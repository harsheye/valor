import React, { useState, useEffect } from 'react';
import type { VideoItem } from '../../types/media';

export type ToneMappingMode = 'off' | 'aces' | 'vibrant' | 'reinhard';
export type PictureFitMode = 'fit' | 'fill' | '100' | '150' | 'stretch';

export interface VideoColorSettings {
  preset: string;
  brightness: number; // -100..100 (0 = default)
  contrast: number;   // -100..100 (0 = default)
  saturation: number; // -100..100 (0 = default)
  gamma: number;      // -100..100 (0 = default)
  hue: number;        // -100..100 (0 = default)
  sepia: number;      // 0..100 (legacy compat)
  pictureFit: PictureFitMode;
}

export const DEFAULT_VIDEO_COLOR_SETTINGS: VideoColorSettings = {
  preset: 'off',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  gamma: 0,
  hue: 0,
  sepia: 0,
  pictureFit: 'fit',
};

export const VIDEO_COLOR_PRESETS: Array<{ id: string; label: string; values: Partial<VideoColorSettings> }> = [
  { id: 'off', label: 'Off', values: { brightness: 0, contrast: 0, saturation: 0, gamma: 0, hue: 0 } },
  { id: 'cinema', label: 'Cinema', values: { brightness: -4, contrast: 10, saturation: 8, gamma: 4 } },
  { id: 'vivid', label: 'Vivid', values: { brightness: 4, contrast: 14, saturation: 24, gamma: 2 } },
  { id: 'darkroom', label: 'Dark room', values: { brightness: -8, contrast: 12, saturation: 4, gamma: 10 } },
  { id: 'sports', label: 'Sports', values: { brightness: 6, contrast: 10, saturation: 16, gamma: 0 } },
];

const VIDEO_COLOR_STORAGE_KEY = 'valor_video_color_settings_v2';
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

export const getToneMappingCssFilter = (mode: ToneMappingMode): string => {
  switch (mode) {
    case 'aces':
      return 'contrast(1.24) saturate(1.36) brightness(1.04)';
    case 'vibrant':
      return 'contrast(1.30) saturate(1.58) brightness(1.06)';
    case 'reinhard':
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
    const br = 1 + (color.brightness || 0) * 0.005 + (color.gamma || 0) * 0.0025;
    const con = 1 + (color.contrast || 0) * 0.005 + (color.gamma || 0) * 0.002;
    const sat = Math.max(0, 1 + (color.saturation || 0) * 0.01);
    if (Math.abs(br - 1) > 0.001) parts.push(`brightness(${Math.max(0.1, br).toFixed(3)})`);
    if (Math.abs(con - 1) > 0.001) parts.push(`contrast(${Math.max(0.1, con).toFixed(3)})`);
    if (Math.abs(sat - 1) > 0.001) parts.push(`saturate(${sat.toFixed(3)})`);
    if (color.hue) parts.push(`hue-rotate(${Math.round(color.hue * 1.8)}deg)`);
    if (color.sepia) parts.push(`sepia(${(color.sepia / 100).toFixed(2)})`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
};

export const ToneMappingSvgDefs: React.FC = () => {
  return null;
};
