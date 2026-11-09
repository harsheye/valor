/**
 * Utility to check and cache whether a remote media URL is CORS-allowed by the browser,
 * and extract the media filename/title from HTTP Content-Disposition headers.
 */

// Cache of CORS check results by URL to avoid redundant network probes
const corsStatusCache = new Map<string, boolean>();
const pendingChecks = new Map<string, Promise<boolean>>();

// Cache of extracted filenames by URL
const mediaFilenameCache = new Map<string, { fileName: string; title: string }>();
const pendingNameResolutions = new Map<string, Promise<{ fileName: string; title: string } | null>>();

/**
 * Parses a standard HTTP Content-Disposition header to extract the filename.
 * Supports:
 * - RFC 6266 / RFC 5987: filename*=UTF-8''encoded_name
 * - Standard: filename="quoted_name" or filename=unquoted_name
 *
 * Example:
 *   attachment; filename="kiDnap.GAME.S01E05.VIU.x264.1080p[MkvDrama.net].mkv"; filename*=UTF-8''kiDnap.GAME.S01E05.VIU.x264.1080p%5BMkvDrama.net%5D.mkv
 *   => "kiDnap.GAME.S01E05.VIU.x264.1080p[MkvDrama.net].mkv"
 */
export function parseContentDisposition(header?: string | null): string | null {
  if (!header || typeof header !== 'string') return null;

  // 1. Highest priority: filename*=charset'lang'encoded_value (RFC 6266 Section 4.3 / RFC 5987)
  const fnStarMatch = header.match(/filename\*\s*=\s*([^;]+)/i);
  if (fnStarMatch) {
    let val = fnStarMatch[1].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    const quoteQuoteIdx = val.indexOf("''");
    let encoded = val;
    if (quoteQuoteIdx !== -1) {
      encoded = val.slice(quoteQuoteIdx + 2);
    }
    try {
      const decoded = decodeURIComponent(encoded.trim());
      if (decoded) {
        const clean = decoded.split(/[\/\\]/).pop();
        if (clean && clean.trim()) {
          return clean.trim();
        }
      }
    } catch {}
  }

  // 2. Fallback: filename="..." or filename=...
  const fnMatch = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (fnMatch) {
    let raw = fnMatch[1] || fnMatch[2] || '';
    raw = raw.trim();
    try {
      if (raw.includes('%')) {
        raw = decodeURIComponent(raw);
      }
    } catch {}
    if (raw) {
      const clean = raw.split(/[\/\\]/).pop();
      if (clean && clean.trim()) {
        return clean.trim();
      }
    }
  }

  return null;
}

/**
 * Derives a clean display title from a media filename (removes extension).
 */
export function cleanTitleFromFileName(fileName?: string | null): string {
  if (!fileName || !fileName.trim()) return '';
  const trimmed = fileName.trim();
  const withoutExt = trimmed.replace(/\.(mp4|mkv|webm|avi|mov|m4v|ts|flv|wmv|mpg|mpeg)$/i, '').trim();
  return withoutExt || trimmed;
}

/**
 * Gets cached media name from previous Content-Disposition inspection.
 */
export function getCachedMediaFileName(url?: string): { fileName: string; title: string } | undefined {
  if (!url) return undefined;
  return mediaFilenameCache.get(url);
}

/**
 * Synchronous check for known or trivial URLs (same-origin, blob, data, or cached).
 * Returns boolean if definitively known, or undefined if network probe is needed.
 */
export function getCachedCorsStatus(url?: string): boolean | undefined {
  if (!url) return false;

  // Blob, data, and relative paths are always local/CORS-safe
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/')) {
    return true;
  }

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (origin) {
      const parsed = new URL(url, origin);
      if (parsed.origin === origin) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return corsStatusCache.get(url);
}

/**
 * Inspects headers from a response to extract Content-Disposition filename
 */
function recordHeadersInfo(url: string, res: Response) {
  try {
    const cd = res.headers.get('content-disposition');
    if (cd) {
      const fileName = parseContentDisposition(cd);
      if (fileName) {
        mediaFilenameCache.set(url, {
          fileName,
          title: cleanTitleFromFileName(fileName)
        });
      }
    }
  } catch {}
}

/**
 * Asynchronously verifies if a remote URL has CORS allowed for media playback.
 * Also extracts and caches Content-Disposition filename if exposed.
 */
