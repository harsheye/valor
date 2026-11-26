import React, { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, Play, Bookmark as BookmarkIcon, X, Plus, SkipForward, Flag, Flame, Heart } from 'lucide-react';
import type { Bookmark } from '../types/media';
import { isMobileDevice } from '../utils/screenOrientation';
import { deduplicateBookmarks } from '../utils/bookmarkUtils';
import './BookmarkPanel.css';

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  onJump: (time: number) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

export const BookmarkPanel: React.FC<BookmarkPanelProps> = ({ 
  bookmarks, 
  onJump, 
  onEdit, 
  onDelete, 
  onAdd, 
  onClose 
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const [deviceState, setDeviceState] = useState(() => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isLandscape: false, width: 1200, height: 800 };
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const minDim = Math.min(w, h);
    const mobile = isMobileDevice() || minDim <= 600 || h <= 650 || w <= 900;
    const landscape = w > h || h <= 600;
    return { isMobile: mobile, isLandscape: landscape, width: w, height: h };
  });

  useEffect(() => {
    const checkDevice = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const minDim = Math.min(w, h);
      const mobile = isMobileDevice() || minDim <= 600 || h <= 650 || w <= 900;
      const landscape = w > h || h <= 600;
      setDeviceState({ isMobile: mobile, isLandscape: landscape, width: w, height: h });
    };

    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);
    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  const isMobile = deviceState.isMobile;
  const isLandscape = deviceState.isLandscape;

  const getPortalTarget = () => {
    if (typeof document === 'undefined') return null;
    return (document.fullscreenElement as HTMLElement) || document.body;
  };

  const sortedBookmarks = useMemo(() => {
    return deduplicateBookmarks(bookmarks);
  }, [bookmarks]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
    return `${s}s`;
  };

  const getTimeDisplay = (bm: Bookmark) => {
    if (bm.endTime && bm.endTime > bm.time) {
      const duration = bm.endTime - bm.time;
      return `${formatTime(bm.time)} → ${formatTime(bm.endTime)} · ${formatDuration(duration)}`;
    }
    return formatTime(bm.time);
  };

  const getItemMeta = (bm: Bookmark) => {
    const isIntro = bm.category === 'Intro' || bm.isIntro || bm.category === 'Preview' || bm.category === 'Recap';
    const isOutro = bm.category === 'Outro' || bm.isOutro;
    const isHot = bm.category === 'Hot Scene' || bm.category === 'Nudity' || bm.category === 'Sex';

    let title = bm.title || bm.label;
    if (!title || title === 'Untitled Bookmark') {
      if (isIntro) title = 'Intro';
      else if (isOutro) title = 'Credits / Outro';
      else title = 'Bookmark';
    } else if (isOutro && (title.toLowerCase() === 'outro' || title.toLowerCase() === 'credits')) {
      title = 'Credits / Outro';
    }

    const createdBy = (bm.createdBy as string) || '';
    const isIntroDb = createdBy === 'theintrodb' || createdBy === 'tidb' || bm.id.startsWith('introdb-') || bm.id.startsWith('api-');
    const isDatabase = createdBy === 'database' || createdBy === 'system' || bm.id.startsWith('bm-intro-') || bm.id.startsWith('bm-outro-');

    let badgeText = 'MINE';
    let badgeClass = 'badge-mine';

    if (isIntroDb) {
      badgeText = 'INTRODB';
      badgeClass = 'badge-introdb';
    } else if (isDatabase) {
      badgeText = isIntro || isOutro ? 'INTRODB' : 'DATABASE';
      badgeClass = isIntro || isOutro ? 'badge-introdb' : 'badge-database';
    }

    let boxClass = 'type-box-bookmark';
    let icon = <BookmarkIcon size={20} color="#c084fc" />;

    if (isIntro) {
      boxClass = 'type-box-intro';
      icon = <SkipForward size={20} color="#38bdf8" />;
    } else if (isOutro) {
      boxClass = 'type-box-outro';
      icon = <Flag size={20} color="#fbbf24" />;
    } else if (isHot) {
      boxClass = 'type-box-hot';
      icon = <Flame size={20} color="#f87171" />;
    }

    return { title, badgeText, badgeClass, boxClass, icon };
  };

  // Desktop Repositioning
  useEffect(() => {
    if (isMobile) return;
    const handleReposition = () => {
      const el = panelRef.current;
      if (!el) return;
      el.style.transform = '';
      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      if (rect.right > viewportWidth - 16) {
        const overflow = rect.right - (viewportWidth - 16);
        el.style.transform = `translateX(-${overflow}px)`;
      } else if (rect.left < 16) {
        const overflow = 16 - rect.left;
        el.style.transform = `translateX(${overflow}px)`;
      }
    };

    handleReposition();
    const timer = setTimeout(handleReposition, 50);
    window.addEventListener('resize', handleReposition);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleReposition);
    };
  }, [bookmarks, isMobile]);

  const renderHeader = () => (
    <div className="bookmark-panel-header">
      <div className="bookmark-panel-header-left">
        <div className="bookmark-panel-icon-box">
          <BookmarkIcon size={20} color="#b490fc" />
        </div>
        <div className="bookmark-panel-title-group">
          <h2 className="bookmark-panel-title">Bookmarks</h2>
          <span className="bookmark-panel-subtitle">
            {sortedBookmarks.length === 1 ? '1 saved in this video' : `${sortedBookmarks.length} saved in this video`}
          </span>
        </div>
      </div>
      <button 
        type="button"
        onClick={onClose}
        className="bookmark-panel-close-btn"
        title="Close"
        aria-label="Close bookmarks panel"
      >
        <X size={18} />
      </button>
    </div>
  );

  const renderAddButton = () => (
    <button 
      type="button"
      onClick={onAdd}
      className="bookmark-add-time-btn"
    >
      <Plus size={18} strokeWidth={2.4} />
      <span>Bookmark current time</span>
    </button>
  );

  const renderBookmarkList = () => (
    <div className="bookmark-panel-list">
      {sortedBookmarks.length === 0 ? (
        <div className="bookmark-empty-state">
          <div className="bookmark-empty-icon-box">
            <BookmarkIcon size={28} color="#b490fc" />
          </div>
          <p className="bookmark-empty-title">No bookmarks yet</p>
          <span className="bookmark-empty-subtitle">Save memorable moments or intro/outro skips while watching.</span>
        </div>
      ) : (
        sortedBookmarks.map((bm) => {
          const { title, badgeText, badgeClass, boxClass, icon } = getItemMeta(bm);
          const timeDisplay = getTimeDisplay(bm);

          return (
            <div 
              key={bm.id}
              className="bookmark-card"
              onClick={() => onJump(bm.time)}
              title="Click to jump to time"
            >
              {/* Left Type Icon */}
              <div className={`bookmark-type-box ${boxClass}`}>
                {icon}
              </div>

              {/* Middle Info */}
              <div className="bookmark-info">
                <div className="bookmark-info-top">
                  <span className="bookmark-item-title" title={title}>
                    {title}
                  </span>
                  {bm.favorite && (
                    <Heart size={13} fill="#f43f5e" color="#f43f5e" style={{ flexShrink: 0 }} />
                  )}
                  <span className={`bookmark-source-badge ${badgeClass}`}>
                    {badgeText}
                  </span>
                </div>
                <div className="bookmark-info-bottom">
                  {timeDisplay}
                </div>
                {bm.description && (
                  <div className="bookmark-item-description">
                    {bm.description}
                  </div>
                )}
              </div>

              {/* Right Actions */}
              <div className="bookmark-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onEdit(bm)}
                  className="bookmark-action-icon-btn"
                  title="Edit bookmark"
                  aria-label="Edit bookmark"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(bm.id)}
                  className="bookmark-action-icon-btn delete-btn"
                  title="Delete bookmark"
                  aria-label="Delete bookmark"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onJump(bm.time)}
                  className="bookmark-play-btn"
                  title="Jump to time"
                  aria-label="Jump to time"
                >
                  <Play size={14} fill="#111319" color="#111319" style={{ marginLeft: '2px' }} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  // --- MOBILE RENDER (Landscape Right Drawer or Portrait Bottom Sheet) ---
  if (isMobile) {
    const panelContent = (
      <div 
        className={`bookmark-mobile-backdrop ${isLandscape ? 'is-landscape' : 'is-portrait'}`}
        onClick={onClose}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Bookmarks"
      >
        <div 
          ref={panelRef}
          className={`bookmark-mobile-panel ${isLandscape ? 'bookmark-mobile-landscape' : 'bookmark-mobile-portrait'}`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!isLandscape && <div className="bookmark-sheet-handle" />}
          {renderHeader()}
          {renderAddButton()}
          {renderBookmarkList()}
        </div>
      </div>
    );

    const target = getPortalTarget();
    return target ? createPortal(panelContent, target) : panelContent;
  }

  // --- DESKTOP RENDER: ANCHORED POPOVER ---
  return (
    <div 
      ref={panelRef}
      className="bookmarks-popover animate-fade-in"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Hover bridge spacer to keep popover open when cursor moves from button to popover */}
      <div style={{ position: 'absolute', bottom: '-25px', left: 0, right: 0, height: '25px', background: 'transparent', pointerEvents: 'auto' }} />
      {renderHeader()}
      {renderAddButton()}
      {renderBookmarkList()}
    </div>
  );
};