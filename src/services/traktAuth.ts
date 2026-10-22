/**
 * Trakt.tv PKCE & Device Authentication & API Service
 * 
 * Implements Proof Key for Code Exchange (PKCE) OAuth 2.0 flow per Trakt developer guidelines.
 * No client_secret required on frontend clients.
 * Also implements Trakt Device Code Flow (trakt.tv/activate) for seamless sign-in.
 */

import { classifyVideoTitle } from '../utils/libraryClassifier';

export const TRAKT_CLIENT_ID = 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88';
export const TRAKT_API_VERSION = '2';
export const TRAKT_AUTH_URL = 'https://auth.trakt.tv/oauth/authorize';
export const TRAKT_TOKEN_URL = 'https://api.trakt.tv/oauth/token';
export const TRAKT_API_BASE = 'https://api.trakt.tv';
export const TRAKT_DEFAULT_REDIRECT_URI = 'https://player.streamiteasy.xyz';
export const TRAKT_USER_AGENT = 'Valor/1.0.0';

const VERIFIER_STORAGE_KEY = 'valor_trakt_code_verifier';
const REDIRECT_STORAGE_KEY = 'valor_trakt_redirect_uri';
const ACTION_STORAGE_KEY = 'valor_trakt_auth_action';

export interface TraktUserProfile {
  username: string;
  name?: string;
  vip?: boolean;
  avatarUrl?: string;
  slug?: string;
  joinedAt?: string;
  raw?: Record<string, unknown>;
}

export interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface TraktDeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/**
 * Pure JS SHA-256 fallback for environments without window.crypto.subtle
 */
function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Fallback(str: string): Uint8Array {
  const asciiBitLength = str.length * 8;
  const numWords = (((asciiBitLength + 64) >> 9) << 4) + 16;
  const words = new Array(numWords).fill(0);
  
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    words[i >> 2] |= (code & 0xff) << (24 - (i % 4) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[numWords - 1] = asciiBitLength;

  let hash: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  
  const k: number[] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = [...hash];
    
    for (let j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const temp1 = (hash[7] + s1 + ch + k[j] + w[j]) | 0;
      const temp2 = (s0 + maj) | 0;

      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }

    for (let j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  const result: number[] = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      result.push((hash[i] >> (j * 8)) & 0xff);
    }
  }
  return new Uint8Array(result);
}

/**
 * Base64URL encode without padding
 */
function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generates an RFC 7636 compliant high-entropy code verifier.
 * Minimum 43 characters, maximum 128 characters from unreserved characters [A-Za-z0-9-._~].
 */
export function generateCodeVerifier(length = 64): string {
  const validLength = Math.max(43, Math.min(length, 128));
  const unreserved = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (typeof globalThis !== 'undefined' ? (globalThis as any).crypto : null);
  if (cryptoObj && cryptoObj.getRandomValues) {
    const array = new Uint8Array(validLength);
    cryptoObj.getRandomValues(array);
    return Array.from(array)
      .map(x => unreserved[x % unreserved.length])
      .join('');
  }

  // Pure JS fallback
  let verifier = '';
  for (let i = 0; i < validLength; i++) {
    const idx = Math.floor(Math.random() * unreserved.length);
    verifier += unreserved[idx];
  }
  return verifier;
}

/**
 * Derives the code challenge from the verifier using SHA-256 and base64url encoding without padding.
 * Trakt only supports the S256 method.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : (typeof globalThis !== 'undefined' ? (globalThis as any).crypto : null);
  if (cryptoObj && cryptoObj.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await cryptoObj.subtle.digest('SHA-256', data);
    return bufferToBase64Url(digest);
  }

  // Fallback for non-secure contexts
  const digestBytes = sha256Fallback(verifier);
  return bufferToBase64Url(digestBytes);
}

/**
 * Cleans and normalizes Trakt redirect URI.
 * Trakt requires an exact case-sensitive match with NO trailing slash.
 */
export function sanitizeTraktRedirectUri(uri?: string): string {
  if (!uri || !uri.trim()) return TRAKT_DEFAULT_REDIRECT_URI;
  return uri.trim().replace(/\/+$/, '');
}

/**
 * Initiates the PKCE OAuth 2.0 authorization redirect.
 * Defaults redirectUri to https://player.streamiteasy.xyz (configured on Trakt.tv, stripped of trailing slashes)
 */
