import React from 'react';
import { PosterCard, type PosterMediaItem } from './PosterCard';
import './streaming.css';

interface RailProps {
  title: string;
  items: PosterMediaItem[];
  onSelectItem: (item: PosterMediaItem) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const Rail: React.FC<RailProps> = ({
  title,
  items,
  onSelectItem,
  className = '',
  style
}) => {
  if (!items || items.length === 0) return null;

  return (
    <section
      aria-label={title}
      className={className}
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '0 var(--space-7)',
        boxSizing: 'border-box',
        ...style
      }}
    >
      <h2
        style={{
          margin: '0 0 var(--space-4) 0',
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.01em'
        }}
      >
        {title}
      </h2>

      {/* Scroll-snap poster rail with 14px padding to prevent hover clip */}
      <div className="streaming-horizontal-rail">
        {items.map((item, idx) => (
          <div
            key={`${item.id}-${idx}`}
            style={{
              width: '172px',
              minWidth: '172px',
              flexShrink: 0
            }}
          >
            <PosterCard
              item={item}
              onClick={() => onSelectItem(item)}
              index={idx}
            />
          </div>
        ))}
      </div>
    </section>
  );
};
