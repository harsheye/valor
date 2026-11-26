import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowLeft, Play, CheckCircle2, Clock, Ban, RotateCcw } from 'lucide-react';
import type { SeriesViewModel, EpisodeViewModel } from '../../utils/libraryViewModel';
import type { VideoItem } from '../../types/media';
import { isSeriesDropped, toggleDropSeries } from '../../utils/seriesDropState';
import { getCachedSeasonEpisodes, setCachedSeason, getSeriesCachedCounts } from '../../utils/seriesCache';
import { DEFAULT_TMDB_TOKEN } from '../../utils/constants';

interface SeriesDetailPageProps {
  series: SeriesViewModel;
  onBack: () => void;
  onPlayEpisode: (video: VideoItem) => void;
  onSelectMedia?: (media: any) => void;
  tmdbApiKey?: string;
}

interface FetchedEpisode {
  episodeNumber: number;
  name: string;
  overview?: string;
  runtime?: number;
  stillPath?: string;
  airDate?: string;
}

interface MergedEpisode {
  episodeNumber: number;
  seasonNumber: number;
  episodeCode: string;
  displayTitle: string;
  runtimeLabel: string;
  isWatched: boolean;
  isInProgress: boolean;
  isRemaining: boolean;
  progress: number;
  resumeLabel: string;
  localVideo?: VideoItem;
  stillPath?: string;
  overview?: string;
}

