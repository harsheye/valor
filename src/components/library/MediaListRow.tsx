import React, { useState, useRef, useEffect } from 'react';
import { Play, MoreVertical, Star, Edit3, Trash2, CheckCircle2, Circle } from 'lucide-react';
import type { BaseMediaViewModel, SeriesViewModel } from '../../utils/libraryViewModel';

interface MediaListRowProps {
  item: BaseMediaViewModel | SeriesViewModel;
  onPlay: () => void;
  onOpenSeries?: () => void;
  onToggleWatched: () => void;
  onRename: () => void;
  onRemove: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  rowRef?: (node: HTMLElement | null) => void;
}

export const MediaListRow: React.FC<MediaListRowProps> = ({
  item,
  onPlay,
  onOpenSeries,
  onToggleWatched,
  onRename,
  onRemove,
  tabIndex = 0,
  onKeyDown,
  rowRef
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [imageError, setImageError] = useState(false);

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

  const handleClick = () => {
    if (isMenuOpen) return;
    if (isSeries && onOpenSeries) {
      onOpenSeries();
    } else {
      onPlay();
    }
  };

  const tileBg = `hsl(${item.tileHue}, 22%, var(--tile-l, 22%))`;
  const tileGlyphColor = `hsl(${item.tileHue}, 38%, var(--tile-glyph-l, 74%))`;

  const ariaLabel = isSeries
    ? `Open ${item.displayTitle}, ${seriesItem?.metaLabel || ''}`
    : item.status === 'in-progress'
      ? `Resume ${item.displayTitle} at ${movieItem ? item.resumeLabel : ''}`
      : `Play ${item.displayTitle}`;

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleClick();
        } else if (onKeyDown) {
          onKeyDown(e);
        }
      }}
      className="media-list-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto auto auto auto 40px',
        alignItems: 'center',
        gap: '14px',
        padding: '8px 14px',
        minHeight: '56px',
        maxHeight: '64px',
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
      {/* 1. Poster Thumbnail (34px wide x ~51px tall) */}
      <div
        style={{
          width: '34px',
          height: '48px',
          borderRadius: '4px',
          overflow: 'hidden',
          backgroundColor: tileBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {item.posterPath && !imageError ? (
          <img
            src={item.posterPath}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: '1rem', fontWeight: 600, color: tileGlyphColor }}>
            {item.tileGlyph}
          </span>
        )}
      </div>

      {/* 2. Title & Meta Row */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '2px' }}>
        <span
          title={item.rawName}
          style={{
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {item.displayTitle}
        </span>
        {isSeries && seriesItem && (
          <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
            {seriesItem.metaLabel}
          </span>
        )}
      </div>

      {/* 3. Year */}
      <div style={{ fontSize: '12px', color: 'var(--text-2)', minWidth: '40px', textAlign: 'center' }}>
        {item.year || ''}
      </div>

      {/* 4. Runtime */}
      <div style={{ fontSize: '12px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', minWidth: '55px', textAlign: 'right' }}>
        {!isSeries && item.runtimeLabel ? item.runtimeLabel : ''}
      </div>

      {/* 5. Quality Chips (only if probed) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {item.resolution && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--surface-3)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)'
            }}
          >
            {item.resolution}
          </span>
        )}
        {item.codec && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--surface-3)',
              color: 'var(--text-3)',
              border: '1px solid var(--border)'
            }}
          >
            {item.codec}
          </span>
        )}
      </div>

      {/* 6. State Text (Right-Aligned) */}
      <div style={{ textAlign: 'right', minWidth: '130px' }}>
        {isSeries && seriesItem ? (
          <span style={{ fontSize: '12px', color: seriesItem.status === 'in-progress' ? 'var(--accent)' : 'var(--text-2)', fontWeight: seriesItem.status === 'in-progress' ? 500 : 400 }}>
            {seriesItem.stateLine}
          </span>
        ) : item.status === 'in-progress' ? (
          <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 500 }}>
            {item.resumeLabel}
          </span>
        ) : item.status === 'watched' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            {item.rating && item.rating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--warning)', marginRight: '4px' }}>
                <Star size={11} fill="currentColor" stroke="none" />
                <span style={{ fontSize: '11px', fontWeight: 600 }}>{item.rating}</span>
              </div>
            )}
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>Watched</span>
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Unplayed</span>
        )}
      </div>

      {/* 7. More Menu Button */}
      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button
          ref={moreBtnRef}
          type="button"
          aria-label={`More options for ${item.displayTitle}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-sm)',
            background: isMenuOpen ? 'var(--surface-3)' : 'transparent',
            border: 'none',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background-color 0.15s, color 0.15s'
          }}
        >
          <MoreVertical size={16} />
        </button>

        {isMenuOpen && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Media row actions"
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
            <button
              role="menuitem"
              type="button"
              onClick={() => {
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

            {!isSeries && (
              <button
                role="menuitem"
                type="button"
                onClick={() => {
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

            <button
              role="menuitem"
              type="button"
              onClick={() => {
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

            <button
              role="menuitem"
              type="button"
              onClick={() => {
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
        .media-list-row:hover {
          background-color: var(--surface-2) !important;
          border-color: var(--control-border) !important;
        }
        .media-list-row:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
};
