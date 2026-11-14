export interface EmbedProvider {
  id: string;
  name: string;
  enabled: boolean;
  moviePattern: string;
  tvPattern: string;
  animePattern: string;
  defaultParams: string;
  allowFullscreen?: boolean;
}

export function getProviderDisplayName(provider: { id: string; name: string }, index = 0): string {
  if (provider.id === 'videasy') return 'Source 1';
  if (provider.id === 'vidking') return 'Source 2';
  if (provider.name && provider.name.includes('Source 1')) return 'Source 1';
  if (provider.name && provider.name.includes('Source 2')) return 'Source 2';
  return `Source ${index + 1}`;
}

export const DEFAULT_EMBED_PROVIDERS: EmbedProvider[] = [
  {
    id: 'videasy',
    name: 'Source 1',
    enabled: true,
    moviePattern: 'https://videasy.xyz/embed/movie/{id}{query}',
    tvPattern: 'https://videasy.xyz/embed/tv/{id}/{season}/{episode}{query}',
    animePattern: 'https://videasy.xyz/embed/anime/{id}/{episode}{query}',
    defaultParams: 'color=8B5CF6&nextEpisode=true&episodeSelector=true',
    allowFullscreen: true
  },
  {
    id: 'vidking',
    name: 'Source 2',
    enabled: true,
    moviePattern: 'https://www.vidking.net/embed/movie/{id}{query}',
    tvPattern: 'https://www.vidking.net/embed/tv/{id}/{season}/{episode}{query}',
    animePattern: 'https://www.vidking.net/embed/movie/{id}{query}',
    defaultParams: 'color=e50914&autoPlay=true&nextEpisode=true&episodeSelector=true',
    allowFullscreen: true
  }
];

const STORAGE_KEY = 'valor_embed_providers';

export function getEmbedProviders(): EmbedProvider[] {
  if (typeof window === 'undefined') return DEFAULT_EMBED_PROVIDERS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: any, idx: number) => ({ ...p, name: getProviderDisplayName(p, idx) }));
      }
    }
  } catch (e) {
    console.warn('[embedProviders] Failed to load local embed providers:', e);
  }
  return DEFAULT_EMBED_PROVIDERS.map((p, idx) => ({ ...p, name: getProviderDisplayName(p, idx) }));
}

export async function fetchEmbedProvidersFromServer(): Promise<EmbedProvider[]> {
  try {
    const res = await fetch('/api/system/embed-providers');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return data;
      }
    }
  } catch (err) {
    // offline or backend endpoint not yet hit
  }
  return getEmbedProviders();
}

export async function saveEmbedProviders(providers: EmbedProvider[], token?: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const adminToken = token || (typeof window !== 'undefined' ? localStorage.getItem('valor_admin_token') : null);
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
    await fetch('/api/admin/embed-providers', {
      method: 'POST',
      headers,
      body: JSON.stringify({ providers })
    });
  } catch (err) {
    console.warn('[embedProviders] Failed to sync providers to server:', err);
  }
}

/**
 * Builds the embed iframe URL using the provider template and video parameters.
 */
export function buildEmbedUrl(
  serverId: string,
  video: any,
  currentTime = 0,
  currentSeason = 1,
  currentEpisode = 1
): string {
  const providers = getEmbedProviders();
  const provider = providers.find(p => p.id === serverId && p.enabled) || providers.find(p => p.enabled) || DEFAULT_EMBED_PROVIDERS[0];

  const id = video.type === 'online_anime' ? (video.anilistId || video.id) : (video.tmdbId || video.id);
  const startProgress = currentTime && Math.floor(currentTime) > 10 ? `progress=${Math.floor(currentTime)}` : '';

  // Merge defaultParams with progress
  const queryParts: string[] = [];
  if (startProgress) queryParts.push(startProgress);
  if (provider.defaultParams) {
    // Strip leading ? or &
    const cleanedParams = provider.defaultParams.replace(/^[?&]+/, '');
    if (cleanedParams) queryParts.push(cleanedParams);
  }
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  let pattern = provider.moviePattern;
  if (video.type === 'online_tv') {
    pattern = provider.tvPattern;
  } else if (video.type === 'online_anime') {
    pattern = provider.animePattern || provider.moviePattern;
  }

  const seasonStr = String(currentSeason || video.season || 1);
  const episodeStr = String(currentEpisode || video.episode || 1);

  return pattern
    .replace('{id}', encodeURIComponent(String(id)))
    .replace('{season}', encodeURIComponent(seasonStr))
    .replace('{episode}', encodeURIComponent(episodeStr))
    .replace('{query}', queryString);
}

/**
 * Parses a raw pasted <iframe> snippet or URL to auto-extract the base structure.
 * E.g.: <iframe src="https://videasy.xyz/embed/movie/533535" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>
 */
export function parseIframeSnippet(snippet: string): {
  url: string;
  extractedMoviePattern?: string;
  extractedTvPattern?: string;
} | null {
  if (!snippet) return null;
  const trimmed = snippet.trim();
  let url = trimmed;

  // Extract src from <iframe ... src="..." ...>
  const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1]) {
    url = srcMatch[1];
  }

  try {
    const parsed = new URL(url);
    const origin = parsed.origin;
    const pathname = parsed.pathname;

    // Check if pathname contains /movie/XXXX or /embed/movie/XXXX
    let moviePattern = `${origin}${pathname}`;
    let tvPattern = `${origin}${pathname}`;

    if (/\/movie\/\d+/i.test(pathname)) {
      moviePattern = origin + pathname.replace(/\/movie\/\d+/i, '/movie/{id}') + '{query}';
      tvPattern = origin + pathname.replace(/\/movie\/\d+/i, '/tv/{id}/{season}/{episode}') + '{query}';
    } else if (/\/tv\/\d+/i.test(pathname)) {
      tvPattern = origin + pathname.replace(/\/tv\/\d+.*$/i, '/tv/{id}/{season}/{episode}') + '{query}';
      moviePattern = origin + pathname.replace(/\/tv\/\d+.*$/i, '/movie/{id}') + '{query}';
    } else {
      moviePattern = `${origin}/embed/movie/{id}{query}`;
      tvPattern = `${origin}/embed/tv/{id}/{season}/{episode}{query}`;
    }

    return {
      url,
      extractedMoviePattern: moviePattern,
      extractedTvPattern: tvPattern
    };
  } catch (err) {
    return null;
  }
}
