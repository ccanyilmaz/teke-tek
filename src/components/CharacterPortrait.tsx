import React from 'react';
import { getCharacterById } from '../game/characters';
import type { CharacterId } from '../game/types';

interface CharacterPortraitProps {
  characterId: CharacterId;
  size?: number;
  className?: string;
}

export const CharacterPortrait: React.FC<CharacterPortraitProps> = ({
  characterId,
  size = 84,
  className = '',
}) => {
  const def = getCharacterById(characterId);
  const { palette, hairStyle, outfitStyle } = def;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Subtle circular backdrop */}
      <circle cx="48" cy="48" r="44" fill="#FFFDF7" stroke="#1E293B" strokeWidth="3.5" />

      {/* Torso */}
      <g>
        <rect
          x="22"
          y="58"
          width="52"
          height="30"
          rx="14"
          fill={palette.primary}
          stroke="#1E293B"
          strokeWidth="3.5"
        />
        {outfitStyle === 'jacket' && (
          <>
            <rect x="43" y="60" width="10" height="26" fill={palette.secondary} />
            <rect x="26" y="60" width="44" height="6" rx="2" fill={palette.secondary} />
          </>
        )}
        {outfitStyle === 'vest' && (
          <>
            <path d="M24 60 H39 V86 H24 Z" fill={palette.secondary} />
            <path d="M57 60 H72 V86 H57 Z" fill={palette.secondary} />
            <polygon points="35,68 38,64 41,68 38,72" fill={palette.accent} />
            <polygon points="55,68 58,64 61,68 58,72" fill={palette.accent} />
          </>
        )}
        {outfitStyle === 'tracksuit' && (
          <>
            <rect x="24" y="68" width="48" height="7" fill={palette.secondary} />
            <rect x="24" y="75" width="48" height="7" fill={palette.accent} />
          </>
        )}
        {outfitStyle === 'blazer' && (
          <>
            <polygon points="36,60 48,76 60,60" fill={palette.secondary} />
            <polygon points="40,63 48,68 56,63 56,71 48,68 40,71" fill={palette.accent} />
          </>
        )}
        {outfitStyle === 'stripes' && (
          <>
            <rect x="24" y="64" width="48" height="4.5" fill={palette.secondary} />
            <rect x="24" y="73" width="48" height="4.5" fill={palette.secondary} />
            <path
              d="M35 58 Q48 66 61 58 L65 69 L53 71 L35 64 Z"
              fill={palette.accent}
              stroke="#1E293B"
              strokeWidth="2.4"
            />
          </>
        )}
        <rect
          x="22"
          y="58"
          width="52"
          height="30"
          rx="14"
          stroke="#1E293B"
          strokeWidth="3.5"
        />
      </g>

      {/* Gloves peeking at sides */}
      <circle cx="20" cy="70" r="9" fill={palette.glove} stroke="#1E293B" strokeWidth="3" />
      <circle cx="76" cy="70" r="9" fill={palette.glove} stroke="#1E293B" strokeWidth="3" />

      {/* Head */}
      <circle cx="48" cy="39" r="21" fill={palette.skin} stroke="#1E293B" strokeWidth="3.5" />

      {/* Hair */}
      {hairStyle === 'short' && (
        <path
          d="M27 36 C28 20 40 15 48 15 C56 15 68 20 69 36 C60 28 36 28 27 36 Z"
          fill={palette.hair}
          stroke="#1E293B"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
      {hairStyle === 'wavy' && (
        <g fill={palette.hair} stroke="#1E293B" strokeWidth="2.8">
          <circle cx="36" cy="24" r="9" />
          <circle cx="48" cy="20" r="10.5" />
          <circle cx="60" cy="24" r="9" />
        </g>
      )}
      {hairStyle === 'slick' && (
        <path
          d="M27 35 C30 16 54 11 68 23 C70 28 70 33 69 36 C56 26 38 28 27 35 Z"
          fill={palette.hair}
          stroke="#1E293B"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
      {hairStyle === 'parted' && (
        <path
          d="M27 36 C28 19 42 15 51 16 C62 17 69 24 69 36 C61 28 53 26 47 32 C41 25 33 28 27 36 Z"
          fill={palette.hair}
          stroke="#1E293B"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
      {hairStyle === 'curly' && (
        <g fill={palette.hair} stroke="#1E293B" strokeWidth="2.8">
          <circle cx="35" cy="25" r="8.5" />
          <circle cx="48" cy="20" r="9.5" />
          <circle cx="61" cy="25" r="8.5" />
        </g>
      )}

      {/* Eyes & Brows */}
      <circle cx="41" cy="40" r="3" fill="#1E293B" />
      <circle cx="55" cy="40" r="3" fill="#1E293B" />
      <circle cx="40" cy="39" r="1" fill="#FFFFFF" />
      <circle cx="54" cy="39" r="1" fill="#FFFFFF" />

      <path d="M36 34 L45 35.5" stroke="#1E293B" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M60 34 L51 35.5" stroke="#1E293B" strokeWidth="2.6" strokeLinecap="round" />

      {/* Confident Smile */}
      <path
        d="M42 49 Q48 53.5 55 48.5"
        stroke="#1E293B"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
};
