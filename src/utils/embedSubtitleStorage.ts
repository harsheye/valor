import type { CustomSubtitleTrack } from '../types/media';
import type { SubtitleCue } from '../utils/subtitleParser';

/**
 * Maps language codes and common identifiers to clean display names.
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  en: 'English',
  eng: 'English',
  es: 'Spanish',
  spa: 'Spanish',
  fr: 'French',
  fre: 'French',
  fra: 'French',
  de: 'German',
  ger: 'German',
  deu: 'German',
  it: 'Italian',
  ita: 'Italian',
  pt: 'Portuguese',
  por: 'Portuguese',
  ru: 'Russian',
  rus: 'Russian',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  zh: 'Chinese',
  chi: 'Chinese',
  zho: 'Chinese',
  hi: 'Hindi',
  hin: 'Hindi',
  ar: 'Arabic',
  ara: 'Arabic',
  nl: 'Dutch',
  dut: 'Dutch',
  nld: 'Dutch',
  tr: 'Turkish',
  tur: 'Turkish',
  pl: 'Polish',
  pol: 'Polish',
  sv: 'Swedish',
  swe: 'Swedish',
  id: 'Indonesian',
  ind: 'Indonesian',
  th: 'Thai',
  tha: 'Thai',
  vi: 'Vietnamese',
  vie: 'Vietnamese',
  el: 'Greek',
  ell: 'Greek',
  he: 'Hebrew',
  heb: 'Hebrew',
  cs: 'Czech',
  ces: 'Czech',
  da: 'Danish',
  dan: 'Danish',
  fi: 'Finnish',
  fin: 'Finnish',
  no: 'Norwegian',
  nor: 'Norwegian',
  hu: 'Hungarian',
  hun: 'Hungarian',
  ro: 'Romanian',
  ron: 'Romanian',
  uk: 'Ukrainian',
  ukr: 'Ukrainian'
};

/**
 * Trims a subtitle name to its short clean language name (e.g. "English" or "ENG")
 * instead of the full release file name.
 */
export function trimSubtitleName(rawName: string, language?: string): string {
  const cleanLang = (language || '').trim().toLowerCase();
  if (cleanLang && LANGUAGE_DISPLAY_NAMES[cleanLang]) {
    return LANGUAGE_DISPLAY_NAMES[cleanLang];
  }
  if (cleanLang && cleanLang.length <= 4 && cleanLang !== 'custom' && cleanLang !== 'none') {
    return cleanLang.toUpperCase();
  }

  const str = rawName || '';

  // Case 1: OpenSubtitles (ENG) - filename.srt or OpenSubtitles (en) - ...
  const openSubMatch = str.match(/opensubtitles\s*\(([a-z0-9_-]+)\)/i);
  if (openSubMatch && openSubMatch[1]) {
    const code = openSubMatch[1].toLowerCase();
    if (LANGUAGE_DISPLAY_NAMES[code]) return LANGUAGE_DISPLAY_NAMES[code];
    return code.toUpperCase();
  }

  // Case 2: Brackets or delimiter tags e.g. [eng], (English), .eng., .english.
  const langMatch = str.match(/\b(eng|english|spa|spanish|fre|french|fra|ger|german|deu|ita|italian|por|portuguese|rus|russian|jpn|japanese|kor|korean|chi|chinese|zho|hin|hindi|ara|arabic|dut|dutch|tur|turkish|pol|polish|swe|swedish|vie|vietnamese|ind|indonesian|tha|thai|gre|greek|heb|hebrew|dan|danish|fin|finnish|nor|norwegian|hun|hungarian|ukr|ukrainian)\b/i);
  if (langMatch && langMatch[1]) {
    const code = langMatch[1].toLowerCase();
    if (LANGUAGE_DISPLAY_NAMES[code]) return LANGUAGE_DISPLAY_NAMES[code];
    return code.charAt(0).toUpperCase() + code.slice(1);
  }

  // Case 3: Already short language-like name (e.g. "English", "Spanish", "ENG")
  if (str.length <= 15 && !str.includes('.') && !str.includes('-')) {
    return str;
  }

  // Fallback: clean filename without extension
  const base = str.replace(/\.[^/.]+$/, '').trim();
  return base.length > 20 ? base.slice(0, 20) : base;
}

