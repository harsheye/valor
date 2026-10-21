import React, { useState } from 'react';
import { Search, Film, Tv, Check, AlertCircle, X, Sparkles, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import type { Bookmark } from '../types/media';
import { classifyVideoTitle } from '../utils/libraryClassifier';

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";

export interface MediaIdentifyModalProps {
  isOpen: boolean;
  videoTitle: string;
  duration: number;
  onClose: () => void;
  onApplyBookmarks: (bookmarks: Bookmark[], mediaInfo: { title: string; tmdbId?: number; imdbId?: string; season?: number; episode?: number; overview?: string; imageUrl?: string; releaseDate?: string; rating?: number }) => void;
  onToast?: (msg: string) => void;
  videoId?: string;
  userId?: string;
}

/**
 * Fetch from TMDB using backend proxy (/api/tmdb-proxy) to eliminate CORS preflight issues on client origins.
 */
async function fetchTmdbApi(endpointPath: string): Promise<any> {
  const cleanEndpoint = endpointPath.startsWith('/') ? endpointPath.slice(1) : endpointPath;
  const proxyEndpoints = [
    `/api/tmdb-proxy?endpoint=${encodeURIComponent(cleanEndpoint)}`,
    `http://127.0.0.1:50001/api/tmdb-proxy?endpoint=${encodeURIComponent(cleanEndpoint)}`
  ];

  for (const url of proxyEndpoints) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
  }

  // Fallback: direct TMDB API request
  const directUrl = `https://api.themoviedb.org/3/${cleanEndpoint}`;
  const directRes = await fetch(directUrl, {
    headers: {
      'Authorization': `Bearer ${TMDB_TOKEN}`,
      'Accept': 'application/json'
    }
  });

  if (!directRes.ok) {
    throw new Error(`TMDB query failed with status ${directRes.status}`);
  }
  return await directRes.json();
}

