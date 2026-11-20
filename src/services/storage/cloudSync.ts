import type { VideoItem, Bookmark } from '../../types/media';
import { deduplicateBookmarks, mergeBookmarksList } from '../../utils/bookmarkUtils';

export { deduplicateBookmarks, mergeBookmarksList };

/**
 * Scan localStorage for all bookmarks saved across all keys (valor_bookmarks_*).
 */
export function collectAllLocalBookmarks(userIdsToScan: string[] = ['local']): { [videoId: string]: Bookmark[] } {
  const result: { [videoId: string]: Bookmark[] } = {};

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (!key.startsWith('valor_bookmarks_')) continue;

      let videoId = '';
      for (const uid of userIdsToScan) {
        const prefix = `valor_bookmarks_${uid}_`;
        if (key.startsWith(prefix)) {
          videoId = key.substring(prefix.length);
          break;
        }
      }
      if (!videoId) {
        const rest = key.substring('valor_bookmarks_'.length);
        const parts = rest.split('_');
        if (parts.length > 1 && userIdsToScan.includes(parts[0])) {
          videoId = parts.slice(1).join('_');
        } else {
          videoId = rest;
        }
      }

      if (!videoId) continue;

      try {
        const val = localStorage.getItem(key);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (!result[videoId]) result[videoId] = [];
            result[videoId].push(...parsed);
          }
        }
      } catch {}
    }
  } catch {}

  // Deduplicate and sort bookmarks per video
  for (const vid in result) {
    result[vid] = deduplicateBookmarks(result[vid]);
  }

  return result;
}

/**
 * Merge local and remote video history lists.
 */
export function mergeHistoryLists(localVideos: VideoItem[], remoteVideos: VideoItem[]): VideoItem[] {
  const map = new Map<string, VideoItem>();

  const ingest = (list: VideoItem[]) => {
    for (const v of list) {
      if (!v || !v.id) continue;
      const key = v.id;
      if (!map.has(key)) {
        map.set(key, { ...v });
      } else {
        const existing = map.get(key)!;
        const higherCurrentTime = Math.max(Number(existing.currentTime || 0), Number(v.currentTime || 0));
        const higherWatched = Math.max(Number(existing.totalTimeWatched || 0), Number(v.totalTimeWatched || 0));
        const latestPlayed = (!existing.lastPlayedDate || (v.lastPlayedDate && new Date(v.lastPlayedDate) > new Date(existing.lastPlayedDate)))
          ? v.lastPlayedDate : existing.lastPlayedDate;

        map.set(key, {
          ...existing,
          ...v,
          currentTime: higherCurrentTime,
          totalTimeWatched: higherWatched,
          lastPlayedDate: latestPlayed,
          bookmarks: mergeBookmarksList(existing.bookmarks, v.bookmarks)
        });
      }
    }
  };

  ingest(remoteVideos);
  ingest(localVideos);

  return Array.from(map.values());
}

/**
 * Collect all local videos from React state, 'valor_videos', and 'valor_videos_${prevUserId}'.
 */