/**
 * Generates candidate storage keys for media
 */
export function getSubtitleStorageKeys(media: any): string[] {
  const keys: string[] = [];
  let url = '';
  let localFilePath = '';
  let fileName = '';
  let id = '';
  let title = '';

  if (typeof media === 'string') {
    url = media;
    if (media.startsWith('/') || media.includes('\\') || /^[a-zA-Z]:[\\/]/.test(media)) {
      localFilePath = media;
    }
  } else if (media && typeof media === 'object') {
    url = media.url || '';
    localFilePath = media.localFilePath || '';
    fileName = media.fileName || '';
    id = media.id || '';
    title = media.title || '';
  }

  if (localFilePath) {
    keys.push(`valor_embed_sub_path_${encodeURIComponent(localFilePath)}`);
  }

  if (url && !url.startsWith('blob:')) {
    try {
      const dummyOrigin = 'https://stream.valor.local';
      const parsed = url.startsWith('http://') || url.startsWith('https://') 
        ? new URL(url) 
        : new URL(url, dummyOrigin);
        
      const pathParam = parsed.searchParams.get('path');
      if (pathParam) {
        keys.push(`valor_embed_sub_path_${encodeURIComponent(pathParam)}`);
      }
      
      const cleanHostAndPath = `${parsed.origin !== dummyOrigin ? parsed.origin : ''}${parsed.pathname}`;
      if (cleanHostAndPath) {
        keys.push(`valor_embed_sub_url_${encodeURIComponent(cleanHostAndPath)}`);
      }
    } catch {}
    keys.push(`valor_embed_sub_raw_${encodeURIComponent(url.split('#')[0])}`);
  }

  if (fileName) {
    keys.push(`valor_embed_sub_file_${encodeURIComponent(fileName)}`);
  }

  if (id && !id.startsWith('embed-') && !id.startsWith('url-') && !id.startsWith('local-blob')) {
    keys.push(`valor_embed_sub_id_${encodeURIComponent(id)}`);
  }

  if (title && title.length > 2 && !/^(embedded media|embedded video|direct video stream)$/i.test(title)) {
    keys.push(`valor_embed_sub_title_${encodeURIComponent(title.toLowerCase().trim())}`);
  }

  // Fallback key
  keys.push(`valor_embed_sub_${encodeURIComponent(url || localFilePath || fileName || id || title || 'default')}`);

  return Array.from(new Set(keys));
}

/**
 * Compact cue serialization: stores cues as lightweight [start, end, text, id] tuples
 * to reduce JSON footprint by 75% and prevent localStorage QuotaExceeded errors.
 */
function compactCues(cues: SubtitleCue[]): any[] {
  if (!Array.isArray(cues)) return [];
  return cues.map((c, i) => [
    Number((c.startTime ?? 0).toFixed(3)),
    Number((c.endTime ?? 0).toFixed(3)),
    c.text || '',
    c.id || `c-${i}`
  ]);
}

function unpackCues(rawCues: any[]): SubtitleCue[] {
  if (!Array.isArray(rawCues)) return [];
  return rawCues.map((c: any, i: number) => {
    if (Array.isArray(c)) {
      return {
        startTime: typeof c[0] === 'number' ? c[0] : parseFloat(c[0]) || 0,
        endTime: typeof c[1] === 'number' ? c[1] : parseFloat(c[1]) || 0,
        text: String(c[2] || ''),
        id: String(c[3] || `cue-${i}`)
      };
    }
    return {
      startTime: Number(c.startTime ?? c.start ?? 0),
      endTime: Number(c.endTime ?? c.end ?? 0),
      text: String(c.text ?? ''),
      id: String(c.id ?? `cue-${i}`)
    };
  });
}

/**
 * Saves downloaded / added subtitle tracks in browser memory (localStorage & IndexedDB)
 */
