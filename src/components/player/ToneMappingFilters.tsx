import React, { useState, useEffect } from 'react';
import type { VideoItem } from '../../types/media';

export type ToneMappingMode = 'off' | 'aces' | 'vibrant' | 'reinhard';

export interface VideoColorSettings {
  preset: string;
  brightness: number; // 50..200 (100 = default)
  contrast: number;   // 50..200 (100 = default)
  saturation: number; // 0..250 (100 = default)
  hue: number;        // -180..180 (0 = default)
  sepia: number;      // 0..100 (0 = default)
}

export const DEFAULT_VIDEO_COLOR_SETTINGS: VideoColorSettings = {
  preset: 'default',
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  sepia: 0,
};

export const VIDEO_COLOR_PRESETS: Array<{ id: string; label: string; values: Partial<VideoColorSettings> }> = [
  { id: 'default', label: 'Default', values: { brightness: 100, contrast: 100, saturation: 100, hue: 0, sepia: 0 } },
  { id: 'vivid', label: 'Vivid', values: { brightness: 104, contrast: 115, saturation: 135, hue: 0, sepia: 0 } },
  { id: 'cinema', label: 'Cinema', values: { brightness: 96, contrast: 118, saturation: 108, hue: 0, sepia: 8 } },
  { id: 'warm', label: 'Warm', values: { brightness: 102, contrast: 105, saturation: 112, hue: -6, sepia: 24 } },
  { id: 'cool', label: 'Cool', values: { brightness: 102, contrast: 106, saturation: 105, hue: 12, sepia: 0 } },
  { id: 'night', label: 'Night', values: { brightness: 118, contrast: 112, saturation: 92, hue: 0, sepia: 12 } },
  { id: 'mono', label: 'B&W', values: { brightness: 102, contrast: 120, saturation: 0, hue: 0, sepia: 0 } },
];

const VIDEO_COLOR_STORAGE_KEY = 'valor_video_color_settings';
const VIDEO_COLOR_EVENT = 'valor-video-color-change';

export function loadVideoColorSettings(): VideoColorSettings {
  try {
    const raw = localStorage.getItem(VIDEO_COLOR_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_VIDEO_COLOR_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_VIDEO_COLOR_SETTINGS };
}

export function saveVideoColorSettings(next: VideoColorSettings): void {
  try {
    localStorage.setItem(VIDEO_COLOR_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(VIDEO_COLOR_EVENT, { detail: next }));
  } catch {}
}

export function useVideoColorSettings(): [VideoColorSettings, (patch: Partial<VideoColorSettings>) => void] {
  const [colorSettings, setColorSettings] = useState<VideoColorSettings>(() => loadVideoColorSettings());

  useEffect(() => {
    const onChange = (e: Event) => {
      const custom = e as CustomEvent<VideoColorSettings>;
      if (custom.detail) {
        setColorSettings(custom.detail);
      } else {
        setColorSettings(loadVideoColorSettings());
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === VIDEO_COLOR_STORAGE_KEY) {
        setColorSettings(loadVideoColorSettings());
      }
    };
    window.addEventListener(VIDEO_COLOR_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(VIDEO_COLOR_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const updateColorSettings = (patch: Partial<VideoColorSettings>) => {
    const next = { ...loadVideoColorSettings(), ...patch };
    setColorSettings(next);
    saveVideoColorSettings(next);
  };

  return [colorSettings, updateColorSettings];
}

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

export const buildVideoCssFilter = (
  toneMappingMode: ToneMappingMode,
  color?: VideoColorSettings | null
): string | undefined => {
  const parts: string[] = [];
  if (toneMappingMode !== 'off') {
    const tm = getToneMappingCssFilter(toneMappingMode);
    if (tm && tm !== 'none') parts.push(tm);
  }
  if (color) {
    if (color.brightness !== 100) parts.push(`brightness(${(color.brightness / 100).toFixed(2)})`);
    if (color.contrast !== 100) parts.push(`contrast(${(color.contrast / 100).toFixed(2)})`);
    if (color.saturation !== 100) parts.push(`saturate(${(color.saturation / 100).toFixed(2)})`);
    if (color.hue !== 0) parts.push(`hue-rotate(${color.hue}deg)`);
    if (color.sepia !== 0) parts.push(`sepia(${(color.sepia / 100).toFixed(2)})`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
};

export const ToneMappingSvgDefs: React.FC = () => {
  return null;
};
