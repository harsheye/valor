import type { VideoItem } from '../types/media';
import { classifyVideoTitle } from './libraryClassifier';
import { formatRuntime, formatTimecode, formatFullTimecode, parseDurationToSeconds } from './timeFormat';

export type MediaStatus = 'new' | 'in-progress' | 'watched';

export interface BaseMediaViewModel {
  id: string;
  kind: 'movie' | 'series' | 'episode';
  displayTitle: string;
  rawName: string;
  year?: number;
  runtimeLabel: string;
  fullTimecode: string;
  durationSec: number;
  status: MediaStatus;
  progress: number; // 0 to 1
  resumeLabel: string;
  rating?: number;
  lastPlayed?: string;
  dateAdded?: string;
  resolution?: string;
  codec?: string;
  posterPath?: string;
  tileHue: number;
  tileGlyph: string;
  video: VideoItem;
}

export interface EpisodeViewModel extends BaseMediaViewModel {
  kind: 'episode';
  season: number;
  episode: number;
  episodeCode: string; // "S01E04"
  seriesTitle: string;
}

export interface SeriesViewModel {
  id: string;
  kind: 'series';
  seriesTitle: string;
  displayTitle: string;
  rawName: string;
  year?: number;
  runtimeLabel?: string;
  fullTimecode?: string;
  durationSec?: number;
  seasonsCount: number;
  episodesCount: number;
  watchedCount: number;
  inProgressCount: number;
  status: MediaStatus;
  progress: number; // watched / total
  metaLabel: string; // "1 season, 4 episodes"
  stateLine: string; // "Resume S01E04" | "Next: S01E05" | "Watched" | ""
  resumeLabel?: string;
  primaryActionLabel: string; // "Resume S01E04" | "Play S01E05" | "Play again"
  primaryEpisode?: VideoItem;
  tileHue: number;
  tileGlyph: string;
  posterPath?: string;
  resolution?: string;
  codec?: string;
  rating?: number;
  episodes: EpisodeViewModel[];
  seasons: number[];
  video: VideoItem; // Primary representative episode
  dateAdded?: string;
  lastPlayed?: string;
}

/* ═══════════════════════════════════════════════════════════════════
   Custom Renames Storage Helper
   ═══════════════════════════════════════════════════════════════════ */
const RENAMES_STORAGE_KEY = 'valor_media_renames';

