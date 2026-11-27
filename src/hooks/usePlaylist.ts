/**
 * usePlaylist — Single source of truth for Valor multi-file playlists.
 *
 * Implements:
 * 1. IndexedDB "playlists" store with full schema (id, name, version, rootHandle, items, currentIndex, repeat, shuffle, trackPrefs, updatedAt)
 * 2. Debounced save & first-save navigator.storage.persist() call
 * 3. Precomputed shuffle order so Previous works predictably
 * 4. Folder relative-path resolution (one permission covers whole tree) via resolveFile()
 * 5. Saved playlists management (create, switch, rename, delete)
 * 6. Locate file support for moved or modified files
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  openDB,
  savePlaylistToStore,
  getPlaylistFromStore,
  getAllPlaylistsFromStore,
  deletePlaylistFromStore,
  getLastPlaylistId,
  setLastPlaylistId,
  requestStoragePersistence,
  storeFileHandle,
  getFileHandle,
  type StoredPlaylist,
  type PlaylistItemStored,
} from '../utils/indexedDB';
import { getMediaTimestamp } from '../utils/mediaTimestampStorage';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { smartTitleCase } from '../utils/libraryViewModel';

// ─── Series title detector ──────────────────────────────────────────────────
export function detectSeriesTitleFromItems(items: Array<{ title?: string; fileName?: string; name?: string }>): string | null {
  if (!items || items.length === 0) return null;
  const seriesTitles = items
    .map(it => classifyVideoTitle(it.title || it.name || it.fileName || '').seriesTitle)
    .filter(Boolean) as string[];

  if (seriesTitles.length === 0) return null;

  const counts: Record<string, number> = {};
  seriesTitles.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted[0] && (sorted[0][1] >= 2 || sorted[0][1] >= items.length * 0.35)) {
    return smartTitleCase(sorted[0][0]);
  }
  return null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type RepeatMode = 'off' | 'one' | 'all';

export interface PlaylistItem {
  id: string;                      // fingerprint `local-${name}_${size}_${lastModified}`
  fingerprint: string;             // alias to id
  name: string;                    // full file name with extension
  title: string;                   // clean display title without extension
  fileName: string;                // alias to name
  relPath?: string[];              // relative path segments from rootHandle
  handle?: FileSystemFileHandle;   // individual fallback handle
  size: number;
  lastModified: number;
  durationSec?: number;
  duration?: string;               // formatted "01:23:45"
  savedTime?: number;              // seconds from mediaTimestampStorage
  isWatched?: boolean;             // finished status
  error?: boolean;                 // file missing / permission required
  file?: File;                     // runtime in-memory File object
}

export interface PlaylistState {
  id: string;
  name: string;
  version: number;
  rootHandle?: FileSystemDirectoryHandle;
  items: PlaylistItem[];
  currentIndex: number;            // -1 = none
  repeat: RepeatMode;
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

export interface UsePlaylistReturn {
  playlist: PlaylistState;
  setPlaylist: React.Dispatch<React.SetStateAction<PlaylistState>>;
  allPlaylists: StoredPlaylist[];

  /** Add items with natural sort and fingerprint deduplication. Returns count added. */
  addItems: (newItems: PlaylistItem[], toEnd?: boolean) => number;

  /** Set active item index. */
  setIndex: (i: number) => void;

  /** Navigate to next item (respects repeat and precomputed shuffle). Returns new index or -1. */
  nextIndex: (currentIdx: number) => number;

  /** Navigate to previous item (respects precomputed shuffle). Returns new index. */
  prevIndex: (currentIdx: number) => number;

  /** Remove item by id/fingerprint. Returns new index. */
  removeItem: (id: string, currentIdx: number) => number;

  /** Clear all items from current playlist. */
  clearAll: () => void;

  /** Mark item as having an error (e.g. missing / permission lapse). */
  markError: (id: string, isError?: boolean) => void;

  /** Update saved timestamp for an item. */
  updateSavedTime: (id: string, time: number, duration?: number) => void;

  /** Reorder item from index to index. */
  reorderItem: (from: number, to: number) => void;

  /** Folder ingest: crawl a directory handle, store rootHandle and relative paths. */
  loadFolderPlaylist: (dirHandle: FileSystemDirectoryHandle, playlistName?: string) => Promise<PlaylistItem[]>;

  /** Switch to a saved playlist by id. */
  switchPlaylist: (id: string) => Promise<boolean>;

  /** Rename current or specified playlist. */
  renamePlaylist: (newName: string, id?: string) => Promise<void>;

  /** Delete a playlist from IndexedDB. */
  deletePlaylist: (id: string) => Promise<void>;

  /** Create a fresh new playlist. */
  createNewPlaylist: (name?: string) => void;

  /** Re-locate a missing file by replacing its handle and file. */
  locateFile: (itemId: string, newFile: File, newHandle?: FileSystemFileHandle) => Promise<boolean>;

  /** Immediate persist flush. */
  persist: () => Promise<void>;

  /** File resolver helper. */
  resolveItemFile: (item: PlaylistItem) => Promise<File | null>;

  /** Shuffle order array. */
  shuffledIndices: number[];
}

