import React, {useEffect, useState} from 'react';
import {getInitials} from '../utils/civicCache';

interface MemberAvatarProps {
  name: string;
  portraitUrl?: string | null;
  size?: 'fab' | 'modal';
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  name,
  portraitUrl,
  size = 'fab',
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [portraitUrl]);

  const initials = getInitials(name);
  const showImage = Boolean(portraitUrl && !hasError);

  if (size === 'modal') {
    return (
      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#D8DEE6] bg-[#EFF2F6] sm:h-40 sm:w-32">
        {showImage ? (
          <img
            src={portraitUrl!}
            alt={`Official portrait of ${name}`}
            referrerPolicy="no-referrer"
            onError={() => setHasError(true)}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div
            aria-label={`Portrait placeholder for ${name}`}
            className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#E5ECF6] to-[#D4DFEE] text-[#1B365D]"
          >
            <span className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {initials}
            </span>
            <span className="mt-1 text-[11px] font-medium text-[#475569]">
              U.S. Congress
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#D8DEE6] bg-[#EFF2F6]">
      {showImage ? (
        <img
          src={portraitUrl!}
          alt={`Portrait of ${name}`}
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center bg-[#DCE6F5] font-serif text-base font-semibold text-[#1B365D]"
        >
          {initials}
        </div>
      )}
    </div>
  );
};
