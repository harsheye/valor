import React from 'react';
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
}

interface PosterCardProps {
  item: PosterMediaItem;
  onClick: () => void;
  index?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const PosterCard: React.FC<PosterCardProps> = ({
  item,
  onClick,
  index = 0,
  className = '',
  style
}) => {
  // Format rating and match %
  const ratingVal = item.rating !== undefined ? Number(item.rating) : 0;
  const matchPercent = item.matchScore ?? (
    ratingVal > 0 ? Math.min(99, Math.max(72, Math.round(ratingVal * 10))) : 90
  );

  const yearLabel = item.year || '2024';
  const typeLabel = item.type === 'tv' || item.type === 'series'
    ? 'Series'
    : item.type === 'anime'
    ? 'Anime'
    : 'Movie';

  const ratingStr = ratingVal > 0 ? ratingVal.toFixed(1) : '7.8';
  const ageRating = item.ageRating || '16+';
  const quality = item.quality || 'HD';

  // Stagger class for entrance animation
  const staggerClass = index < 12 ? `stagger-${index + 1}` : '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${item.title}, ${yearLabel} ${typeLabel}, ${matchPercent}% match`}
      className={`streaming-poster-card animate-rise ${staggerClass} ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        background: 'transparent',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        outline: 'none',
        position: 'relative',
        userSelect: 'none',
        ...style
      }}
    >
      {/* Poster Image Container (Cover, anchored top, on --surface-2 base) */}
      <div
        style={{
          width: '100%',
          aspectRatio: '2/3',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--surface-2)',
          backgroundImage: item.posterPath ? `url("${item.posterPath}")` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'top center',
          backgroundRepeat: 'no-repeat',
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 'var(--space-2)'
        }}
      >
        {/* Top Chips Row: 16+ and HD chips (No % match on image) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {/* Age Rating Chip */}
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: 'rgba(27, 30, 38, 0.8)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(4px)'
            }}
          >
            {ageRating}
          </span>

          {/* HD / 4K Chip */}
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '2px 5px',
              borderRadius: '4px',
              backgroundColor: 'rgba(27, 30, 38, 0.8)',
              color: 'var(--text-3)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(4px)'
            }}
          >
            {quality}
          </span>
        </div>

        {/* Fallback placeholder if no poster */}
        {!item.posterPath && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-3)',
              fontSize: '2rem',
              fontWeight: 700,
              textTransform: 'uppercase'
            }}
          >
            {item.title.charAt(0)}
          </div>
        )}
      </div>

      {/* Meta underneath poster */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 2px' }}>
        <h3
          title={item.title}
          style={{
            margin: 0,
            fontSize: '0.92rem',
            fontWeight: 600,
            color: 'var(--text-1)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {item.title}
        </h3>

        {/* "year · type · ★ rating" as plain text under title */}
        <p
          style={{
            margin: 0,
            fontSize: '0.78rem',
            color: 'var(--text-3)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>{yearLabel}</span>
          <span>·</span>
          <span>{typeLabel}</span>
          <span>·</span>
          <span style={{ color: 'var(--warning)', fontWeight: 600 }}>★</span>
          <span>{ratingStr}</span>
        </p>
      </div>
    </div>
  );
};
