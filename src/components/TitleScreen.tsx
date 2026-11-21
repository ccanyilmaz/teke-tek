import React, { useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenProps {
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  muted,
  onToggleMute,
  onStart,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onStart();
      } else if (e.key.toLowerCase() === 'm') {
        onToggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart, onToggleMute]);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between px-4 pt-3 pb-6 sm:px-6 sm:pt-3 sm:pb-6">
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
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
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
        <div className="mt-1 w-full max-w-[310px] sm:mt-0 sm:max-w-[340px]">
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

      {/* Bottom Primary Start CTA (leaves center live sparring arena 100% visible) */}
      <div className="mx-auto flex w-full max-w-[280px] justify-center">
        <button
          type="button"
          data-start="true"
          onClick={onStart}
          className="pointer-events-auto min-h-[54px] w-full cursor-pointer rounded-2xl border-[3px] border-[#1E293B] bg-[#E63946] px-8 py-3.5 text-lg font-black tracking-wide text-white shadow-[0_5px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1E293B]"
        >
          OYUNA BAŞLA
        </button>
      </div>
    </div>
  );
};