export async function initiateTraktPkceAuth(options?: {
  redirectUri?: string;
  isLoginAction?: boolean;
}): Promise<void> {
  if (typeof window === 'undefined') return;

  const verifier = generateCodeVerifier(64);
  const challenge = await generateCodeChallenge(verifier);

  const redirectUri = sanitizeTraktRedirectUri(options?.redirectUri);

  // Store PKCE state in both sessionStorage and localStorage for resilience across redirects
  try {
    sessionStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
    sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri);
    sessionStorage.setItem(ACTION_STORAGE_KEY, options?.isLoginAction ? 'login' : 'connect');

    localStorage.setItem(VERIFIER_STORAGE_KEY, verifier);
    localStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri);
    localStorage.setItem(ACTION_STORAGE_KEY, options?.isLoginAction ? 'login' : 'connect');
  } catch (e) {
    console.warn('[Trakt PKCE] Failed to write state to storage', e);
  }

  const authUrl = `${TRAKT_AUTH_URL}?response_type=code&client_id=${TRAKT_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&code_challenge=${challenge}&code_challenge_method=S256&scope=public`;

  console.log('[Trakt PKCE] Redirecting to Trakt authorization:', {
    redirectUri,
    challenge,
    action: options?.isLoginAction ? 'login' : 'connect'
  });

  window.location.href = authUrl;
}

/**
 * Retrieves stored PKCE auth action ('login' | 'connect')
 */
export function getTraktAuthAction(): 'login' | 'connect' {
  if (typeof window === 'undefined') return 'connect';
  const action = sessionStorage.getItem(ACTION_STORAGE_KEY) || localStorage.getItem(ACTION_STORAGE_KEY);
  return action === 'login' ? 'login' : 'connect';
}

/**
 * Clears stored PKCE verifiers & tokens
 */
export function clearTraktAuthState(): void {
  try {
    sessionStorage.removeItem(VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
    sessionStorage.removeItem(ACTION_STORAGE_KEY);
    localStorage.removeItem(VERIFIER_STORAGE_KEY);
    localStorage.removeItem(REDIRECT_STORAGE_KEY);
    localStorage.removeItem(ACTION_STORAGE_KEY);
  } catch {}
}

/**
 * Exchanges authorization code for access and refresh tokens using PKCE verifier.
 */
export async function exchangeTraktCodeForToken(
  code: string,
  backendOrigin = ''
): Promise<TraktTokenResponse> {
  const verifier =
    sessionStorage.getItem(VERIFIER_STORAGE_KEY) || localStorage.getItem(VERIFIER_STORAGE_KEY) || '';
  const rawRedirect =
    sessionStorage.getItem(REDIRECT_STORAGE_KEY) ||
    localStorage.getItem(REDIRECT_STORAGE_KEY) ||
    TRAKT_DEFAULT_REDIRECT_URI;
  const redirectUri = sanitizeTraktRedirectUri(rawRedirect);

  // Clear verifier after reading
  clearTraktAuthState();

  console.log('[Trakt PKCE] Exchanging auth code for access token with verifier length:', verifier.length);

  // 1. Try Backend exchange endpoint first
  if (backendOrigin) {
    try {
      const res = await fetch(`${backendOrigin}/api/trakt/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          console.log('[Trakt PKCE] Token exchanged successfully via backend!');
          return data;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn('[Trakt PKCE] Backend exchange returned non-OK:', res.status, errJson);
      }
    } catch (backendErr) {
      console.warn('[Trakt PKCE] Backend exchange network failed, attempting direct fetch fallback:', backendErr);
    }
  }

  // 2. Direct client PKCE fetch to Trakt
  const payload: Record<string, unknown> = {
    code,
    client_id: TRAKT_CLIENT_ID,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  };

  if (verifier) {
    payload.code_verifier = verifier;
  }

  const directHeaders: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (typeof window === 'undefined') {
    directHeaders['User-Agent'] = TRAKT_USER_AGENT;
  }

  const traktRes = await fetch(TRAKT_TOKEN_URL, {
    method: 'POST',
    headers: directHeaders,
    body: JSON.stringify(payload)
  });

  const traktData = await traktRes.json().catch(() => ({}));

  if (traktRes.ok && traktData.access_token) {
    console.log('[Trakt PKCE] Token exchanged directly with Trakt successfully!');
    return traktData as TraktTokenResponse;
  }

  const errMsg = traktData.error_description || traktData.error || `HTTP ${traktRes.status}`;
  throw new Error(`Trakt token exchange failed: ${errMsg}`);
}

/**
 * Trakt Device Code Flow:
 * Requests an 8-character user code and verification URL (https://auth.trakt.tv/activate).
 */
export async function generateTraktDeviceCode(backendOrigin = ''): Promise<TraktDeviceCodeResponse> {
  // 1. Try backend proxy
  if (backendOrigin) {
    try {
      const res = await fetch(`${backendOrigin}/api/trakt/device/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[Trakt Device] Backend proxy failed, falling back to direct:', err);
    }
  }

  // 2. Direct API call
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': TRAKT_API_VERSION,
    'trakt-api-key': TRAKT_CLIENT_ID
  };
  if (typeof window === 'undefined') {
    headers['User-Agent'] = TRAKT_USER_AGENT;
  }

  const res = await fetch(`${TRAKT_API_BASE}/oauth/device/code`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ client_id: TRAKT_CLIENT_ID })
  });

  if (res.ok) {
    return await res.json();
  }
  const errData = await res.json().catch(() => ({}));
  throw new Error(errData.error_description || errData.error || `HTTP ${res.status}`);
}

