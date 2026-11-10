import React from 'react';
import { Play } from 'lucide-react';
import './streaming.css';

export interface EpisodeData {
  episodeNumber: number;
  name: string;
  overview?: string;
  stillPath?: string;
  runtime?: string;
  progress?: number; // 0 to 1
}

interface EpisodeListProps {
  episodes: EpisodeData[];
  onPlayEpisode: (episode: EpisodeData) => void;
  seasons?: { seasonNumber: number; name: string }[];
  currentSeason?: number;
  onSeasonChange?: (season: number) => void;
  loading?: boolean;
  fallbackBackdrop?: string;
}

export const EpisodeList: React.FC<EpisodeListProps> = ({
  episodes,
  onPlayEpisode,
  seasons,
  currentSeason = 1,
  onSeasonChange,
  loading = false,
  fallbackBackdrop
}) => {
  return (
    <section
      aria-label="Episodes list"
      className="streaming-episodes-section"
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '0 var(--space-7)',
        boxSizing: 'border-box'
      }}
    >
      {/* Header Row: Title & Season Select */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-4)',
          gap: 'var(--space-3)'
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--text-1)',
            fontFamily: 'var(--font-display)',
            letterSpacing: '-0.01em'
          }}
        >
          Episodes
        </h2>

        {seasons && seasons.length > 1 && onSeasonChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label htmlFor="season-picker" className="visually-hidden">Select season</label>
            <select
              id="season-picker"
              value={currentSeason}
              onChange={(e) => onSeasonChange(Number(e.target.value))}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {seasons.map((s) => (
                <option key={s.seasonNumber} value={s.seasonNumber}>
                  {s.name || `Season ${s.seasonNumber}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Episode Rows Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          width: '100%'
        }}
      >
        {episodes.map((ep, idx) => {
          const hasProgress = ep.progress !== undefined && ep.progress > 0;
          const progressPercent = Math.min(100, Math.round((ep.progress || 0) * 100));
          const thumbnailImg = ep.stillPath || fallbackBackdrop;

          return (
            <div
              key={`${ep.episodeNumber}-${idx}`}
              role="button"
              tabIndex={0}
              onClick={() => onPlayEpisode(ep)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPlayEpisode(ep);
                }
              }}
              aria-label={`Play episode ${ep.episodeNumber}: ${ep.name}`}
              className="streaming-episode-row"
            >
              {/* Episode Number */}
              <span className="streaming-episode-number">
                {ep.episodeNumber}
              </span>

              {/* 16:9 Thumbnail with play overlay on hover */}
              <div className="streaming-episode-row-thumbnail">
                {thumbnailImg ? (
                  <img
                    src={thumbnailImg}
                    alt={ep.name}
                    loading="lazy"
                    className="streaming-episode-thumbnail-img"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="streaming-episode-thumbnail-fallback">
                    <span>EP {ep.episodeNumber}</span>
                  </div>
                )}

                {/* Hover Play Overlay */}
                <div className="streaming-episode-row-play">
                  <div className="streaming-episode-play-circle">
                    <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />
                  </div>
                </div>

                {/* Progress bar if started */}
                {hasProgress && (
                  <div className="streaming-episode-progress-track">
                    <div
                      className="streaming-episode-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Episode Title & Synopsis */}
              <div className="streaming-episode-row-info">
                <div className="streaming-episode-row-title-wrap">
                  <span className="streaming-episode-row-badge">
                    EP {ep.episodeNumber}
                  </span>
                  <h3 className="streaming-episode-row-title">
                    {ep.name}
                  </h3>
                  {ep.runtime && (
                    <span className="streaming-episode-row-runtime">
                      {ep.runtime}
                    </span>
                  )}
                </div>

                <p className="streaming-episode-row-overview">
                  {ep.overview || 'No description available for this episode.'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
