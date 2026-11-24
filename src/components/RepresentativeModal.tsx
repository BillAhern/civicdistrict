import React, {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  CongressMemberSummary,
  RepresentativeDetailRecord,
} from '../types/civic';
import {getPartyTextColor, getVoteTextColor} from '../utils/civicCache';
import {MemberAvatar} from './MemberAvatar';

interface RepresentativeModalProps {
  member: CongressMemberSummary;
  detail: RepresentativeDetailRecord | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}

export const RepresentativeModal: React.FC<RepresentativeModalProps> = ({
  member,
  detail,
  loading,
  error,
  onRetry,
  onClose,
}) => {
  const [factCheckOpen, setFactCheckOpen] = useState(true);
  const [votingOpen, setVotingOpen] = useState(true);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      window.setTimeout(() => {
        setCopiedValue((curr) => (curr === value ? null : curr));
      }, 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const partyColor = getPartyTextColor(member.party);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/50 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rep-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white md3-elev-3 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab indicator & top dialog bar */}
        <div className="flex shrink-0 flex-col border-b border-[#D8DEE6] bg-white px-5 pb-3 pt-3 sm:px-7 sm:py-4">
          <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-[#CBD5E1] sm:hidden" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 text-xs font-medium text-[#64748B]">
              <span>{member.chamber === 'Senate' ? 'United States Senate' : 'U.S. House of Representatives'}</span>
              <span aria-hidden="true" className="mx-2 text-[#CBD5E1]">
                ·
              </span>
              <span>
                {member.districtCode ? `${member.state} (${member.districtCode})` : member.state}
              </span>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close representative dossier"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#475569] transition-colors hover:bg-[#EFF2F6] hover:text-[#0F172A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable 4-Row Material Dialog Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
          {/* ROW 1: Single Horizontal Row — Official Portrait (Left) + Personally Identifying & Office Details (Right) */}
          <section aria-label="Representative profile">
            <div className="flex flex-row items-start gap-4 sm:gap-6">
              <MemberAvatar
                name={member.name}
                portraitUrl={member.portraitUrl}
                size="modal"
              />

              <div className="min-w-0 flex-1">
                <h2
                  id="rep-modal-title"
                  className="font-serif text-2xl font-semibold leading-tight text-[#0F172A] sm:text-3xl"
                >
                  {member.name}
                </h2>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                  <span className="font-medium text-[#0F172A]">{member.title}</span>
                  <span aria-hidden="true" className="text-[#CBD5E1]">
                    ·
                  </span>
                  <span className={`font-semibold ${partyColor}`}>{member.party}</span>
                  {member.hometown && (
                    <>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <span className="text-[#475569]">{member.hometown}</span>
                    </>
                  )}
                </div>

                {/* Key Personally Identifying & Term Metrics */}
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[#EFF2F6] pt-4 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-[#64748B]">Age</dt>
                    <dd className="mt-0.5 font-mono text-sm font-medium text-[#0F172A] tabular-nums">
                      {typeof member.age === 'number' ? `${member.age} yrs` : 'Not listed'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#64748B]">Years in Office</dt>
                    <dd className="mt-0.5 font-mono text-sm font-medium text-[#0F172A] tabular-nums">
                      {typeof member.yearsInOffice === 'number'
                        ? `${member.yearsInOffice} ${member.yearsInOffice === 1 ? 'yr' : 'yrs'}${
                            member.termStartYear ? ` (${member.termStartYear})` : ''
                          }`
                        : member.termStartYear
                          ? `Since ${member.termStartYear}`
                          : 'Current term'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#64748B]">Next Election</dt>
                    <dd className="mt-0.5 font-mono text-sm font-medium text-[#0F172A] tabular-nums">
                      {member.nextElectionYear ?? 'Scheduled'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#64748B]">Term Ends</dt>
                    <dd className="mt-0.5 font-mono text-sm font-medium text-[#0F172A] tabular-nums">
                      {member.termEndDate ?? '—'}
                    </dd>
                  </div>
                </dl>

                {/* Leadership Roles & Committee Assignments (Confirmed Phase 1 additions) */}
                {(member.leadershipRoles.length > 0 || member.committees.length > 0) && (
                  <div className="mt-4 space-y-2 border-t border-[#EFF2F6] pt-3.5 text-sm">
                    {member.leadershipRoles.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-[#64748B]">
                          Leadership:{' '}
                        </span>
                        <span className="text-[#0F172A]">
                          {member.leadershipRoles.join(' · ')}
                        </span>
                      </div>
                    )}
                    {member.committees.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-[#64748B]">
                          Committees:{' '}
                        </span>
                        <span className="text-[#475569]">
                          {member.committees.join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <hr className="my-6 border-[#D8DEE6]" />

          {/* Error Recovery Banner for Stage-2 Details */}
          {error && !loading && (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5 text-sm text-[#991B1B]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-full bg-[#1B365D] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#142947] cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* ROW 2: Contact Information & Social / Community Presence */}
          <section aria-label="Contact information and digital channels">
            <h3 className="font-serif text-lg font-semibold text-[#0F172A]">
              Contact &amp; Official Channels
            </h3>

            {loading ? (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy="true">
                <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
              </div>
            ) : detail ? (
              <div className="mt-4 space-y-5">
                {/* Direct Phone, Email/Contact, Website */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {detail.contact.phones.map((phone) => (
                    <div
                      key={`${phone.label}-${phone.number}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[#F4F6F9] px-4 py-3"
                    >
                      <a
                        href={`tel:${phone.number.replace(/[^\d+]/g, '')}`}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-[#1B365D]"
                      >
                        <Phone
                          className="h-4 w-4 shrink-0 text-[#1B365D]"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-[#64748B] truncate">
                            {phone.label}
                          </div>
                          <div className="font-mono text-sm font-medium text-[#0F172A] tabular-nums">
                            {phone.number}
                          </div>
                        </div>
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleCopy(phone.number)}
                        aria-label={`Copy ${phone.label} phone number`}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#475569] transition-colors hover:bg-[#DCE6F5] hover:text-[#1B365D] cursor-pointer"
                      >
                        {copiedValue === phone.number ? (
                          <Check className="h-4 w-4 text-[#166534]" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}

                  {detail.contact.emailOrContactForm && (
                    <a
                      href={
                        detail.contact.emailOrContactForm.isUrl
                          ? detail.contact.emailOrContactForm.value
                          : `mailto:${detail.contact.emailOrContactForm.value}`
                      }
                      target={
                        detail.contact.emailOrContactForm.isUrl ? '_blank' : undefined
                      }
                      rel={
                        detail.contact.emailOrContactForm.isUrl
                          ? 'noopener noreferrer'
                          : undefined
                      }
                      className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl bg-[#F4F6F9] px-4 py-3 transition-colors hover:bg-[#DCE6F5]/70"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Mail
                          className="h-4 w-4 shrink-0 text-[#1B365D]"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-[#64748B]">
                            {detail.contact.emailOrContactForm.label}
                          </div>
                          <div className="truncate text-sm font-medium text-[#1B365D]">
                            {detail.contact.emailOrContactForm.isUrl
                              ? 'Open Official Contact Portal'
                              : detail.contact.emailOrContactForm.value}
                          </div>
                        </div>
                      </div>
                      <ExternalLink
                        className="h-4 w-4 shrink-0 text-[#64748B]"
                        aria-hidden="true"
                      />
                    </a>
                  )}

                  {detail.contact.website && (
                    <a
                      href={detail.contact.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[60px] items-center justify-between gap-3 rounded-2xl bg-[#F4F6F9] px-4 py-3 transition-colors hover:bg-[#DCE6F5]/70"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Globe
                          className="h-4 w-4 shrink-0 text-[#1B365D]"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="text-xs text-[#64748B]">Official Website</div>
                          <div className="truncate text-sm font-medium text-[#1B365D]">
                            {detail.contact.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </div>
                        </div>
                      </div>
                      <ExternalLink
                        className="h-4 w-4 shrink-0 text-[#64748B]"
                        aria-hidden="true"
                      />
                    </a>
                  )}
                </div>

                {/* Office Addresses */}
                {(detail.contact.dcOffice || detail.contact.districtOffice) && (
                  <div className="grid grid-cols-1 gap-3 text-sm text-[#475569] sm:grid-cols-2">
                    {detail.contact.dcOffice && (
                      <div className="flex items-start gap-2.5">
                        <MapPin
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#64748B]"
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-xs font-medium text-[#64748B]">
                            Washington, D.C. Office
                          </div>
                          <div className="mt-0.5 text-[#0F172A]">
                            {detail.contact.dcOffice}
                          </div>
                        </div>
                      </div>
                    )}
                    {detail.contact.districtOffice && (
                      <div className="flex items-start gap-2.5">
                        <MapPin
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#64748B]"
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-xs font-medium text-[#64748B]">
                            District / State Office
                          </div>
                          <div className="mt-0.5 text-[#0F172A]">
                            {detail.contact.districtOffice}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Social Media & Community Channels (X, Instagram, Facebook, YouTube, Reddit, Discord, etc.) */}
                <div>
                  <div className="text-xs font-medium text-[#64748B]">
                    Social &amp; Community Accounts
                  </div>
                  {detail.contact.socials.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {detail.contact.socials.map((social) => (
                        <a
                          key={`${social.platform}-${social.url}`}
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#D8DEE6] bg-white px-3.5 py-2 text-sm text-[#0F172A] transition-colors hover:border-[#1B365D] hover:bg-[#F7FAFE] whitespace-nowrap"
                        >
                          <span className="font-semibold text-[#1B365D]">
                            {social.platform}
                          </span>
                          <span className="text-[#475569]">{social.handle}</span>
                          <ExternalLink
                            className="h-3.5 w-3.5 text-[#64748B]"
                            aria-hidden="true"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm text-[#64748B]">
                      No verified social media channels were returned for this office.
                    </p>
                  )}

                  {detail.contact.communityPlatformsNote && (
                    <p className="mt-2.5 text-xs text-[#64748B]">
                      {detail.contact.communityPlatformsNote}
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <hr className="my-6 border-[#D8DEE6]" />

          {/* ROW 3 (Collapsible): Fact-Checker Records & Public Accuracy Sources */}
          <section aria-label="Fact-checker records">
            <button
              type="button"
              aria-expanded={factCheckOpen}
              onClick={() => setFactCheckOpen((prev) => !prev)}
              className="flex w-full min-h-[48px] items-center justify-between gap-4 rounded-xl py-1 text-left transition-colors hover:text-[#1B365D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] cursor-pointer"
            >
              <div>
                <h3 className="font-serif text-lg font-semibold text-[#0F172A]">
                  Fact-Check Records &amp; Public Accuracy Sources
                </h3>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  Source-attributed reviews from PolitiFact, FactCheck.org, Washington Post Fact Checker, Snopes, and other nonpartisan monitors
                </p>
              </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF2F6] text-[#1B365D]">
                <ChevronDown
                  className={`h-5 w-5 transition-transform duration-200 ${
                    factCheckOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>

            {factCheckOpen && (
              <div className="mt-4">
                {loading ? (
                  <div className="space-y-3" aria-busy="true">
                    <div className="h-24 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                    <div className="h-24 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                  </div>
                ) : detail && detail.factChecks.length > 0 ? (
                  <div className="divide-y divide-[#EFF2F6] rounded-2xl border border-[#D8DEE6] bg-[#FAFBFD]">
                    {detail.factChecks.map((outlet) => (
                      <div key={outlet.outlet} className="p-4 sm:p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-[#0F172A]">
                            {outlet.outlet}
                          </h4>
                          {outlet.profileUrl && (
                            <a
                              href={outlet.profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap"
                            >
                              <span>View source archive</span>
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          )}
                        </div>

                        {outlet.summary && (
                          <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">
                            {outlet.summary}
                          </p>
                        )}

                        {outlet.availabilityNote && (
                          <p className="mt-1.5 text-xs text-[#64748B]">
                            {outlet.availabilityNote}
                          </p>
                        )}

                        {outlet.recentChecks.length > 0 && (
                          <ul className="mt-3 space-y-2.5 border-t border-[#EFF2F6] pt-3">
                            {outlet.recentChecks.map((check, idx) => (
                              <li key={`${outlet.outlet}-${idx}`} className="text-sm">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                  <span className="font-medium text-[#0F172A]">
                                    {check.assessment}
                                  </span>
                                  {check.date && (
                                    <span className="font-mono text-xs text-[#64748B] tabular-nums">
                                      {check.date}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs leading-relaxed text-[#475569]">
                                  {check.claim}
                                </p>
                                {check.url && (
                                  <a
                                    href={check.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#1B365D] hover:underline"
                                  >
                                    <span>Read fact-check</span>
                                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#64748B]">
                    No indexed fact-check records were found across major nonpartisan fact-checking archives for this lawmaker.
                  </p>
                )}
              </div>
            )}
          </section>

          <hr className="my-6 border-[#D8DEE6]" />

          {/* ROW 4 (Collapsible): Voting Record & Legislative Activity */}
          <section aria-label="Voting record and legislation">
            <button
              type="button"
              aria-expanded={votingOpen}
              onClick={() => setVotingOpen((prev) => !prev)}
              className="flex w-full min-h-[48px] items-center justify-between gap-4 rounded-xl py-1 text-left transition-colors hover:text-[#1B365D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] cursor-pointer"
            >
              <div>
                <h3 className="font-serif text-lg font-semibold text-[#0F172A]">
                  Voting Record &amp; Legislative Activity
                </h3>
                <p className="mt-0.5 text-xs text-[#64748B]">
                  {detail?.votingRecord.sessionLabel ??
                    'Recent roll-call votes and sponsored federal legislation'}
                </p>
              </div>
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFF2F6] text-[#1B365D]">
                <ChevronDown
                  className={`h-5 w-5 transition-transform duration-200 ${
                    votingOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>

            {votingOpen && (
              <div className="mt-4">
                {loading ? (
                  <div className="space-y-3" aria-busy="true">
                    <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                    <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                    <div className="h-16 animate-pulse rounded-2xl bg-[#EFF2F6]" />
                  </div>
                ) : detail ? (
                  <div className="space-y-5">
                    {(detail.votingRecord.summary || detail.votingRecord.votingRecordUrl) && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        {detail.votingRecord.summary && (
                          <p className="max-w-prose text-sm leading-relaxed text-[#475569]">
                            {detail.votingRecord.summary}
                          </p>
                        )}
                        {detail.votingRecord.votingRecordUrl && (
                          <a
                            href={detail.votingRecord.votingRecordUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#1B365D] hover:underline whitespace-nowrap"
                          >
                            <span>Full Congress.gov record</span>
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Notable Roll-Call Votes */}
                    {detail.votingRecord.keyVotes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-[#64748B]">
                          Recent Notable Roll-Call Votes
                        </h4>
                        <div className="mt-2.5 divide-y divide-[#EFF2F6] rounded-2xl border border-[#D8DEE6]">
                          {detail.votingRecord.keyVotes.map((vote, idx) => (
                            <div
                              key={`${vote.billNumber}-${idx}`}
                              className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span className="font-mono text-xs font-medium text-[#1B365D] tabular-nums">
                                    {vote.billNumber}
                                  </span>
                                  <span className="text-sm font-semibold text-[#0F172A]">
                                    {vote.title}
                                  </span>
                                </div>
                                {vote.summary && (
                                  <p className="mt-1 text-xs leading-relaxed text-[#475569]">
                                    {vote.summary}
                                  </p>
                                )}
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 text-xs text-[#64748B] tabular-nums">
                                  {vote.date && <span>{vote.date}</span>}
                                  {vote.url && (
                                    <>
                                      {vote.date && <span aria-hidden="true">·</span>}
                                      <a
                                        href={vote.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-medium text-[#1B365D] hover:underline"
                                      >
                                        <span>Roll-call record</span>
                                        <ExternalLink
                                          className="h-3 w-3"
                                          aria-hidden="true"
                                        />
                                      </a>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 sm:text-right">
                                <span className="text-xs text-[#64748B] sm:block">
                                  Vote Cast{' '}
                                </span>
                                <span
                                  className={`font-mono text-sm font-semibold tabular-nums ${getVoteTextColor(
                                    vote.vote
                                  )}`}
                                >
                                  {vote.vote}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Key Sponsored Bills */}
                    {detail.votingRecord.sponsoredBills.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-[#64748B]">
                          Key Sponsored &amp; Co-Sponsored Legislation
                        </h4>
                        <ul className="mt-2.5 divide-y divide-[#EFF2F6] rounded-2xl border border-[#D8DEE6]">
                          {detail.votingRecord.sponsoredBills.map((bill, idx) => (
                            <li
                              key={`${bill.billNumber}-${idx}`}
                              className="flex flex-col justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                            >
                              <div className="min-w-0">
                                <span className="font-mono text-xs font-medium text-[#1B365D] tabular-nums mr-2">
                                  {bill.billNumber}
                                </span>
                                <span className="text-sm font-medium text-[#0F172A]">
                                  {bill.title}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-xs text-[#64748B]">
                                <span>{bill.status}</span>
                                {bill.url && (
                                  <a
                                    href={bill.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`View ${bill.billNumber} on Congress.gov`}
                                    className="inline-flex items-center text-[#1B365D] hover:underline"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          {/* Grounded Citations Footer */}
          {detail && detail.sources.length > 0 && (
            <div className="mt-6 border-t border-[#EFF2F6] pt-4">
              <div className="text-xs font-medium text-[#64748B]">
                Cited Public Sources
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#475569]">
                {detail.sources.slice(0, 6).map((source, idx) => (
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
                      <span className="max-w-[200px] truncate">{source.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