// ─── Natural-sort helper ─────────────────────────────────────────────────────

function naturalCompare(a: string, b: string): number {
  const re = /(\d+)|(\D+)/g;
  const pa = a.match(re) ?? [];
  const pb = b.match(re) ?? [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const na = parseInt(pa[i], 10);
    const nb = parseInt(pb[i], 10);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = pa[i].localeCompare(pb[i], undefined, { sensitivity: 'base' });
      if (cmp !== 0) return cmp;
    }
  }
  return pa.length - pb.length;
}

export function naturalSortItems(items: PlaylistItem[]): PlaylistItem[] {
  return [...items].sort((a, b) => naturalCompare(a.name || a.fileName, b.name || b.fileName));
}

export function makeFingerprint(file: File): string {
  return `local-${file.name}_${file.size}_${file.lastModified}`;
}

// ─── File Resolver ──────────────────────────────────────────────────────────

/**
 * Resolves a File object for a given PlaylistItem.
 * 1. Checks memory cache
 * 2. If rootHandle + relPath available, navigates DirectoryHandle hierarchy
 * 3. If individual FileSystemFileHandle available, calls getFile()
 * 4. Fallback to IndexedDB file_handles store
 */
export async function resolveFile(
  item: PlaylistItem,
  rootHandle?: FileSystemDirectoryHandle
): Promise<File | null> {
  // 1. In-memory check
  if (item.file) {
    try {
      await item.file.slice(0, 1).arrayBuffer();
      return item.file;
    } catch {}
  }

  const ensurePermission = async (handle: any) => {
    if (!handle || !('queryPermission' in handle)) return;
    try {
      const q = await handle.queryPermission({ mode: 'read' });
      console.log('[resolveFile] Handle queryPermission state:', q);
      if (q !== 'granted' && 'requestPermission' in handle) {
        const r = await handle.requestPermission({ mode: 'read' });
        console.log('[resolveFile] Handle requestPermission state:', r);
      }
    } catch (e) {
      console.warn('[resolveFile] Permission request failed:', e);
    }
  };

  // 2. Resolve via root directory handle and relative path
  if (rootHandle) {
    try {
      await ensurePermission(rootHandle);
      if (item.relPath && item.relPath.length > 0) {
        let currentDir = rootHandle;
        for (let i = 0; i < item.relPath.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(item.relPath[i]);
        }
        const fh = await currentDir.getFileHandle(item.relPath[item.relPath.length - 1]);
        const file = await fh.getFile();
        item.file = file;
        item.handle = fh;
        item.error = false;
        return file;
      }
    } catch (err) {
      console.warn(`[resolveFile] Failed to resolve via rootHandle and relPath:`, err);
    }
  }

  // 3. Resolve via item individual handle
  if (item.handle) {
    try {
      await ensurePermission(item.handle);
      const file = await item.handle.getFile();
      item.file = file;
      item.error = false;
      return file;
    } catch (err) {
      console.warn(`[resolveFile] Failed to resolve via item.handle:`, err);
    }
  }

  // 4. Resolve via IndexedDB file_handles store
  try {
    const handle = await getFileHandle(item.id || item.fingerprint);
    if (handle) {
      await ensurePermission(handle);
      const file = await handle.getFile();
      item.handle = handle;
      item.file = file;
      item.error = false;
      return file;
    }
  } catch (err) {
    console.warn(`[resolveFile] Failed to resolve via IndexedDB handle:`, err);
  }

  return null;
}

