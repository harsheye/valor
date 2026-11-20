/**
 * Utility for persisting and carrying over track preferences (audio, subtitle, offset, style)
 * across playlist items.
 */

import type { SubtitleSettings } from '../components/SubtitleOverlay';

export interface CarriedTrackPreferences {
  audioLang?: string;
  audioTitle?: string;
  subLang?: string; // e.g. 'eng', 'jpn', 'off'
  subTitle?: string;
  subOffset?: number; // seconds
  subSettings?: Partial<SubtitleSettings>;
}

const STORAGE_KEY = 'valor_playlist_track_prefs';

let memoryPrefs: CarriedTrackPreferences = {};

export function saveCarriedTrackPreferences(prefs: Partial<CarriedTrackPreferences>): void {
  memoryPrefs = { ...memoryPrefs, ...prefs };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryPrefs));
  } catch {}
}

export function getCarriedTrackPreferences(): CarriedTrackPreferences {
  if (Object.keys(memoryPrefs).length === 0) {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        memoryPrefs = JSON.parse(saved);
      }
    } catch {}
  }
  return memoryPrefs;
}

export function clearCarriedTrackPreferences(): void {
  memoryPrefs = {};
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
