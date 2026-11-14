import React, { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash, Play, Bookmark as BookmarkIcon, Heart, Clock, X } from 'lucide-react';
import type { Bookmark } from '../types/media';
import { isMobileDevice } from '../utils/screenOrientation';
import './BookmarkPanel.css';

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  onJump: (time: number) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

export const BookmarkPanel: React.FC<BookmarkPanelProps> = ({ bookmarks, onJump, onEdit, onDelete, onAdd, onClose }) => {
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
    return [...bookmarks].sort((a, b) => a.time - b.time);
  }, [bookmarks]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
      
      // If overflowing the right edge of viewport, pull left
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

  // Shared Bookmark Item Renderer
  const renderBookmarkList = () => (
    <div className="bookmark-panel-list">
      {sortedBookmarks.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '140px', color: 'var(--bmp-text-muted)', textAlign: 'center', gap: '10px', padding: '16px' }}>
          <BookmarkIcon size={40} strokeWidth={1.5} color="var(--bmp-text-muted)" />
          <div>
            <p style={{ margin: '0 0 4px', fontSize: '15px', color: 'var(--bmp-text-sec)', fontWeight: 600 }}>No bookmarks yet</p>
            <span style={{ fontSize: '12px' }}>Save memorable moments while watching.</span>
          </div>
          <button 
            type="button"
            onClick={onAdd}
            style={{ marginTop: '12px', background: 'var(--bmp-accent)', color: '#ffffff', border: 'none', padding: '8px 18px', borderRadius: '12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 12px var(--bmp-accent-glow)' }}
          >
            Create First Bookmark
          </button>
        </div>
      ) : (
        sortedBookmarks.map(bm => (
          <div 
            key={bm.id}
            className="bookmark-item"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--bmp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {bm.category === 'Movie Scene' && '🎬 '}
                    {bm.category === 'Action' && '💥 '}
                    {bm.category === 'Funny' && '😂 '}
                    {bm.category === 'Hot Scene' && '🔥 '}
                    {bm.category === 'Outro' && '🏁 '}
                    {bm.category === 'Intro' && '⏩ '}
                    {(bm.category === 'Preview' || bm.category === 'Recap') && '⏱️ '}
                    {bm.category === 'Nudity' && '🔞 '}
                    {bm.category === 'Sex' && '❤️‍🔥 '}
                    {bm.category === 'Gore' && '🩸 '}
                    {bm.title || bm.label || 'Untitled Bookmark'}
                  </span>
                  {bm.favorite && <Heart size={14} fill="var(--bmp-accent)" color="var(--bmp-accent)" style={{ flexShrink: 0 }} />}
                  {(() => {
                    const createdBy = bm.createdBy;
                    let label = 'Manual';
                    let color = '#34d399'; // green
                    let bg = 'rgba(52, 211, 153, 0.12)';
                    
                    if ((createdBy as string) === 'theintrodb' || (createdBy as string) === 'tidb' || bm.id.startsWith('introdb-') || bm.id.startsWith('api-')) {
                      label = 'IntroDB';
                      color = '#60a5fa'; // blue
                      bg = 'rgba(96, 165, 250, 0.12)';
                    } else if (createdBy === 'database' || createdBy === 'system' || bm.id.startsWith('bm-intro-') || bm.id.startsWith('bm-outro-')) {
                      label = 'Database';
                      color = '#c084fc'; // purple
                      bg = 'rgba(192, 132, 252, 0.12)';
                    } else if (createdBy === 'manual') {
                      label = 'Manual';
                      color = '#34d399';
                      bg = 'rgba(52, 211, 153, 0.12)';
                    }
                    
                    return (
                      <span style={{ 
                        fontSize: '9px', 
                        fontWeight: 700, 
                        textTransform: 'uppercase', 
                        padding: '1px 5px', 
                        borderRadius: '4px', 
                        color, 
                        background: bg,
                        border: `1px solid ${color}22`,
                        letterSpacing: '0.5px',
                        display: 'inline-block',
                        flexShrink: 0
                      }}>
                        {label}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--bmp-accent)', fontSize: '13px', fontWeight: 600 }}>
                  <Clock size={12} />
                  {formatTime(bm.time)}
                  {bm.endTime ? ` → ${formatTime(bm.endTime)}` : ''}
                </div>
                {(bm.userName || bm.userTime) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bmp-text-muted)', fontSize: '11px', marginTop: '2px' }}>
                    {bm.userName && <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>👤 {bm.userName}</span>}
                    {bm.userTime && <span>• 📅 {new Date(bm.userTime).toLocaleDateString()}</span>}
                  </div>
                )}
              </div>
              
              <button 
                type="button"
                onClick={() => onJump(bm.time)}
                style={{ background: '#ffffff', color: '#000000', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'transform 0.2s' }}
                title="Jump to time"
              >
                <Play size={14} fill="#000000" style={{ marginLeft: '2px' }} />
              </button>
            </div>

            {bm.description && (
              <div style={{ fontSize: '12px', color: 'var(--bmp-text-sec)', lineHeight: '1.4', background: 'rgba(0,0,0,0.25)', padding: '6px 10px', borderRadius: '6px', borderLeft: '2px solid var(--bmp-border)' }}>
                {bm.description}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
              <button 
                type="button"
                onClick={() => onEdit(bm)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: 'var(--bmp-surface)', border: '1px solid var(--bmp-border-subtle)', color: 'var(--bmp-text)', padding: '6px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <Pencil size={12} /> Edit
              </button>
              <button 
                type="button"
                onClick={() => onDelete(bm.id)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '6px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                <Trash size={12} /> Delete
              </button>
            </div>
          </div>
        ))
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
          
          <div className="bookmark-panel-header">
            <div className="bookmark-panel-title">
              <BookmarkIcon size={18} color="var(--bmp-accent)" />
              <h2>Bookmarks ({bookmarks.length})</h2>
            </div>
            <div className="bookmark-panel-actions">
              <button 
                type="button"
                onClick={onAdd}
                className="bookmark-new-btn"
                title="Create a bookmark"
              >
                + New
              </button>
              <button 
                type="button"
                onClick={onClose}
                className="bookmark-close-btn"
                title="Close"
                aria-label="Close bookmarks panel"
              >
                <X size={15} />
              </button>
            </div>
          </div>

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
      
      <div className="bookmark-panel-header">
        <div className="bookmark-panel-title">
          <BookmarkIcon size={18} color="var(--bmp-accent)" />
          <h2>Bookmarks ({bookmarks.length})</h2>
        </div>
        <div className="bookmark-panel-actions">
          <button 
            type="button"
            onClick={onAdd}
            className="bookmark-new-btn"
          >
            + New
          </button>
          <button 
            type="button"
            onClick={onClose}
            className="bookmark-close-btn"
            title="Close Panel"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {renderBookmarkList()}
    </div>
  );
};
