import React, { useEffect } from 'react';
import { Globe, Swords, Volume2, VolumeX } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenProps {
  muted: boolean;
  onToggleMute: () => void;
  onStartSingle: () => void;
  onStartOnline: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  muted,
  onToggleMute,
  onStartSingle,
  onStartOnline,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStartSingle();
      } else if (e.key.toLowerCase() === 'm') {
        onToggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStartSingle, onToggleMute]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between px-4 pt-2 pb-4 sm:px-6 sm:pt-3 sm:pb-6">
      {/* Top Bar: Utility buttons + TEKE TEK Title Lockup keeping center arena open */}
      <div className="relative flex flex-col items-center">
        <div className="flex w-full items-center justify-end gap-2.5 sm:absolute sm:top-1 sm:right-0 sm:w-auto">
          <div className="pointer-events-auto flex items-center gap-2.5">
            <PWAInstallButton />
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
              title={muted ? 'Sesi aç (M)' : 'Sesi kapat (M)'}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none sm:h-11 sm:w-11"
            >
              {muted ? (
                <VolumeX className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Volume2 className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Bespoke inline SVG Title Lockup positioned above the live arena */}
        <div className="w-full max-w-[235px] sm:max-w-[330px]">
          <svg
            viewBox="0 0 420 92"
            className="mx-auto h-auto w-full"
            role="img"
            aria-label="TEKE TEK"
          >
            <path
              d="M34 20 L43 31 L58 26 L52 40 L65 49 L49 54 L53 69 L39 60 L25 69 L29 54 L13 49 L26 40 L20 26 Z"
              fill="#FACC15"
              stroke="#1E293B"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path
              d="M386 20 L395 31 L410 26 L404 40 L417 49 L401 54 L405 69 L391 60 L377 69 L381 54 L365 49 L378 40 L372 26 Z"
              fill="#38BDF8"
              stroke="#1E293B"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <text
              x="210"
              y="62"
              textAnchor="middle"
              fontFamily="'Trebuchet MS', system-ui, sans-serif"
              fontWeight="900"
              fontSize="56"
              letterSpacing="3"
              fill="#E63946"
              stroke="#1E293B"
              strokeWidth="10"
              strokeLinejoin="round"
              style={{ paintOrder: 'stroke fill' }}
            >
              TEKE TEK
            </text>
          </svg>
        </div>
      </div>

      {/* Bottom Dual Primary CTAs (Single Player + Real-Time Online 1v1) */}
      <div className="mx-auto flex w-full max-w-[520px] flex-row items-center justify-center gap-3">
        <button
          type="button"
          data-start="true"
          data-mode="single"
          onClick={onStartSingle}
          className="pointer-events-auto inline-flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-[3px] border-[#1E293B] bg-[#E63946] px-4 py-2.5 text-sm font-black tracking-wide text-white shadow-[0_5px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E293B] sm:min-h-[54px] sm:px-6 sm:text-base"
        >
          <Swords className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
          <span>TEK OYUNCULU</span>
        </button>

        <button
          type="button"
          data-mode="online"
          onClick={onStartOnline}
          className="pointer-events-auto inline-flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-[3px] border-[#1E293B] bg-[#0284C7] px-4 py-2.5 text-sm font-black tracking-wide text-white shadow-[0_5px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E293B] sm:min-h-[54px] sm:px-6 sm:text-base"
        >
          <Globe className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
          <span>ONLINE 1v1</span>
        </button>
      </div>
    </div>
  );
};
