/**
 * Language matching utilities for audio and subtitle track auto-selection.
 */

const LANG_MAP: Record<string, string[]> = {
  ENG: ['eng', 'en', 'english', 'en-us', 'en-gb', 'en-ca', 'en-au', 'en-nz', 'en-ie', 'en-za'],
  HIN: ['hin', 'hi', 'hindi'],
  JAP: ['jpn', 'ja', 'japanese', 'japan'],
  CHN: ['chi', 'zho', 'zh', 'chinese', 'mandarin', 'cantonese'],
  SPA: ['spa', 'es', 'spanish', 'espanol'],
  FRE: ['fra', 'fre', 'fr', 'french'],
  GER: ['ger', 'deu', 'de', 'german'],
  ITA: ['ita', 'it', 'italian'],
  KOR: ['kor', 'ko', 'korean'],
  RUS: ['rus', 'ru', 'russian'],
  POR: ['por', 'pt', 'portuguese']
};

/**
 * Normalizes a language code, title, or details string to a 3-letter canonical key (e.g., 'ENG', 'HIN').
 */
export function normalizeLanguageCode(lang?: string, title?: string, details?: string): string {
  const candidates = [lang, title, details]
    .filter(Boolean)
    .map(s => String(s).toLowerCase().trim());

  for (const [canonical, aliases] of Object.entries(LANG_MAP)) {
    for (const c of candidates) {
      for (const alias of aliases) {
        // Exact match or token match (e.g. "English (5.1)", "Hindi [Original]")
        const regex = new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, 'i');
        if (c === alias || regex.test(c)) {
          return canonical;
        }
      }
    }
  }

  // Fallback: if lang is a 3-letter ISO code (not "und"), use uppercase
  if (lang) {
    const clean = lang.toLowerCase().trim();
    if (clean.length === 3 && clean !== 'und') {
      return clean.toUpperCase();
    }
  }

  return '';
}

/**
 * Checks if a stream's language, title, or details match a user-requested target language.
 */
export function isLanguageMatch(
  targetLang: string,
  streamLang?: string,
  streamTitle?: string,
  streamDetails?: string
): boolean {
  if (!targetLang || targetLang === 'Original' || targetLang === 'Off') {
    return false;
  }

  const normalizedTarget = normalizeLanguageCode(targetLang) || targetLang.toUpperCase();
  const normalizedStream = normalizeLanguageCode(streamLang, streamTitle, streamDetails);

  if (normalizedStream && normalizedTarget === normalizedStream) {
    return true;
  }

  // Direct alias check against targetLang
  const aliases = LANG_MAP[normalizedTarget] || [targetLang.toLowerCase()];
  const haystack = [streamLang, streamTitle, streamDetails]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return aliases.some(alias => {
    const regex = new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, 'i');
    return regex.test(haystack);
  });
}

/**
 * Finds the best matching stream of a given type based on user language preferences.
 */
export function findPreferredStream<T extends { type?: string; language?: string; title?: string; details?: string; codec?: string; index: number }>(
  streams: T[],
  targetLang: string,
  type: 'audio' | 'subtitle'
): T | undefined {
  const filtered = streams.filter(s => !s.type || s.type === type);
  return filtered.find(s => isLanguageMatch(targetLang, s.language, s.title, s.details));
}

/**
 * Helper to get user saved settings safely from localStorage.
 */
export function getSavedMediaPreferences(): { defaultAudio: string; defaultSub: string } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('valor_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          defaultAudio: parsed.defaultAudio || 'ENG',
          defaultSub: parsed.defaultSub || 'ENG'
        };
      }
    }
  } catch {}
  return { defaultAudio: 'ENG', defaultSub: 'ENG' };
}

/**
 * Returns the preferred audio stream index for initial playback.
 */
export function getPreferredAudioStreamIndex(
  streams: any[],
  targetLang: string = 'ENG'
): number | null {
  const audioStreams = streams.filter(s => s.type === 'audio');
  if (audioStreams.length === 0) return null;

  if (targetLang !== 'Original') {
    const matched = findPreferredStream(audioStreams, targetLang, 'audio');
    if (matched) {
      return matched.index;
    }
  }

  // Fallback to first available audio track if preferred language is not found or is 'Original'
  return audioStreams[0].index;
}

/**
 * Formats a clean, readable language label for the UI (e.g. "ENG", "HIN", or Title).
 */
export function getLanguageDisplayLabel(
  lang?: string,
  fallback: string = '',
  title?: string
): string {
  const norm = normalizeLanguageCode(lang, title);
  if (norm) return norm;

  if (title && title.trim()) {
    const cleanTitle = title.trim();
    if (cleanTitle.length <= 15) return cleanTitle;
  }

  if (lang && lang.toLowerCase() !== 'und') {
    return lang.toUpperCase().trim();
  }

  return fallback || 'Unknown';
}
