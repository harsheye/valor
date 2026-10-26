export interface ParsedLibraryItem {
  id: string;
  title: string;
  type: 'movie' | 'series' | 'unknown';
  seriesTitle?: string;
  season?: number;
  episode?: number;
  originalTitle: string;
}

const JUNK_PATTERN = /\b(1080p|720p|2160p|4k|uhd|hd|sd|480p|576p|web-?dl|web-?rip|bluray|blu-ray|bdrip|brrip|hdrip|dvdrip|remux|imax|camrip|telesync|hdcam|x264|x265|h264|h265|hevc|avc|av1|10bit|8bit|hdr10\+?|hdr|dv|dolby\s*vision|sdr|dual[.\s-]audio|multi[.\s-]audio|multi[.\s-]sub|esubs?|subs?|subbed|dubbed|proper|repack|rerip|amzn|nf|dsnp|hmax|atvp|bilibili|bollyflix|yts(\.mx)?|psa|rarbg|eztv|tgx|galaxytv|ita|eng|english|hindi|tamil|telugu|korean|japanese|spanish|french|german|mandarin|cantonese|thai|vietnamese|russian|italian|ddp?5[.\s]1|atmos|truehd|dts(-hd)?|aac\d?(\.0)?|ac3|mp3|flac|eac3)\b.*/i;

