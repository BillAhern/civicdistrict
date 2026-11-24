import type {
  CongressMemberSummary,
  DistrictInfo,
  DistrictLookupResult,
  FactCheckOutletRecord,
  GroundingSource,
  PhoneEntry,
  RepresentativeDetailRecord,
  SocialChannel,
} from '../types/civic';

const DATASET_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

// Tracks whether the optional Express /api backend is available (e.g. local dev)
let apiBackendAvailable: boolean | null = null;

function sanitizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function slugifyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return await res.text();
}

async function getLegislators(): Promise<RawLegislator[]> {
  if (legislatorsCache && legislatorsCache.expiresAt > Date.now()) {
    return legislatorsCache.data;
  }
  const data = await fetchJson<RawLegislator[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-current.json'
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
    fetchJson<RawCommittee[]>(
      'https://unitedstates.github.io/congress-legislators/committees-current.json'
    ),
    fetchJson<Record<string, RawCommitteeMember[]>>(
      'https://unitedstates.github.io/congress-legislators/committee-membership-current.json'
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
  const list = await fetchJson<RawSocialEntry[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-social-media.json'
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
  const list = await fetchJson<RawDistrictOfficeEntry[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-district-offices.json'
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
  const csv = await fetchText(
    'https://raw.githubusercontent.com/OpenSourceActivismTech/us-zipcodes-congress/master/zccd.csv'
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

async function lookupByZipClient(zip: string): Promise<DistrictLookupResult> {
  const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (zipRes.status === 404) {
    throw new Error(
      `ZIP code "${zip}" was not recognized as a valid U.S. ZIP code.`
    );
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
    throw new Error(`ZIP code "${zip}" did not return location data.`);
  }

  const city = place['place name'];
  const stateCode = place['state abbreviation'].toUpperCase();
  const stateName = STATE_NAMES[stateCode] ?? place.state;

  const [legislators, commMap, zccdMap] = await Promise.all([
    getLegislators(),
    getCommitteeIndex().catch(() => new Map()),
    getZccdIndex().catch(() => new Map()),
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
      title: 'UnitedStates Congress Legislators Open Dataset',
      uri: 'https://github.com/unitedstates/congress-legislators',
    },
    {
      title: 'ZIP-to-Congressional-District Crosswalk (ZCCD)',
      uri: 'https://github.com/OpenSourceActivismTech/us-zipcodes-congress',
    },
    {
      title: 'Congress.gov Official Member Directory',
      uri: 'https://www.congress.gov/members',
    },
  ];

  const isSplitDistrict = districts.length > 1;

  return {
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
}

async function fetchRepresentativeDetailsClient(params: {
  memberId: string;
  bioguideId?: string | null;
  name: string;
  chamber: string;
  state: string;
}): Promise<RepresentativeDetailRecord> {
  const shortName = params.name
    .replace(/\s+[A-Z]\.\s+/g, ' ')
    .replace(/,?\s+(Jr\.|Sr\.|II|III|IV)$/i, '')
    .trim();

  const [legislators, socialMap, officeMap] = await Promise.all([
    getLegislators(),
    getSocialIndex().catch(() => new Map()),
    getDistrictOfficeIndex().catch(() => new Map()),
  ]);

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
    (officialWebsite ? `${officialWebsite.replace(/\/$/, '')}/contact` : null);

  const socials: SocialChannel[] = [];
  const rawSocial = bioguide ? socialMap.get(bioguide) : undefined;
  if (rawSocial?.twitter) {
    socials.push({
      platform: 'X',
      handle: `@${rawSocial.twitter}`,
      url: `https://x.com/${rawSocial.twitter}`,
    });
  }
  if (rawSocial?.instagram) {
    socials.push({
      platform: 'Instagram',
      handle: `@${rawSocial.instagram}`,
      url: `https://www.instagram.com/${rawSocial.instagram}`,
    });
  }
  if (rawSocial?.facebook) {
    socials.push({
      platform: 'Facebook',
      handle: rawSocial.facebook,
      url: `https://www.facebook.com/${rawSocial.facebook}`,
    });
  }
  if (rawSocial?.youtube_id || rawSocial?.youtube) {
    socials.push({
      platform: 'YouTube',
      handle: rawSocial.youtube || 'Official Channel',
      url: rawSocial.youtube_id
        ? `https://www.youtube.com/channel/${rawSocial.youtube_id}`
        : `https://www.youtube.com/${rawSocial.youtube}`,
    });
  }
  if (rawSocial?.mastodon) {
    const mUrl = sanitizeHttpUrl(rawSocial.mastodon);
    if (mUrl) {
      socials.push({
        platform: 'Mastodon',
        handle: 'Official Account',
        url: mUrl,
      });
    }
  }

  const encodedQuery = encodeURIComponent(shortName);
  const slug = slugifyName(shortName);

  const factChecks: FactCheckOutletRecord[] = [
    {
      outlet: 'PolitiFact',
      summary: `Search PolitiFact’s nonpartisan Truth-O-Meter archive for ${params.name}.`,
      profileUrl: `https://www.politifact.com/personalities/${slug}/`,
      recentChecks: [],
    },
    {
      outlet: 'FactCheck.org',
      summary: `Browse FactCheck.org’s published reviews mentioning ${shortName}.`,
      profileUrl: `https://www.factcheck.org/?s=${encodedQuery}`,
      recentChecks: [],
    },
    {
      outlet: 'Washington Post Fact Checker',
      summary: `Search Washington Post Fact Checker articles mentioning ${shortName}.`,
      profileUrl: `https://www.washingtonpost.com/search/?query=${encodeURIComponent(
        `${shortName} "Fact Checker"`
      )}`,
      recentChecks: [],
    },
    {
      outlet: 'Snopes',
      summary: `Search Snopes fact-checks related to ${shortName}.`,
      profileUrl: `https://www.snopes.com/?s=${encodedQuery}`,
      recentChecks: [],
    },
    {
      outlet: 'AP Fact Check',
      summary: `Search Associated Press Fact Check reports mentioning ${shortName}.`,
      profileUrl: `https://apnews.com/search?q=${encodedQuery}`,
      recentChecks: [],
    },
  ];

  const congressUrl = bioguide
    ? `https://www.congress.gov/member/${slugifyName(params.name)}/${bioguide}`
    : 'https://www.congress.gov/members';

  const chamberVotesUrl =
    params.chamber === 'Senate'
      ? 'https://www.senate.gov/legislative/votes_new.htm'
      : 'https://clerk.house.gov/Votes';

  const sources: GroundingSource[] = [
    ...(officialWebsite
      ? [
          {
            title: `Official Congressional Website (${new URL(officialWebsite).hostname})`,
            uri: officialWebsite,
          },
        ]
      : []),
    {
      title: 'Congress.gov Member Profile & Legislation',
      uri: congressUrl,
    },
    {
      title:
        params.chamber === 'Senate'
          ? 'U.S. Senate Roll Call Votes'
          : 'U.S. House Clerk Roll Call Votes',
      uri: chamberVotesUrl,
    },
    {
      title: 'UnitedStates Congress Legislators Open Dataset',
      uri: 'https://github.com/unitedstates/congress-legislators',
    },
  ];

  return {
    memberId: params.memberId,
    contact: {
      phones,
      emailOrContactForm: contactFormUrl
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
      communityPlatformsNote: null,
    },
    factChecks,
    votingRecord: {
      sessionLabel: '119th Congress (Official Public Records)',
      summary: `View ${params.name}’s full roll-call voting history, sponsored bills, and co-sponsored legislation directly on Congress.gov.`,
      votingRecordUrl: congressUrl,
      keyVotes: [],
      sponsoredBills: [],
    },
    sources,
    fetchedAt: new Date().toISOString(),
  };
}

export async function lookupDistrictByZip(
  zip: string
): Promise<DistrictLookupResult> {
  if (apiBackendAvailable !== false) {
    try {
      const res = await fetch('/api/lookup', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({zip}),
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        apiBackendAvailable = true;
        const payload = (await res.json()) as DistrictLookupResult & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            payload.error || 'Could not look up that ZIP code right now.'
          );
        }
        return payload;
      }
      apiBackendAvailable = false;
    } catch (err) {
      if (apiBackendAvailable === true) {
        throw err;
      }
      apiBackendAvailable = false;
    }
  }

  return lookupByZipClient(zip);
}

export async function lookupRepresentativeDetails(params: {
  memberId: string;
  bioguideId?: string | null;
  name: string;
  title: string;
  chamber: string;
  state: string;
  districtCode?: string | null;
}): Promise<RepresentativeDetailRecord> {
  if (apiBackendAvailable !== false) {
    try {
      const res = await fetch('/api/representative-details', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(params),
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        apiBackendAvailable = true;
        const payload = (await res.json()) as RepresentativeDetailRecord & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            payload.error || 'Could not load detailed public records right now.'
          );
        }
        return payload;
      }
      apiBackendAvailable = false;
    } catch (err) {
      if (apiBackendAvailable === true) {
        throw err;
      }
      apiBackendAvailable = false;
    }
  }

  return fetchRepresentativeDetailsClient(params);
}
