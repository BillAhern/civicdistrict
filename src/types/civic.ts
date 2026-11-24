export type Chamber = 'House' | 'Senate';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface DistrictInfo {
  code: string;
  label: string;
  representativeIds: string[];
}

export interface CongressMemberSummary {
  id: string;
  bioguideId?: string | null;
  name: string;
  title: string;
  chamber: Chamber;
  party: string;
  districtCode?: string | null;
  senateClass?: string | null;
  state: string;
  age?: number | null;
  birthDate?: string | null;
  hometown?: string | null;
  yearsInOffice?: number | null;
  termStartYear?: number | null;
  nextElectionYear?: number | null;
  termEndDate?: string | null;
  committees: string[];
  leadershipRoles: string[];
  portraitUrl?: string | null;
}

export interface DistrictLookupResult {
  zip: string;
  city: string;
  state: string;
  stateCode: string;
  county?: string | null;
  isSplitDistrict: boolean;
  splitNote?: string | null;
  districts: DistrictInfo[];
  representatives: CongressMemberSummary[];
  sources: GroundingSource[];
  fetchedAt: string;
}

export interface PhoneEntry {
  label: string;
  number: string;
}

export interface SocialChannel {
  platform: string;
  handle: string;
  url: string;
}

export interface MemberContactInfo {
  phones: PhoneEntry[];
  emailOrContactForm?: {
    label: string;
    value: string;
    isUrl: boolean;
  } | null;
  website?: string | null;
  dcOffice?: string | null;
  districtOffice?: string | null;
  socials: SocialChannel[];
  communityPlatformsNote?: string | null;
}

export interface FactCheckEntry {
  claim: string;
  assessment: string;
  date?: string | null;
  url?: string | null;
}

export interface FactCheckOutletRecord {
  outlet: string;
  summary: string;
  profileUrl?: string | null;
  availabilityNote?: string | null;
  recentChecks: FactCheckEntry[];
}

export interface RollCallVote {
  billNumber: string;
  title: string;
  date: string;
  vote: string;
  summary: string;
  url?: string | null;
}

export interface SponsoredBill {
  billNumber: string;
  title: string;
  status: string;
  url?: string | null;
}

export interface VotingRecordInfo {
  sessionLabel: string;
  summary: string;
  votingRecordUrl?: string | null;
  keyVotes: RollCallVote[];
  sponsoredBills: SponsoredBill[];
}

export interface RepresentativeDetailRecord {
  memberId: string;
  contact: MemberContactInfo;
  factChecks: FactCheckOutletRecord[];
  votingRecord: VotingRecordInfo;
  sources: GroundingSource[];
  fetchedAt: string;
}
