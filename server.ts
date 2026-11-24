import 'dotenv/config';
import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {load} from 'cheerio';
import type {
  CongressMemberSummary,
  DistrictInfo,
  DistrictLookupResult,
  FactCheckOutletRecord,
  GroundingSource,
  PhoneEntry,
  RepresentativeDetailRecord,
  RollCallVote,
  SocialChannel,
} from './src/types/civic.ts';
import {
  sanitizeHttpUrl,
  scrapeApFactCheck,
  scrapeFactCheckOrg,
  scrapeOfficialMemberWebsite,
  scrapePolitiFactProfile,
  scrapeSnopes,
  scrapeWashingtonPostFactChecker,
  slugifyName,
} from './server/scraperEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const USER_AGENT = 'CivicDistrictPWA/1.0 (+https://civicdistrict.app)';

const DATASET_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const VOTE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DETAIL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Open Congressional Dataset Types (@unitedstates/congress-legislators)
// ---------------------------------------------------------------------------
interface RawLegislatorTerm {
  type: 'rep' | 'sen';
  start: string;
  end: string;
  state: string;
  district?: number;
  class?: number;
  state_rank?: string;
  party?: string;
  url?: string;
  contact_form?: string;
  address?: string;
  office?: string;
  phone?: string;
}

interface RawLegislator {
  id: {
    bioguide: string;
    lis?: string;
    govtrack?: number;
    wikipedia?: string;
  };
  name: {
    first: string;
    last: string;
    official_full?: string;
    nickname?: string;
  };
  bio?: {
    birthday?: string;
    gender?: string;
  };
  terms: RawLegislatorTerm[];
}

interface RawCommittee {
  thomas_id: string;
  name: string;
  type: string;
  subcommittees?: Array<{thomas_id: string; name: string}>;
}

interface RawCommitteeMember {
  name: string;
  bioguide: string;
  rank?: number;
  title?: string;
}

interface RawSocialEntry {
  id: {bioguide: string};
  social?: {
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    youtube_id?: string;
    mastodon?: string;
  };
}

interface RawDistrictOfficeEntry {
  id: {bioguide: string};
  offices: Array<{
    address?: string;
    suite?: string;
    building?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
  }>;
}

interface CachedSenateVote {
  voteNumber: string;
  date: string;
  issue: string;
  title: string;
  question: string;
  result: string;
  url: string;
  votesByLis: Map<string, string>;
  votesByLastState: Map<string, string>;
}

interface CachedHouseVote {
  rollNumber: number;
  year: number;
  date: string;
  legisNum: string;
  title: string;
  question: string;
  result: string;
  url: string;
  votesByBioguide: Map<string, string>;
}

// ---------------------------------------------------------------------------
// In-memory dataset & response caches
// ---------------------------------------------------------------------------
let legislatorsCache: {data: RawLegislator[]; expiresAt: number} | null = null;
let committeeIndexCache: {
  byBioguide: Map<string, {committees: string[]; leadershipRoles: string[]}>;
  expiresAt: number;
} | null = null;
let socialIndexCache: {
  byBioguide: Map<string, RawSocialEntry['social']>;
  expiresAt: number;
} | null = null;
let districtOfficeCache: {
  byBioguide: Map<string, RawDistrictOfficeEntry['offices']>;
  expiresAt: number;
} | null = null;
let zccdCache: {
  byZip: Map<string, Array<{stateCode: string; cd: number}>>;
  expiresAt: number;
} | null = null;

let senateVotesCache: {votes: CachedSenateVote[]; expiresAt: number} | null = null;
let houseVotesCache: {votes: CachedHouseVote[]; expiresAt: number} | null = null;

const lookupCache = new Map<
  string,
  {data: DistrictLookupResult; expiresAt: number}
>();
const detailCache = new Map<
  string,
  {data: RepresentativeDetailRecord; expiresAt: number}
>();

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function normalizeParty(party?: string): string {
  if (!party) return 'Independent';
  const lower = party.toLowerCase();
  if (lower.startsWith('democrat')) return 'Democratic';
  if (lower.startsWith('republican')) return 'Republican';
  return party;
}

function computeAge(birthday?: string): number | null {
  if (!birthday) return null;
  const birth = new Date(`${birthday}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age;
}

function formatIsoDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatSenateClass(cls?: number): string | null {
  if (cls === 1) return 'Class I';
  if (cls === 2) return 'Class II';
  if (cls === 3) return 'Class III';
  return null;
}

function formatPhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone.trim();
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: {'User-Agent': USER_AGENT, Accept: 'application/json'},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchTextWithTimeout(url: string, timeoutMs = 7000): Promise<string> {
  const res = await fetch(url, {
    headers: {'User-Agent': USER_AGENT},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return await res.text();
}

// ---------------------------------------------------------------------------
// Open Public Dataset Loaders (Zero Paid APIs)
// ---------------------------------------------------------------------------
async function getLegislators(): Promise<RawLegislator[]> {
  if (legislatorsCache && legislatorsCache.expiresAt > Date.now()) {
    return legislatorsCache.data;
  }
  const data = await fetchJsonWithTimeout<RawLegislator[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-current.json',
    10000
  );
  legislatorsCache = {data, expiresAt: Date.now() + DATASET_TTL_MS};
  return data;
}

async function getCommitteeIndex(): Promise<
  Map<string, {committees: string[]; leadershipRoles: string[]}>
> {
  if (committeeIndexCache && committeeIndexCache.expiresAt > Date.now()) {
    return committeeIndexCache.byBioguide;
  }

  const [committees, membership] = await Promise.all([
    fetchJsonWithTimeout<RawCommittee[]>(
      'https://unitedstates.github.io/congress-legislators/committees-current.json',
      10000
    ),
    fetchJsonWithTimeout<Record<string, RawCommitteeMember[]>>(
      'https://unitedstates.github.io/congress-legislators/committee-membership-current.json',
      10000
    ),
  ]);

  const commNames = new Map<string, {name: string; isSubcommittee: boolean}>();
  for (const c of committees) {
    commNames.set(c.thomas_id, {name: c.name, isSubcommittee: false});
    for (const sub of c.subcommittees ?? []) {
      commNames.set(`${c.thomas_id}${sub.thomas_id}`, {
        name: `${sub.name} Subcommittee`,
        isSubcommittee: true,
      });
    }
  }

  const byBioguide = new Map<
    string,
    {committees: string[]; leadershipRoles: string[]}
  >();

  for (const [commId, members] of Object.entries(membership)) {
    const info = commNames.get(commId);
    if (!info) continue;
    for (const m of members) {
      if (!m.bioguide) continue;
      let entry = byBioguide.get(m.bioguide);
      if (!entry) {
        entry = {committees: [], leadershipRoles: []};
        byBioguide.set(m.bioguide, entry);
      }
      if (!info.isSubcommittee && !entry.committees.includes(info.name)) {
        entry.committees.push(info.name);
      }
      if (m.title && m.title !== 'Ex Officio') {
        const roleLabel = `${m.title}, ${info.name}`;
        if (!entry.leadershipRoles.includes(roleLabel)) {
          entry.leadershipRoles.push(roleLabel);
        }
      }
    }
  }

  committeeIndexCache = {byBioguide, expiresAt: Date.now() + DATASET_TTL_MS};
  return byBioguide;
}

async function getSocialIndex(): Promise<
  Map<string, RawSocialEntry['social']>
> {
  if (socialIndexCache && socialIndexCache.expiresAt > Date.now()) {
    return socialIndexCache.byBioguide;
  }
  const list = await fetchJsonWithTimeout<RawSocialEntry[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-social-media.json',
    10000
  );
  const byBioguide = new Map<string, RawSocialEntry['social']>();
  for (const item of list) {
    if (item.id?.bioguide && item.social) {
      byBioguide.set(item.id.bioguide, item.social);
    }
  }
  socialIndexCache = {byBioguide, expiresAt: Date.now() + DATASET_TTL_MS};
  return byBioguide;
}

async function getDistrictOfficeIndex(): Promise<
  Map<string, RawDistrictOfficeEntry['offices']>
> {
  if (districtOfficeCache && districtOfficeCache.expiresAt > Date.now()) {
    return districtOfficeCache.byBioguide;
  }
  const list = await fetchJsonWithTimeout<RawDistrictOfficeEntry[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-district-offices.json',
    10000
  );
  const byBioguide = new Map<string, RawDistrictOfficeEntry['offices']>();
  for (const item of list) {
    if (item.id?.bioguide && Array.isArray(item.offices)) {
      byBioguide.set(item.id.bioguide, item.offices);
    }
  }
  districtOfficeCache = {byBioguide, expiresAt: Date.now() + DATASET_TTL_MS};
  return byBioguide;
}

async function getZccdIndex(): Promise<
  Map<string, Array<{stateCode: string; cd: number}>>
> {
  if (zccdCache && zccdCache.expiresAt > Date.now()) {
    return zccdCache.byZip;
  }
  const csv = await fetchTextWithTimeout(
    'https://raw.githubusercontent.com/OpenSourceActivismTech/us-zipcodes-congress/master/zccd.csv',
    10000
  );
  const byZip = new Map<string, Array<{stateCode: string; cd: number}>>();
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 4) continue;
    const stateCode = parts[1].trim().toUpperCase();
    const zcta = parts[2].trim().padStart(5, '0');
    const cd = Number.parseInt(parts[3].trim(), 10);
    if (!stateCode || !/^\d{5}$/.test(zcta) || Number.isNaN(cd)) continue;
    let arr = byZip.get(zcta);
    if (!arr) {
      arr = [];
      byZip.set(zcta, arr);
    }
    if (!arr.some((x) => x.stateCode === stateCode && x.cd === cd)) {
      arr.push({stateCode, cd});
    }
  }
  zccdCache = {byZip, expiresAt: Date.now() + DATASET_TTL_MS};
  return byZip;
}

// ---------------------------------------------------------------------------
// Stage 1: ZIP -> Congressional District(s) & Current Delegation Lookup
// ---------------------------------------------------------------------------
function toMemberSummary(
  raw: RawLegislator,
  commMap: Map<string, {committees: string[]; leadershipRoles: string[]}>
): CongressMemberSummary {
  const lastTerm = raw.terms[raw.terms.length - 1];
  const chamber = lastTerm.type === 'sen' ? 'Senate' : 'House';
  const stateCode = lastTerm.state.toUpperCase();
  const stateName = STATE_NAMES[stateCode] ?? stateCode;
  const fullName =
    raw.name.official_full?.trim() || `${raw.name.first} ${raw.name.last}`.trim();

  const firstTerm = raw.terms[0];
  const firstStartYear = firstTerm?.start
    ? Number.parseInt(firstTerm.start.slice(0, 4), 10)
    : null;
  const currentYear = new Date().getUTCFullYear();
  const yearsInOffice =
    firstStartYear && Number.isFinite(firstStartYear)
      ? Math.max(1, currentYear - firstStartYear)
      : null;

  const endYear = lastTerm.end ? Number.parseInt(lastTerm.end.slice(0, 4), 10) : null;
  const nextElectionYear =
    endYear && Number.isFinite(endYear) ? endYear - 1 : null;

  let title = chamber === 'Senate' ? 'U.S. Senator' : 'U.S. Representative';
  if (chamber === 'House') {
    if (stateCode === 'PR') title = 'Resident Commissioner';
    else if (['DC', 'GU', 'VI', 'AS', 'MP'].includes(stateCode)) {
      title = 'U.S. Delegate';
    }
  }

  let districtCode: string | null = null;
  if (chamber === 'House') {
    const distNum = lastTerm.district ?? 0;
    districtCode =
      distNum === 0
        ? `${stateCode}-AL`
        : `${stateCode}-${String(distNum).padStart(2, '0')}`;
  }

  const commEntry = commMap.get(raw.id.bioguide);

  return {
    id: raw.id.bioguide,
    bioguideId: raw.id.bioguide,
    name: fullName,
    title,
    chamber,
    party: normalizeParty(lastTerm.party),
    districtCode,
    senateClass: chamber === 'Senate' ? formatSenateClass(lastTerm.class) : null,
    state: stateName,
    age: computeAge(raw.bio?.birthday),
    birthDate: formatIsoDate(raw.bio?.birthday),
    hometown: null,
    yearsInOffice,
    termStartYear: firstStartYear,
    nextElectionYear,
    termEndDate: formatIsoDate(lastTerm.end),
    committees: (commEntry?.committees ?? []).slice(0, 5),
    leadershipRoles: (commEntry?.leadershipRoles ?? []).slice(0, 3),
    portraitUrl: `https://unitedstates.github.io/images/congress/225x275/${raw.id.bioguide}.jpg`,
  };
}

async function queryCensusDistrict(
  lng: number,
  lat: number
): Promise<number | null> {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${encodeURIComponent(
      lng
    )}&y=${encodeURIComponent(
      lat
    )}&benchmark=Public_AR_Current&vintage=Current_Current&layers=54&format=json`;
    const data = await fetchJsonWithTimeout<{
      result?: {
        geographies?: Record<string, Array<Record<string, string>>>;
      };
    }>(url, 6000);
    const geos = data.result?.geographies ?? {};
    for (const [key, list] of Object.entries(geos)) {
      if (
        !key.toLowerCase().includes('congressional') ||
        !Array.isArray(list) ||
        !list[0]
      ) {
        continue;
      }
      const row = list[0];
      const cdKey = Object.keys(row).find((k) => /^CD\d+$/i.test(k));
      if (cdKey && row[cdKey] != null) {
        const parsed = Number.parseInt(row[cdKey], 10);
        if (!Number.isNaN(parsed)) {
          return parsed === 98 ? 0 : parsed;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function lookupByZip(zip: string): Promise<DistrictLookupResult> {
  const cached = lookupCache.get(zip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`, {
    headers: {'User-Agent': USER_AGENT},
    signal: AbortSignal.timeout(7000),
  });
  if (zipRes.status === 404) {
    const err = new Error(
      `ZIP code "${zip}" was not recognized as a valid U.S. ZIP code.`
    );
    (err as Error & {statusCode?: number}).statusCode = 404;
    throw err;
  }
  if (!zipRes.ok) {
    throw new Error(`ZIP directory service returned HTTP ${zipRes.status}.`);
  }

  const zipData = (await zipRes.json()) as {
    places?: Array<{
      'place name': string;
      state: string;
      'state abbreviation': string;
      latitude: string;
      longitude: string;
    }>;
  };
  const place = zipData.places?.[0];
  if (!place) {
    const err = new Error(`ZIP code "${zip}" did not return location data.`);
    (err as Error & {statusCode?: number}).statusCode = 404;
    throw err;
  }

  const city = place['place name'];
  const stateCode = place['state abbreviation'].toUpperCase();
  const stateName = STATE_NAMES[stateCode] ?? place.state;
  const lat = Number.parseFloat(place.latitude);
  const lng = Number.parseFloat(place.longitude);

  const [legislators, commMap, zccdMap, censusCd] = await Promise.all([
    getLegislators(),
    getCommitteeIndex().catch(() => new Map()),
    getZccdIndex().catch(() => new Map()),
    Number.isFinite(lat) && Number.isFinite(lng)
      ? queryCensusDistrict(lng, lat)
      : Promise.resolve(null),
  ]);

  const stateMembers = legislators.filter((l) => {
    const last = l.terms[l.terms.length - 1];
    return last?.state?.toUpperCase() === stateCode;
  });

  const stateHouse = stateMembers.filter(
    (l) => l.terms[l.terms.length - 1].type === 'rep'
  );
  const stateSenators = stateMembers.filter(
    (l) => l.terms[l.terms.length - 1].type === 'sen'
  );

  const districtNumbers = new Set<number>();
  const isAtLargeState =
    stateHouse.length === 1 &&
    (stateHouse[0].terms[stateHouse[0].terms.length - 1].district ?? 0) === 0;

  if (isAtLargeState) {
    districtNumbers.add(0);
  } else {
    if (censusCd !== null) {
      districtNumbers.add(censusCd);
    }
    const zccdEntries = zccdMap.get(zip) ?? [];
    for (const entry of zccdEntries) {
      if (entry.stateCode === stateCode) {
        const exists = stateHouse.some(
          (l) => (l.terms[l.terms.length - 1].district ?? -1) === entry.cd
        );
        if (exists || districtNumbers.size === 0) {
          districtNumbers.add(entry.cd);
        }
      }
    }
    if (districtNumbers.size === 0 && stateHouse.length > 0) {
      const firstDist =
        stateHouse[0].terms[stateHouse[0].terms.length - 1].district ?? 1;
      districtNumbers.add(firstDist);
    }
  }

  const sortedDistricts = [...districtNumbers].sort((a, b) => a - b);

  const districts: DistrictInfo[] = [];
  const matchedHouseSummaries: CongressMemberSummary[] = [];
  const seenRepIds = new Set<string>();

  for (const cd of sortedDistricts) {
    const code =
      cd === 0 ? `${stateCode}-AL` : `${stateCode}-${String(cd).padStart(2, '0')}`;
    const label =
      cd === 0
        ? stateCode === 'DC'
          ? 'District of Columbia At-Large Delegate District'
          : `${stateName} At-Large Congressional District`
        : `${stateName}'s ${ordinal(cd)} Congressional District`;

    const matchingRawReps = stateHouse.filter(
      (l) => (l.terms[l.terms.length - 1].district ?? 0) === cd
    );

    const repIds: string[] = [];
    for (const rawRep of matchingRawReps) {
      const summary = toMemberSummary(rawRep, commMap);
      repIds.push(summary.id);
      if (!seenRepIds.has(summary.id)) {
        seenRepIds.add(summary.id);
        matchedHouseSummaries.push(summary);
      }
    }

    districts.push({code, label, representativeIds: repIds});
  }

  const senatorSummaries = stateSenators
    .map((s) => toMemberSummary(s, commMap))
    .sort((a, b) => (a.senateClass ?? '').localeCompare(b.senateClass ?? ''));

  const sources: GroundingSource[] = [
    {
      title: 'U.S. Census Bureau Geocoder (Congressional Districts)',
      uri: 'https://geocoding.geo.census.gov/',
    },
    {
      title: 'UnitedStates Congress Legislators Open Dataset',
      uri: 'https://github.com/unitedstates/congress-legislators',
    },
    {
      title: 'Congress.gov Official Member Directory',
      uri: 'https://www.congress.gov/members',
    },
  ];

  const isSplitDistrict = districts.length > 1;

  const result: DistrictLookupResult = {
    zip,
    city,
    state: stateName,
    stateCode,
    county: null,
    isSplitDistrict,
    splitNote: isSplitDistrict
      ? `ZIP code ${zip} spans ${districts.length} congressional districts. Use the switcher to view the representative for your specific area.`
      : null,
    districts,
    representatives: [...matchedHouseSummaries, ...senatorSummaries],
    sources,
    fetchedAt: new Date().toISOString(),
  };

  lookupCache.set(zip, {data: result, expiresAt: Date.now() + DETAIL_CACHE_TTL_MS});
  return result;
}