export function collectLocalVideos(prevUserId?: string, inMemoryVideos?: VideoItem[]): VideoItem[] {
  const videoMap = new Map<string, VideoItem>();

  const addVideos = (items: any[]) => {
    if (!Array.isArray(items)) return;
    for (const v of items) {
      if (!v || !v.id) continue;
      const key = v.id;
      if (!videoMap.has(key)) {
        videoMap.set(key, { ...v });
      } else {
        const existing = videoMap.get(key)!;
        const higherCurrentTime = Math.max(Number(existing.currentTime || 0), Number(v.currentTime || 0));
        const higherWatched = Math.max(Number(existing.totalTimeWatched || 0), Number(v.totalTimeWatched || 0));
        const latestPlayed = (!existing.lastPlayedDate || (v.lastPlayedDate && new Date(v.lastPlayedDate) > new Date(existing.lastPlayedDate)))
          ? v.lastPlayedDate : existing.lastPlayedDate;

        videoMap.set(key, {
          ...existing,
          ...v,
          currentTime: higherCurrentTime,
          totalTimeWatched: higherWatched,
          lastPlayedDate: latestPlayed,
          bookmarks: mergeBookmarksList(existing.bookmarks, v.bookmarks)
        });
      }
    }
  };

  // 1. inMemoryVideos
  if (inMemoryVideos && inMemoryVideos.length > 0) {
    addVideos(inMemoryVideos);
  }

  // 2. Scan ALL keys in localStorage starting with valor_videos
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k === 'valor_videos' || k.startsWith('valor_videos_')) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              addVideos(parsed);
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 3. Scan valor_local_profiles for any associated profile history
  try {
    const localSaved = localStorage.getItem('valor_local_profiles');
    if (localSaved) {
      const profiles = JSON.parse(localSaved);
      if (Array.isArray(profiles)) {
        for (const p of profiles) {
          if (p.userId) {
            const raw = localStorage.getItem(`valor_videos_${p.userId}`);
            if (raw) {
              try { addVideos(JSON.parse(raw)); } catch {}
            }
          }
        }
      }
    }
  } catch {}

  // 4. Attach any local bookmarks from localStorage
  const localBookmarks = collectAllLocalBookmarks();

  for (const [vid, bms] of Object.entries(localBookmarks)) {
    if (videoMap.has(vid)) {
      const v = videoMap.get(vid)!;
      v.bookmarks = mergeBookmarksList(v.bookmarks, bms);
    } else {
      // Create a stub video entry if none exists so bookmarks are preserved in history
      videoMap.set(vid, {
        id: vid,
        title: bms[0]?.mediaName || bms[0]?.title || 'Video',
        url: '',
        type: 'local',
        currentTime: bms[0]?.time || 0,
        audioTracks: [],
        subtitleTracks: [],
        bookmarks: bms,
        tmdbId: bms[0]?.tmdbId,
        season: bms[0]?.season,
        episode: bms[0]?.episode
      });
    }
  }

  return Array.from(videoMap.values());
}

export interface SyncProfileDataOptions {
  prevUserId?: string;
  inMemoryVideos?: VideoItem[];
  currentSettings?: any;
  gqlFetch?: (query: string, variables?: any) => Promise<any>;
}

/**
 * Synchronize full profile data (Watch History, Bookmarks, and Settings) to the cloud server database.
 */
