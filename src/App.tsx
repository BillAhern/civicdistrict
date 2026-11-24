import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  MapPin,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type {
  CongressMemberSummary,
  DistrictLookupResult,
  RepresentativeDetailRecord,
} from './types/civic';
import {
  getCachedMemberDetail,
  getCachedZipLookup,
  saveMemberDetailToCache,
  saveZipLookupToCache,
} from './utils/civicCache';
import {
  lookupDistrictByZip,
  lookupRepresentativeDetails,
} from './services/civicClient';
import {useOnlineStatus} from './hooks/useOnlineStatus';
import {OfflineIndicator, PWAInstallButton} from './components/PWAInstallButton';
import {RepresentativeFab} from './components/RepresentativeFab';
import {RepresentativeModal} from './components/RepresentativeModal';

export default function App() {
  const isOnline = useOnlineStatus();

  const [zipInput, setZipInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<DistrictLookupResult | null>(
    null
  );
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Split-district active selector ('all' or specific district code)
  const [activeDistrictCode, setActiveDistrictCode] = useState<string>('all');

  // Modal state
  const [selectedMember, setSelectedMember] =
    useState<CongressMemberSummary | null>(null);
  const [memberDetail, setMemberDetail] =
    useState<RepresentativeDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const zipFieldRef = useRef<HTMLInputElement | null>(null);

  const performZipLookup = useCallback(
    async (rawZip: string, options?: {forceRefresh?: boolean}) => {
      const cleaned = rawZip.replace(/\D/g, '').slice(0, 5);
      setZipInput(cleaned);
      setInputError(null);
      setLookupError(null);

      if (!/^\d{5}$/.test(cleaned)) {
        setInputError('Enter a valid 5-digit U.S. ZIP code.');
        return;
      }

      const cached = getCachedZipLookup(cleaned);
      if (cached && !options?.forceRefresh && !isOnline) {
        setLookupResult(cached);
        setActiveDistrictCode(
          cached.districts.length === 1 ? cached.districts[0].code : 'all'
        );
        setIsFromCache(true);
        return;
      }

      if (!isOnline && !cached) {
        setLookupError(
          'You are currently offline and this ZIP code has not been cached yet. Select a recent ZIP below or reconnect to search.'
        );
        return;
      }

      setIsLookingUp(true);
      setIsFromCache(false);

      try {
        const payload = await lookupDistrictByZip(cleaned);

        saveZipLookupToCache(payload);
        setLookupResult(payload);
        setActiveDistrictCode(
          payload.districts.length === 1 ? payload.districts[0].code : 'all'
        );
      } catch (err) {
        if (cached) {
          setLookupResult(cached);
          setActiveDistrictCode(
            cached.districts.length === 1 ? cached.districts[0].code : 'all'
          );
          setIsFromCache(true);
          setLookupError(
            'Live lookup is temporarily unavailable — showing your saved offline record.'
          );
        } else {
          setLookupError(
            err instanceof Error
              ? err.message
              : 'Unable to retrieve district data right now.'
          );
        }
      } finally {
        setIsLookingUp(false);
      }
    },
    [isOnline]
  );

  const loadMemberDetails = useCallback(
    async (member: CongressMemberSummary, forceRefresh = false) => {
      setDetailError(null);

      const cached = getCachedMemberDetail(member.id);
      if (cached && !forceRefresh) {
        setMemberDetail(cached);
        setDetailLoading(false);
        return;
      }

      if (!isOnline) {
        setMemberDetail(cached ?? null);
        setDetailLoading(false);
        if (!cached) {
          setDetailError(
            'Offline mode: detailed contact, fact-check, and voting records require an internet connection the first time you open a profile.'
          );
        }
        return;
      }

      setMemberDetail(null);
      setDetailLoading(true);

      try {
        const payload = await lookupRepresentativeDetails({
          memberId: member.id,
          bioguideId: member.bioguideId ?? null,
          name: member.name,
          title: member.title,
          chamber: member.chamber,
          state: member.state,
          districtCode: member.districtCode ?? null,
        });

        saveMemberDetailToCache(payload);
        setMemberDetail(payload);
      } catch (err) {
        setDetailError(
          err instanceof Error
            ? err.message
            : 'Unable to load contact, fact-check, and voting records.'
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [isOnline]
  );

  const handleSelectMember = useCallback(
    (member: CongressMemberSummary) => {
      setSelectedMember(member);
      void loadMemberDetails(member, false);
    },
    [loadMemberDetails]
  );

  const handleCloseModal = useCallback(() => {
    setSelectedMember(null);
    setDetailError(null);
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performZipLookup(zipInput);
  };

  const handleResetToOnboarding = () => {
    setLookupResult(null);
    setLookupError(null);
    setInputError(null);
    setSelectedMember(null);
    window.setTimeout(() => {
      zipFieldRef.current?.focus();
    }, 50);
  };

  // Keep activeDistrictCode valid if result changes
  useEffect(() => {
    if (!lookupResult) return;
    if (
      activeDistrictCode !== 'all' &&
      !lookupResult.districts.some((d) => d.code === activeDistrictCode)
    ) {
      setActiveDistrictCode('all');
    }
  }, [lookupResult, activeDistrictCode]);

  const houseMembers = useMemo(() => {
    if (!lookupResult) return [];
    const allHouse = lookupResult.representatives.filter(
      (r) => r.chamber === 'House'
    );
    if (activeDistrictCode === 'all' || lookupResult.districts.length <= 1) {
      return allHouse;
    }
    const targetDistrict = lookupResult.districts.find(
      (d) => d.code === activeDistrictCode
    );
    if (!targetDistrict) return allHouse;
    const filtered = allHouse.filter(
      (r) =>
        targetDistrict.representativeIds.includes(r.id) ||
        r.districtCode?.toLowerCase() === targetDistrict.code.toLowerCase()
    );
    return filtered.length > 0 ? filtered : allHouse;
  }, [lookupResult, activeDistrictCode]);

  const senateMembers = useMemo(() => {
    if (!lookupResult) return [];
    return lookupResult.representatives.filter((r) => r.chamber === 'Senate');
  }, [lookupResult]);

  const activeDistrictLabel = useMemo(() => {
    if (!lookupResult) return '';
    if (lookupResult.districts.length === 0) {
      return `${lookupResult.city}, ${lookupResult.state}`;
    }
    if (activeDistrictCode === 'all' && lookupResult.districts.length > 1) {
      return `${lookupResult.districts.length} Overlapping Congressional Districts`;
    }
    const matched =
      lookupResult.districts.find((d) => d.code === activeDistrictCode) ??
      lookupResult.districts[0];
    return `${matched.label} (${matched.code})`;
  }, [lookupResult, activeDistrictCode]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-[#0F172A]">
      {/* Mobile-First Sticky Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-[#D8DEE6] bg-[#F8F9FA]/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <button
            type="button"
            onClick={handleResetToOnboarding}
            className="font-serif text-xl font-semibold tracking-tight text-[#1B365D] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] cursor-pointer"
          >
            CivicDistrict
          </button>

          <PWAInstallButton />
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {!lookupResult ? (
          /* CLEAN, MOBILE-FIRST SINGLE-INPUT ONBOARDING */
          <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-20">
            <section aria-labelledby="onboarding-heading">
              <p className="text-xs font-semibold tracking-wider text-[#1B365D] uppercase">
                U.S. Congressional Lookup
              </p>

              <h1
                id="onboarding-heading"
                className="mt-2.5 font-serif text-3xl font-semibold leading-[1.15] tracking-tight text-[#0F172A] sm:text-5xl"
              >
                Who represents you in Congress?
              </h1>

              <p className="mt-3 text-base leading-relaxed text-[#475569]">
                Enter your 5-digit ZIP code to see your congressional district,
                U.S. Representative, and Senators.
              </p>

              {/* Single-Input Material Design 3 Outlined ZIP Field */}
              <form onSubmit={handleFormSubmit} noValidate className="mt-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <div className="relative flex-1">
                    <label
                      htmlFor="zip-onboarding-input"
                      className="absolute -top-2.5 left-3.5 bg-[#F8F9FA] px-1.5 text-xs font-medium text-[#1B365D]"
                    >
                      5-Digit ZIP Code
                    </label>
                    <input
                      ref={zipFieldRef}
                      id="zip-onboarding-input"
                      name="zip"
                      type="text"
                      inputMode="numeric"
                      pattern="\d{5}"
                      autoComplete="postal-code"
                      maxLength={5}
                      placeholder="e.g. 10001"
                      value={zipInput}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
                        setZipInput(digits);
                        if (inputError) setInputError(null);
                        if (lookupError) setLookupError(null);
                      }}
                      aria-invalid={Boolean(inputError || lookupError)}
                      aria-describedby={
                        inputError || lookupError ? 'zip-error-msg' : undefined
                      }
                      className="h-14 w-full rounded-2xl border-2 border-[#94A3B8] bg-white px-4 pr-12 font-mono text-lg font-medium tracking-widest text-[#0F172A] tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-[#94A3B8] transition-colors focus:border-[#1B365D] focus:outline-none"
                    />
                    {zipInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setZipInput('');
                          setInputError(null);
                          zipFieldRef.current?.focus();
                        }}
                        aria-label="Clear ZIP code"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#64748B] hover:bg-[#EFF2F6] hover:text-[#0F172A] cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isLookingUp}
                    className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#1B365D] px-6 text-base font-semibold text-white md3-elev-1 transition-all duration-150 hover:bg-[#142947] hover:md3-elev-2 active:scale-[0.985] disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] whitespace-nowrap shrink-0 sm:w-auto sm:min-w-[156px] sm:text-sm cursor-pointer"
                  >
                    {isLookingUp ? (
                      <>
                        <RefreshCw
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        <span>Looking Up…</span>
                      </>
                    ) : (
                      <>
                        <span>Look Up</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>

                {(inputError || lookupError) && (
                  <div
                    id="zip-error-msg"
                    role="alert"
                    className="mt-3 flex items-start gap-2 text-sm text-[#B91C1C]"
                  >
                    <AlertCircle
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{inputError || lookupError}</span>
                  </div>
                )}
              </form>
            </section>
          </div>
        ) : (
          /* DISTRICT & DELEGATION RESULTS VIEW */
          <div
            id="delegation"
            className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10"
          >
            {/* Workspace Inline ZIP Switcher Toolbar */}
            <div className="flex flex-col gap-4 border-b border-[#D8DEE6] pb-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#64748B]">
                  <span className="inline-flex items-center gap-1 text-[#1B365D]">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-mono tabular-nums">
                      ZIP {lookupResult.zip}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {lookupResult.city}, {lookupResult.state}
                  </span>
                  {lookupResult.county && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{lookupResult.county}</span>
                    </>
                  )}
                  {isFromCache && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#1B365D]">Saved offline copy</span>
                    </>
                  )}
                </div>

                <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-4xl">
                  {activeDistrictLabel}
                </h1>
              </div>

              {/* Compact Mobile-Friendly Inline ZIP Search Form */}
              <form
                onSubmit={handleFormSubmit}
                noValidate
                className="flex w-full items-center gap-2 md:w-auto"
              >
                <div className="relative flex-1 md:flex-none">
                  <label htmlFor="zip-inline-input" className="sr-only">
                    Search another 5-digit ZIP code
                  </label>
                  <input
                    id="zip-inline-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="Change ZIP"
                    value={zipInput}
                    onChange={(e) => {
                      setZipInput(e.target.value.replace(/\D/g, '').slice(0, 5));
                      if (inputError) setInputError(null);
                    }}
                    className="h-11 w-full rounded-xl border border-[#94A3B8] bg-white px-3.5 font-mono text-sm font-medium text-[#0F172A] tabular-nums placeholder:font-sans placeholder:font-normal placeholder:text-[#94A3B8] focus:border-[#1B365D] focus:outline-none md:w-36"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLookingUp}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#1B365D] px-4 text-sm font-medium text-white transition-colors hover:bg-[#142947] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isLookingUp ? (
                    <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>Lookup</span>
                </button>
                <button
                  type="button"
                  disabled={isLookingUp || !isOnline}
                  onClick={() =>
                    void performZipLookup(lookupResult.zip, {forceRefresh: true})
                  }
                  title="Refresh live congressional records"
                  aria-label="Refresh live congressional records"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D8DEE6] bg-white text-[#475569] transition-colors hover:border-[#1B365D] hover:text-[#1B365D] disabled:opacity-45 cursor-pointer"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isLookingUp ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </form>
            </div>

            {(inputError || lookupError) && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{inputError || lookupError}</span>
              </div>
            )}

            {/* Split-District Segmented Switcher (Confirmed Phase 1 choice) */}
            {lookupResult.districts.length > 1 && (
              <div className="mt-6 rounded-2xl border border-[#D8DEE6] bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[#0F172A]">
                      Multiple Congressional Districts Overlap ZIP{' '}
                      <span className="font-mono tabular-nums">
                        {lookupResult.zip}
                      </span>
                    </h2>
                    <p className="mt-0.5 text-xs text-[#64748B]">
                      {lookupResult.splitNote ||
                        'Select a specific district below to filter your U.S. House Representative.'}
                    </p>
                  </div>

                  <div
                    role="tablist"
                    aria-label="Select overlapping congressional district"
                    className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-[#EFF2F6] p-1"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeDistrictCode === 'all'}
                      onClick={() => setActiveDistrictCode('all')}
                      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeDistrictCode === 'all'
                          ? 'bg-white text-[#1B365D] md3-elev-1'
                          : 'text-[#475569] hover:text-[#0F172A]'
                      }`}
                    >
                      All ({lookupResult.districts.length})
                    </button>
                    {lookupResult.districts.map((dist) => (
                      <button
                        key={dist.code}
                        type="button"
                        role="tab"
                        aria-selected={activeDistrictCode === dist.code}
                        onClick={() => setActiveDistrictCode(dist.code)}
                        className={`min-h-[36px] rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          activeDistrictCode === dist.code
                            ? 'bg-white text-[#1B365D] md3-elev-1'
                            : 'text-[#475569] hover:text-[#0F172A]'
                        }`}
                      >
                        {dist.code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Loading Overlay Skeleton when switching ZIPs */}
            {isLookingUp ? (
              <div className="mt-8 space-y-8" aria-busy="true">
                <div>
                  <div className="h-5 w-56 animate-pulse rounded bg-[#E2E8F0]" />
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="h-24 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                  </div>
                </div>
                <div>
                  <div className="h-5 w-44 animate-pulse rounded bg-[#E2E8F0]" />
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="h-24 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                    <div className="h-24 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 space-y-10">
                {/* U.S. House of Representatives — Material Extended FABs */}
                <section aria-labelledby="house-heading">
                  <h2
                    id="house-heading"
                    className="font-serif text-2xl font-semibold text-[#0F172A]"
                  >
                    U.S. House of Representatives
                  </h2>

                  {houseMembers.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {houseMembers.map((member) => (
                        <RepresentativeFab
                          key={member.id}
                          member={member}
                          onSelect={handleSelectMember}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[#64748B]">
                      No House representative found for the selected district filter.
                    </p>
                  )}
                </section>

                {/* U.S. Senate — Material Extended FABs */}
                <section aria-labelledby="senate-heading">
                  <h2
                    id="senate-heading"
                    className="font-serif text-2xl font-semibold text-[#0F172A]"
                  >
                    United States Senate
                  </h2>

                  {senateMembers.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {senateMembers.map((member) => (
                        <RepresentativeFab
                          key={member.id}
                          member={member}
                          onSelect={handleSelectMember}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-[#D8DEE6] bg-white p-5 text-sm text-[#475569]">
                      {lookupResult.state} does not have voting representation in
                      the United States Senate.
                    </div>
                  )}
                </section>

                {/* Grounding Sources & Verification Footer */}
                {lookupResult.sources.length > 0 && (
                  <section
                    id="sources-methodology"
                    aria-label="District verification sources"
                    className="border-t border-[#D8DEE6] pt-6"
                  >
                    <div className="text-xs font-medium text-[#64748B]">
                      Verified Public Record Sources
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#475569]">
                      {lookupResult.sources.slice(0, 8).map((source, idx) => (
                        <React.Fragment key={source.uri}>
                          {idx > 0 && (
                            <span aria-hidden="true" className="text-[#CBD5E1]">
                              ·
                            </span>
                          )}
                          <a
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-[#1B365D] hover:underline"
                          >
                            <span className="max-w-[220px] truncate">
                              {source.title}
                            </span>
                            <ExternalLink
                              className="h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                          </a>
                        </React.Fragment>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-[#D8DEE6] bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 px-4 py-4 text-xs text-[#64748B] sm:flex-row sm:items-center sm:px-6">
          <span>CivicDistrict — Nonpartisan U.S. Congressional Reference</span>
          <span>Fact-checks and roll-call votes attributed to public sources.</span>
        </div>
      </footer>

      {selectedMember && (
        <RepresentativeModal
          member={selectedMember}
          detail={memberDetail}
          loading={detailLoading}
          error={detailError}
          onRetry={() => void loadMemberDetails(selectedMember, true)}
          onClose={handleCloseModal}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