export function getCustomRenames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(RENAMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCustomRename(id: string, newTitle: string): void {
  try {
    const current = getCustomRenames();
    if (newTitle.trim()) {
      current[id] = newTitle.trim();
    } else {
      delete current[id];
    }
    localStorage.setItem(RENAMES_STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

export function removeCustomRename(id: string): void {
  try {
    const current = getCustomRenames();
    delete current[id];
    localStorage.setItem(RENAMES_STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

/* ═══════════════════════════════════════════════════════════════════
   String Hashing & Tile Fallback Generator
   ═══════════════════════════════════════════════════════════════════ */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getFirstAlphanumeric(str: string): string {
  const match = str.match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : 'V';
}

export function getTileColors(displayTitle: string): { hue: number; tileBg: string; glyphColor: string } {
  const hue = hashString(displayTitle) % 360;
  return {
    hue,
    tileBg: `hsl(${hue}, 22%, var(--tile-l, 22%))`,
    glyphColor: `hsl(${hue}, 38%, var(--tile-glyph-l, 74%))`
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Smart Title Casing
   ═══════════════════════════════════════════════════════════════════ */
const MINOR_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
  'from', 'by', 'in', 'of', 'with', 'vs', 'via'
]);

export function smartTitleCase(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();

  const isAllUpper = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const isAllLower = trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed);
  const isErratic = /[a-z][A-Z]{2,}/.test(trimmed) || /^[a-z]+[A-Z]/.test(trimmed);

  if (!isAllUpper && !isAllLower && !isErratic) {
    return trimmed;
  }

  const words = trimmed.toLowerCase().split(/\s+/);
  const cased = words.map((w, idx) => {
    if (/^(ii|iii|iv|v|vi|vii|viii|ix|x)$/i.test(w)) {
      return w.toUpperCase();
    }
    if (w.includes('-')) {
      return w.split('-').map(part => smartTitleCase(part)).join('-');
    }
    if (idx > 0 && idx < words.length - 1 && MINOR_WORDS.has(w)) {
      return w;
    }
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return cased.join(' ');
}

/* ═══════════════════════════════════════════════════════════════════
   Resolution / Codec Derivation
   ═══════════════════════════════════════════════════════════════════ */
export function deriveResolution(video: VideoItem): string | undefined {
  if (video.streams && video.streams.length > 0) {
    const videoStream = video.streams.find(s => (s as any).type === 'video' || (s as any).codec_type === 'video') as any;
    if (videoStream) {
      const h = videoStream.height;
      const w = videoStream.width;
      if (w && h) {
        if (w >= 3800 || h >= 2100) return '4K';
        if (w >= 2500 || h >= 1400) return '1440p';
        if (w >= 1900 || h >= 1000) return '1080p';
        if (w >= 1200 || h >= 700) return '720p';
        if (h >= 480) return '480p';
      }
      if (videoStream.details) {
        if (/\b(3840x2160|2160p|4k)\b/i.test(videoStream.details)) return '4K';
        if (/\b(1920x1080|1080p)\b/i.test(videoStream.details)) return '1080p';
        if (/\b(1280x720|720p)\b/i.test(videoStream.details)) return '720p';
        if (/\b480p\b/i.test(videoStream.details)) return '480p';
      }
    }
  }

  const raw = (video.title + ' ' + (video.fileName || '')).toLowerCase();
  if (/\b(4k|2160p|uhd)\b/.test(raw)) return '4K';
  if (/\b(1080p|fhd)\b/.test(raw)) return '1080p';
  if (/\b(720p|hd)\b/.test(raw)) return '720p';
  if (/\b(480p|sd|576p)\b/.test(raw)) return '480p';
  return undefined;
}

export function deriveCodec(video: VideoItem): string | undefined {
  if (video.streams && video.streams.length > 0) {
    const vStream = video.streams.find(s => (s as any).type === 'video' || (s as any).codec_type === 'video') as any;
    if (vStream) {
      const c = (vStream.codec || vStream.codec_name || '').toUpperCase();
      if (c === 'HEVC' || c === 'H265') return 'HEVC';
      if (c === 'H264' || c === 'AVC') return 'AVC';
      if (c === 'AV1') return 'AV1';
      if (c === 'VP9') return 'VP9';
      if (c) return c;
    }
  }
  const raw = (video.title + ' ' + (video.fileName || '')).toLowerCase();
  if (/\b(hevc|h265|x265|10bit)\b/.test(raw)) return 'HEVC';
  if (/\b(avc|h264|x264)\b/.test(raw)) return 'AVC';
  if (/\bav1\b/.test(raw)) return 'AV1';
  return undefined;
}

/* ═══════════════════════════════════════════════════════════════════
   Movie View Model Builder
   ═══════════════════════════════════════════════════════════════════ */
export function buildMovieViewModel(video: VideoItem, customRenames: Record<string, string>): BaseMediaViewModel {
  const classified = classifyVideoTitle(video.title);
  const rawName = video.title;

  let baseTitle = classified.cleanTitle || video.title;
  baseTitle = smartTitleCase(baseTitle);

  const year = classified.year;
  const customOverride = customRenames[video.id];
  const displayTitle = customOverride || (year ? `${baseTitle} (${year})` : baseTitle);

  const durationSec = typeof video.duration === 'number'
    ? video.duration
    : parseDurationToSeconds(video.duration);

  const currentTime = video.currentTime || video.resumeTime || 0;

  const isCompleted = !!(
    (video as any).completed === true ||
    video.timeToFinish ||
    (durationSec > 0 && ((durationSec - currentTime <= (durationSec > 360 ? 240 : (durationSec > 120 ? 60 : 15))) || currentTime >= durationSec * 0.92))
  );

  let status: MediaStatus = 'new';
  let progress = 0;
  let resumeLabel = '';

  if (isCompleted) {
    status = 'watched';
    progress = 1;
    resumeLabel = 'Watched';
  } else if (currentTime > 0) {
    status = 'in-progress';
    progress = durationSec > 0 ? Math.min(1, Math.max(0, currentTime / durationSec)) : 0.05;
    resumeLabel = `Resume at ${formatTimecode(currentTime)}`;
  }

  const runtimeLabel = formatRuntime(durationSec);
  const fullTimecode = formatFullTimecode(durationSec);

  const rating = video.rating && video.rating > 0 ? video.rating : undefined;

  const dateAdded = video.playedDates && video.playedDates.length > 0
    ? video.playedDates[0]
    : (video.file as any)?.lastModified
      ? new Date((video.file as any).lastModified).toISOString()
      : video.lastPlayedDate;

  const { hue } = getTileColors(displayTitle);

  return {
    id: video.id,
    kind: 'movie',
    displayTitle,
    rawName,
    year,
    runtimeLabel,
    fullTimecode,
    durationSec,
    status,
    progress,
    resumeLabel,
    rating,
    lastPlayed: video.lastPlayedDate,
    dateAdded,
    resolution: deriveResolution(video),
    codec: deriveCodec(video),
    posterPath: video.posterPath || video.thumbnailUrl,
    tileHue: hue,
    tileGlyph: getFirstAlphanumeric(displayTitle),
    video
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Episode & Series View Model Builder
   ═══════════════════════════════════════════════════════════════════ */
export function buildEpisodeViewModel(video: VideoItem, customRenames: Record<string, string>): EpisodeViewModel {
  const classified = classifyVideoTitle(video.title);
  const rawName = video.title;

  const season = classified.season || 1;
  const episode = classified.episode || 1;
  const sStr = String(season).padStart(2, '0');
  const eStr = String(episode).padStart(2, '0');
  const episodeCode = `S${sStr}E${eStr}`;

  let seriesTitle = smartTitleCase(classified.seriesTitle || 'Unknown Series');
  seriesTitle = seriesTitle.replace(/\s*\(\d{4}\)$/, '').trim();

  let epTitle = classified.episodeTitle
    ? smartTitleCase(classified.episodeTitle)
    : `Episode ${episode}`;

  const customOverride = customRenames[video.id];
  const displayTitle = customOverride || epTitle;

  const durationSec = typeof video.duration === 'number'
    ? video.duration
    : parseDurationToSeconds(video.duration);

  const currentTime = video.currentTime || video.resumeTime || 0;

  const isCompleted = !!(
    (video as any).completed === true ||
    video.timeToFinish ||
    (durationSec > 0 && ((durationSec - currentTime <= (durationSec > 360 ? 240 : (durationSec > 120 ? 60 : 15))) || currentTime >= durationSec * 0.92))
  );

  let status: MediaStatus = 'new';
  let progress = 0;
  let resumeLabel = '';

  if (isCompleted) {
    status = 'watched';
    progress = 1;
    resumeLabel = 'Watched';
  } else if (currentTime > 0) {
    status = 'in-progress';
    progress = durationSec > 0 ? Math.min(1, Math.max(0, currentTime / durationSec)) : 0.05;
    resumeLabel = `Resume at ${formatTimecode(currentTime)}`;
  } else {
    resumeLabel = 'Not started';
  }

  const runtimeLabel = formatRuntime(durationSec);
  const fullTimecode = formatFullTimecode(durationSec);

  const dateAdded = video.playedDates && video.playedDates.length > 0
    ? video.playedDates[0]
    : video.lastPlayedDate;

  const { hue } = getTileColors(displayTitle);

  return {
    id: video.id,
    kind: 'episode',
    displayTitle,
    rawName,
    year: classified.year,
    season,
    episode,
    episodeCode,
    seriesTitle,
    runtimeLabel,
    fullTimecode,
    durationSec,
    status,
    progress,
    resumeLabel,
    rating: video.rating && video.rating > 0 ? video.rating : undefined,
    lastPlayed: video.lastPlayedDate,
    dateAdded,
    resolution: deriveResolution(video),
    codec: deriveCodec(video),
    posterPath: video.posterPath || video.thumbnailUrl,
    tileHue: hue,
    tileGlyph: getFirstAlphanumeric(seriesTitle),
    video
  };
}

export function buildSeriesViewModel(
  seriesTitle: string,
  episodes: EpisodeViewModel[],
  customRenames: Record<string, string>
): SeriesViewModel {
  const sortedEpisodes = [...episodes].sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });

  const uniqueSeasons = Array.from(new Set(sortedEpisodes.map(e => e.season))).sort((a, b) => a - b);
  const seasonsCount = uniqueSeasons.length;
  const episodesCount = sortedEpisodes.length;

  const watchedEpisodes = sortedEpisodes.filter(e => e.status === 'watched');
  const watchedCount = watchedEpisodes.length;
  const inProgressEpisodes = sortedEpisodes.filter(e => e.status === 'in-progress');
  const inProgressCount = inProgressEpisodes.length;

  const seasonsPlural = seasonsCount === 1 ? '1 season' : `${seasonsCount} seasons`;
  const episodesPlural = episodesCount === 1 ? '1 episode' : `${episodesCount} episodes`;
  const metaLabel = `${seasonsPlural}, ${episodesPlural}`;

  let primaryEpisode: VideoItem | undefined = undefined;
  let stateLine = '';
  let primaryActionLabel = 'Play';

  if (inProgressEpisodes.length > 0) {
    const resumeEp = inProgressEpisodes[0];
    primaryEpisode = resumeEp.video;
    stateLine = `Resume ${resumeEp.episodeCode}`;
    primaryActionLabel = `Resume ${resumeEp.episodeCode}`;
  } else if (watchedCount > 0 && watchedCount < episodesCount) {
    const nextEp = sortedEpisodes.find(e => e.status === 'new') || sortedEpisodes[0];
    primaryEpisode = nextEp.video;
    stateLine = `Next: ${nextEp.episodeCode}`;
    primaryActionLabel = `Play ${nextEp.episodeCode}`;
  } else if (watchedCount === episodesCount && episodesCount > 0) {
    stateLine = 'Watched';
    primaryActionLabel = 'Play again';
    primaryEpisode = sortedEpisodes[0].video;
  } else {
    primaryEpisode = sortedEpisodes[0]?.video;
    stateLine = '';
    primaryActionLabel = sortedEpisodes[0] ? `Play ${sortedEpisodes[0].episodeCode}` : 'Play';
  }

  let status: MediaStatus = 'new';
  let progress = 0;
  if (watchedCount === episodesCount && episodesCount > 0) {
    status = 'watched';
    progress = 1;
  } else if (inProgressCount > 0 || watchedCount > 0) {
    status = 'in-progress';
    progress = episodesCount > 0 ? watchedCount / episodesCount : 0;
  }

  const seriesId = `series-${hashString(seriesTitle)}`;
  const customOverride = customRenames[seriesId];
  const displayTitle = customOverride || seriesTitle;
  const year = sortedEpisodes.find(e => e.year)?.year;

  const posterPath = sortedEpisodes.find(e => e.posterPath)?.posterPath;
  const { hue } = getTileColors(displayTitle);

  const lastPlayed = sortedEpisodes
    .map(e => e.lastPlayed)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  const dateAdded = sortedEpisodes
    .map(e => e.dateAdded)
    .filter(Boolean)
    .sort()[0];

  return {
    id: seriesId,
    kind: 'series',
    seriesTitle,
    displayTitle,
    rawName: seriesTitle,
    year,
    seasonsCount,
    episodesCount,
    watchedCount,
    inProgressCount,
    status,
    progress,
    metaLabel,
    stateLine,
    resumeLabel: stateLine,
    primaryActionLabel,
    primaryEpisode,
    tileHue: hue,
    tileGlyph: getFirstAlphanumeric(displayTitle),
    posterPath,
    episodes: sortedEpisodes,
    seasons: uniqueSeasons,
    video: primaryEpisode || sortedEpisodes[0].video,
    dateAdded,
    lastPlayed
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Filtering & Sorting Functions
   ═══════════════════════════════════════════════════════════════════ */
export type SortOption = 'recently-added' | 'recently-played' | 'title' | 'year' | 'length';
export type FilterOption = 'all' | 'in-progress' | 'unwatched' | 'watched';

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function stripLeadingArticles(title: string): string {
  return title.replace(/^(the|a|an)\s+/i, '').trim();
}

export function sortMediaItems<T extends { displayTitle: string; year?: number; durationSec?: number; dateAdded?: string; lastPlayed?: string; status: MediaStatus }>(
  items: T[],
  sortBy: SortOption
): T[] {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case 'recently-added': {
        const timeA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const timeB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        return timeB - timeA;
      }
      case 'recently-played': {
        const timeA = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
        const timeB = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
        if (timeA === 0 && timeB === 0) return a.displayTitle.localeCompare(b.displayTitle);
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;
        return timeB - timeA;
      }
      case 'title': {
        const titleA = stripLeadingArticles(a.displayTitle);
        const titleB = stripLeadingArticles(b.displayTitle);
        return titleA.localeCompare(titleB, undefined, { sensitivity: 'base', numeric: true });
      }
      case 'year': {
        const yearA = a.year || 0;
        const yearB = b.year || 0;
        if (yearA === 0 && yearB === 0) return a.displayTitle.localeCompare(b.displayTitle);
        if (yearA === 0) return 1;
        if (yearB === 0) return -1;
        return yearB - yearA;
      }
      case 'length': {
        const lenA = a.durationSec || 0;
        const lenB = b.durationSec || 0;
        return lenB - lenA;
      }
      default:
        return 0;
    }
  });
}

export function filterMediaItems<T extends { status: MediaStatus; displayTitle: string; rawName?: string; year?: number }>(
  items: T[],
  filterBy: FilterOption,
  searchQuery: string
): T[] {
  let result = items;

  if (filterBy === 'in-progress') {
    result = result.filter(item => item.status === 'in-progress');
  } else if (filterBy === 'unwatched') {
    result = result.filter(item => item.status === 'new');
  } else if (filterBy === 'watched') {
    result = result.filter(item => item.status === 'watched');
  }

  if (searchQuery.trim()) {
    const q = normalizeSearchText(searchQuery);
    result = result.filter(item => {
      const matchTitle = normalizeSearchText(item.displayTitle).includes(q);
      const matchRaw = item.rawName ? normalizeSearchText(item.rawName).includes(q) : false;
      const matchYear = item.year ? String(item.year).includes(q) : false;
      return matchTitle || matchRaw || matchYear;
    });
  }

  return result;
}
