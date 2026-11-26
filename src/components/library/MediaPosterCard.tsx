import React, { useState, useRef, useEffect } from 'react';
import { Play, Check, MoreVertical, Star, Edit3, Trash2, CheckCircle2, Circle } from 'lucide-react';
import type { BaseMediaViewModel, SeriesViewModel } from '../../utils/libraryViewModel';
import { isSeriesDropped } from '../../utils/seriesDropState';

interface MediaPosterCardProps {
  item: BaseMediaViewModel | SeriesViewModel;
  onPlay: () => void;
  onOpenSeries?: () => void;
  onToggleWatched: () => void;
  onRename: () => void;
  onRemove: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  cardRef?: (node: HTMLElement | null) => void;
}

export const MediaPosterCard: React.FC<MediaPosterCardProps> = ({
  item,
  onPlay,
  onOpenSeries,
  onToggleWatched,
  onRename,
  onRemove,
  tabIndex = 0,
  onKeyDown,
  cardRef
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [imageError, setImageError] = useState(false);

  // Close menu on click outside or Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        moreBtnRef.current?.focus();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        moreBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isMenuOpen]);

  const isSeries = item.kind === 'series';
  const seriesItem = isSeries ? (item as SeriesViewModel) : null;
  const movieItem = !isSeries ? (item as BaseMediaViewModel) : null;

  const handleClick = (e: React.MouseEvent) => {
    if (isMenuOpen) return;
    if (isSeries && onOpenSeries) {
      onOpenSeries();
    } else {
      onPlay();
    }
  };

  const ariaLabel = isSeries
    ? `Open ${item.displayTitle}, ${seriesItem?.metaLabel || ''}`
    : item.status === 'in-progress'
      ? `Resume ${item.displayTitle} at ${movieItem ? item.resumeLabel : ''}`
      : `Play ${item.displayTitle}`;

  const tileBg = `hsl(${item.tileHue}, 22%, var(--tile-l, 22%))`;
  const tileGlyphColor = `hsl(${item.tileHue}, 38%, var(--tile-glyph-l, 74%))`;

  return (
    <div
      className="media-poster-card-wrapper"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        contentVisibility: 'auto',
        containIntrinsicSize: '160px 290px'
      }}
    >
      {/* The ONE primary focusable button for the card */}
      <button
        ref={cardRef}
        type="button"
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        onClick={handleClick}
        onKeyDown={onKeyDown}
        className="media-card-main-button"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          outline: 'none',
          width: '100%',
          position: 'relative',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        {/* Poster 2:3 Container */}
        <div
          className="poster-container"
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '2 / 3',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            backgroundColor: tileBg,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            transition: 'border-color 0.15s ease'
          }}
        >
          {/* Artwork Image or Generated Flat Tile */}
          {item.posterPath && !imageError ? (
            <img
              src={item.posterPath}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tileBg
              }}
            >
              <span
                style={{
                  fontSize: '3rem',
                  fontWeight: 600,
                  fontFamily: 'var(--font-display)',
                  color: tileGlyphColor,
                  userSelect: 'none'
                }}
              >
                {item.tileGlyph}
              </span>
            </div>
          )}

          {/* Top-Left: "New" Badge for unplayed media */}
          {item.status === 'new' && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: 'rgba(21, 26, 33, 0.90)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.7rem',
                fontWeight: 600,
                backdropFilter: 'blur(4px)',
                zIndex: 2,
                pointerEvents: 'none'
              }}
            >
              New
            </div>
          )}

          {/* Dropped Badge */}
          {isSeries && seriesItem && (isSeriesDropped(seriesItem.seriesTitle) || isSeriesDropped(item.displayTitle)) && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: '#f59e0b',
                color: '#000',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '4px',
                letterSpacing: '0.5px',
                zIndex: 3
              }}
            >
              DROPPED
            </div>
          )}

          {/* Top-Right: Watched Circle Check Badge */}
          {item.status === 'watched' && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'rgba(21, 26, 33, 0.90)',
                border: '1px solid var(--border)',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)',
                zIndex: 2,
                pointerEvents: 'none'
              }}
            >
              <Check size={13} strokeWidth={3} />
            </div>
          )}

          {/* Bottom Edge: 4px Progress Bar for in-progress items */}
          {item.status === 'in-progress' && item.progress > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '4px',
                background: 'var(--surface-3)',
                zIndex: 3
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.round(item.progress * 100)}%`,
                  background: 'var(--accent)'
                }}
              />
            </div>
          )}

          {/* Hover / :focus-visible Overlay with 40px Play Button */}
          <div
            className="poster-hover-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'var(--scrim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 150ms ease-out',
              zIndex: 4,
              pointerEvents: 'none'
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--accent-fill)',
                color: 'var(--on-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
              }}
            >
              <Play size={18} fill="currentColor" stroke="none" style={{ marginLeft: '2px' }} />
            </div>
          </div>
        </div>

        {/* Text Metadata Under Poster */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', overflow: 'hidden' }}>
          {/* Title Row */}
          <div
            title={item.rawName}
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              lineHeight: 1.3
            }}
          >
            {item.displayTitle}
          </div>

          {/* Meta Row (Year + Runtime or Seasons/Episodes) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-2)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.3
            }}
          >
            {isSeries && seriesItem ? (
              <span>{seriesItem.metaLabel}</span>
            ) : (
              <>
                {item.year && <span>{item.year}</span>}
                {item.year && item.runtimeLabel && <span>•</span>}
                {item.runtimeLabel && <span title={item.fullTimecode}>{item.runtimeLabel}</span>}
              </>
            )}
          </div>

          {/* State Line */}
          <div
            style={{
              fontSize: '12px',
              minHeight: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              lineHeight: 1.3
            }}
          >
            {isSeries && seriesItem ? (
              (isSeriesDropped(seriesItem.seriesTitle) || isSeriesDropped(item.displayTitle)) ? (
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                  Dropped
                </span>
              ) : seriesItem.stateLine ? (
                <span style={{ color: seriesItem.status === 'in-progress' ? 'var(--accent)' : 'var(--text-2)' }}>
                  {seriesItem.stateLine}
                </span>
              ) : null
            ) : item.status === 'in-progress' ? (
              <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                {item.resumeLabel}
              </span>
            ) : item.status === 'watched' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {item.rating && item.rating > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--warning)' }}>
                    <Star size={11} fill="currentColor" stroke="none" />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{item.rating}</span>
                  </div>
                )}
                <span style={{ color: 'var(--text-2)' }}>Watched</span>
              </div>
            ) : null}
          </div>
        </div>
      </button>

      {/* Three-Dot More Menu Button (36px hit target, hover/focus-within visible) */}
      <div
        className="card-more-menu-wrapper"
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          zIndex: 10
        }}
      >
        <button
          ref={moreBtnRef}
          type="button"
          aria-label={`More options for ${item.displayTitle}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
          }}
          className="card-more-button"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: isMenuOpen ? 'var(--surface-3)' : 'rgba(21, 26, 33, 0.85)',
            border: '1px solid var(--border)',
            color: 'var(--text-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            opacity: isMenuOpen ? 1 : undefined,
            transition: 'opacity 0.15s, background-color 0.15s'
          }}
        >
          <MoreVertical size={16} />
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Media card actions"
            style={{
              position: 'absolute',
              top: '40px',
              right: 0,
              minWidth: '170px',
              backgroundColor: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              zIndex: 9999
            }}
          >
            {/* Action 1: Play / Resume */}
            <button
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(false);
                if (isSeries && onOpenSeries) onOpenSeries();
                else onPlay();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-1)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-3)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Play size={14} />
              <span>{isSeries ? 'View series' : item.status === 'in-progress' ? 'Resume' : 'Play'}</span>
            </button>

            {/* Action 2: Mark Watched / Unwatched (Movies only) */}
            {!isSeries && (
              <button
                role="menuitem"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(false);
                  onToggleWatched();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--text-1)',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-3)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {item.status === 'watched' ? (
                  <>
                    <Circle size={14} />
                    <span>Mark as unwatched</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} color="var(--success)" />
                    <span>Mark as watched</span>
                  </>
                )}
              </button>
            )}

            {/* Action 3: Rename Title */}
            <button
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(false);
                onRename();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-1)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-3)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Edit3 size={14} />
              <span>Rename</span>
            </button>

            {/* Action 4: Remove from library */}
            <button
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(false);
                onRemove();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--danger)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-3)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Trash2 size={14} />
              <span>Remove</span>
            </button>
          </div>
        )}
      </div>

      <style>{`
        .media-poster-card-wrapper .card-more-button {
          opacity: 0;
        }
        .media-poster-card-wrapper:hover .card-more-button,
        .media-poster-card-wrapper:focus-within .card-more-button {
          opacity: 1;
        }
        .media-card-main-button:hover .poster-hover-overlay,
        .media-card-main-button:focus-visible .poster-hover-overlay {
          opacity: 1;
        }
        .media-card-main-button:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 3px;
        }
      `}</style>
    </div>
  );
};