// ---------------------------------------------------------------------------
// Stage 2A: Official Roll-Call XML Scrapers (Cheerio XML Mode)
// ---------------------------------------------------------------------------
async function getRecentSenateVotes(): Promise<CachedSenateVote[]> {
  if (senateVotesCache && senateVotesCache.expiresAt > Date.now()) {
    return senateVotesCache.votes;
  }

  const menuXml = await fetchTextWithTimeout(
    'https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml',
    8000
  );
  const $menu = load(menuXml, {xmlMode: true});

  const voteSummaries: Array<{
    voteNumber: string;
    issue: string;
    title: string;
    question: string;
    result: string;
    fallbackDate: string;
  }> = [];

  $menu('vote').each((_, el) => {
    if (voteSummaries.length >= 10) return;
    const voteNumber = $menu(el).find('vote_number').first().text().trim().padStart(5, '0');
    if (!/^\d{5}$/.test(voteNumber)) return;
    voteSummaries.push({
      voteNumber,
      issue: $menu(el).find('issue').first().text().trim() || `Vote #${Number(voteNumber)}`,
      title: $menu(el).find('title').first().text().trim(),
      question: $menu(el).find('question').first().text().trim(),
      result: $menu(el).find('result').first().text().trim(),
      fallbackDate: $menu(el).find('vote_date').first().text().trim(),
    });
  });

  const parsedVotes = await Promise.all(
    voteSummaries.map(async (item) => {
      const xmlUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_${item.voteNumber}.xml`;
      const htmlUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_${item.voteNumber}.htm`;
      try {
        const voteXml = await fetchTextWithTimeout(xmlUrl, 6000);
        const $vote = load(voteXml, {xmlMode: true});
        const votesByLis = new Map<string, string>();
        const votesByLastState = new Map<string, string>();

        $vote('member').each((_, mEl) => {
          const lis = $vote(mEl).find('lis_member_id').first().text().trim().toUpperCase();
          const last = $vote(mEl).find('last_name').first().text().trim().toLowerCase();
          const st = $vote(mEl).find('state').first().text().trim().toUpperCase();
          const cast = $vote(mEl).find('vote_cast').first().text().trim();
          if (lis && cast) votesByLis.set(lis, cast);
          if (last && st && cast) votesByLastState.set(`${last}:${st}`, cast);
        });

        const rawVoteDate = $vote('vote_date').first().text().trim();
        const dateParts = rawVoteDate.split(',');
        const formattedDate =
          dateParts.length >= 2
            ? `${dateParts[0].trim()}, ${dateParts[1].trim()}`
            : item.fallbackDate;

        const docText = $vote('vote_document_text').first().text().trim();
        const qText = $vote('vote_question_text').first().text().trim();

        return {
          voteNumber: item.voteNumber,
          date: formattedDate,
          issue: item.issue,
          title: item.title || docText || qText || 'Senate Roll-Call Vote',
          question: item.question || qText,
          result: item.result,
          url: htmlUrl,
          votesByLis,
          votesByLastState,
        } satisfies CachedSenateVote;
      } catch {
        return null;
      }
    })
  );

  const valid = parsedVotes.filter((v): v is CachedSenateVote => v !== null);
  senateVotesCache = {votes: valid, expiresAt: Date.now() + VOTE_CACHE_TTL_MS};
  return valid;
}

