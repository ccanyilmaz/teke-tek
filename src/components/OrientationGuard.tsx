import React, { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';

export function tryLockLandscapeOrientation(): void {
  if (typeof window === 'undefined') return;
  try {
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (mode: string) => Promise<void> })
      | undefined;
    if (orientation && typeof orientation.lock === 'function') {
      void orientation.lock('landscape').catch(() => {
        // Browsers outside fullscreen/PWA may decline orientation lock silently
      });
    }
  } catch {
    // Ignore unsupported platforms
  }
}

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<{ release: () => Promise<void> }>;
      };
    };
    if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') return;

    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        const lock = await nav.wakeLock!.request('screen');
        if (cancelled) {
          await lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // Wake lock rejected or unsupported
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [active]);
}

export const OrientationGuard: React.FC = () => {
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth && window.innerWidth < 900;
  });

  useEffect(() => {
    const check = () => {
      setIsPortraitMobile(
        window.innerHeight > window.innerWidth && window.innerWidth < 900
      );
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  if (!isPortraitMobile) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="portrait-orientation-guard"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0F172A]/95 px-6 text-center text-[#FFFDF7]"
    >
      <div className="flex max-w-xs flex-col items-center rounded-3xl border-[3px] border-[#FACC15] bg-[#1E293B] p-6 shadow-[0_10px_0_#090D16]">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#FACC15] bg-[#0F172A]">
          <RotateCw
            className="h-10 w-10 animate-spin text-[#FACC15]"
            style={{ animationDuration: '2.6s' }}
            aria-hidden="true"
          />
        </div>
        <h2 className="text-xl font-black tracking-wide text-[#FACC15]">
          TELEFONUNU YATAY ÇEVİR
        </h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-[#CBD5E1]">
          Teke Tek arenası yatay ekran için tasarlandı. Cihazını çevirdiğinde
          maç kaldığı yerden kesintisiz devam eder.
        </p>
      </div>
    </div>
  );
};