/**
 * Trakt Device Code Flow Polling:
 * Polls /oauth/device/token to check if the user has completed authorization at trakt.tv/activate.
 */
export async function pollTraktDeviceToken(
  deviceCode: string,
  backendOrigin = ''
): Promise<{ success: boolean; pending: boolean; token?: TraktTokenResponse; error?: string }> {
  // 1. Try backend proxy
  if (backendOrigin) {
    try {
      const res = await fetch(`${backendOrigin}/api/trakt/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: deviceCode })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200 && data.access_token) {
        return { success: true, pending: false, token: data };
      }
      if (res.status === 400) {
        return { success: false, pending: true };
      }
      return { success: false, pending: false, error: data.error_description || data.error || `HTTP ${res.status}` };
    } catch {}
  }

  // 2. Direct API call
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': TRAKT_API_VERSION,
    'trakt-api-key': TRAKT_CLIENT_ID
  };
  if (typeof window === 'undefined') {
    headers['User-Agent'] = TRAKT_USER_AGENT;
  }

  const res = await fetch(`${TRAKT_API_BASE}/oauth/device/token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code: deviceCode,
      client_id: TRAKT_CLIENT_ID
    })
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 200 && data.access_token) {
    return { success: true, pending: false, token: data };
  }
  if (res.status === 400) {
    return { success: false, pending: true };
  }
  return { success: false, pending: false, error: data.error_description || data.error || `HTTP ${res.status}` };
}

/**
 * Fetches the currently authenticated user's Trakt profile.
 */
