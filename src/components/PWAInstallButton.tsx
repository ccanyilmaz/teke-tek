import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
        }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-4 py-2 text-sm font-bold text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Uygulamayı Yükle
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-[#1E293B] bg-[#FFFDF7] px-4 py-2 text-sm font-bold text-[#1E293B] shadow-[0_3px_0_#1E293B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Ana Ekrana Ekle
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/60 p-4"
          >
            <div className="w-full max-w-sm rounded-2xl border-[3px] border-[#1E293B] bg-[#FFFDF7] p-6 shadow-[0_8px_0_#1E293B]">
              <h3 id="ios-install-title" className="text-lg font-extrabold text-[#1E293B]">
                Ana Ekrana Ekle (iOS)
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                1. Safari alt menüsündeki <strong>Paylaş</strong> simgesine dokun.
                <br />
                2. Aşağı kaydır ve <strong>Ana Ekrana Ekle</strong> seçeneğine bas.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-xl border-2 border-[#1E293B] bg-[#E63946] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_3px_0_#1E293B] active:translate-y-0.5 active:shadow-none"
              >
                Anladım
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