async function houseRollExists(year: number, rollNum: number): Promise<boolean> {
  try {
    const res = await fetch(
      `https://clerk.house.gov/evs/${year}/roll${String(rollNum).padStart(3, '0')}.xml`,
      {
        headers: {'User-Agent': USER_AGENT, Range: 'bytes=0-180'},
        signal: AbortSignal.timeout(4000),
      }
    );
    const text = await res.text();
    return text.includes('<rollcall-vote>');
  } catch {
    return false;
  }
}

async function getRecentHouseVotes(): Promise<CachedHouseVote[]> {
  if (houseVotesCache && houseVotesCache.expiresAt > Date.now()) {
    return houseVotesCache.votes;
  }

  const currentYear = new Date().getUTCFullYear();
  let year = currentYear;

  async function findLatestRoll(y: number): Promise<number> {
    if (!(await houseRollExists(y, 1))) return 0;
    let lo = 1;
    let hi = 700;
    let best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (await houseRollExists(y, mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  let latest = await findLatestRoll(year);
  if (latest === 0) {
    year = currentYear - 1;
    latest = await findLatestRoll(year);
  }
  if (latest === 0) return [];

  const rollNums: number[] = [];
  for (let n = latest; n >= Math.max(1, latest - 11); n--) {
    rollNums.push(n);
  }

  const parsed = await Promise.all(
    rollNums.map(async (rollNumber) => {
      const padded = String(rollNumber).padStart(3, '0');
      const xmlUrl = `https://clerk.house.gov/evs/${year}/roll${padded}.xml`;
      try {
        const xml = await fetchTextWithTimeout(xmlUrl, 6000);
        if (!xml.includes('<rollcall-vote>')) return null;

        const $ = load(xml, {xmlMode: true});
        const legisNum = $('legis-num').first().text().trim();
        const voteType = $('vote-type').first().text().trim();
        if (
          legisNum.toUpperCase() === 'QUORUM' ||
          voteType.toUpperCase() === 'QUORUM'
        ) {
          return null;
        }

        const votesByBioguide = new Map<string, string>();
        $('recorded-vote').each((_, rvEl) => {
          const bio = $(rvEl).find('legislator').attr('name-id')?.trim().toUpperCase();
          const vote = $(rvEl).find('vote').first().text().trim();
          if (bio && vote) votesByBioguide.set(bio, vote);
        });

        const title =
          $('vote-desc').first().text().trim() ||
          $('vote-question').first().text().trim() ||
          `House Roll Call #${rollNumber}`;
        const question = $('vote-question').first().text().trim();
        const result = $('vote-result').first().text().trim();
        const date = $('action-date').first().text().trim();

        return {
          rollNumber,
          year,
          date,
          legisNum: legisNum || `Roll #${rollNumber}`,
          title,
          question,
          result,
          url: `https://clerk.house.gov/Votes/${year}${rollNumber}`,
          votesByBioguide,
        } satisfies CachedHouseVote;
      } catch {
        return null;
      }
    })
  );

  const valid = parsed
    .filter((v): v is CachedHouseVote => v !== null)
    .slice(0, 7);
  houseVotesCache = {votes: valid, expiresAt: Date.now() + VOTE_CACHE_TTL_MS};
  return valid;
}

// ---------------------------------------------------------------------------
// Stage 2B: Full Representative Dossier (Open Datasets + Live Cheerio Scrapers)
// ---------------------------------------------------------------------------
async function fetchRepresentativeDetails(params: {
  memberId: string;
  bioguideId?: string | null;
  name: string;
  chamber: string;
  state: string;
}): Promise<RepresentativeDetailRecord> {
  const cacheKey = (params.bioguideId || params.memberId).toUpperCase();
  const cached = detailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const shortName = params.name
    .replace(/\s+[A-Z]\.\s+/g, ' ')
    .replace(/,?\s+(Jr\.|Sr\.|II|III|IV)$/i, '')
    .trim();

  // First ensure we have the member record so we can live-scrape their official .gov website in parallel
  const legislators = await getLegislators();
  const rawMember =
    legislators.find(
      (l) =>
        l.id.bioguide.toUpperCase() ===
        (params.bioguideId || params.memberId).toUpperCase()
    ) ??
    legislators.find((l) => {
      const full = (
        l.name.official_full || `${l.name.first} ${l.name.last}`
      ).toLowerCase();
      return full === params.name.toLowerCase();
    });

  const lastTerm = rawMember?.terms[rawMember.terms.length - 1];
  const bioguide = rawMember?.id.bioguide ?? params.bioguideId ?? '';
  const officialWebsite = sanitizeHttpUrl(lastTerm?.url);

  const [
    socialMap,
    officeMap,
    scrapedSite,
    politifact,
    factcheckOrg,
    wapo,
    snopes,
    apFactCheck,
    senateVotes,
    houseVotes,
  ] = await Promise.all([
    getSocialIndex().catch(() => new Map()),
    getDistrictOfficeIndex().catch(() => new Map()),
    scrapeOfficialMemberWebsite(officialWebsite),
    scrapePolitiFactProfile(params.name, shortName),
    scrapeFactCheckOrg(shortName),
    scrapeWashingtonPostFactChecker(shortName),
    scrapeSnopes(shortName),
    scrapeApFactCheck(shortName),
    params.chamber === 'Senate'
      ? getRecentSenateVotes().catch(() => [])
      : Promise.resolve([]),
    params.chamber === 'House'
      ? getRecentHouseVotes().catch(() => [])
      : Promise.resolve([]),
  ]);

  // Row 2: Phones, Official Contact Portal / Email, Website, Offices, Merged Social/Community Channels
  const phones: PhoneEntry[] = [];
  if (lastTerm?.phone) {
    const formatted = formatPhone(lastTerm.phone);
    if (formatted) {
      phones.push({label: 'Washington, D.C. Office', number: formatted});
    }
  }

  const districtOffices = bioguide ? officeMap.get(bioguide) ?? [] : [];
  let primaryDistrictOffice: string | null = null;

  for (const off of districtOffices) {
    if (!primaryDistrictOffice && off.address && off.city) {
      primaryDistrictOffice = [
        off.building,
        off.address,
        off.suite,
        `${off.city}, ${off.state ?? ''} ${off.zip ?? ''}`.trim(),
      ]
        .filter(Boolean)
        .join(', ');
    }
    if (off.phone && phones.length < 3) {
      const formatted = formatPhone(off.phone);
      if (formatted && !phones.some((p) => p.number === formatted)) {
        phones.push({
          label: off.city ? `${off.city} Office` : 'District Office',
          number: formatted,
        });
      }
    }
  }

  const contactFormUrl =
    sanitizeHttpUrl(lastTerm?.contact_form) ??
    scrapedSite.contactUrl ??
    (officialWebsite ? `${officialWebsite.replace(/\/$/, '')}/contact` : null);

  // Merge live-scraped .gov website social/community links + open social dataset
  const socialsByPlatform = new Map<string, SocialChannel>();
  for (const s of scrapedSite.socials) {
    socialsByPlatform.set(s.platform, s);
  }

  const rawSocial = bioguide ? socialMap.get(bioguide) : undefined;
  if (rawSocial?.twitter && !socialsByPlatform.has('X')) {
    socialsByPlatform.set('X', {
      platform: 'X',
      handle: `@${rawSocial.twitter}`,
      url: `https://x.com/${rawSocial.twitter}`,
    });
  }
  if (rawSocial?.instagram && !socialsByPlatform.has('Instagram')) {
    socialsByPlatform.set('Instagram', {
      platform: 'Instagram',
      handle: `@${rawSocial.instagram}`,
      url: `https://www.instagram.com/${rawSocial.instagram}`,
    });
  }
  if (rawSocial?.facebook && !socialsByPlatform.has('Facebook')) {
    socialsByPlatform.set('Facebook', {
      platform: 'Facebook',
      handle: rawSocial.facebook,
      url: `https://www.facebook.com/${rawSocial.facebook}`,
    });
  }
  if ((rawSocial?.youtube_id || rawSocial?.youtube) && !socialsByPlatform.has('YouTube')) {
    socialsByPlatform.set('YouTube', {
      platform: 'YouTube',
      handle: rawSocial.youtube || 'Official Channel',
      url: rawSocial.youtube_id
        ? `https://www.youtube.com/channel/${rawSocial.youtube_id}`
        : `https://www.youtube.com/${rawSocial.youtube}`,
    });
  }
  if (rawSocial?.mastodon && !socialsByPlatform.has('Mastodon')) {
    const mUrl = sanitizeHttpUrl(rawSocial.mastodon);
    if (mUrl) {
      socialsByPlatform.set('Mastodon', {
        platform: 'Mastodon',
        handle: 'Official Account',
        url: mUrl,
      });
    }
  }

  const socials = [...socialsByPlatform.values()];
  const hasReddit = socialsByPlatform.has('Reddit');
  const hasDiscord = socialsByPlatform.has('Discord');
  let communityPlatformsNote: string | null = null;
  if (!hasReddit && !hasDiscord) {
    communityPlatformsNote =
      'No verified official Reddit or Discord channel was found on this office’s official .gov website or congressional directory.';
  } else if (!hasReddit) {
    communityPlatformsNote =
      'No verified official Reddit account was found on this office’s official .gov website.';
  } else if (!hasDiscord) {
    communityPlatformsNote =
      'No verified official Discord server was found on this office’s official .gov website.';
  }

  // Row 3: Fact-Check Outlets
  const factChecks: FactCheckOutletRecord[] = [
    politifact,
    factcheckOrg,
    wapo,
    snopes,
    ...(apFactCheck ? [apFactCheck] : []),
  ];

  // Row 4: Official Roll-Call Voting Record
  const keyVotes: RollCallVote[] = [];
  if (params.chamber === 'Senate' && senateVotes.length > 0) {
    const lisId = rawMember?.id.lis?.toUpperCase() ?? '';
    const lastStateKey = rawMember
      ? `${rawMember.name.last.toLowerCase()}:${lastTerm?.state?.toUpperCase() ?? ''}`
      : '';

    for (const v of senateVotes.slice(0, 6)) {
      const cast =
        (lisId && v.votesByLis.get(lisId)) ||
        (lastStateKey && v.votesByLastState.get(lastStateKey)) ||
        'Not Recorded';
      keyVotes.push({
        billNumber: v.issue,
        title: v.title,
        date: v.date,
        vote: cast,
        summary: `${v.question}${v.result ? ` — Result: ${v.result}` : ''}`,
        url: v.url,
      });
    }
  } else if (params.chamber === 'House' && houseVotes.length > 0) {
    for (const v of houseVotes.slice(0, 6)) {
      const cast =
        (bioguide && v.votesByBioguide.get(bioguide.toUpperCase())) ||
        'Not Recorded';
      keyVotes.push({
        billNumber: v.legisNum,
        title: v.title,
        date: v.date,
        vote: cast,
        summary: `${v.question}${v.result ? ` — Result: ${v.result}` : ''}`,
        url: v.url,
      });
    }
  }

  const congressUrl = bioguide
    ? `https://www.congress.gov/member/${slugifyName(params.name)}/${bioguide}`
    : 'https://www.congress.gov/members';

  const sources: GroundingSource[] = [
    ...(officialWebsite
      ? [{title: `Official Congressional Website (${new URL(officialWebsite).hostname})`, uri: officialWebsite}]
      : []),
    {
      title: 'Congress.gov Member Profile & Legislation',
      uri: congressUrl,
    },
    {
      title:
        params.chamber === 'Senate'
          ? 'U.S. Senate Roll Call Votes XML (119th Congress)'
          : 'U.S. House Clerk Roll Call Votes XML',
      uri:
        params.chamber === 'Senate'
          ? 'https://www.senate.gov/legislative/votes_new.htm'
          : 'https://clerk.house.gov/Votes',
    },
    {
      title: 'PolitiFact Archive',
      uri: politifact.profileUrl ?? 'https://www.politifact.com/',
    },
  ];

  const result: RepresentativeDetailRecord = {
    memberId: params.memberId,
    contact: {
      phones,
      emailOrContactForm: scrapedSite.email
        ? {
            label: 'Official Email',
            value: scrapedSite.email,
            isUrl: false,
          }
        : contactFormUrl
          ? {
              label: 'Official Contact Portal',
              value: contactFormUrl,
              isUrl: true,
            }
          : null,
      website: officialWebsite,
      dcOffice: lastTerm?.address ?? lastTerm?.office ?? null,
      districtOffice: primaryDistrictOffice,
      socials,
      communityPlatformsNote,
    },
    factChecks,
    votingRecord: {
      sessionLabel: '119th Congress (Official Roll-Call Records)',
      summary:
        keyVotes.length > 0
          ? `Recent recorded roll-call votes parsed directly from official ${
              params.chamber === 'Senate'
                ? 'U.S. Senate LIS XML'
                : 'U.S. House Clerk XML'
            } tallies.`
          : `Official legislative sponsorship and full roll-call history are published on Congress.gov.`,
      votingRecordUrl: congressUrl,
      keyVotes,
      sponsoredBills: [],
    },
    sources,
    fetchedAt: new Date().toISOString(),
  };

  detailCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
  });
  return result;
}

// ---------------------------------------------------------------------------
// Express + Vite Server Entrypoint
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  app.use(express.json({limit: '100kb'}));

  app.get('/api/health', (_req, res) => {
    res.json({ok: true});
  });

  app.post('/api/lookup', async (req, res) => {
    const rawZip = typeof req.body?.zip === 'string' ? req.body.zip.trim() : '';
    if (!/^\d{5}$/.test(rawZip)) {
      res.status(400).json({
        error: 'Please enter a valid 5-digit U.S. ZIP code.',
      });
      return;
    }

    try {
      const data = await lookupByZip(rawZip);
      res.json(data);
    } catch (err) {
      const customStatus = (err as Error & {statusCode?: number})?.statusCode;
      if (customStatus === 404) {
        res.status(404).json({
          error:
            err instanceof Error
              ? err.message
              : 'ZIP code was not recognized as a valid U.S. ZIP code.',
        });
        return;
      }
      console.error('[/api/lookup] Error:', err);
      res.status(502).json({
        error:
          'Unable to reach the congressional directory service right now. Please try again in a moment.',
      });
    }
  });

  app.post('/api/representative-details', async (req, res) => {
    const body = req.body ?? {};
    const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
    const bioguideId =
      typeof body.bioguideId === 'string' ? body.bioguideId.trim() : null;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const chamber = typeof body.chamber === 'string' ? body.chamber.trim() : 'House';
    const state = typeof body.state === 'string' ? body.state.trim() : '';

    if (!memberId || !name || !state || name.length > 120 || state.length > 60) {
      res.status(400).json({
        error: 'Missing or invalid representative identifier for detail lookup.',
      });
      return;
    }

    try {
      const data = await fetchRepresentativeDetails({
        memberId,
        bioguideId,
        name,
        chamber,
        state,
      });
      res.json(data);
    } catch (err) {
      console.error('[/api/representative-details] Error:', err);
      res.status(502).json({
        error:
          'Unable to load detailed congressional records right now. Please try again in a moment.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicDistrict server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CivicDistrict server:', err);
  process.exit(1);
});
