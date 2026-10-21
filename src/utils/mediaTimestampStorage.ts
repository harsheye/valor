/**
 * Media Timestamp Storage Utility
 * 
 * Persists playback timestamp locations into browser site storage (localStorage & IndexedDB)
 * so that when the player or page is reloaded, playback immediately resumes at the exact location.
 */

export interface SavedMediaTimestamp {
  currentTime: number;
  duration?: number;
  updatedAt: number;
  title?: string;
  url?: string;
  completed?: boolean;
}

export type MediaIdentifier = 
  | string 
  | {
      url?: string;
      localFilePath?: string;
      fileName?: string;
      id?: string;
      title?: string;
    };

const IDB_NAME = 'valor_playback_storage';
const IDB_STORE = 'media_timestamps';
const STORAGE_PREFIX = 'valor_media_pos_';

/**
 * Strips transient / expiring query parameters (tokens, signatures, timestamps) from a URL.
 */
function cleanMediaUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';

    // Handle relative or stream URLs with query params
    const dummyOrigin = 'https://stream.valor.local';
    const parsed = trimmed.startsWith('http://') || trimmed.startsWith('https://') 
      ? new URL(trimmed) 
      : new URL(trimmed, dummyOrigin);

    // If it's a local/backend stream proxy with ?path=...
    const pathParam = parsed.searchParams.get('path');
    if (pathParam) {
      return `stream_path:${decodeURIComponent(pathParam)}`;
    }

    // Ephemeral parameters to remove
    const ephemeralParams = new Set([
      'token', 'auth', 'expires', 'expire', 'exp', 'sig', 'signature',
      't', 'time', 'seed', 'hls_key', 'session', 'session_id', 'timestamp',
      '_', 'cache', 'cb', 'v'
    ]);

    const remainingParams = new URLSearchParams();
    parsed.searchParams.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!ephemeralParams.has(lower) && !lower.startsWith('sig') && !lower.startsWith('token')) {
        remainingParams.append(key, value);
      }
    });

    remainingParams.sort();
    const queryPart = remainingParams.toString();
    const cleanHostAndPath = `${parsed.origin !== dummyOrigin ? parsed.origin : ''}${parsed.pathname}`;
    return queryPart ? `${cleanHostAndPath}?${queryPart}` : cleanHostAndPath;
  } catch {
    return rawUrl.trim().split('#')[0];
  }
}

/**
 * Generates ordered candidate storage keys for a media item.
 */