export async function fetchTraktUserProfile(
  accessToken: string,
  backendOrigin = ''
): Promise<TraktUserProfile | null> {
  if (!accessToken) return null;

  // 1. Try direct fetch
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'trakt-api-key': TRAKT_CLIENT_ID,
      'trakt-api-version': TRAKT_API_VERSION
    };
    if (typeof window === 'undefined') {
      headers['User-Agent'] = TRAKT_USER_AGENT;
    }
    const res = await fetch(`${TRAKT_API_BASE}/users/me?extended=full`, {
      headers
    });

    if (res.ok) {
      const data = await res.json();
      return {
        username: data.username,
        name: data.name || data.username,
        vip: Boolean(data.vip || data.vip_ep),
        avatarUrl: data.images?.avatar?.full || '',
        slug: data.ids?.slug || data.username,
        joinedAt: data.joined_at,
        raw: data
      };
    }
  } catch (err) {
    console.warn('[Trakt Profile] Direct fetch failed, trying backend proxy:', err);
  }

  // 2. Backend proxy fallback
  if (backendOrigin) {
    try {
      const res = await fetch(`${backendOrigin}/api/trakt/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken })
      });

      if (res.ok) {
        const data = await res.json();
        return {
          username: data.username,
          name: data.name || data.username,
          vip: Boolean(data.vip || data.vip_ep),
          avatarUrl: data.images?.avatar?.full || '',
          slug: data.ids?.slug || data.username,
          joinedAt: data.joined_at,
          raw: data
        };
      }
    } catch (e) {
      console.error('[Trakt Profile] Backend proxy also failed:', e);
    }
  }

  return null;
}

/**
 * Standard Trakt API headers for authenticated or unauthenticated calls
 */
export function getTraktHeaders(accessToken?: string, clientId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'trakt-api-version': TRAKT_API_VERSION,
    'trakt-api-key': clientId?.trim() || TRAKT_CLIENT_ID
  };

  if (typeof window === 'undefined') {
    headers['User-Agent'] = TRAKT_USER_AGENT;
  }

  if (accessToken && accessToken.trim().length > 0) {
    headers['Authorization'] = `Bearer ${accessToken.trim()}`;
  }

  return headers;
}

/**
 * Tests Trakt connection and token validity.
 */
export async function testTraktApi(
  accessToken?: string,
  backendOrigin = ''
): Promise<{ ok: boolean; status: number; message: string; user?: TraktUserProfile | null }> {
  const startTime = Date.now();

  if (accessToken) {
    try {
      const user = await fetchTraktUserProfile(accessToken, backendOrigin);
      const latency = Date.now() - startTime;
      if (user && user.username) {
        return {
          ok: true,
          status: 200,
          message: `Authenticated as @${user.username} (${latency}ms)`,
          user
        };
      }
    } catch {}

    return {
      ok: false,
      status: 401,
      message: 'Access Token expired or invalid'
    };
  }

  // Test public API key
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'trakt-api-key': TRAKT_CLIENT_ID,
      'trakt-api-version': TRAKT_API_VERSION
    };
    if (typeof window === 'undefined') {
      headers['User-Agent'] = TRAKT_USER_AGENT;
    }
    const res = await fetch(`${TRAKT_API_BASE}/movies/popular?limit=1`, {
      headers
    });
    const latency = Date.now() - startTime;
    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        message: `Trakt API Key Valid (${latency}ms)`
      };
    }
    return {
      ok: false,
      status: res.status,
      message: `Trakt returned HTTP ${res.status}`
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error reaching Trakt.tv';
    return {
      ok: false,
      status: 0,
      message
    };
  }
}

export interface TraktMediaIds {
  trakt?: number;
  slug?: string;
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
  [key: string]: any;
}

export interface TraktResolvedMetadata {
  isTV: boolean;
  showTitle?: string;
  showIds?: TraktMediaIds;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  episodeIds?: TraktMediaIds;
  movieTitle?: string;
  movieIds?: TraktMediaIds;
  tmdbId?: number;
}

/**
 * Checks if user is authenticated into Trakt.tv via stored token or provided token.
 */
export function isTraktLoggedIn(token?: string): boolean {
  if (token && typeof token === 'string' && token.trim().length > 0) {
    return true;
  }
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem('valor_settings');
    if (!saved) return false;
    const parsed = JSON.parse(saved);
    return Boolean(parsed.traktAccessToken && typeof parsed.traktAccessToken === 'string' && parsed.traktAccessToken.trim().length > 0);
  } catch {
    return false;
  }
}

/**
 * Retrieves the stored Trakt access token if user is logged in.
 */
export function getTraktToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('valor_settings');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return (parsed.traktAccessToken && typeof parsed.traktAccessToken === 'string' && parsed.traktAccessToken.trim().length > 0)
      ? parsed.traktAccessToken.trim()
      : null;
  } catch {
    return null;
  }
}

export interface TraktSearchResult {
  title: string;
  ids: TraktMediaIds;
  overview?: string;
  year?: number;
  rating?: number;
  isTV?: boolean;
}

/**
 * Searches Trakt for a TV show by title or TMDB ID
 */
export async function searchTraktShow(
  query: string,
  tmdbId?: number | null,
  token?: string
): Promise<TraktSearchResult | null> {
  const headers = getTraktHeaders(token);

  if (tmdbId) {
    try {
      const res = await fetch(`${TRAKT_API_BASE}/search/tmdb/${tmdbId}?type=show&extended=full`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].show) {
          return {
            title: data[0].show.title,
            ids: data[0].show.ids,
            overview: data[0].show.overview,
            year: data[0].show.year,
            rating: data[0].show.rating,
            isTV: true
          };
        }
      }
    } catch {
      // Fallback to text query
    }
  }

  if (query && query.trim()) {
    try {
      const clean = query.replace(/[._]/g, ' ').trim();
      const res = await fetch(`${TRAKT_API_BASE}/search/show?query=${encodeURIComponent(clean)}&extended=full`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].show) {
          return {
            title: data[0].show.title,
            ids: data[0].show.ids,
            overview: data[0].show.overview,
            year: data[0].show.year,
            rating: data[0].show.rating,
            isTV: true
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Searches Trakt for a movie by title or TMDB ID
 */
export async function searchTraktMovie(
  query: string,
  tmdbId?: number | null,
  token?: string
): Promise<TraktSearchResult | null> {
  const headers = getTraktHeaders(token);

  if (tmdbId) {
    try {
      const res = await fetch(`${TRAKT_API_BASE}/search/tmdb/${tmdbId}?type=movie&extended=full`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].movie) {
          return {
            title: data[0].movie.title,
            ids: data[0].movie.ids,
            overview: data[0].movie.overview,
            year: data[0].movie.year,
            rating: data[0].movie.rating,
            isTV: false
          };
        }
      }
    } catch {
      // Fallback to text query
    }
  }

  if (query && query.trim()) {
    try {
      const clean = query.replace(/[._]/g, ' ').trim();
      const res = await fetch(`${TRAKT_API_BASE}/search/movie?query=${encodeURIComponent(clean)}&extended=full`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].movie) {
          return {
            title: data[0].movie.title,
            ids: data[0].movie.ids,
            overview: data[0].movie.overview,
            year: data[0].movie.year,
            rating: data[0].movie.rating,
            isTV: false
          };
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Searches Trakt for either a movie or show by query title with intelligent fallback.
 */
export async function searchTraktMedia(
  query: string,
  isTVHint?: boolean,
  token?: string
): Promise<TraktSearchResult | null> {
  if (!query || !query.trim()) return null;
  const cleanQuery = query.replace(/[._]/g, ' ').trim();

  if (isTVHint) {
    const show = await searchTraktShow(cleanQuery, null, token);
    if (show) return show;
    const movie = await searchTraktMovie(cleanQuery, null, token);
    if (movie) return movie;
  } else {
    const movie = await searchTraktMovie(cleanQuery, null, token);
    if (movie) return movie;
    const show = await searchTraktShow(cleanQuery, null, token);
    if (show) return show;
  }

  return null;
}

/**
 * Fetches episode details and IDs from Trakt
 */
export async function fetchTraktEpisode(
  showIdentifier: string | number,
  season: number,
  episode: number,
  token?: string
): Promise<{ title?: string; ids: TraktMediaIds; overview?: string; rating?: number } | null> {
  const headers = getTraktHeaders(token);
  try {
    const res = await fetch(
      `${TRAKT_API_BASE}/shows/${encodeURIComponent(String(showIdentifier))}/seasons/${season}/episodes/${episode}?extended=full`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.ids) {
        return {
          title: data.title,
          ids: data.ids,
          overview: data.overview,
          rating: data.rating
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Resolves media metadata using library title classifier and Trakt endpoints
 */
export async function resolveTraktMetadata(
  video: {
    title: string;
    tmdbId?: number | null;
  },
  token?: string
): Promise<TraktResolvedMetadata> {
  const seriesInfo = classifyVideoTitle(video.title);
  const isTV = seriesInfo.type === 'series';

  if (isTV) {
    const query = seriesInfo.seriesTitle || video.title;
    const showMatch = await searchTraktShow(query, video.tmdbId, token);
    const showIds = showMatch?.ids || (video.tmdbId ? { tmdb: video.tmdbId } : undefined);
    const showTitle = showMatch?.title || seriesInfo.seriesTitle || video.title;
    const season = seriesInfo.season || 1;
    const episode = seriesInfo.episode || 1;

    let episodeIds: TraktMediaIds | undefined;
    let episodeTitle: string | undefined;

    const showIdentifier = showIds?.trakt || showIds?.slug || video.tmdbId || query;
    if (showIdentifier) {
      const epMatch = await fetchTraktEpisode(showIdentifier, season, episode, token);
      if (epMatch) {
        episodeIds = epMatch.ids;
        episodeTitle = epMatch.title;
      }
    }

    return {
      isTV: true,
      showTitle,
      showIds,
      season,
      episode,
      episodeTitle,
      episodeIds,
      tmdbId: showIds?.tmdb || video.tmdbId || undefined
    };
  }

  const query = seriesInfo.displayTitle || video.title;
  const movieMatch = await searchTraktMovie(query, video.tmdbId, token);
  const movieIds = movieMatch?.ids || (video.tmdbId ? { tmdb: video.tmdbId } : undefined);
  const movieTitle = movieMatch?.title || seriesInfo.displayTitle || video.title;

  return {
    isTV: false,
    movieTitle,
    movieIds,
    tmdbId: movieIds?.tmdb || video.tmdbId || undefined
  };
}

/**
 * Synchronizes watched history for a video (movie or episode) to Trakt
 */
export async function syncTraktHistory(
  video: { id?: string; title: string; tmdbId?: number | null },
  token: string
): Promise<{ ok: boolean; status: number; message: string; tmdbId?: number; data?: any }> {
  if (!token) {
    return { ok: false, status: 401, message: 'Please connect Trakt.tv first' };
  }

  const metadata = await resolveTraktMetadata(video);
  const nowIso = new Date().toISOString();
  const body: any = {};

  if (metadata.isTV) {
    if (metadata.episodeIds) {
      body.episodes = [
        {
          watched_at: nowIso,
          ids: metadata.episodeIds
        }
      ];
    } else {
      body.shows = [
        {
          title: metadata.showTitle,
          ids: metadata.showIds,
          seasons: [
            {
              number: metadata.season || 1,
              episodes: [
                {
                  number: metadata.episode || 1,
                  watched_at: nowIso
                }
              ]
            }
          ]
        }
      ];
    }
  } else {
    body.movies = [
      {
        title: metadata.movieTitle,
        watched_at: nowIso,
        ids: metadata.movieIds
      }
    ];
  }

  try {
    const res = await fetch(`${TRAKT_API_BASE}/sync/history`, {
      method: 'POST',
      headers: getTraktHeaders(token),
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const count = data.added?.movies || data.added?.episodes || 1;
      const label = metadata.isTV
        ? `${metadata.showTitle} S${metadata.season}E${metadata.episode}`
        : (metadata.movieTitle || video.title);
      return {
        ok: true,
        status: res.status,
        message: `Trakt Sync: Added "${label}" (${count} item) to history`,
        tmdbId: metadata.tmdbId,
        data
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      message: `Trakt history sync failed: HTTP ${res.status} ${errText.substring(0, 60)}`
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return {
      ok: false,
      status: 0,
      message: `Trakt history sync network error: ${msg}`
    };
  }
}

/**
 * Synchronizes a user rating (1-5 or 1-10) for a video (movie or episode) to Trakt
 */
export async function syncTraktRating(
  video: { id?: string; title: string; tmdbId?: number | null },
  ratingVal: number,
  token: string
): Promise<{ ok: boolean; status: number; message: string; data?: any }> {
  if (!token) {
    return { ok: false, status: 401, message: 'Please connect Trakt.tv first' };
  }

  if (!ratingVal || ratingVal <= 0) {
    return { ok: false, status: 400, message: 'Invalid rating value' };
  }

  // Trakt uses 1 to 10 scale
  const rating10 = ratingVal <= 5
    ? Math.min(10, Math.max(1, Math.round(ratingVal * 2)))
    : Math.min(10, Math.max(1, Math.round(ratingVal)));

  const metadata = await resolveTraktMetadata(video);
  const nowIso = new Date().toISOString();
  const body: any = {};

  if (metadata.isTV) {
    if (metadata.episodeIds) {
      // Trakt /sync/ratings requires top-level 'episodes' array with exact episode IDs
      body.episodes = [
        {
          rating: rating10,
          rated_at: nowIso,
          ids: metadata.episodeIds
        }
      ];
    } else {
      // Fallback: Rate the show if episode ID cannot be resolved
      body.shows = [
        {
          title: metadata.showTitle,
          rating: rating10,
          rated_at: nowIso,
          ids: metadata.showIds
        }
      ];
    }
  } else {
    body.movies = [
      {
        title: metadata.movieTitle,
        rating: rating10,
        rated_at: nowIso,
        ids: metadata.movieIds
      }
    ];
  }

  try {
    const res = await fetch(`${TRAKT_API_BASE}/sync/ratings`, {
      method: 'POST',
      headers: getTraktHeaders(token),
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const label = metadata.isTV
        ? `${metadata.showTitle} S${metadata.season}E${metadata.episode}`
        : (metadata.movieTitle || video.title);
      return {
        ok: true,
        status: res.status,
        message: `Trakt Rating: Rated "${label}" ${rating10}/10`,
        data
      };
    }

    const errText = await res.text().catch(() => '');
    return {
      ok: false,
      status: res.status,
      message: `Trakt rating sync failed: HTTP ${res.status} ${errText.substring(0, 60)}`
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return {
      ok: false,
      status: 0,
      message: `Trakt rating sync network error: ${msg}`
    };
  }
}
