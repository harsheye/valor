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
  onApplyBookmarks: (bookmarks: Bookmark[], mediaInfo: { title: string; tmdbId?: number; imdbId?: string; season?: number; episode?: number }) => void;
  onToast?: (msg: string) => void;
}

export const MediaIdentifyModal: React.FC<MediaIdentifyModalProps> = ({
  isOpen,
  videoTitle,
  duration,
  onClose,
  onApplyBookmarks,
  onToast
}) => {
  const initialClassified = classifyVideoTitle(videoTitle || '');
  const [mediaTitle, setMediaTitle] = useState(() => initialClassified.seriesTitle || initialClassified.displayTitle || videoTitle || '');
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
      // 1. Search TMDB for Show or Movie
      const cleanQuery = mediaTitle.trim();
      const endpoint = isTvShow ? 'search/tv' : 'search/movie';
      const searchUrl = `https://api.themoviedb.org/3/${endpoint}?query=${encodeURIComponent(cleanQuery)}&include_adult=false`;

      const searchRes = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${TMDB_TOKEN}`,
          'accept': 'application/json'
        }
      });

      if (!searchRes.ok) {
        throw new Error(`TMDB search returned status ${searchRes.status}`);
      }

      const searchData = await searchRes.json();
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
        const extUrl = `https://api.themoviedb.org/3/${isTvShow ? 'tv' : 'movie'}/${tmdbId}/external_ids`;
        const extRes = await fetch(extUrl, {
          headers: {
            'Authorization': `Bearer ${TMDB_TOKEN}`,
            'accept': 'application/json'
          }
        });
        if (extRes.ok) {
          const extData = await extRes.json();
          if (extData.imdb_id) {
            imdbId = extData.imdb_id;
          }
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

      let introDbRes = await fetch(introDbUrl, { headers: introHeaders });

      // Fallback to IMDB query if TMDB query returned 404 and IMDB ID exists
      if (!introDbRes.ok && imdbId) {
        let imdbIntroUrl = `https://api.theintrodb.org/v3/media?imdb_id=${imdbId}`;
        if (isTvShow) {
          imdbIntroUrl += `&season=${season}&episode=${episode}`;
        }
        if (durationMs > 0) {
          imdbIntroUrl += `&duration_ms=${durationMs}`;
        }
        const fallbackRes = await fetch(imdbIntroUrl, { headers: introHeaders });
        if (fallbackRes.ok) {
          introDbRes = fallbackRes;
        }
      }

      const newBookmarks: Bookmark[] = [];
      const msToSec = (ms?: number | null) => (ms ? Math.round(ms / 1000) : 0);

      if (introDbRes.ok) {
        const introData = await introDbRes.json();

        // Intros
        if (introData.intro && Array.isArray(introData.intro)) {
          introData.intro.forEach((item: any, idx: number) => {
            newBookmarks.push({
              id: `theintrodb-intro-${idx}`,
              time: msToSec(item.start_ms),
              endTime: msToSec(item.end_ms),
              label: 'Intro',
              isIntro: true,
              isOutro: false,
              skipEnabled: true,
              createdBy: 'theintrodb'
            });
          });
        }

        // Recaps
        if (introData.recap && Array.isArray(introData.recap)) {
          introData.recap.forEach((item: any, idx: number) => {
            newBookmarks.push({
              id: `theintrodb-recap-${idx}`,
              time: msToSec(item.start_ms),
              endTime: msToSec(item.end_ms),
              label: 'Recap',
              isIntro: true,
              isOutro: false,
              skipEnabled: true,
              createdBy: 'theintrodb'
            });
          });
        }

        // Credits
        if (introData.credits && Array.isArray(introData.credits)) {
          introData.credits.forEach((item: any, idx: number) => {
            newBookmarks.push({
              id: `theintrodb-credits-${idx}`,
              time: msToSec(item.start_ms),
              endTime: msToSec(item.end_ms),
              label: 'Credits/Outro',
              isIntro: false,
              isOutro: true,
              skipEnabled: true,
              createdBy: 'theintrodb'
            });
          });
        }
      }

      const count = newBookmarks.length;
      const successToast = count > 0
        ? `Found ${imdbId ? `IMDB ${imdbId}` : `TMDB #${tmdbId}`} — Loaded ${count} intro/skip timestamps!`
        : `Identified as "${resolvedTitle}" (${imdbId || `TMDB #${tmdbId}`}). No introdb entries yet.`;

      onToast?.(successToast);
      onApplyBookmarks(newBookmarks, {
        title: resolvedTitle,
        tmdbId,
        imdbId,
        season: isTvShow ? season : undefined,
        episode: isTvShow ? episode : undefined
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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
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
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.7), 0 0 30px rgba(59, 130, 246, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          userSelect: 'none',
          padding: '24px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Sparkles size={16} color="#60a5fa" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                TheIntroDB Skip Sync
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Identify Media
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Enter media name to resolve IMDB ID and fetch intro skip markers.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
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
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
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
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: '#ffffff',
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
                border: isTvShow ? '1px solid #8b5cf6' : '1px solid rgba(255, 255, 255, 0.1)',
                background: isTvShow ? 'rgba(139, 92, 246, 0.2)' : 'rgba(30, 41, 59, 0.4)',
                color: isTvShow ? '#c4b5fd' : '#94a3b8',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
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
                border: !isTvShow ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.1)',
                background: !isTvShow ? 'rgba(6, 182, 212, 0.2)' : 'rgba(30, 41, 59, 0.4)',
                color: !isTvShow ? '#22d3ee' : '#94a3b8',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Film size={14} /> Movie / Cinema
            </button>
          </div>

          {/* Season & Episode Inputs (if TV) */}
          {isTvShow && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Season
                </label>
                <input
                  type="number"
                  min="1"
                  value={season}
                  onChange={e => setSeason(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Episode
                </label>
                <input
                  type="number"
                  min="1"
                  value={episode}
                  onChange={e => setEpisode(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
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
            <div style={{ fontSize: '12px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Loader2 size={13} className="animate-spin" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div style={{ fontSize: '12px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            style={{ color: '#94a3b8', padding: '8px 14px' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSearchAndFetch}
            disabled={isLoading}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '13px',
              padding: '9px 18px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
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