export function classifyVideoTitle(title: string): {
  type: 'movie' | 'series' | 'unknown';
  seriesTitle?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  displayTitle: string;
  cleanTitle: string;
  year?: number;
} {
  if (!title) {
    return {
      type: 'unknown',
      displayTitle: 'Unknown Media',
      cleanTitle: 'Unknown Media'
    };
  }

  let raw = title;
  // If title is a full URL or path, extract the target file name
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('/') || raw.includes('\\')) {
    try {
      const u = new URL(raw);
      const paramName = u.searchParams.get('title') || u.searchParams.get('name') || u.searchParams.get('file');
      if (paramName) {
        raw = paramName;
      } else {
        const segs = u.pathname.split('/').filter(Boolean);
        if (segs.length > 0) raw = segs[segs.length - 1];
      }
    } catch {
      raw = raw.split(/[/\\]/).filter(Boolean).pop() || raw;
    }
  }

  // Safe URI decoding (replace + with space first, decode %20, %5B, %5D, etc.)
  try {
    raw = decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    raw = raw
      .replace(/%20/g, ' ')
      .replace(/%5B/gi, '[')
      .replace(/%5D/gi, ']')
      .replace(/%28/gi, '(')
      .replace(/%29/gi, ')')
      .replace(/%2E/gi, '.')
      .replace(/%2D/gi, '-')
      .replace(/%5F/gi, '_');
  }

  // Strip query parameters if any remains
  raw = raw.split('?')[0];

  // 1. Clean file extensions (.mkv, .mp4, .avi, etc.)
  let clean = raw.replace(/\.(?:mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|iso|[a-z0-9]{2,4})$/i, '');

  // 2. Strip bracketed site / release group tags like [BollyFlix], [YTS.MX], [1337x], [PSA], [RARBG], {HD}
  clean = clean.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^\}]*\}/g, ' ');

  // 3. Strip website prefixes like www.SiteName.com -
  clean = clean.replace(/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,6}\s*[-_–—:]\s*/i, '');

  // 4. Normalize dots and underscores to spaces for unified token matching
  let s = clean.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

  // 5. Check TV Show Patterns:
  // a) S01E03 or s1e3 or S01 E03
  // b) 1x03 or 01x03
  // c) Season 1 Episode 3
  const sPattern = /\b[sS](\d+)\s*[eE](\d+)\b/i;
  const xPattern = /\b(\d+)x(\d+)\b/i;
  const seasonEpPattern = /\bseason\s*(\d+)\s*episode\s*(\d+)\b/i;
  const epOnlyPattern = /\b(?:episode|ep|ep\.)\s*(\d+)\b/i;

  const sMatch = s.match(sPattern) || s.match(xPattern) || s.match(seasonEpPattern);
  if (sMatch) {
    const sIndex = s.indexOf(sMatch[0]);
    let seriesTitle = s.substring(0, sIndex).replace(/[-–—:]+$/, '').trim();
    let after = s.substring(sIndex + sMatch[0].length).replace(/^[-–—:]+/, '').trim();
    
    // Preserve year if present in series title
    const seriesYearMatch = seriesTitle.match(/\b\((19\d\d|20[0-3]\d)\)/) || seriesTitle.match(/\b(19\d\d|20[0-3]\d)\b/);
    const seriesYear = seriesYearMatch ? parseInt(seriesYearMatch[1] || seriesYearMatch[0], 10) : undefined;

    seriesTitle = seriesTitle
      .replace(/\[.*?\]/g, ' ')
      .replace(/\(\s*(19\d\d|20[0-3]\d)\s*\)/g, ' ')
      .replace(/\b(19\d\d|20[0-3]\d)\b/g, ' ')
      .replace(/\(\s*\)/g, ' ')
      .replace(/\((?!\d{4}\))[^\)]*\)/g, ' ')
      .replace(JUNK_PATTERN, '')
      .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let epTitle = after.replace(/\[.*?\]|\(.*?\)/g, '').trim();
    epTitle = epTitle.replace(JUNK_PATTERN, '').trim();
    epTitle = epTitle.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();

    const season = parseInt(sMatch[1], 10);
    const episode = parseInt(sMatch[2], 10);
    const sStr = String(season).padStart(2, '0');
    const eStr = String(episode).padStart(2, '0');

    const formattedSeriesTitle = seriesYear ? `${seriesTitle} (${seriesYear})` : seriesTitle;

    return {
      type: 'series',
      seriesTitle: formattedSeriesTitle || 'Unknown Series',
      cleanTitle: seriesTitle || 'Unknown Series',
      season,
      episode,
      episodeTitle: epTitle || undefined,
      year: seriesYear,
      displayTitle: epTitle 
        ? `${formattedSeriesTitle} - S${sStr}E${eStr} - ${epTitle}` 
        : `${formattedSeriesTitle} - S${sStr}E${eStr}`
    };
  }

  // d) Ep 12 or Episode 12
  const epMatch = s.match(epOnlyPattern);
  if (epMatch) {
    const epIndex = s.indexOf(epMatch[0]);
    let seriesTitle = s.substring(0, epIndex).replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').replace(/\[.*?\]|\(.*?\)/g, '').replace(JUNK_PATTERN, '').trim();
    const episode = parseInt(epMatch[1], 10);
    return {
      type: 'series',
      seriesTitle: seriesTitle || 'Unknown Series',
      cleanTitle: seriesTitle || 'Unknown Series',
      season: 1,
      episode,
      displayTitle: `${seriesTitle} - Episode ${episode}`
    };
  }

  // 6. Check Movie Year (1920 - 2035)
  // First check parenthesized year e.g. (2026), then bare 4-digit years
  const parenYearMatch = s.match(/\b\((19\d\d|20[0-3]\d)\)/);
  const bareYearMatches = [...s.matchAll(/\b(19\d\d|20[0-3]\d)\b/g)];

  let year: number | undefined;
  let movieTitle = s;

  if (parenYearMatch) {
    const yIndex = s.indexOf(parenYearMatch[0]);
    const beforeYear = s.substring(0, yIndex).replace(/[([{\-–—:]+$/, '').trim();
    if (beforeYear.length >= 2) {
      year = parseInt(parenYearMatch[1], 10);
      movieTitle = beforeYear;
    }
  } else if (bareYearMatches.length > 0) {
    for (let i = bareYearMatches.length - 1; i >= 0; i--) {
      const match = bareYearMatches[i];
      const yIndex = match.index ?? -1;
      if (yIndex >= 2) {
        const beforeYear = s.substring(0, yIndex).replace(/[([{\-–—:]+$/, '').trim();
        if (beforeYear.length >= 2) {
          year = parseInt(match[1], 10);
          movieTitle = beforeYear;
          break;
        }
      }
    }
  }

  // 7. Strip all leftover parenthetical junk (except year) and release tags
  movieTitle = movieTitle.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^\}]*\}/g, ' ');
  movieTitle = movieTitle.replace(/\((?!\d{4}\))[^\)]*\)/g, ' ');
  movieTitle = movieTitle.replace(JUNK_PATTERN, '');
  movieTitle = movieTitle.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').replace(/\s+/g, ' ').trim();

  const finalTitle = movieTitle || s || 'Unknown Title';

  return {
    type: year ? 'movie' : 'unknown',
    cleanTitle: finalTitle,
    displayTitle: year ? `${finalTitle} (${year})` : finalTitle,
    year
  };
}

/**
 * Returns the cleaned, regexed media title with year:
 * - Movies: "Title (Year)" (e.g. "By Any Means (2026)") or "Title" if no year is detected
 * - TV Series: "Series (Year) - S01E02 - Episode Title" or "Series - S01E02"
 */
export function getRegexedTitleWithYear(title: string): string {
  if (!title) return '';
  const classified = classifyVideoTitle(title);
  return classified.displayTitle || classified.cleanTitle || title;
}
