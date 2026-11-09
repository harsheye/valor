/**
 * seriesCache.ts
 * Persistent cache for TV series seasons, episodes, and counts.
 * Avoids repeated refetching and supplies total episode counts to the library.
 */

export interface CachedSeasonEpisode {
  episodeNumber: number;
  name: string;
  overview?: string;
  runtime?: number;
  stillPath?: string;
  airDate?: string;
}

export interface CachedSeasonData {
  seasonNumber: number;
  episodes: CachedSeasonEpisode[];
}

export interface CachedSeriesData {
  seriesTitle: string;
  tmdbId?: number;
  totalSeasonsCount: number;
  totalEpisodesCount: number;
  seasons: Record<number, CachedSeasonData>;
  updatedAt: number;
}

const CACHE_STORAGE_KEY = 'valor_series_episodes_cache';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

let memoryCache: Record<string, CachedSeriesData> | null = null;

function normalizeKey(title: string): string {
  if (!title) return '';
  return title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function loadAllCache(): Record<string, CachedSeriesData> {
  if (memoryCache) return memoryCache;
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) {
      memoryCache = {};
      return memoryCache;
    }
    memoryCache = JSON.parse(raw) || {};
    return memoryCache!;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

function saveAllCache(data: Record<string, CachedSeriesData>): void {
  memoryCache = data;
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save series cache to localStorage:', e);
  }
}

export function getCachedSeries(seriesTitle: string): CachedSeriesData | null {
  if (!seriesTitle) return null;
  const all = loadAllCache();
  const key = normalizeKey(seriesTitle);
  const found = all[key];
  if (!found) return null;
  if (Date.now() - (found.updatedAt || 0) > CACHE_TTL_MS) {
    return null;
  }
  return found;
}

export function getCachedSeasonEpisodes(seriesTitle: string, seasonNumber: number): CachedSeasonEpisode[] | null {
  const seriesData = getCachedSeries(seriesTitle);
  if (!seriesData || !seriesData.seasons) return null;
  const season = seriesData.seasons[seasonNumber];
  return season && season.episodes && season.episodes.length > 0 ? season.episodes : null;
}

export function setCachedSeason(
  seriesTitle: string,
  seasonNumber: number,
  episodes: CachedSeasonEpisode[],
  meta?: { tmdbId?: number; totalSeasonsCount?: number }
): void {
  if (!seriesTitle || !episodes || episodes.length === 0) return;
  const all = loadAllCache();
  const key = normalizeKey(seriesTitle);
  const existing = all[key] || {
    seriesTitle,
    totalSeasonsCount: meta?.totalSeasonsCount || 1,
    totalEpisodesCount: episodes.length,
    seasons: {},
    updatedAt: Date.now()
  };

  if (meta?.tmdbId) existing.tmdbId = meta.tmdbId;
  if (meta?.totalSeasonsCount) {
    existing.totalSeasonsCount = Math.max(existing.totalSeasonsCount, meta.totalSeasonsCount);
  }

  existing.seasons[seasonNumber] = {
    seasonNumber,
    episodes
  };

  // Compute total episodes across cached seasons
  let totalEp = 0;
  Object.values(existing.seasons).forEach(s => {
    totalEp += (s.episodes?.length || 0);
  });
  existing.totalEpisodesCount = Math.max(totalEp, existing.totalEpisodesCount, episodes.length);
  existing.updatedAt = Date.now();

  all[key] = existing;
  saveAllCache(all);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('valor_series_cache_updated', {
        detail: { seriesTitle, totalEpisodes: existing.totalEpisodesCount }
      })
    );
  }
}

export function getSeriesCachedCounts(seriesTitle: string): { totalSeasons: number; totalEpisodes: number; tmdbId?: number } | null {
  const data = getCachedSeries(seriesTitle);
  if (!data) return null;
  return {
    totalSeasons: data.totalSeasonsCount || 1,
    totalEpisodes: data.totalEpisodesCount || 0,
    tmdbId: data.tmdbId
  };
}
