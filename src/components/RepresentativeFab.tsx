import React from 'react';
import {ChevronRight} from 'lucide-react';
import type {CongressMemberSummary} from '../types/civic';
import {getPartyTextColor} from '../utils/civicCache';
import {MemberAvatar} from './MemberAvatar';

interface RepresentativeFabProps {
  member: CongressMemberSummary;
  onSelect: (member: CongressMemberSummary) => void;
}

export const RepresentativeFab: React.FC<RepresentativeFabProps> = ({
  member,
  onSelect,
}) => {
  const partyColor = getPartyTextColor(member.party);

  const metaParts: string[] = [];
  if (member.chamber === 'House' && member.districtCode) {
    metaParts.push(member.districtCode);
  } else if (member.chamber === 'Senate') {
    metaParts.push(member.senateClass ? `Senate · ${member.senateClass}` : 'U.S. Senate');
  }
  if (typeof member.yearsInOffice === 'number') {
    metaParts.push(
      member.yearsInOffice === 1
        ? '1 yr in office'
        : `${member.yearsInOffice} yrs in office`
    );
  }
  if (typeof member.nextElectionYear === 'number') {
    metaParts.push(`Next election ${member.nextElectionYear}`);
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(member)}
      aria-label={`Inspect ${member.title} ${member.name}, ${member.party}`}
      className="group relative flex w-full min-h-[88px] items-center justify-between gap-4 rounded-2xl border border-[#D8DEE6] bg-white px-5 py-4 text-left md3-elev-1 transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-[#B6C4D8] hover:bg-[#F7FAFE] hover:md3-elev-2 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] cursor-pointer"
    >
      <div className="flex min-w-0 items-center gap-4">
        <MemberAvatar
          name={member.name}
          portraitUrl={member.portraitUrl}
          size="fab"
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-serif text-lg font-semibold text-[#0F172A] sm:text-xl">
              {member.name}
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-[#475569]">
            <span className="font-medium text-[#0F172A]">{member.title}</span>
            <span aria-hidden="true" className="text-[#94A3B8]">
              ·
            </span>
            <span className={`font-medium ${partyColor}`}>{member.party}</span>
          </div>

          {metaParts.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B] tabular-nums">
              {metaParts.map((part, index) => (
                <React.Fragment key={part}>
                  {index > 0 && (
                    <span aria-hidden="true" className="text-[#CBD5E1]">
                      ·
                    </span>
                  )}
                  <span>{part}</span>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      <span
        aria-hidden="true"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DCE6F5] text-[#1B365D] transition-colors duration-150 group-hover:bg-[#1B365D] group-hover:text-white"
      >
        <ChevronRight className="h-5 w-5" />
      </span>
    </button>
  );
};