export function saveEmbedSubtitles(media: any, tracks: CustomSubtitleTrack[]): void {
  if (!media || !tracks || tracks.length === 0) return;

  try {
    const keys = getSubtitleStorageKeys(media);
    const sanitizedTracks = tracks.map(t => ({
      ...t,
      name: trimSubtitleName(t.name, t.language),
      url: t.url && t.url.startsWith('blob:') ? '' : t.url,
      cues: t.cues || []
    }));

    // Compact representation for localStorage
    const storageObj = sanitizedTracks.map(t => ({
      id: t.id,
      name: t.name,
      url: t.url,
      language: t.language,
      format: t.format,
      isExtracted: t.isExtracted,
      streamIndex: t.streamIndex,
      c: compactCues(t.cues)
    }));

    const json = JSON.stringify(storageObj);

    for (const key of keys) {
      try {
        localStorage.setItem(key, json);
      } catch (quotaErr) {
        console.warn(`[EmbedSubtitleStorage] Quota exceeded on key ${key}`, quotaErr);
      }
    }

    try {
      localStorage.setItem('valor_embed_sub_latest', json);
      const mediaStr = typeof media === 'string' ? media : (media.url || media.localFilePath || media.id || '');
      localStorage.setItem('valor_embed_sub_latest_url', mediaStr);
    } catch {}

    // Persist full tracks into IndexedDB
    saveToIndexedDB(keys[0], sanitizedTracks).catch(() => {});
  } catch (e) {
    console.warn('[EmbedSubtitleStorage] Failed to save subtitles:', e);
    const keys = getSubtitleStorageKeys(media);
    saveToIndexedDB(keys[0], tracks).catch(() => {});
  }
}

/**
 * Synchronously retrieves cached subtitles from localStorage
 */
export function getEmbedSubtitlesSync(media: any): CustomSubtitleTrack[] {
  if (!media) return [];

  try {
    const keys = getSubtitleStorageKeys(media);
    let raw: string | null = null;
    for (const key of keys) {
      raw = localStorage.getItem(key);
      if (raw) break;
    }

    if (!raw) {
      const mediaStr = typeof media === 'string' ? media : (media.url || media.localFilePath || media.id || '');
      const latestUrl = localStorage.getItem('valor_embed_sub_latest_url');
      if (latestUrl && (latestUrl === mediaStr || keys.some(k => latestUrl.includes(k)))) {
        raw = localStorage.getItem('valor_embed_sub_latest');
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((t: any, idx: number) => ({
          id: t.id || `cached-sub-${idx}`,
          name: trimSubtitleName(t.name || 'Subtitles', t.language),
          url: t.url || '',
          cues: t.c ? unpackCues(t.c) : (t.cues ? unpackCues(t.cues) : []),
          isExtracted: Boolean(t.isExtracted),
          streamIndex: t.streamIndex,
          language: t.language || 'en',
          format: t.format || 'srt'
        }));
      }
    }
  } catch (e) {
    console.warn('[EmbedSubtitleStorage] Error reading from localStorage', e);
  }
  return [];
}

/**
 * Asynchronously retrieves cached subtitles from IndexedDB
 */
export async function getEmbedSubtitlesAsync(media: any): Promise<CustomSubtitleTrack[]> {
  if (!media) return [];

  const syncResult = getEmbedSubtitlesSync(media);
  if (syncResult && syncResult.length > 0 && syncResult[0].cues && syncResult[0].cues.length > 0) {
    return syncResult;
  }

  try {
    const keys = getSubtitleStorageKeys(media);
    for (const key of keys) {
      const idbResult = await getFromIndexedDB(key);
      if (Array.isArray(idbResult) && idbResult.length > 0) {
        return idbResult.map((t: any, idx: number) => ({
          id: t.id || `idb-sub-${idx}`,
          name: trimSubtitleName(t.name || 'Subtitles', t.language),
          url: t.url || '',
          cues: t.c ? unpackCues(t.c) : (t.cues ? unpackCues(t.cues) : []),
          isExtracted: Boolean(t.isExtracted),
          streamIndex: t.streamIndex,
          language: t.language || 'en',
          format: t.format || 'srt'
        }));
      }
    }
  } catch {}

  return syncResult;
}

// ─── IndexedDB Storage for Large Cues ───
const IDB_NAME = 'valor_embed_storage_db';
const IDB_STORE = 'subtitles';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIndexedDB(key: string, value: any): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getFromIndexedDB(key: string): Promise<any> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
