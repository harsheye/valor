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
}

export const EpisodeList: React.FC<EpisodeListProps> = ({
  episodes,
  onPlayEpisode,
  seasons,
  currentSeason = 1,
  onSeasonChange,
  loading = false
}) => {
  return (
    <section
      aria-label="Episodes list"
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
              className="streaming-poster-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                outline: 'none',
                position: 'relative',
                boxSizing: 'border-box'
              }}
            >
              {/* Episode Number */}
              <span
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-3)',
                  minWidth: '24px',
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {ep.episodeNumber}
              </span>

              {/* 16:9 Thumbnail with play overlay on hover */}
              <div
                style={{
                  width: '144px',
                  minWidth: '144px',
                  aspectRatio: '16/9',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--surface-2)',
                  backgroundImage: ep.stillPath ? `url("${ep.stillPath}")` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'top center',
                  backgroundRepeat: 'no-repeat',
                  position: 'relative',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {/* Hover Play Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'opacity 0.15s ease'
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'var(--accent-fill)',
                      color: 'var(--on-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}
                  >
                    <Play size={14} fill="currentColor" style={{ marginLeft: '2px' }} />
                  </div>
                </div>

                {/* Thin --accent progress bar if started */}
                {hasProgress && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      background: 'rgba(255, 255, 255, 0.25)'
                    }}
                  >
                    <div
                      style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        background: 'var(--accent)'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Episode Title & 2-line Synopsis */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  flex: 1,
                  minWidth: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {/* EP Chip */}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      background: 'var(--accent-soft)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    EP {ep.episodeNumber}
                  </span>

                  <h3
                    style={{
                      margin: 0,
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--text-1)',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {ep.name}
                  </h3>
                </div>

                {/* 2-line synopsis */}
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.82rem',
                    color: 'var(--text-2)',
                    lineHeight: 1.45,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
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
