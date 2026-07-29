import React, { useMemo } from 'react';
import { Pencil, Trash, Play, Bookmark as BookmarkIcon, Heart, Clock, X } from 'lucide-react';
import type { Bookmark } from '../types/media';

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  onJump: (time: number) => void;
  onEdit: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

export const BookmarkPanel: React.FC<BookmarkPanelProps> = ({ bookmarks, onJump, onEdit, onDelete, onAdd, onClose }) => {
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

  return (
    <div 
      className="animate-fade-in"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: '50px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 150,
        width: '380px',
        maxHeight: '400px',
        background: 'var(--dropdown-bg, rgba(18, 18, 18, 0.88))',
        backdropFilter: 'blur(25px)',
        WebkitBackdropFilter: 'blur(25px)',
        border: '1px solid var(--dropdown-border, rgba(255, 255, 255, 0.12))',
        borderRadius: '12px',
        boxShadow: '0 15px 40px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--dropdown-text, white)',
        padding: '0',
        overflow: 'hidden'
      }}
    >
      {/* Hover bridge spacer to keep popover open when cursor moves from button to popover */}
      <div style={{ position: 'absolute', bottom: '-25px', left: 0, right: 0, height: '25px', background: 'transparent', pointerEvents: 'auto' }} />
      <div style={{ padding: '32px 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.05))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookmarkIcon size={22} color="var(--accent-color, #e50914)" />
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>Bookmarks</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={onAdd}
            style={{ background: 'var(--accent-glow, rgba(229, 9, 20, 0.1))', color: 'var(--accent-color, #e50914)', border: 'none', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-glow)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-glow)'}
          >
            + New
          </button>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary, rgba(255,255,255,0.6))', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
            title="Close Panel"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {sortedBookmarks.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted, rgba(255,255,255,0.4))', textAlign: 'center', gap: '12px' }}>
            <BookmarkIcon size={48} strokeWidth={1} />
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '16px', color: 'var(--text-secondary, rgba(255,255,255,0.8))', fontWeight: 500 }}>No bookmarks yet</p>
              <span style={{ fontSize: '13px' }}>Save memorable moments while watching.</span>
            </div>
            <button 
              onClick={onAdd}
              style={{ marginTop: '16px', background: 'var(--accent-color, #e50914)', color: 'var(--btn-text-color, white)', border: 'none', padding: '10px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 4px 12px rgba(229, 9, 20, 0.3)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover, #f40b17)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-color, #e50914)'}
            >
              Create First Bookmark
            </button>
          </div>
        ) : (
          sortedBookmarks.map(bm => (
            <div 
              key={bm.id}
              style={{ 
                background: 'var(--border-subtle, rgba(255,255,255,0.03))', 
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.05))', 
                borderRadius: '16px', 
                padding: '16px',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--surface-hover)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--border-subtle)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {bm.category === 'Movie Scene' && '🎬 '}
                      {bm.category === 'Action' && '💥 '}
                      {bm.category === 'Funny' && '😂 '}
                      {bm.category === 'Hot Scene' && '🔥 '}
                      {bm.category === 'Outro' && '🏁 '}
                      {bm.title || bm.label || 'Untitled Bookmark'}
                    </span>
                    {bm.favorite && <Heart size={14} fill="var(--accent-color, #e50914)" color="var(--accent-color, #e50914)" style={{ flexShrink: 0 }} />}
                    {(() => {
                      const createdBy = bm.createdBy;
                      let label = 'Manual';
                      let color = '#34d399'; // green
                      let bg = 'rgba(52, 211, 153, 0.12)';
                      
                      if ((createdBy as string) === 'theintrodb' || (createdBy as string) === 'tidb' || bm.id.startsWith('api-')) {
                        label = 'TheIntroDB';
                        color = '#60a5fa'; // blue
                        bg = 'rgba(96, 165, 250, 0.12)';
                      } else if (createdBy === 'system' || bm.id.startsWith('bm-intro-') || bm.id.startsWith('bm-outro-') || bm.isIntro || bm.isOutro) {
                        label = 'System';
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color, #e50914)', fontSize: '13px', fontWeight: 600 }}>
                    <Clock size={12} />
                    {formatTime(bm.time)}
                    {bm.endTime ? ` → ${formatTime(bm.endTime)}` : ''}
                  </div>
                  {(bm.userName || bm.userTime) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted, rgba(255,255,255,0.45))', fontSize: '11px', marginTop: '2px' }}>
                      {bm.userName && <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>👤 {bm.userName}</span>}
                      {bm.userTime && <span>• 📅 {new Date(bm.userTime).toLocaleDateString()}</span>}
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={() => onJump(bm.time)}
                  style={{ background: 'var(--text-primary, white)', color: 'var(--bg-primary, black)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'transform 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  title="Jump to time"
                >
                  <Play size={14} fill="var(--bg-primary, black)" style={{ marginLeft: '2px' }} />
                </button>
              </div>

              {bm.description && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary, rgba(255,255,255,0.6))', lineHeight: '1.4', background: 'var(--border-subtle, rgba(0,0,0,0.2))', padding: '8px 12px', borderRadius: '8px', borderLeft: '2px solid var(--border-color, rgba(255,255,255,0.1))' }}>
                  {bm.description}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button 
                  onClick={() => onEdit(bm)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--border-subtle, rgba(255,255,255,0.05))', border: 'none', color: 'var(--text-primary, white)', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--border-subtle)'}
                >
                  <Pencil size={12} /> Edit
                </button>
                <button 
                  onClick={() => onDelete(bm.id)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--danger-glow, rgba(239, 68, 68, 0.1))', border: 'none', color: 'var(--danger, #ef4444)', padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = 'white'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--danger-glow, rgba(239, 68, 68, 0.1))'; e.currentTarget.style.color = 'var(--danger)'; }}
                >
                  <Trash size={12} /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