export async function checkCorsAllowed(url?: string): Promise<boolean> {
  if (!url) return false;

  const cached = getCachedCorsStatus(url);
  if (cached !== undefined) return cached;

  if (pendingChecks.has(url)) {
    return pendingChecks.get(url)!;
  }

  const checkPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);

      try {
        const headRes = await fetch(url, {
          method: 'HEAD',
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timer);

        recordHeadersInfo(url, headRes);

        if (headRes.ok || headRes.status === 200 || headRes.status === 206) {
          corsStatusCache.set(url, true);
          return true;
        }

        // If the server forbids HEAD (e.g. 405 Method Not Allowed), fall back to GET 1-byte range
        if (headRes.status === 405 || headRes.status === 403) {
          const getController = new AbortController();
          const getTimer = setTimeout(() => getController.abort(), 2500);
          const getRes = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            mode: 'cors',
            signal: getController.signal
          });
          clearTimeout(getTimer);
          recordHeadersInfo(url, getRes);

          if (getRes.ok || getRes.status === 206 || getRes.status === 200) {
            corsStatusCache.set(url, true);
            return true;
          }
        }
      } catch {
        clearTimeout(timer);
        // If HEAD failed, try 1-byte GET
        const getController = new AbortController();
        const getTimer = setTimeout(() => getController.abort(), 2500);
        try {
          const getRes = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0' },
            mode: 'cors',
            signal: getController.signal
          });
          clearTimeout(getTimer);
          recordHeadersInfo(url, getRes);

          if (getRes.ok || getRes.status === 206 || getRes.status === 200) {
            corsStatusCache.set(url, true);
            return true;
          }
        } catch {
          clearTimeout(getTimer);
          corsStatusCache.set(url, false);
          return false;
        }
      }

      corsStatusCache.set(url, false);
      return false;
    } catch {
      corsStatusCache.set(url, false);
      return false;
    } finally {
      pendingChecks.delete(url);
    }
  })();

  pendingChecks.set(url, checkPromise);
  return checkPromise;
}

export function recordCorsStatus(url: string, allowed: boolean): void {
  if (url) {
    corsStatusCache.set(url, allowed);
  }
}

/**
 * Resolves media name by prioritizing Content-Disposition header over the raw URL.
 * 1. Checks cache from previous HEAD/GET probe.
 * 2. If not cached, runs a fast HEAD request.
 * 3. If CORS hides Content-Disposition from browser JavaScript, queries `/api/remote/media-headers`.
 */
export async function resolveRemoteMediaName(url?: string): Promise<{ fileName: string; title: string } | null> {
  if (!url || !url.trim()) return null;
  const cleanUrl = url.trim();

  // 1. In-memory cache hit
  const cached = mediaFilenameCache.get(cleanUrl);
  if (cached) return cached;

  if (pendingNameResolutions.has(cleanUrl)) {
    return pendingNameResolutions.get(cleanUrl)!;
  }

  const resolvePromise = (async () => {
    try {
      // 2. Direct client-side fetch (works if same-origin or CORS exposes Content-Disposition)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(cleanUrl, {
          method: 'HEAD',
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timer);
        const cd = res.headers.get('content-disposition');
        if (cd) {
          const parsed = parseContentDisposition(cd);
          if (parsed) {
            const result = { fileName: parsed, title: cleanTitleFromFileName(parsed) };
            mediaFilenameCache.set(cleanUrl, result);
            return result;
          }
        }
      } catch {}

      // 3. Fallback: Query backend header endpoint /api/remote/media-headers (bypasses browser CORS header-hiding)
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const apiUrl = `/api/remote/media-headers?url=${encodeURIComponent(cleanUrl)}`;
        const res = await fetch(apiUrl, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data && data.fileName) {
            const result = { fileName: data.fileName, title: data.title || cleanTitleFromFileName(data.fileName) };
            mediaFilenameCache.set(cleanUrl, result);
            return result;
          }
        }
      } catch {}

      return null;
    } finally {
      pendingNameResolutions.delete(cleanUrl);
    }
  })();

  pendingNameResolutions.set(cleanUrl, resolvePromise);
  return resolvePromise;
}

export function recordRemoteMediaName(url: string, fileName: string): void {
  if (url && fileName) {
    mediaFilenameCache.set(url, {
      fileName: fileName.trim(),
      title: cleanTitleFromFileName(fileName)
    });
  }
}
