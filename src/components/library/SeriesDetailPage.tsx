import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, CheckCircle2, Star, Clock } from 'lucide-react';
import type { SeriesViewModel, EpisodeViewModel } from '../../utils/libraryViewModel';
import type { VideoItem } from '../../types/media';

interface SeriesDetailPageProps {
  series: SeriesViewModel;
  onBack: () => void;
  onPlayEpisode: (video: VideoItem) => void;
}

export const SeriesDetailPage: React.FC<SeriesDetailPageProps> = ({
  series,
  onBack,
  onPlayEpisode
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number>(() => {
    return series.seasons[0] || 1;
  });

  const seasonChipsRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);

  // Filter and sort episodes for the selected season
  const seasonEpisodes = series.episodes
    .filter(e => e.season === selectedSeason)
    .sort((a, b) => a.episode - b.episode);

  const tileBg = `hsl(${series.tileHue}, 22%, var(--tile-l, 22%))`;
  const tileGlyphColor = `hsl(${series.tileHue}, 38%, var(--tile-glyph-l, 74%))`;

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
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        flexWrap: 'wrap'
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
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
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
        </div>

        {/* Series Metadata & Filled Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.35rem',
            fontWeight: 500,
            color: 'var(--text-1)',
            lineHeight: 1.2
          }}>
            {series.displayTitle}
          </h2>

          <div style={{
            fontSize: '0.85rem',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {series.year && <span>{series.year}</span>}
            {series.year && <span>•</span>}
            <span>{series.metaLabel}</span>
            {series.watchedCount > 0 && (
              <>
                <span>•</span>
                <span style={{ color: 'var(--success)' }}>
                  {series.watchedCount} of {series.episodesCount} watched
                </span>
              </>
            )}
          </div>

          {/* Primary Filled Button for the Series */}
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                if (series.primaryEpisode) {
                  onPlayEpisode(series.primaryEpisode);
                } else if (seasonEpisodes[0]) {
                  onPlayEpisode(seasonEpisodes[0].video);
                }
              }}
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
                boxShadow: 'none',
                transition: 'opacity 0.15s ease'
              }}
            >
              <Play size={16} fill="currentColor" stroke="none" />
              <span>{series.primaryActionLabel}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Season Selection Radio Group Chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Seasons
        </span>
        <div
          ref={seasonChipsRef}
          role="radiogroup"
          aria-label="Season selection"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
        >
          {series.seasons.map((seasonNum) => {
            const isSelected = selectedSeason === seasonNum;
            const seasonEpCount = series.episodes.filter(e => e.season === seasonNum).length;
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
        {seasonEpisodes.map((ep) => {
          const isEpWatched = ep.status === 'watched';
          const isEpInProgress = ep.status === 'in-progress';

          return (
            <div
              key={ep.id}
              role="button"
              tabIndex={0}
              aria-label={`Play ${ep.episodeCode}: ${ep.displayTitle}`}
              onClick={() => onPlayEpisode(ep.video)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPlayEpisode(ep.video);
                }
              }}
              className="series-episode-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '48px 1fr 80px 140px 40px',
                alignItems: 'center',
                gap: '14px',
                padding: '10px 14px',
                backgroundColor: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                position: 'relative',
                userSelect: 'none',
                outline: 'none',
                transition: 'background-color 0.15s ease-out, border-color 0.15s ease-out'
              }}
            >
              {/* 1. Episode Code: "E04" */}
              <span style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-2)',
                fontVariantNumeric: 'tabular-nums'
              }}>
                E{String(ep.episode).padStart(2, '0')}
              </span>

              {/* 2. Episode Title */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: 'var(--text-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {ep.displayTitle}
                </span>
              </div>

              {/* 3. Runtime */}
              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {ep.runtimeLabel || ''}
              </div>

              {/* 4. Thin Progress Bar & State */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '110px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: isEpInProgress ? 600 : 400,
                  color: isEpWatched ? 'var(--text-2)' : isEpInProgress ? 'var(--accent)' : 'var(--text-3)'
                }}>
                  {ep.resumeLabel}
                </span>
                {isEpInProgress && ep.progress > 0 && (
                  <div style={{ width: '100%', height: '3px', backgroundColor: 'var(--surface-3)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round(ep.progress * 100)}%`, backgroundColor: 'var(--accent)' }} />
                  </div>
                )}
              </div>

              {/* 5. Circular Ghost Play Icon Button */}
              <button
                type="button"
                aria-label={`Play episode ${ep.episode}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayEpisode(ep.video);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'transparent',
                  border: '1px solid var(--control-border)',
                  color: 'var(--text-1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s, color 0.15s, border-color 0.15s'
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
        }
        .series-episode-row:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
        .series-episode-row:hover .ep-ghost-play-btn {
          background-color: var(--accent-fill);
          color: var(--on-accent);
          border-color: var(--accent-fill);
        }
        .series-back-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};