// ─── Directory Tree Scanner ─────────────────────────────────────────────────

export async function scanDirectoryTree(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string[] = []
): Promise<{ file: File; handle: FileSystemFileHandle; relPath: string[] }[]> {
  const results: { file: File; handle: FileSystemFileHandle; relPath: string[] }[] = [];
  try {
    for await (const [name, entry] of (dirHandle as any).entries()) {
      if (entry.kind === 'file') {
        if (/\.(mp4|mkv|webm|mov|avi|m4v|ts|ogv|flv|wmv)$/i.test(name)) {
          try {
            const file: File = await (entry as FileSystemFileHandle).getFile();
            results.push({ file, handle: entry as FileSystemFileHandle, relPath: [...currentPath, name] });
          } catch {}
        }
      } else if (entry.kind === 'directory') {
        const sub = await scanDirectoryTree(entry as FileSystemDirectoryHandle, [...currentPath, name]);
        results.push(...sub);
      }
    }
  } catch (err) {
    console.warn(`[scanDirectoryTree] Error reading directory:`, err);
  }
  return results;
}

// ─── Initial State Factory ──────────────────────────────────────────────────

function createEmptyPlaylist(name = 'New Playlist'): PlaylistState {
  return {
    id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    version: 1,
    items: [],
    currentIndex: -1,
    repeat: 'off',
    shuffle: false,
    updatedAt: Date.now(),
  };
}