export const SeriesDetailPage: React.FC<SeriesDetailPageProps> = ({
  series,
  onBack,
  onPlayEpisode,
  onSelectMedia,
  tmdbApiKey
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number>(() => {
    return series.seasons[0] || 1;
  });

  const [isDropped, setIsDropped] = useState<boolean>(() => {
    return isSeriesDropped(series.seriesTitle) || isSeriesDropped(series.id);
  });

  // Check cache immediately on mount
  const initialCached = useMemo(() => {
    return getCachedSeasonEpisodes(series.seriesTitle, selectedSeason) || [];
  }, [series.seriesTitle, selectedSeason]);

  const [fetchedSeasonEpisodes, setFetchedSeasonEpisodes] = useState<FetchedEpisode[]>(initialCached);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [resolvedTmdbId, setResolvedTmdbId] = useState<number | null>(() => {
    const cached = getSeriesCachedCounts(series.seriesTitle);
    return cached?.tmdbId || null;
  });

  const seasonChipsRef = useRef<HTMLDivElement>(null);

  // Sync dropped series state if changed externally
  useEffect(() => {
    const handleDropChanged = () => {
      setIsDropped(isSeriesDropped(series.seriesTitle) || isSeriesDropped(series.id));
    };
    window.addEventListener('valor_dropped_series_changed', handleDropChanged);
    return () => window.removeEventListener('valor_dropped_series_changed', handleDropChanged);
  }, [series.seriesTitle, series.id]);

  // Local episodes for the currently selected season
  const localSeasonEpisodes = useMemo(() => {
    return series.episodes
      .filter(e => e.season === selectedSeason)
      .sort((a, b) => a.episode - b.episode);
  }, [series.episodes, selectedSeason]);

  // 1. Fetch TV Show ID and Full Season Episode List (with cache check first)
  useEffect(() => {
    let isMounted = true;

    // Check cache first
    const cached = getCachedSeasonEpisodes(series.seriesTitle, selectedSeason);
    if (cached && cached.length > 0) {
      setFetchedSeasonEpisodes(cached);
      setLoadingSeason(false);
      return;
    }

    const fetchTmdbEpisodes = async () => {
      setLoadingSeason(true);
      const isBearer = tmdbApiKey ? tmdbApiKey.length > 50 : true;
      const token = tmdbApiKey || DEFAULT_TMDB_TOKEN;

      let showId = resolvedTmdbId;
      try {

        // Step A: Find show ID if not already resolved
        if (!showId) {
          let searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(series.seriesTitle)}&include_adult=false`;
          const headers: HeadersInit = { accept: 'application/json' };
          if (isBearer) {
            headers['Authorization'] = `Bearer ${token}`;
          } else if (token) {
            searchUrl += `&api_key=${token}`;
          }

          const sRes = await fetch(searchUrl, { headers });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.results && sData.results.length > 0) {
              showId = sData.results[0].id;
              if (isMounted) setResolvedTmdbId(showId);
            }
          }
        }

        // Step B: Fetch full season details from TMDB
        if (showId) {
          let seasonUrl = `https://api.themoviedb.org/3/tv/${showId}/season/${selectedSeason}?language=en-US`;
          const headers: HeadersInit = { accept: 'application/json' };
          if (isBearer) {
            headers['Authorization'] = `Bearer ${token}`;
          } else if (token) {
            seasonUrl += `&api_key=${token}`;
          }

          const sRes = await fetch(seasonUrl, { headers });
          if (sRes.ok) {
            const data = await sRes.json();
            if (isMounted && data.episodes && data.episodes.length > 0) {
              const mapped: FetchedEpisode[] = data.episodes.map((ep: any) => ({
                episodeNumber: ep.episode_number,
                name: ep.name || `Episode ${ep.episode_number}`,
                overview: ep.overview,
                runtime: ep.runtime || 48,
                stillPath: ep.still_path
                  ? `https://images.weserv.nl/?url=https://image.tmdb.org/t/p/w300${ep.still_path}`
                  : undefined,
                airDate: ep.air_date
              }));

              // Save to persistent cache so subsequent visits require ZERO network calls
              setCachedSeason(series.seriesTitle, selectedSeason, mapped, { tmdbId: showId });
              setFetchedSeasonEpisodes(mapped);
              setLoadingSeason(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch TMDB season episodes, using fallback generator:', err);
      }

      // Step C: Fallback generator if offline / no TMDB key
      // Ensures the user sees the remaining episodes up to standard season count (min 10)
      if (isMounted) {
        const highestLocal = localSeasonEpisodes.reduce((max, ep) => Math.max(max, ep.episode), 0);
        const totalSeasonCount = Math.max(10, highestLocal + 5);
        const fallbackList: FetchedEpisode[] = [];
        for (let epNum = 1; epNum <= totalSeasonCount; epNum++) {
          fallbackList.push({
            episodeNumber: epNum,
            name: `Episode ${epNum}`,
            runtime: 48
          });
        }
        setCachedSeason(series.seriesTitle, selectedSeason, fallbackList, { tmdbId: showId || undefined });
        setFetchedSeasonEpisodes(fallbackList);
        setLoadingSeason(false);
      }
    };

    fetchTmdbEpisodes();
    return () => { isMounted = false; };
  }, [selectedSeason, series.seriesTitle, resolvedTmdbId, tmdbApiKey, localSeasonEpisodes]);

  // 2. Merge local episodes with fetched remaining episodes
  const mergedEpisodes: MergedEpisode[] = useMemo(() => {
    const count = Math.max(fetchedSeasonEpisodes.length, localSeasonEpisodes.length, 1);
    const list: MergedEpisode[] = [];

    for (let epNum = 1; epNum <= count; epNum++) {
      const localEp = localSeasonEpisodes.find(e => e.episode === epNum);
      const fetchedEp = fetchedSeasonEpisodes.find(e => e.episodeNumber === epNum);

      const sStr = String(selectedSeason).padStart(2, '0');
      const eStr = String(epNum).padStart(2, '0');
      const episodeCode = `S${sStr}E${eStr}`;

      if (localEp) {
        const isWatched = localEp.status === 'watched';
        const isInProgress = localEp.status === 'in-progress';
        list.push({
          episodeNumber: epNum,
          seasonNumber: selectedSeason,
          episodeCode,
          displayTitle: localEp.displayTitle || fetchedEp?.name || `Episode ${epNum}`,
          runtimeLabel: localEp.runtimeLabel || (fetchedEp?.runtime ? `${fetchedEp.runtime}m` : '48m'),
          isWatched,
          isInProgress,
          isRemaining: false,
          progress: localEp.progress,
          resumeLabel: isWatched ? 'Watched' : isInProgress ? localEp.resumeLabel : 'Unwatched',
          localVideo: localEp.video,
          stillPath: fetchedEp?.stillPath,
          overview: fetchedEp?.overview
        });
      } else {
        list.push({
          episodeNumber: epNum,
          seasonNumber: selectedSeason,
          episodeCode,
          displayTitle: fetchedEp?.name || `Episode ${epNum}`,
          runtimeLabel: fetchedEp?.runtime ? `${fetchedEp.runtime}m` : '48m',
          isWatched: false,
          isInProgress: false,
          isRemaining: true,
          progress: 0,
          resumeLabel: 'Unwatched',
          stillPath: fetchedEp?.stillPath,
          overview: fetchedEp?.overview
        });
      }
    }

    return list;
  }, [fetchedSeasonEpisodes, localSeasonEpisodes, selectedSeason]);

  // Counts for the selected season
  const watchedInSeason = mergedEpisodes.filter(e => e.isWatched).length;
  const unwatchedInSeason = mergedEpisodes.length - watchedInSeason;

  const tileBg = `hsl(${series.tileHue}, 22%, var(--tile-l, 22%))`;
  const tileGlyphColor = `hsl(${series.tileHue}, 38%, var(--tile-glyph-l, 74%))`;

  // Handle Play/Stream action for an episode
  const handleEpisodeClick = (ep: MergedEpisode) => {
    if (ep.localVideo) {
      if (ep.localVideo.file || ep.localVideo.url || (ep.localVideo as any).localFilePath) {
        onPlayEpisode(ep.localVideo);
        return;
      }
      if ((ep.localVideo.type === 'online_tv' || ep.localVideo.type === 'online_movie' || !ep.localVideo.url) && onSelectMedia) {
        onSelectMedia(ep.localVideo);
        return;
      }
      onPlayEpisode(ep.localVideo);
      return;
    }

    // Remaining episode not stored locally -> Launch via online details/stream
    if (onSelectMedia) {
      const onlineVideo: VideoItem = {
        id: `tv-${resolvedTmdbId || series.id}-s${selectedSeason}-e${ep.episodeNumber}`,
        title: `${series.displayTitle} - ${ep.episodeCode}`,
        url: '',
        type: 'online_tv',
        isRemote: true,
        posterPath: series.posterPath,
        tmdbId: resolvedTmdbId || undefined,
        audioTracks: [],
        subtitleTracks: []
      };
      onSelectMedia(onlineVideo);
    } else if (series.primaryEpisode) {
      onPlayEpisode(series.primaryEpisode);
    }
  };

  // Primary Resume/Play Handler
  const handleResumeClick = () => {
    // Priority 1: In-progress local episode
    const inProgressEp = localSeasonEpisodes.find(e => e.status === 'in-progress');
    const targetVideo = inProgressEp?.video || series.primaryEpisode || localSeasonEpisodes[0]?.video;

    if (targetVideo) {
      if (targetVideo.file || targetVideo.url || (targetVideo as any).localFilePath) {
        onPlayEpisode(targetVideo);
        return;
      }
      if ((targetVideo.type === 'online_tv' || targetVideo.type === 'online_movie' || !targetVideo.url) && onSelectMedia) {
        onSelectMedia(targetVideo);
        return;
      }
      onPlayEpisode(targetVideo);
      return;
    }

    // Priority 2: Next unwatched merged episode
    const nextUnwatched = mergedEpisodes.find(e => !e.isWatched) || mergedEpisodes[0];
    if (nextUnwatched) {
      handleEpisodeClick(nextUnwatched);
    }
  };

  // Season chip arrow navigation
  const handleSeasonKeyDown = (e: React.KeyboardEvent, seasonNum: number) => {
    const currentIndex = series.seasons.indexOf(seasonNum);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % series.seasons.length;
      setSelectedSeason(series.seasons[nextIndex]);
      const nextBtn = seasonChipsRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex];
      nextBtn?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + series.seasons.length) % series.seasons.length;
      setSelectedSeason(series.seasons[prevIndex]);
      const prevBtn = seasonChipsRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[prevIndex];
      prevBtn?.focus();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      width: '100%',
      maxWidth: 'var(--page-max-width, 1400px)',
      margin: '0 auto',
      animation: 'fadeIn 0.15s ease-out'
    }}>
      {/* Top Navigation: "All series" Back Link */}
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 0',
            color: 'var(--accent)',
            fontSize: '0.9rem',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            outline: 'none'
          }}
          className="series-back-link"
        >
          <ArrowLeft size={16} />
          <span>All series</span>
        </button>
      </div>

      {/* Series Hero Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '1.25rem 1.5rem',
        backgroundColor: 'var(--surface-1)',
        border: isDropped ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        flexWrap: 'wrap',
        position: 'relative'
      }}>
        {/* Poster Tile (84x126) */}
        <div style={{
          width: '84px',
          height: '126px',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          backgroundColor: tileBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          position: 'relative'
        }}>
          {series.posterPath && !imageError ? (
            <img
              src={series.posterPath}
              alt=""
              loading="lazy"
              onError={() => setImageError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: '2.5rem', fontWeight: 600, color: tileGlyphColor }}>
              {series.tileGlyph}
            </span>
          )}

          {/* Dropped Badge on Poster */}
          {isDropped && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                background: '#f59e0b',
                color: '#000',
                fontSize: '9px',
                fontWeight: 800,
                textAlign: 'center',
                padding: '2px 0',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}
            >
              Dropped
            </div>
          )}
        </div>

        {/* Series Metadata & Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{
              margin: 0,
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'var(--text-1)',
              lineHeight: 1.2
            }}>
              {series.displayTitle}
            </h2>

            {/* Dropped State Pill */}
            {isDropped && (
              <span style={{
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#f59e0b',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.5px'
              }}>
                DROPPED
              </span>
            )}
          </div>

          <div style={{
            fontSize: '0.85rem',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {series.year && <span>{series.year}</span>}
            {series.year && <span>•</span>}
            <span>Season {selectedSeason}</span>
            <span>•</span>
            <span style={{ color: '#9ca3af' }}>{watchedInSeason} of {mergedEpisodes.length} watched</span>
            <span>•</span>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{unwatchedInSeason} unwatched</span>
          </div>

          {/* Action Buttons: Resume + Drop Series Toggle */}
          <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleResumeClick}
              style={{
                background: 'var(--accent-fill)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 18px',
                fontSize: '0.9rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease'
              }}
            >
              <Play size={16} fill="currentColor" stroke="none" />
              <span>{series.primaryActionLabel}</span>
            </button>

            {/* Drop Series Button (Distinct Amber Color) */}
            <button
              type="button"
              onClick={() => {
                const next = toggleDropSeries(series.seriesTitle);
                setIsDropped(next);
              }}
              style={{
                background: isDropped ? 'rgba(245, 158, 11, 0.15)' : 'var(--surface-2)',
                color: isDropped ? '#f59e0b' : 'var(--text-2)',
                border: isDropped ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={isDropped ? 'Resume watching this series' : 'Drop series (will not be watching anymore)'}
            >
              {isDropped ? (
                <>
                  <RotateCcw size={14} />
                  <span>Dropped · Click to resume</span>
                </>
              ) : (
                <>
                  <Ban size={14} />
                  <span>Drop series</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Season Selection Radio Group Chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Seasons
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9ca3af' }} />
              Grey = Watched
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }} />
              Red = Unwatched
            </span>
            {isDropped && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                Amber = Dropped
              </span>
            )}
          </div>
        </div>

        <div
          ref={seasonChipsRef}
          role="radiogroup"
          aria-label="Season selection"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
        >
          {series.seasons.map((seasonNum) => {
            const isSelected = selectedSeason === seasonNum;
            const seasonEpCount = isSelected ? mergedEpisodes.length : series.episodes.filter(e => e.season === seasonNum).length;
            return (
              <button
                key={seasonNum}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedSeason(seasonNum)}
                onKeyDown={(e) => handleSeasonKeyDown(e, seasonNum)}
                style={{
                  background: isSelected ? 'var(--accent-soft)' : 'var(--surface-1)',
                  color: isSelected ? 'var(--text-1)' : 'var(--text-2)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--accent)' : 'var(--control-border)',
                  borderRadius: '16px',
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  outline: 'none',
                  transition: 'all 0.15s ease-out'
                }}
              >
                <span>Season {seasonNum}</span>
                <span style={{
                  fontSize: '0.75rem',
                  color: isSelected ? 'var(--accent)' : 'var(--text-3)',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  ({seasonEpCount})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Episode Rows Container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {mergedEpisodes.map((ep) => {
          const isWatched = ep.isWatched;

          return (
            <div
              key={`${ep.seasonNumber}-${ep.episodeNumber}`}
              role="button"
              tabIndex={0}
              aria-label={`Play ${ep.episodeCode}: ${ep.displayTitle}`}
              onClick={() => handleEpisodeClick(ep)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleEpisodeClick(ep);
                }
              }}
              className={`series-episode-row ${isWatched ? 'is-watched' : 'is-unwatched'} ${isDropped ? 'is-dropped' : ''}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr 80px 140px 40px',
                alignItems: 'center',
                gap: '14px',
                padding: '10px 14px',
                backgroundColor: isDropped
                  ? 'rgba(245, 158, 11, 0.04)'
                  : isWatched
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'var(--surface-1)',
                border: '1px solid',
                borderColor: isDropped
                  ? 'rgba(245, 158, 11, 0.25)'
                  : isWatched
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(239, 68, 68, 0.22)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                position: 'relative',
                userSelect: 'none',
                outline: 'none',
                opacity: isWatched ? 0.72 : 1,
                transition: 'background-color 0.15s ease-out, border-color 0.15s ease-out, opacity 0.15s ease-out'
              }}
            >
              {/* 1. Episode Code: "E04" */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {isDropped ? (
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#f59e0b',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                ) : isWatched ? (
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#6b7280',
                    background: 'rgba(107, 114, 128, 0.12)',
                    border: '1px solid rgba(107, 114, 128, 0.25)',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                ) : (
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* 2. Episode Title */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px' }}>
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: isWatched ? 400 : 600,
                  color: isWatched ? '#9ca3af' : 'var(--text-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {ep.displayTitle}
                </span>
                {ep.overview && (
                  <span style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {ep.overview}
                  </span>
                )}
              </div>

              {/* 3. Runtime */}
              <div style={{
                fontSize: '0.8rem',
                color: isWatched ? 'var(--text-3)' : 'var(--text-2)',
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right'
              }}>
                {ep.runtimeLabel}
              </div>

              {/* 4. State / Status Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                {isDropped ? (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#f59e0b',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    Dropped
                  </span>
                ) : isWatched ? (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#9ca3af',
                    background: 'rgba(156, 163, 175, 0.12)',
                    border: '1px solid rgba(156, 163, 175, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    ✓ Watched
                  </span>
                ) : ep.isInProgress ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
                      {ep.resumeLabel}
                    </span>
                    <div style={{ width: '100%', height: '3px', backgroundColor: 'var(--surface-3)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(ep.progress * 100)}%`, backgroundColor: 'var(--accent)' }} />
                    </div>
                  </div>
                ) : (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    Unwatched
                  </span>
                )}
              </div>

              {/* 5. Circular Play Icon Button */}
              <button
                type="button"
                aria-label={`Play episode ${ep.episodeNumber}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEpisodeClick(ep);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'transparent',
                  border: isDropped
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : isWatched
                      ? '1px solid rgba(156, 163, 175, 0.3)'
                      : '1px solid rgba(239, 68, 68, 0.4)',
                  color: isDropped ? '#f59e0b' : isWatched ? '#9ca3af' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                className="ep-ghost-play-btn"
              >
                <Play size={14} fill="currentColor" stroke="none" style={{ marginLeft: '1px' }} />
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        .series-episode-row:hover {
          background-color: var(--surface-2) !important;
          border-color: var(--control-border) !important;
          opacity: 1 !important;
        }
        .series-episode-row:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
        .series-episode-row.is-unwatched:hover .ep-ghost-play-btn {
          background-color: #ef4444;
          color: #fff;
          border-color: #ef4444;
        }
        .series-episode-row.is-watched:hover .ep-ghost-play-btn {
          background-color: #6b7280;
          color: #fff;
          border-color: #6b7280;
        }
        .series-episode-row.is-dropped:hover .ep-ghost-play-btn {
          background-color: #f59e0b;
          color: #000;
          border-color: #f59e0b;
        }
        .series-back-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};
export default SeriesDetailPage;
