import React from 'react';
import type { VideoItem } from '../../types/media';

export type ToneMappingMode = 'off' | 'aces' | 'vibrant' | 'reinhard';

export const isHdrOrX265Video = (video?: VideoItem | null): boolean => {
  if (!video) return false;
  const str = `${video.title || ''} ${video.fileName || ''} ${video.url || ''}`.toLowerCase();
  const streamCodecs = (video.streams || []).map(s => s.codec || '').join(' ').toLowerCase();
  return /x265|hevc|h\.?265|hdr|2160p|10bit|bt2020|uhd/i.test(`${str} ${streamCodecs}`);
};

/**
 * Universal, GPU-accelerated CSS filters for HDR tone mapping.
 * Uses high-performance compositor filters (contrast, saturate, brightness)
 * that work natively across all desktop browsers, WebKit (iOS/Safari), and Android
 * without relying on brittle SVG filter resolution.
 */
export const getToneMappingCssFilter = (mode: ToneMappingMode): string => {
  switch (mode) {
    case 'aces':
      // ACES Filmic: Deep blacks, restored highlight contrast, and balanced color saturation
      return 'contrast(1.24) saturate(1.36) brightness(1.04)';
    case 'vibrant':
      // Vibrant: Maximum color punch and rich vivid tones for heavily washed out 10-bit files
      return 'contrast(1.30) saturate(1.58) brightness(1.06)';
    case 'reinhard':
      // Reinhard: Natural roll-off with gentle contrast curve and smooth SDR tone mapping
      return 'contrast(1.14) saturate(1.22) brightness(1.02)';
    case 'off':
    default:
      return 'none';
  }
};

export const ToneMappingSvgDefs: React.FC = () => {
  return null;
};
