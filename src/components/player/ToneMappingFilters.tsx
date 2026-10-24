import React from 'react';
import type { VideoItem } from '../../types/media';

export type ToneMappingMode = 'off' | 'aces' | 'vibrant' | 'reinhard';

export const isHdrOrX265Video = (video?: VideoItem | null): boolean => {
  if (!video) return false;
  const str = `${video.title || ''} ${video.fileName || ''} ${video.url || ''}`.toLowerCase();
  const streamCodecs = (video.streams || []).map(s => s.codec || '').join(' ').toLowerCase();
  return /x265|hevc|h\.?265|hdr|2160p|10bit|bt2020|uhd/i.test(`${str} ${streamCodecs}`);
};

export const getToneMappingCssFilter = (mode: ToneMappingMode): string => {
  switch (mode) {
    case 'aces':
      return 'url(#hdr-tone-map-aces) contrast(1.12) saturate(1.28) brightness(1.02)';
    case 'vibrant':
      return 'url(#hdr-tone-map-vibrant) contrast(1.16) saturate(1.38) brightness(1.03)';
    case 'reinhard':
      return 'url(#hdr-tone-map-reinhard) contrast(1.06) saturate(1.18) brightness(1.01)';
    case 'off':
    default:
      return 'none';
  }
};

export const ToneMappingSvgDefs: React.FC = () => {
  return (
    <svg 
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none', overflow: 'hidden' }} 
      aria-hidden="true"
    >
      <defs>
        {/* ACES Filmic Tone Mapping approximation: Rec.2020 to Rec.709 gamut mapping, highlight recovery, deep blacks */}
        <filter id="hdr-tone-map-aces" colorInterpolationFilters="sRGB">
          <feColorMatrix 
            type="matrix" 
            values="
              1.22 -0.14 -0.06 0 0.02
              -0.08 1.24 -0.08 0 0.02
              -0.05 -0.11 1.26 0 0.02
              0     0     0    1 0
            " 
          />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1.10" exponent="0.94" offset="-0.02" />
            <feFuncG type="gamma" amplitude="1.10" exponent="0.94" offset="-0.02" />
            <feFuncB type="gamma" amplitude="1.10" exponent="0.94" offset="-0.02" />
          </feComponentTransfer>
        </filter>

        {/* Vibrant HDR Tone Mapping: maximum color punch for heavily desaturated x265 10-bit files */}
        <filter id="hdr-tone-map-vibrant" colorInterpolationFilters="sRGB">
          <feColorMatrix 
            type="matrix" 
            values="
              1.28 -0.16 -0.07 0 0.015
              -0.09 1.28 -0.09 0 0.015
              -0.06 -0.13 1.30 0 0.015
              0     0     0    1 0
            " 
          />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1.14" exponent="0.90" offset="-0.03" />
            <feFuncG type="gamma" amplitude="1.14" exponent="0.90" offset="-0.03" />
            <feFuncB type="gamma" amplitude="1.14" exponent="0.90" offset="-0.03" />
          </feComponentTransfer>
        </filter>

        {/* Reinhard Tone Mapping: smooth shoulder roll-off for natural SDR conversion */}
        <filter id="hdr-tone-map-reinhard" colorInterpolationFilters="sRGB">
          <feColorMatrix 
            type="matrix" 
            values="
              1.14 -0.08 -0.04 0 0.025
              -0.05 1.14 -0.05 0 0.025
              -0.04 -0.07 1.16 0 0.025
              0     0     0    1 0
            " 
          />
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1.06" exponent="0.96" offset="-0.015" />
            <feFuncG type="gamma" amplitude="1.06" exponent="0.96" offset="-0.015" />
            <feFuncB type="gamma" amplitude="1.06" exponent="0.96" offset="-0.015" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
};
