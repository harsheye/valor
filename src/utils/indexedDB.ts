const DB_NAME = 'valor_media_db';
const STORE_NAME = 'file_handles';
export const PLAYLIST_STORE = 'playlist';
export const PLAYLISTS_STORE = 'playlists';
export const PLAYLIST_META_STORE = 'playlist_meta';

export interface PlaylistItemStored {
  id: string; // fingerprint `local-${name}_${size}_${lastModified}`
  name: string;
  title?: string;
  relPath?: string[]; // relative path segments from rootHandle
  handle?: FileSystemFileHandle; // fallback for loose files
  size: number;
  lastModified: number;
  durationSec?: number;
  duration?: string;
  savedTime?: number;
  isWatched?: boolean;
  thumbnail?: string;
}

export interface StoredPlaylist {
  id: string;
  name: string;
  version: number;
  rootHandle?: FileSystemDirectoryHandle;
  items: PlaylistItemStored[];
  currentIndex: number;
  repeat: 'off' | 'one' | 'all';
  shuffle: boolean;
  trackPrefs?: {
    audioLang?: string;
    audioTitle?: string;
    subLang?: string;
    subTitle?: string;
    subOffset?: number;
    subSettings?: any;
  };
  updatedAt: number;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
        db.createObjectStore(PLAYLIST_STORE);
      }
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        db.createObjectStore(PLAYLISTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PLAYLIST_META_STORE)) {
        db.createObjectStore(PLAYLIST_META_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Call navigator.storage.persist() on first save to prevent eviction and log status */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        const granted = await navigator.storage.persist();
        console.log(`[Storage Persistence] navigator.storage.persist() requested -> granted: ${granted}`);
        return granted;
      }
      console.log('[Storage Persistence] Storage is already persisted (persisted: true)');
      return isPersisted;
    } catch (err) {
      console.warn('[Storage Persistence] Error requesting storage persistence:', err);
      return false;
    }
  }
  console.log('[Storage Persistence] navigator.storage.persist() not supported in this environment');
  return false;
}

export async function storeFileHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  // Prevent storing raw Blob/File objects to avoid bloated databases
  if (handle instanceof Blob || handle instanceof File || (handle && typeof (handle as any).size === 'number')) {
    console.warn('[IndexedDB] Blocked storing raw File/Blob object in file_handles store to save storage.');
    return;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getFileHandle(id: string): Promise<FileSystemFileHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function removeFileHandle(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function verifyPermission(fileHandle: any): Promise<boolean> {
  if (!fileHandle) return false;
  const options = { mode: 'read' as const };
  try {
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
  } catch (e) {
    console.error('Permission request failed:', e);
  }
  return false;
}

export async function cleanupFileHandles(activeIds: string[]): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    const activeSet = new Set(activeIds);
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const key = String(cursor.key);
        if (!activeSet.has(key)) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

// ─── Playlists Store Operations ─────────────────────────────────────────────

export async function savePlaylistToStore(playlist: StoredPlaylist): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLAYLISTS_STORE, PLAYLIST_META_STORE], 'readwrite');
    const pStore = tx.objectStore(PLAYLISTS_STORE);
    const mStore = tx.objectStore(PLAYLIST_META_STORE);
    
    pStore.put(playlist);
    mStore.put(playlist.id, 'lastPlaylistId');

    tx.oncomplete = () => {
      try {
        localStorage.setItem('valor_last_playlist_id', playlist.id);
      } catch {}
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPlaylistFromStore(id: string): Promise<StoredPlaylist | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PLAYLISTS_STORE, 'readonly');
    const store = tx.objectStore(PLAYLISTS_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllPlaylistsFromStore(): Promise<StoredPlaylist[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PLAYLISTS_STORE, 'readonly');
    const store = tx.objectStore(PLAYLISTS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePlaylistFromStore(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([PLAYLISTS_STORE, PLAYLIST_META_STORE], 'readwrite');
    const pStore = tx.objectStore(PLAYLISTS_STORE);
    const mStore = tx.objectStore(PLAYLIST_META_STORE);

    pStore.delete(id);
    
    // Check if deleted playlist was lastPlaylistId
    const getReq = mStore.get('lastPlaylistId');
    getReq.onsuccess = () => {
      if (getReq.result === id) {
        mStore.delete('lastPlaylistId');
        try {
          localStorage.removeItem('valor_last_playlist_id');
        } catch {}
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLastPlaylistId(): Promise<string | null> {
  try {
    const fromLocal = localStorage.getItem('valor_last_playlist_id');
    if (fromLocal) return fromLocal;
  } catch {}

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(PLAYLIST_META_STORE, 'readonly');
      const store = tx.objectStore(PLAYLIST_META_STORE);
      const req = store.get('lastPlaylistId');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setLastPlaylistId(id: string): Promise<void> {
  try {
    localStorage.setItem('valor_last_playlist_id', id);
  } catch {}
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAYLIST_META_STORE, 'readwrite');
      const store = tx.objectStore(PLAYLIST_META_STORE);
      const req = store.put(id, 'lastPlaylistId');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}