export async function syncProfileDataToCloud(
  targetUserId: string,
  options?: SyncProfileDataOptions
): Promise<{ mergedVideos: VideoItem[]; mergedSettings: any }> {
  const prevUserId = options?.prevUserId || 'local';

  // 1. Collect all local videos and bookmarks
  const localVideos = collectLocalVideos(prevUserId, options?.inMemoryVideos);

  // 2. Fetch existing cloud history
  let remoteVideos: VideoItem[] = [];
  try {
    const res = await fetch(`/api/history?userId=${encodeURIComponent(targetUserId)}`, {
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        remoteVideos = data;
      }
    }
  } catch (e) {
    console.warn('[cloudSync] Failed to fetch remote history:', e);
  }

  // 3. Merge local and remote videos
  const mergedVideos = mergeHistoryLists(localVideos, remoteVideos);

  // 4. Serialize and push merged history to server database via REST
  const serializedHistory = mergedVideos.map(v => ({
    id: v.id,
    title: v.title || '',
    url: v.type === 'url' ? v.url : (v.url || ''),
    type: v.type || 'local',
    fileName: v.file ? v.file.name : ((v as any).fileName || ''),
    duration: v.duration || 0,
    currentTime: v.currentTime || 0,
    lastPlayedDate: v.lastPlayedDate || new Date().toISOString(),
    totalTimeWatched: v.totalTimeWatched || 0,
    rating: v.rating || null,
    timeToFinish: v.timeToFinish || null,
    sessions: (v as any).sessions || [],
    localFilePath: v.localFilePath || null,
    playedDates: v.playedDates || [],
    format: v.format || null,
    streams: v.streams || [],
    audioTracks: v.audioTracks || [],
    subtitleTracks: v.subtitleTracks || [],
    bookmarks: (v.bookmarks || []).map(bm => ({
      id: bm.id || `bm_${bm.time}_${Math.random().toString(36).substring(2, 7)}`,
      time: Number(bm.time) || 0,
      endTime: bm.endTime !== undefined && bm.endTime !== null ? Number(bm.endTime) : null,
      label: bm.label || bm.title || 'Bookmark',
      isIntro: Boolean(bm.isIntro),
      isOutro: Boolean(bm.isOutro),
      skipEnabled: Boolean(bm.skipEnabled),
      title: bm.title || bm.label || 'Bookmark',
      description: bm.description || '',
      category: bm.category || (bm.isIntro ? 'Intro' : bm.isOutro ? 'Outro' : 'Custom'),
      startTime: bm.startTime !== undefined && bm.startTime !== null ? Number(bm.startTime) : (Number(bm.time) || 0),
      thumbnail: bm.thumbnail || '',
      favorite: Boolean(bm.favorite),
      createdAt: bm.createdAt || new Date().toISOString(),
      updatedAt: bm.updatedAt || new Date().toISOString(),
      userName: bm.userName || '',
      userTime: bm.userTime || '',
      mediaName: bm.mediaName || v.title || '',
      tmdbId: bm.tmdbId || v.tmdbId,
      season: bm.season || v.season,
      episode: bm.episode || v.episode,
      createdBy: bm.createdBy || 'manual'
    })),
    episode: v.episode || null,
    season: v.season || null,
    color: (v as any).color || null,
    tmdbId: v.tmdbId || null,
    hasScrobbledTrakt: Boolean(v.hasScrobbledTrakt)
  }));

  try {
    await fetch(`/api/history?userId=${encodeURIComponent(targetUserId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId: targetUserId, history: serializedHistory })
    });
  } catch (e) {
    console.error('[cloudSync] Failed to push history to /api/history:', e);
  }

  // Also push via GraphQL if gqlFetch is provided
  if (options?.gqlFetch) {
    try {
      await options.gqlFetch(`
        mutation SaveHistory($userId: String!, $history: [HistoryInput!]!) {
          saveHistory(userId: $userId, history: $history) {
            success
          }
        }
      `, { userId: targetUserId, history: serializedHistory });
    } catch {}
  }

  // 5. Gather all bookmarks from merged videos and ensure dedicated persistence via /api/timestamps
  const allBookmarks: any[] = [];
  for (const v of mergedVideos) {
    if (Array.isArray(v.bookmarks) && v.bookmarks.length > 0) {
      for (const bm of v.bookmarks) {
        allBookmarks.push({
          ...bm,
          id: bm.id || `bm_${bm.time}_${Math.random().toString(36).substring(2, 7)}`,
          videoId: bm.videoId || v.id,
          userId: targetUserId,
          tmdbId: bm.tmdbId || v.tmdbId,
          season: bm.season || v.season,
          episode: bm.episode || v.episode,
          mediaName: bm.mediaName || v.title
        });
      }
    }
  }

  if (allBookmarks.length > 0) {
    try {
      await fetch('/api/timestamps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: targetUserId,
          bookmarks: allBookmarks
        })
      });
    } catch (e) {
      console.warn('[cloudSync] Failed to push bookmarks to /api/timestamps:', e);
    }
  }

  // 6. Update local storage caches for target user and default local
  try {
    const serializedJson = JSON.stringify(mergedVideos);
    localStorage.setItem(`valor_videos_${targetUserId}`, serializedJson);
    localStorage.setItem('valor_videos', serializedJson);

    // Also mirror individual video bookmarks keys
    for (const v of mergedVideos) {
      if (Array.isArray(v.bookmarks) && v.bookmarks.length > 0) {
        localStorage.setItem(`valor_bookmarks_${targetUserId}_${v.id}`, JSON.stringify(v.bookmarks));
      }
    }
  } catch {}

  // 7. Save settings to cloud database
  let mergedSettings = options?.currentSettings ? { ...options.currentSettings } : {};
  mergedSettings = {
    ...mergedSettings,
    userId: targetUserId,
    storageMode: 'file',
    experienceMode: 'cloud',
    isOnboarded: true
  };

  try {
    localStorage.setItem(`valor_settings_${targetUserId}`, JSON.stringify(mergedSettings));
    localStorage.setItem('valor_settings', JSON.stringify(mergedSettings));
  } catch {}

  try {
    await fetch(`/api/settings?userId=${encodeURIComponent(targetUserId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(mergedSettings)
    });
  } catch (e) {
    console.error('[cloudSync] Failed to push settings to /api/settings:', e);
  }

  return { mergedVideos, mergedSettings };
}
