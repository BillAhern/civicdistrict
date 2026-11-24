import type {
  DistrictLookupResult,
  RepresentativeDetailRecord,
} from '../types/civic';

const ZIP_CACHE_KEY = 'civicdistrict_zip_lookups_v1';
const DETAIL_CACHE_KEY = 'civicdistrict_member_details_v1';
const MAX_CACHED_ZIPS = 10;

interface StoredZipEntry {
  zip: string;
  result: DistrictLookupResult;
  savedAt: string;
}

export function getCachedZipEntries(): StoredZipEntry[] {
  try {
    const raw = localStorage.getItem(ZIP_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCachedZipLookup(zip: string): DistrictLookupResult | null {
  const entries = getCachedZipEntries();
  const match = entries.find((e) => e.zip === zip);
  return match?.result ?? null;
}

export function saveZipLookupToCache(result: DistrictLookupResult): void {
  try {
    const existing = getCachedZipEntries().filter((e) => e.zip !== result.zip);
    const next: StoredZipEntry[] = [
      {zip: result.zip, result, savedAt: new Date().toISOString()},
      ...existing,
    ].slice(0, MAX_CACHED_ZIPS);
    localStorage.setItem(ZIP_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

export function getCachedMemberDetail(
  memberId: string
): RepresentativeDetailRecord | null {
  try {
    const raw = localStorage.getItem(DETAIL_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, RepresentativeDetailRecord>;
    return map[memberId] ?? null;
  } catch {
    return null;
  }
}

export function saveMemberDetailToCache(
  detail: RepresentativeDetailRecord
): void {
  try {
    const raw = localStorage.getItem(DETAIL_CACHE_KEY);
    const map: Record<string, RepresentativeDetailRecord> = raw
      ? JSON.parse(raw)
      : {};
    map[detail.memberId] = detail;
    const keys = Object.keys(map);
    if (keys.length > 30) {
      delete map[keys[0]];
    }
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

export function getPartyTextColor(party: string): string {
  const normalized = party.toLowerCase();
  if (normalized.includes('democrat')) return 'text-[#1D4ED8]';
  if (normalized.includes('republican')) return 'text-[#B91C1C]';
  return 'text-[#475569]';
}

export function getVoteTextColor(vote: string): string {
  const normalized = vote.toLowerCase();
  if (normalized === 'yea' || normalized === 'aye' || normalized === 'yes') {
    return 'text-[#166534]';
  }
  if (normalized === 'nay' || normalized === 'no') {
    return 'text-[#991B1B]';
  }
  return 'text-[#475569]';
}

export function getInitials(name: string): string {
  const parts = name
    .replace(/^(Rep\.|Sen\.|Del\.)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
