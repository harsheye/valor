import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import './streaming.css';

export interface PosterMediaItem {
  id: string | number;
  title: string;
  posterPath?: string;
  year?: string;
  type?: 'movie' | 'tv' | 'series' | 'anime';
  rating?: number;
  matchScore?: number;
  ageRating?: string;
  quality?: string;
  progressPercent?: number;
}

interface PosterCardProps {
  item: PosterMediaItem;
  onClick: () => void;
  index?: number;
  className?: string;
  style?: React.CSSProperties;
  progressPercent?: number;
}

export const PosterCard: React.FC<PosterCardProps> = ({
  item,
  onClick,
  className = '',
  style,
  progressPercent: propProgressPercent
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [item.posterPath]);

  const progressPercent = propProgressPercent ?? item.progressPercent;
  const ratingVal = item.rating !== undefined ? Number(item.rating) : 0;
  const ratingStr = ratingVal > 0 ? ratingVal.toFixed(1) : '7.8';

  const yearLabel = item.year || '2024';
  const typeLabel = item.type === 'tv' || item.type === 'series'
    ? 'Series'
    : item.type === 'anime'
    ? 'Anime'
    : 'Movie';

  const showImage = item.posterPath && !imgError;

  return (
    <a
      href="#play"
      role="link"
      tabIndex={0}
      aria-label={`${item.title}, ${yearLabel} ${typeLabel}`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`streaming-poster-card ${className}`}
      style={style}
    >
      {/* Poster (2:3 aspect ratio, radius 16px, overflow:hidden) */}
      <div className="streaming-card-poster">
        {showImage ? (
          <img
            src={item.posterPath}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            className="streaming-card-poster-img"
          />
        ) : (
          <div className="streaming-card-placeholder">
            <div className="streaming-card-avatar">
              {item.title ? item.title.trim().charAt(0).toUpperCase() : 'M'}
            </div>
            <span className="streaming-card-fallback-title">
              {item.title}
            </span>
            <span className="streaming-card-type">{typeLabel}</span>
          </div>
        )}

        {/* Play button (48px round, fades in and scales from .85 to 1 on hover/focus) */}
        <div className="streaming-card-play-btn" aria-hidden="true">
          <Play size={20} fill="#0e1118" color="#0e1118" style={{ transform: 'translateX(1px)' }} />
        </div>

        {/* Progress bar (5px tall, pinned to poster bottom and clipped by rounded corners) */}
        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="streaming-card-progress-track">
            <div
              className="streaming-card-progress-bar"
              style={{
                width: `${Math.min(100, Math.max(0, progressPercent))}%`
              }}
            />
          </div>
        )}
      </div>

      {/* Meta (title + subline, sits OUTSIDE the ring) */}
      <div className="streaming-card-meta">
        <b className="streaming-card-title" title={item.title}>
          {item.title}
        </b>
        <span className="streaming-card-subline">
          <span>{yearLabel}</span>
          <span>·</span>
          <span>{typeLabel}</span>
          <span>·</span>
          <span className="streaming-card-star">★</span>
          <span>{ratingStr}</span>
        </span>
      </div>
    </a>
  );
};
