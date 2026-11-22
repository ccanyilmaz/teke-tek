import React from 'react';
import type { WeaponId } from '../game/types';

interface WeaponIconProps {
  weaponId: WeaponId;
  size?: number;
  className?: string;
}

export const WeaponIcon: React.FC<WeaponIconProps> = ({
  weaponId,
  size = 28,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {weaponId === 'yumruk' && (
        <g>
          <circle cx="19" cy="17" r="10" fill="#EF4444" stroke="#1E293B" strokeWidth="2.5" />
          <rect x="7" y="18" width="9" height="8" rx="3" fill="#DC2626" stroke="#1E293B" strokeWidth="2.2" />
          <circle cx="16" cy="13" r="3" fill="#FCA5A5" opacity="0.7" />
        </g>
      )}

      {weaponId === 'sopa' && (
        <g transform="rotate(-35 18 18)">
          <rect x="4" y="14.5" width="28" height="7" rx="3.5" fill="#B45309" stroke="#1E293B" strokeWidth="2.4" />
          <rect x="8" y="15.5" width="6" height="5" fill="#FDE68A" />
        </g>
      )}

      {weaponId === 'bicak' && (
        <g transform="rotate(-35 18 18)">
          <rect x="4" y="15" width="9" height="6" rx="2" fill="#1E293B" />
          <path
            d="M13 13.5 L29 15.5 Q33 18 29 20.5 L13 22.5 Z"
            fill="#E2E8F0"
            stroke="#1E293B"
            strokeWidth="2.2"
          />
          <line x1="16" y1="16.5" x2="26" y2="17.2" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}

      {weaponId === 'isin_kilici' && (
        <g transform="rotate(-40 18 18)">
          <rect x="3" y="14.5" width="10" height="7" rx="2" fill="#334155" stroke="#1E293B" strokeWidth="2.2" />
          <line x1="14" y1="18" x2="33" y2="18" stroke="#A5F3FC" strokeWidth="9" strokeLinecap="round" opacity="0.65" />
          <line x1="14" y1="18" x2="33" y2="18" stroke="#06B6D4" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="15" y1="18" x2="32" y2="18" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {weaponId === 'sapan' && (
        <g>
          <path
            d="M18 30 V19 L10 9 M18 19 L26 9"
            stroke="#1E293B"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18 30 V19 L10 9 M18 19 L26 9"
            stroke="#92400E"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="10" y1="9" x2="26" y2="9" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="18" cy="9" r="3" fill="#94A3B8" stroke="#1E293B" strokeWidth="1.6" />
        </g>
      )}

      {weaponId === 'kalem' && (
        <g transform="rotate(-38 18 18)">
          <rect x="4" y="14.5" width="5" height="7" rx="1.5" fill="#F472B6" stroke="#1E293B" strokeWidth="2" />
          <rect x="9" y="14.5" width="16" height="7" fill="#FACC15" stroke="#1E293B" strokeWidth="2" />
          <polygon points="25,14.5 32,18 25,21.5" fill="#FDE68A" stroke="#1E293B" strokeWidth="2" />
          <polygon points="29.5,16.7 32,18 29.5,19.3" fill="#1E293B" />
        </g>
      )}

      {weaponId === 'terlik' && (
        <g transform="rotate(-25 18 18)">
          <ellipse cx="18" cy="18" rx="13" ry="6.5" fill="#EC4899" stroke="#1E293B" strokeWidth="2.4" />
          <ellipse cx="15" cy="18" rx="4.5" ry="5.5" fill="#FBCFE8" stroke="#1E293B" strokeWidth="2" />
        </g>
      )}

      {weaponId === 'kizartma_tavasi' && (
        <g transform="rotate(-30 18 18)">
          <rect x="3" y="15.5" width="12" height="5" rx="2" fill="#475569" stroke="#1E293B" strokeWidth="2.2" />
          <circle cx="23" cy="18" r="9.5" fill="#1E293B" stroke="#1E293B" strokeWidth="2.2" />
          <circle cx="23" cy="18" r="6" fill="none" stroke="#94A3B8" strokeWidth="1.8" />
        </g>
      )}

      {weaponId === 'cetvel' && (
        <g transform="rotate(-32 18 18)">
          <rect x="4" y="14" width="28" height="8" rx="1.5" fill="#F59E0B" stroke="#1E293B" strokeWidth="2.2" />
          <line x1="9" y1="14" x2="9" y2="17.5" stroke="#1E293B" strokeWidth="1.6" />
          <line x1="14" y1="14" x2="14" y2="18.5" stroke="#1E293B" strokeWidth="1.6" />
          <line x1="19" y1="14" x2="19" y2="17.5" stroke="#1E293B" strokeWidth="1.6" />
          <line x1="24" y1="14" x2="24" y2="18.5" stroke="#1E293B" strokeWidth="1.6" />
        </g>
      )}

      {weaponId === 'baget_ekmek' && (
        <g transform="rotate(-35 18 18)">
          <rect
            x="3"
            y="12.5"
            width="30"
            height="11"
            rx="5.5"
            fill="#D97706"
            stroke="#1E293B"
            strokeWidth="2.3"
          />
          <path
            d="M9 14.5 L12.5 21.5 M16 14.5 L19.5 21.5 M23 14.5 L26.5 21.5"
            stroke="#FEF3C7"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
};