export const MediaIdentifyModal: React.FC<MediaIdentifyModalProps> = ({
  isOpen,
  videoTitle,
  duration,
  onClose,
  onApplyBookmarks,
  onToast,
  videoId,
  userId
}) => {
  const isHashOrUrl = (str: string) => {
    if (!str) return true;
    const clean = str.trim();
    if (/^[a-zA-Z0-9_\-\+=\/]{18,}$/.test(clean)) return true;
    if (/^(stream|video|master|index|chunk|playlist|file|media|remote|untitled|embedded video)/i.test(clean)) return true;
    return false;
  };

  const initialClassified = classifyVideoTitle(videoTitle || '');
  const [mediaTitle, setMediaTitle] = useState(() => {
    if (isHashOrUrl(videoTitle)) return '';
    return initialClassified.seriesTitle || initialClassified.displayTitle || videoTitle || '';
  });
  const [isTvShow, setIsTvShow] = useState<boolean>(() => initialClassified.type === 'series');
  const [season, setSeason] = useState<number>(() => initialClassified.season || 1);
  const [episode, setEpisode] = useState<number>(() => initialClassified.episode || 1);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSearchAndFetch = async () => {
    if (!mediaTitle.trim()) {
      setErrorMsg('Please enter a media title.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setStatusMsg('Searching IMDB / TMDB...');

    try {
      // 1. Search TMDB for Show or Movie via backend proxy (Zero CORS error)
      const cleanQuery = mediaTitle.trim();
      const endpoint = isTvShow ? 'search/tv' : 'search/movie';
      const searchData = await fetchTmdbApi(`${endpoint}?query=${encodeURIComponent(cleanQuery)}&include_adult=false`);

      if (!searchData.results || searchData.results.length === 0) {
        throw new Error(`No match found on TMDB/IMDB for "${cleanQuery}".`);
      }

      const topResult = searchData.results[0];
      const tmdbId: number = topResult.id;
      const resolvedTitle = topResult.name || topResult.title || cleanQuery;

      setStatusMsg(`Found: "${resolvedTitle}" (TMDB #${tmdbId}). Resolving IMDB ID...`);

      // 2. Fetch external IDs to get IMDB ID (e.g. tt1234567)
      let imdbId: string | undefined = undefined;
      try {
        const extData = await fetchTmdbApi(`${isTvShow ? 'tv' : 'movie'}/${tmdbId}/external_ids`);
        if (extData && extData.imdb_id) {
          imdbId = extData.imdb_id;
        }
      } catch (extErr) {
        console.warn('[MediaIdentifyModal] External IDs lookup error:', extErr);
      }

      setStatusMsg(`Querying TheIntroDB with ${imdbId ? `IMDB: ${imdbId}` : `TMDB: ${tmdbId}`}...`);

      // 3. Fetch Intro & Outro Timestamps from TheIntroDB
      const durationMs = Math.round((duration || 0) * 1000);
      let introDbUrl = `https://api.theintrodb.org/v3/media?tmdb_id=${tmdbId}`;
      if (isTvShow) {
        introDbUrl += `&season=${season}&episode=${episode}`;
      }
      if (durationMs > 0) {
        introDbUrl += `&duration_ms=${durationMs}`;
      }

      const introHeaders: Record<string, string> = { 'accept': 'application/json' };
      try {
        const savedSettings = localStorage.getItem('valor_settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          if (parsed.theIntroDbApiKey) {
            introHeaders['Authorization'] = `Bearer ${parsed.theIntroDbApiKey}`;
          }
        }
      } catch {}

      let introDbRes = await fetch(introDbUrl, { headers: introHeaders }).catch(() => null);

      // Fallback to IMDB query if TMDB query returned 404 and IMDB ID exists
      if ((!introDbRes || !introDbRes.ok) && imdbId) {
        let imdbIntroUrl = `https://api.theintrodb.org/v3/media?imdb_id=${imdbId}`;
        if (isTvShow) {
          imdbIntroUrl += `&season=${season}&episode=${episode}`;
        }
        if (durationMs > 0) {
          imdbIntroUrl += `&duration_ms=${durationMs}`;
        }
        const fallbackRes = await fetch(imdbIntroUrl, { headers: introHeaders }).catch(() => null);
        if (fallbackRes && fallbackRes.ok) {
          introDbRes = fallbackRes;
        }
      }

      const newBookmarks: Bookmark[] = [];
      const msToSec = (ms?: number | null) => (ms ? Math.round(ms / 1000) : 0);
      let introDbData: any = null;

      if (introDbRes && introDbRes.ok) {
        introDbData = await introDbRes.json();

        // Intros
        if (introDbData.intro && Array.isArray(introDbData.intro)) {
          introDbData.intro.forEach((item: any, idx: number) => {
            newBookmarks.push({
              id: `theintrodb-intro-${idx}`,
              time: msToSec(item.start_ms),
              endTime: msToSec(item.end_ms),
              startTime: msToSec(item.start_ms),
              label: 'Intro',
              category: 'Intro',
              isIntro: true,
              isOutro: false,
              skipEnabled: true,
              createdBy: 'theintrodb'
            });
          });
        }

        // Recaps / Previews
        if (introDbData.recap && Array.isArray(introDbData.recap)) {
          introDbData.recap.forEach((item: any, idx: number) => {
            newBookmarks.push({
              id: `theintrodb-recap-${idx}`,
              time: msToSec(item.start_ms),
              endTime: msToSec(item.end_ms),
              startTime: msToSec(item.start_ms),
              label: 'Preview / Recap',
              category: 'Preview',
              isIntro: true,
              isOutro: false,
              skipEnabled: true,
              createdBy: 'theintrodb'
            });
          });
        }

        // Credits / Outros
        if (introDbData.credits && Array.isArray(introDbData.credits)) {
          introDbData.credits.forEach((item: any, idx: number) => {
            newBookmarks.push({
              id: `theintrodb-credits-${idx}`,
              time: msToSec(item.start_ms),
              endTime: msToSec(item.end_ms),
              startTime: msToSec(item.start_ms),
              label: 'Credits / Outro',
              category: 'Outro',
              isIntro: false,
              isOutro: true,
              skipEnabled: true,
              createdBy: 'theintrodb'
            });
          });
        }

        // Auto-cache discovered IntroDB timestamps into server database
        if (newBookmarks.length > 0 && introDbData) {
          try {
            fetch('/api/timestamps/save-introdb', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tmdbId,
                season: isTvShow ? season : null,
                episode: isTvShow ? episode : null,
                videoId: videoId || String(tmdbId),
                mediaName: resolvedTitle,
                introDbData,
                userId: userId || 'theintrodb'
              })
            }).catch(saveErr => console.warn('[IntroDB Cache] Auto-save failed:', saveErr));
          } catch {}
        }
      }

      const count = newBookmarks.length;
      const successToast = count > 0
        ? `Found ${imdbId ? `IMDB ${imdbId}` : `TMDB #${tmdbId}`} — Loaded ${count} intro/skip timestamps!`
        : `Identified as "${resolvedTitle}" (${imdbId || `TMDB #${tmdbId}`}). No introdb entries yet.`;

      onToast?.(successToast);
      const mediaImg = topResult.poster_path ? `https://image.tmdb.org/t/p/w500${topResult.poster_path}` : (topResult.backdrop_path ? `https://image.tmdb.org/t/p/w500${topResult.backdrop_path}` : '');
      onApplyBookmarks(newBookmarks, {
        title: resolvedTitle,
        tmdbId,
        imdbId,
        season: isTvShow ? season : undefined,
        episode: isTvShow ? episode : undefined,
        overview: topResult.overview || '',
        imageUrl: mediaImg,
        releaseDate: topResult.release_date || topResult.first_air_date || '',
        rating: topResult.vote_average
      });

      onClose();
    } catch (err: any) {
      console.warn('[MediaIdentifyModal] Error:', err);
      setErrorMsg(err.message || 'Failed to search IMDB / IntroDB.');
    } finally {
      setIsLoading(false);
      setStatusMsg(null);
    }
  };

  return (
    <div
      className="media-identify-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'var(--overlay-bg, rgba(0, 0, 0, 0.75))',
        backdropFilter: 'var(--glass-blur, blur(16px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="media-identify-modal-container"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--card-bg, #161622)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-xl, 0 20px 45px rgba(0, 0, 0, 0.7))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-primary, #ffffff)',
          fontFamily: 'var(--font-sans)',
          userSelect: 'none',
          padding: '24px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Sparkles size={16} color="var(--accent-color, #e50914)" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-color, #e50914)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                TheIntroDB Skip Sync
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary, #ffffff)' }}>
              Identify Media
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', margin: '4px 0 0 0' }}>
              Enter media name to resolve IMDB ID and fetch intro skip markers.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #9ca3af)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px'
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Inputs Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
          {/* Media Name Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #d1d5db)', marginBottom: '6px' }}>
              Media / Show Name
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                value={mediaTitle}
                onChange={e => setMediaTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSearchAndFetch();
                }}
                placeholder="e.g. Breaking Bad, Stranger Things, Dune"
                style={{
                  width: '100%',
                  background: 'var(--surface, #12121a)',
                  border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: 'var(--text-primary, #ffffff)',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Media Type Selector */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setIsTvShow(true)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: isTvShow ? '1px solid var(--accent-color, #e50914)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                background: isTvShow ? 'var(--accent-glow, rgba(229, 9, 20, 0.25))' : 'var(--surface, #12121a)',
                color: isTvShow ? 'var(--accent-color, #e50914)' : 'var(--text-secondary, #d1d5db)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <Tv size={14} /> TV Show / Series
            </button>
            <button
              type="button"
              onClick={() => setIsTvShow(false)}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: !isTvShow ? '1px solid var(--accent-color, #e50914)' : '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                background: !isTvShow ? 'var(--accent-glow, rgba(229, 9, 20, 0.25))' : 'var(--surface, #12121a)',
                color: !isTvShow ? 'var(--accent-color, #e50914)' : 'var(--text-secondary, #d1d5db)',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <Film size={14} /> Movie / Cinema
            </button>
          </div>

          {/* Season & Episode Inputs (if TV) */}
          {isTvShow && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginBottom: '4px' }}>
                  Season
                </label>
                <input
                  type="number"
                  min="1"
                  value={season}
                  onChange={e => setSeason(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    background: 'var(--surface, #12121a)',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: 'var(--text-primary, #ffffff)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted, #9ca3af)', marginBottom: '4px' }}>
                  Episode
                </label>
                <input
                  type="number"
                  min="1"
                  value={episode}
                  onChange={e => setEpisode(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    background: 'var(--surface, #12121a)',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: 'var(--text-primary, #ffffff)',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          {/* Status / Error Message */}
          {statusMsg && (
            <div style={{ fontSize: '12px', color: 'var(--accent-color, #e50914)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 size={13} className="animate-spin" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div style={{ fontSize: '12px', color: 'var(--danger, #ef4444)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            style={{ color: 'var(--text-muted, #9ca3af)', padding: '8px 14px' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSearchAndFetch}
            disabled={isLoading}
            style={{
              background: 'var(--accent-color, #e50914)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease'
            }}
          >
            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Search & Sync IntroDB
          </Button>
        </div>
      </div>
    </div>
  );
};