function storedToState(stored: StoredPlaylist): PlaylistState {
  const items: PlaylistItem[] = (stored.items || []).map(it => {
    const title = it.title || it.name.replace(/\.[^/.]+$/, '');
    const fallbackSavedTime = savedPosToSec(getMediaTimestamp({ id: it.id, fileName: it.name, title } as any));
    const savedTime = it.savedTime !== undefined ? it.savedTime : fallbackSavedTime;
    const durationFormatted = it.duration || (it.durationSec
      ? (() => {
          const h = Math.floor(it.durationSec / 3600);
          const m = Math.floor((it.durationSec % 3600) / 60);
          const s = Math.floor(it.durationSec % 60);
          return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${m}:${String(s).padStart(2, '0')}`;
        })()
      : undefined);

    return {
      id: it.id,
      fingerprint: it.id,
      name: it.name,
      title,
      fileName: it.name,
      relPath: it.relPath,
      handle: it.handle,
      size: it.size || 0,
      lastModified: it.lastModified || 0,
      durationSec: it.durationSec,
      duration: durationFormatted,
      savedTime,
      isWatched: it.isWatched ?? (savedTime && it.durationSec ? (savedTime / it.durationSec >= 0.95) : false),
      error: false,
    };
  });

  return {
    id: stored.id,
    name: stored.name,
    version: stored.version || 1,
    rootHandle: stored.rootHandle,
    items,
    currentIndex: stored.currentIndex ?? -1,
    repeat: stored.repeat || 'off',
    shuffle: !!stored.shuffle,
    trackPrefs: stored.trackPrefs,
    updatedAt: stored.updatedAt || Date.now(),
  };
}

export function stateToStored(state: PlaylistState): StoredPlaylist {
  const storedItems: PlaylistItemStored[] = state.items.map(it => ({
    id: it.id || it.fingerprint,
    name: it.name || it.fileName,
    title: it.title || it.name.replace(/\.[^/.]+$/, ''),
    relPath: it.relPath,
    handle: it.handle,
    size: it.size || 0,
    lastModified: it.lastModified || 0,
    durationSec: it.durationSec,
    duration: it.duration,
    savedTime: it.savedTime,
    isWatched: it.isWatched,
  }));

  return {
    id: state.id,
    name: state.name,
    version: state.version,
    rootHandle: state.rootHandle,
    items: storedItems,
    currentIndex: state.currentIndex,
    repeat: state.repeat,
    shuffle: state.shuffle,
    trackPrefs: state.trackPrefs,
    updatedAt: Date.now(),
  };
}

function savedPosToSec(val: any): number | undefined {
  if (typeof val === 'number' && val > 0) return val;
  return undefined;
}

// ─── Precomputed Shuffle Order ──────────────────────────────────────────────

function computeShuffleOrder(count: number, currentIdx: number): number[] {
  if (count <= 1) return count === 1 ? [0] : [];
  const indices = Array.from({ length: count }, (_, i) => i);
  
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Ensure currentIdx is at the front if valid
  if (currentIdx >= 0 && currentIdx < count) {
    const pos = indices.indexOf(currentIdx);
    if (pos > 0) {
      indices.splice(pos, 1);
      indices.unshift(currentIdx);
    }
  }
  return indices;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePlaylist(): UsePlaylistReturn {
  const [playlist, setPlaylistRaw] = useState<PlaylistState>(createEmptyPlaylist());
  const [allPlaylists, setAllPlaylists] = useState<StoredPlaylist[]>([]);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const shufflePosRef = useRef<number>(0);

  const playlistRef = useRef(playlist);
  playlistRef.current = playlist;

  const persistTimerRef = useRef<any>(null);
  const hasPersistedStorageRef = useRef(false);

  // Debounced save with first-save storage persistence request
  const scheduleSave = useCallback((state: PlaylistState) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    // Never persist empty unnamed placeholder playlists
    if ((!state.items || state.items.length === 0) && state.name === 'New Playlist') {
      return;
    }
    persistTimerRef.current = setTimeout(async () => {
      // Call navigator.storage.persist() on first save and log result
      if (!hasPersistedStorageRef.current) {
        hasPersistedStorageRef.current = true;
        const isGranted = await requestStoragePersistence().catch(() => false);
        console.log(`[usePlaylist] navigator.storage.persist() on first save: granted = ${isGranted}`);
      }
      try {
        const stored = stateToStored(state);
        await savePlaylistToStore(stored);
        const all = await getAllPlaylistsFromStore();
        setAllPlaylists(all);
      } catch (err) {
        console.warn('[usePlaylist] Debounced save failed:', err);
      }
    }, 400);
  }, []);

  // Flush pending save immediately on page unload so changes are never lost when closing the tab
  useEffect(() => {
    const handleFlush = () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
        try {
          const cur = playlistRef.current;
          if ((cur.items && cur.items.length > 0) || cur.name !== 'New Playlist') {
            const stored = stateToStored(cur);
            savePlaylistToStore(stored);
          }
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handleFlush);
    window.addEventListener('pagehide', handleFlush);
    return () => {
      window.removeEventListener('beforeunload', handleFlush);
      window.removeEventListener('pagehide', handleFlush);
    };
  }, []);

  const setPlaylist = useCallback<React.Dispatch<React.SetStateAction<PlaylistState>>>(
    (valOrFn) => {
      setPlaylistRaw(prev => {
        const next = typeof valOrFn === 'function' ? (valOrFn as Function)(prev) : valOrFn;
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  // Recompute shuffle order when shuffle setting toggles or items change
  useEffect(() => {
    if (playlist.shuffle) {
      const order = computeShuffleOrder(playlist.items.length, playlist.currentIndex);
      setShuffledIndices(order);
      shufflePosRef.current = 0;
    } else {
      setShuffledIndices([]);
      shufflePosRef.current = 0;
    }
  }, [playlist.shuffle, playlist.items.length]);

  // Load last playlist on launch strictly from stored metadata (never calling getFile or queryPermission)
  useEffect(() => {
    (async () => {
      try {
        const lastId = await getLastPlaylistId();
        let all = await getAllPlaylistsFromStore();
        // Clean up any stale empty "New Playlist" placeholders from IndexedDB
        const staleEmpty = all.filter(p => (!p.items || p.items.length === 0) && p.name === 'New Playlist');
        if (staleEmpty.length > 0) {
          await Promise.all(staleEmpty.map(p => deletePlaylistFromStore(p.id).catch(() => {})));
          all = all.filter(p => !((!p.items || p.items.length === 0) && p.name === 'New Playlist'));
        }
        setAllPlaylists(all);

        console.log('[Playlist Startup] Records read from IndexedDB:', {
          lastId,
          totalSavedPlaylists: all.length,
          playlists: all.map(p => ({ id: p.id, name: p.name, itemCount: p.items?.length || 0 }))
        });

        let targetPlaylist: StoredPlaylist | null = null;
        if (lastId) {
          targetPlaylist = all.find(p => p.id === lastId) || (await getPlaylistFromStore(lastId));
        }

        // If no lastId or empty, but other saved playlists exist, pick the most recent
        if ((!targetPlaylist || !targetPlaylist.items || targetPlaylist.items.length === 0) && all.length > 0) {
          const sorted = [...all].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          if (sorted[0] && sorted[0].items && sorted[0].items.length > 0) {
            targetPlaylist = sorted[0];
          }
        }

        if (targetPlaylist && targetPlaylist.items && targetPlaylist.items.length > 0) {
          const restored = storedToState(targetPlaylist);
          console.log(`[Playlist Startup] Count rendered: ${restored.items.length} item(s) from metadata for playlist "${restored.name}"`);
          setPlaylistRaw(restored);
        } else {
          console.log('[Playlist Startup] Count rendered: 0 items (no saved playlist found with items)');
        }
      } catch (err) {
        console.warn('[usePlaylist] Failed to load saved playlists:', err);
      }
    })();
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const addItems = useCallback((newItems: PlaylistItem[], toEnd = true): number => {
    let addedCount = 0;
    setPlaylist(prev => {
      const existingIds = new Set(prev.items.map(it => it.id || it.fingerprint));
      const unique = newItems.filter(it => !existingIds.has(it.id || it.fingerprint));
      addedCount = unique.length;
      if (unique.length === 0) return prev;

      const combined = toEnd ? [...prev.items, ...unique] : [...unique, ...prev.items];
      const sorted = naturalSortItems(combined);
      
      // Keep currentIndex pointing to the same item if one is playing
      let newCurrentIndex = prev.currentIndex;
      if (prev.currentIndex >= 0 && prev.items[prev.currentIndex]) {
        const activeFp = prev.items[prev.currentIndex].id || prev.items[prev.currentIndex].fingerprint;
        newCurrentIndex = sorted.findIndex(it => (it.id || it.fingerprint) === activeFp);
      }

      let playlistName = prev.name;
      if (!prev.name || prev.name === 'Default Playlist' || prev.name === 'Playlist' || prev.items.length === 0) {
        const detected = detectSeriesTitleFromItems(sorted);
        if (detected) playlistName = detected;
      }

      return {
        ...prev,
        name: playlistName,
        items: sorted,
        currentIndex: newCurrentIndex,
        updatedAt: Date.now(),
      };
    });
    return addedCount;
  }, [setPlaylist]);

  const setIndex = useCallback((i: number) => {
    setPlaylist(prev => {
      if (prev.shuffle && shuffledIndices.length > 0) {
        const pos = shuffledIndices.indexOf(i);
        if (pos >= 0) shufflePosRef.current = pos;
      }
      return { ...prev, currentIndex: i, updatedAt: Date.now() };
    });
  }, [setPlaylist, shuffledIndices]);

  const nextIndex = useCallback((currentIdx: number): number => {
    const { items, repeat, shuffle } = playlistRef.current;
    if (items.length === 0) return -1;
    if (repeat === 'one') return currentIdx;

    if (shuffle && shuffledIndices.length > 0) {
      const nextPos = shufflePosRef.current + 1;
      if (nextPos < shuffledIndices.length) {
        shufflePosRef.current = nextPos;
        return shuffledIndices[nextPos];
      }
      if (repeat === 'all') {
        const reshuffled = computeShuffleOrder(items.length, -1);
        setShuffledIndices(reshuffled);
        shufflePosRef.current = 0;
        return reshuffled[0] ?? 0;
      }
      return -1;
    }

    const next = currentIdx + 1;
    if (next >= items.length) {
      return repeat === 'all' ? 0 : -1;
    }
    return next;
  }, [shuffledIndices]);

  const prevIndex = useCallback((currentIdx: number): number => {
    const { items, shuffle } = playlistRef.current;
    if (items.length === 0) return -1;

    if (shuffle && shuffledIndices.length > 0) {
      const prevPos = Math.max(0, shufflePosRef.current - 1);
      shufflePosRef.current = prevPos;
      return shuffledIndices[prevPos];
    }

    return Math.max(0, currentIdx - 1);
  }, [shuffledIndices]);

  const removeItem = useCallback((id: string, currentIdx: number): number => {
    let nextIdx = currentIdx;
    setPlaylist(prev => {
      const targetPos = prev.items.findIndex(it => (it.id || it.fingerprint) === id);
      if (targetPos === -1) return prev;

      const remaining = prev.items.filter(it => (it.id || it.fingerprint) !== id);
      let ni = currentIdx;
      if (targetPos < currentIdx) {
        ni = currentIdx - 1;
      } else if (targetPos === currentIdx) {
        ni = Math.min(currentIdx, remaining.length - 1);
        if (remaining.length === 0) ni = -1;
      }
      nextIdx = ni;
      return { ...prev, items: remaining, currentIndex: ni, updatedAt: Date.now() };
    });
    return nextIdx;
  }, [setPlaylist]);

  const clearAll = useCallback(() => {
    setPlaylist(prev => ({
      ...prev,
      items: [],
      currentIndex: -1,
      rootHandle: undefined,
      updatedAt: Date.now(),
    }));
  }, [setPlaylist]);

  const markError = useCallback((id: string, isError = true) => {
    setPlaylist(prev => ({
      ...prev,
      items: prev.items.map(it =>
        (it.id || it.fingerprint) === id ? { ...it, error: isError } : it
      ),
    }));
  }, [setPlaylist]);

  const updateSavedTime = useCallback((id: string, time: number, duration?: number) => {
    setPlaylist(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if ((it.id || it.fingerprint) === id) {
          const dur = duration || it.durationSec;
          return {
            ...it,
            savedTime: time,
            durationSec: dur,
            isWatched: (dur && dur > 0) ? (time / dur >= 0.95) : it.isWatched,
          };
        }
        return it;
      }),
    }));
  }, [setPlaylist]);

  const reorderItem = useCallback((from: number, to: number) => {
    setPlaylist(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.items.length || to >= prev.items.length) {
        return prev;
      }
      const reordered = [...prev.items];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

      let newIndex = prev.currentIndex;
      if (prev.currentIndex === from) {
        newIndex = to;
      } else if (from < prev.currentIndex && to >= prev.currentIndex) {
        newIndex = prev.currentIndex - 1;
      } else if (from > prev.currentIndex && to <= prev.currentIndex) {
        newIndex = prev.currentIndex + 1;
      }

      return {
        ...prev,
        items: reordered,
        currentIndex: newIndex,
        updatedAt: Date.now(),
      };
    });
  }, [setPlaylist]);

  // Folder ingest
  const loadFolderPlaylist = useCallback(async (dirHandle: FileSystemDirectoryHandle, playlistName?: string): Promise<PlaylistItem[]> => {
    const rawTree = await scanDirectoryTree(dirHandle);
    const items: PlaylistItem[] = [];

    for (const { file, handle, relPath } of rawTree) {
      const id = makeFingerprint(file);
      await storeFileHandle(id, handle).catch(() => {});
      await storeFileHandle(`local-${id}`, handle).catch(() => {});
      const title = file.name.replace(/\.[^/.]+$/, '');
      const savedTime = getMediaTimestamp({ id, fileName: file.name, title } as any);
      items.push({
        id,
        fingerprint: id,
        name: file.name,
        title,
        fileName: file.name,
        relPath,
        handle,
        size: file.size,
        lastModified: file.lastModified,
        savedTime: savedPosToSec(savedTime),
        file,
        error: false,
      });
    }

    const sorted = naturalSortItems(items);
    const detectedSeries = detectSeriesTitleFromItems(items);
    const name = detectedSeries || playlistName || dirHandle.name || 'Folder Playlist';
    const newPlaylistState: PlaylistState = {
      id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name,
      version: 1,
      rootHandle: dirHandle,
      items: sorted,
      currentIndex: sorted.length > 0 ? 0 : -1,
      repeat: 'off',
      shuffle: false,
      updatedAt: Date.now(),
    };

    setPlaylist(newPlaylistState);
    return sorted;
  }, [setPlaylist]);

  // Saved playlists management
  const switchPlaylist = useCallback(async (id: string): Promise<boolean> => {
    try {
      const found = await getPlaylistFromStore(id);
      if (found) {
        setPlaylist(storedToState(found));
        await setLastPlaylistId(id);
        return true;
      }
    } catch (err) {
      console.warn('[usePlaylist] Failed to switch playlist:', err);
    }
    return false;
  }, [setPlaylist]);

  const renamePlaylist = useCallback(async (newName: string, id?: string) => {
    const targetId = id || playlistRef.current.id;
    setPlaylist(prev => {
      if (prev.id === targetId) {
        return { ...prev, name: newName, updatedAt: Date.now() };
      }
      return prev;
    });
    try {
      const stored = await getPlaylistFromStore(targetId);
      if (stored) {
        stored.name = newName;
        stored.updatedAt = Date.now();
        await savePlaylistToStore(stored);
        const all = await getAllPlaylistsFromStore();
        setAllPlaylists(all);
      }
    } catch {}
  }, [setPlaylist]);

  const deletePlaylist = useCallback(async (id: string) => {
    try {
      await deletePlaylistFromStore(id);
      const remaining = await getAllPlaylistsFromStore();
      setAllPlaylists(remaining);

      if (playlistRef.current.id === id) {
        if (remaining.length > 0) {
          setPlaylist(storedToState(remaining[0]));
          await setLastPlaylistId(remaining[0].id);
        } else {
          const fresh = createEmptyPlaylist();
          setPlaylist(fresh);
        }
      }
    } catch (err) {
      console.warn('[usePlaylist] Failed to delete playlist:', err);
    }
  }, [setPlaylist]);

  const createNewPlaylist = useCallback((name = 'New Playlist') => {
    const fresh = createEmptyPlaylist(name);
    setPlaylist(fresh);
    scheduleSave(fresh);
  }, [setPlaylist, scheduleSave]);

  // Locate file flow for moved/renamed files
  const locateFile = useCallback(async (itemId: string, newFile: File, newHandle?: FileSystemFileHandle): Promise<boolean> => {
    let succeeded = false;
    setPlaylist(prev => {
      const updatedItems = prev.items.map(it => {
        if ((it.id || it.fingerprint) === itemId) {
          succeeded = true;
          return {
            ...it,
            name: newFile.name,
            title: newFile.name.replace(/\.[^/.]+$/, ''),
            fileName: newFile.name,
            size: newFile.size,
            lastModified: newFile.lastModified,
            file: newFile,
            handle: newHandle || it.handle,
            error: false,
          };
        }
        return it;
      });
      return { ...prev, items: updatedItems, updatedAt: Date.now() };
    });

    if (newHandle) {
      await storeFileHandle(itemId, newHandle).catch(() => {});
    }
    return succeeded;
  }, [setPlaylist]);

  const persist = useCallback(async () => {
    try {
      const stored = stateToStored(playlistRef.current);
      await savePlaylistToStore(stored);
    } catch {}
  }, []);

  const resolveItemFile = useCallback(async (item: PlaylistItem): Promise<File | null> => {
    return resolveFile(item, playlistRef.current.rootHandle);
  }, []);

  return {
    playlist,
    setPlaylist,
    allPlaylists,
    addItems,
    setIndex,
    nextIndex,
    prevIndex,
    removeItem,
    clearAll,
    markError,
    updateSavedTime,
    reorderItem,
    loadFolderPlaylist,
    switchPlaylist,
    renamePlaylist,
    deletePlaylist,
    createNewPlaylist,
    locateFile,
    persist,
    resolveItemFile,
    shuffledIndices,
  };
}
