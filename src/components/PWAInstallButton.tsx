import React, {useState} from 'react';
import {Download, Share, WifiOff, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';
import {useOnlineStatus} from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  fallbackAction?: React.ReactNode;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  fallbackAction,
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return <>{fallbackAction ?? null}</>;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#1B365D] px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-[#142947] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#DCE6F5] px-4 py-2 text-sm font-medium text-[#1B365D] transition-colors duration-150 hover:bg-[#CEDDF1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B365D] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl bg-white p-6 md3-elev-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <h3
                  id="ios-install-title"
                  className="font-serif text-xl font-semibold text-[#0F172A]"
                >
                  Install CivicDistrict
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#475569] transition-colors hover:bg-[#EFF2F6] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[#475569]">
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-xs font-medium text-[#1B365D] mt-0.5">
                    01.
                  </span>
                  <span>
                    Tap the{' '}
                    <strong className="font-semibold text-[#0F172A] inline-flex items-center gap-1">
                      Share <Share className="h-3.5 w-3.5 inline" aria-hidden="true" />
                    </strong>{' '}
                    button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-xs font-medium text-[#1B365D] mt-0.5">
                    02.
                  </span>
                  <span>
                    Scroll down and select{' '}
                    <strong className="font-semibold text-[#0F172A]">
                      Add to Home Screen
                    </strong>
                    .
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-xs font-medium text-[#1B365D] mt-0.5">
                    03.
                  </span>
                  <span>
                    Tap <strong className="font-semibold text-[#0F172A]">Add</strong>{' '}
                    to access your saved districts offline anytime.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-full bg-[#1B365D] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#142947] cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{fallbackAction ?? null}</>;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-md items-center gap-2.5 rounded-2xl border border-[#D8DEE6] bg-[#0F172A] px-4 py-3 text-sm text-white md3-elev-2 sm:left-4 sm:right-auto"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-[#93C5FD]" aria-hidden="true" />
      <span>Offline mode — displaying previously cached ZIP records.</span>
    </div>
  );
};