export function getMediaStorageKeys(media: MediaIdentifier): { primaryKey: string; allKeys: string[] } {
  const keys: string[] = [];

  let url = '';
  let localFilePath = '';
  let fileName = '';
  let id = '';
  let title = '';

  if (typeof media === 'string') {
    url = media;
    // If it looks like a local file path
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

  // 1. Direct local file path
  if (localFilePath) {
    keys.push(`${STORAGE_PREFIX}path_${encodeURIComponent(localFilePath)}`);
  }

  // 2. Cleaned URL
  if (url && !url.startsWith('blob:')) {
    const cleaned = cleanMediaUrl(url);
    if (cleaned) {
      keys.push(`${STORAGE_PREFIX}url_${encodeURIComponent(cleaned)}`);
    }
    // Also raw URL as fallback
    const rawKey = `${STORAGE_PREFIX}raw_${encodeURIComponent(url.split('#')[0])}`;
    if (!keys.includes(rawKey)) {
      keys.push(rawKey);
    }
  }

  // 3. File name
  if (fileName) {
    keys.push(`${STORAGE_PREFIX}file_${encodeURIComponent(fileName)}`);
  }

  // 4. Custom ID (if stable)
  if (id && !id.startsWith('embed-') && !id.startsWith('url-') && !id.startsWith('local-blob')) {
    keys.push(`${STORAGE_PREFIX}id_${encodeURIComponent(id)}`);
  }

  // 5. Title (if distinct)
  if (title && title.length > 2 && !/^(embedded media|embedded video|direct video stream)$/i.test(title)) {
    keys.push(`${STORAGE_PREFIX}title_${encodeURIComponent(title.toLowerCase().trim())}`);
  }

  // Fallback key if nothing matched
  if (keys.length === 0) {
    keys.push(`${STORAGE_PREFIX}default_${encodeURIComponent(url || id || title || 'media')}`);
  }

  return {
    primaryKey: keys[0],
    allKeys: Array.from(new Set(keys))
  };
}

/**
 * Open IndexedDB for persistent site storage backup
 */
function openTimestampDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
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

/**
 * Persists timestamp to IndexedDB asynchronously
 */
async function saveToIndexedDB(key: string, data: SavedMediaTimestamp): Promise<void> {
  try {
    const db = await openTimestampDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(data, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

/**
 * Synchronously saves the exact media timestamp location into browser site storage.
 */
export function saveMediaTimestamp(
  media: MediaIdentifier,
  currentTime: number,
  duration?: number,
  title?: string,
  forceCompleted?: boolean
): void {
  if (!media) return;
  if (typeof currentTime !== 'number' || isNaN(currentTime) || currentTime < 0) return;

  try {
    const { primaryKey, allKeys } = getMediaStorageKeys(media);
    const numDur = typeof duration === 'number' && isFinite(duration) && duration > 0 ? duration : undefined;
    
    // Check if media completed or near end (within 3 seconds)
    const isCompleted = forceCompleted || (numDur !== undefined && currentTime >= numDur - 3);

    const record: SavedMediaTimestamp = {
      currentTime: isCompleted ? 0 : Number(currentTime.toFixed(3)),
      duration: numDur !== undefined ? Number(numDur.toFixed(3)) : undefined,
      updatedAt: Date.now(),
      title: title && title.length > 2 ? title : undefined,
      completed: isCompleted
    };

    const json = JSON.stringify(record);

    // Save under primary key
    localStorage.setItem(primaryKey, json);

    // Also link secondary keys so reload lookup succeeds under any representation
    for (const key of allKeys) {
      if (key !== primaryKey) {
        localStorage.setItem(key, json);
      }
    }

    // Save as latest active media position for instant single-session reload restoration
    localStorage.setItem('valor_last_media_pos', JSON.stringify({
      ...record,
      key: primaryKey
    }));

    // Persist to IndexedDB in background
    saveToIndexedDB(primaryKey, record).catch(() => {});
  } catch (err) {
    console.warn('[MediaTimestampStorage] Failed to save timestamp:', err);
  }
}

/**
 * Synchronously retrieves the exact media timestamp location from browser site storage.
 * Returns 0 if none is found or if the media was already completed.
 */
export function getMediaTimestamp(media: MediaIdentifier, duration?: number): number {
  if (!media) return 0;

  try {
    const { primaryKey, allKeys } = getMediaStorageKeys(media);

    // 1. Check direct keys in localStorage
    for (const key of allKeys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SavedMediaTimestamp;
          if (parsed && typeof parsed.currentTime === 'number') {
            if (parsed.completed) return 0;
            const targetDuration = duration || parsed.duration;
            if (targetDuration && targetDuration > 0 && parsed.currentTime >= targetDuration - 3) {
              return 0;
            }
            if (parsed.currentTime > 0) {
              return parsed.currentTime;
            }
          }
        } catch {}
      }
    }

    // 2. Check valor_last_media_pos fallback
    const lastPosRaw = localStorage.getItem('valor_last_media_pos');
    if (lastPosRaw) {
      try {
        const lastPos = JSON.parse(lastPosRaw);
        if (lastPos && typeof lastPos.currentTime === 'number') {
          if (allKeys.includes(lastPos.key) || lastPos.key === primaryKey) {
            if (lastPos.completed) return 0;
            const targetDuration = duration || lastPos.duration;
            if (targetDuration && targetDuration > 0 && lastPos.currentTime >= targetDuration - 3) {
              return 0;
            }
            if (lastPos.currentTime > 0) {
              return lastPos.currentTime;
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[MediaTimestampStorage] Failed to get timestamp:', err);
  }

  return 0;
}

/**
 * Asynchronously checks IndexedDB for the timestamp if localStorage was cleared.
 */
export async function getMediaTimestampAsync(media: MediaIdentifier, duration?: number): Promise<number> {
  // First try synchronous localStorage
  const syncTime = getMediaTimestamp(media, duration);
  if (syncTime > 0) return syncTime;

  try {
    const { primaryKey, allKeys } = getMediaStorageKeys(media);
    const db = await openTimestampDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      
      let resolved = false;
      for (const key of allKeys) {
        const req = store.get(key);
        req.onsuccess = () => {
          if (resolved) return;
          const parsed = req.result as SavedMediaTimestamp;
          if (parsed && typeof parsed.currentTime === 'number') {
            if (!parsed.completed) {
              const targetDuration = duration || parsed.duration;
              if (!targetDuration || parsed.currentTime < targetDuration - 3) {
                resolved = true;
                resolve(parsed.currentTime);
                return;
              }
            }
          }
        };
      }

      tx.oncomplete = () => {
        if (!resolved) resolve(0);
      };
      tx.onerror = () => {
        if (!resolved) resolve(0);
      };
    });
  } catch {
    return 0;
  }
}

/**
 * Clears saved media timestamp from site storage (e.g. when video reaches completion).
 */
export function clearMediaTimestamp(media: MediaIdentifier): void {
  if (!media) return;
  try {
    const { primaryKey, allKeys } = getMediaStorageKeys(media);
    for (const key of allKeys) {
      localStorage.removeItem(key);
    }
    const lastPosRaw = localStorage.getItem('valor_last_media_pos');
    if (lastPosRaw) {
      try {
        const lastPos = JSON.parse(lastPosRaw);
        if (allKeys.includes(lastPos.key) || lastPos.key === primaryKey) {
          localStorage.removeItem('valor_last_media_pos');
        }
      } catch {}
    }
  } catch {}
}
