import React, { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import type { Bookmark } from '../types/media';

interface BookmarkModalProps {
  initialTime: number;
  initialEndTime?: number;
  initialBookmark?: Bookmark;
  videoElement: HTMLVideoElement | null;
  videoTitle?: string;
  onSave: (bm: Partial<Bookmark>) => void;
  onClose: () => void;
}

export const BookmarkModal: React.FC<BookmarkModalProps> = ({ 
  initialTime, 
  initialEndTime,
  initialBookmark,
  videoElement,
  videoTitle,
  onSave, 
  onClose 
}) => {
  const [newBookmarkLabel, setNewBookmarkLabel] = useState(initialBookmark?.title || initialBookmark?.label || '');
  const [bookmarkType, setBookmarkType] = useState<'nudity' | 'sex' | 'gore' | 'intro' | 'outro' | 'custom'>(
    initialBookmark?.category === 'Nudity' ? 'nudity' : 
    initialBookmark?.category === 'Sex' ? 'sex' : 
    initialBookmark?.category === 'Gore' ? 'gore' : 
    initialBookmark?.category === 'Intro' ? 'intro' : 
    initialBookmark?.category === 'Outro' ? 'outro' : 'custom'
  );
  
  const [showAdjustTimes, setShowAdjustTimes] = useState(false);
  
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const parseTimeStringToSeconds = (val: string): number => {
    const clean = val.replace(/[^0-9:]/g, '');
    const parts = clean.split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    const parsed = parseInt(clean, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  const [startTimeStr, setStartTimeStr] = useState(formatTime(initialBookmark?.time ?? initialTime));
  const [endTimeStr, setEndTimeStr] = useState(formatTime(initialBookmark?.endTime ?? (initialEndTime || initialTime + 90)));
  const [newBookmarkTime, setNewBookmarkTime] = useState(initialBookmark?.time ?? initialTime);
  const [newBookmarkEndTime, setNewBookmarkEndTime] = useState(initialBookmark?.endTime ?? (initialEndTime || initialTime + 90));
  
  const [thumbnail, setThumbnail] = useState(initialBookmark?.thumbnail || '');

  useEffect(() => {
    if (!initialBookmark && videoElement && !thumbnail) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = (480 / videoElement.videoWidth) * videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          setThumbnail(canvas.toDataURL('image/jpeg', 0.6));
        }
      } catch (e) {
        console.warn('Failed to capture thumbnail', e);
      }
    }
  }, [videoElement, initialBookmark, thumbnail]);

  const handleSaveBookmark = () => {
    let finalCategory = 'Custom';
    if (bookmarkType === 'nudity') finalCategory = 'Nudity';
    if (bookmarkType === 'sex') finalCategory = 'Sex';
    if (bookmarkType === 'gore') finalCategory = 'Gore';
    if (bookmarkType === 'intro') finalCategory = 'Intro';
    if (bookmarkType === 'outro') finalCategory = 'Outro';

    onSave({
      title: newBookmarkLabel || finalCategory || 'Untitled Bookmark',
      label: newBookmarkLabel || finalCategory || 'Untitled Bookmark',
      description: '',
      category: finalCategory,
      favorite: initialBookmark?.favorite || false,
      thumbnail: thumbnail,
      time: newBookmarkTime,
      endTime: (bookmarkType !== 'outro') ? newBookmarkEndTime : undefined,
      createdAt: initialBookmark?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  const presets = [
    { value: 'nudity', label: 'Nudity' },
    { value: 'sex', label: 'Sex' },
    { value: 'gore', label: 'Gore' },
    { value: 'intro', label: 'Intro' },
    { value: 'outro', label: 'Outro' },
    { value: 'custom', label: 'Custom' }
  ];

  const handlePresetSelect = (val: 'nudity' | 'sex' | 'gore' | 'intro' | 'outro' | 'custom') => {
    setBookmarkType(val);
    const matchedLabel = presets.find(p => p.value === val)?.label || 'Custom';
    setNewBookmarkLabel(matchedLabel);
  };

  return (
    <div 
      className="bookmark-dialog-overlay custom-overlay-anim" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--overlay-bg)',
        backdropFilter: 'var(--glass-blur)',
        zIndex: 9999,
      }}
    >
      <style>{`
        @keyframes customFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes customScaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .custom-overlay-anim {
          animation: customFadeIn 0.2s ease forwards;
        }
        .custom-box-anim {
          animation: customScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .preset-btn {
          background: var(--surface);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          font-family: inherit;
        }
        .preset-btn:hover {
          background: var(--card-hover-bg);
          color: var(--text-primary);
        }
        .preset-btn.active {
          background: var(--accent-glow);
          border-color: var(--accent-color);
          color: var(--accent-color);
          box-shadow: var(--shadow-sm);
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: '24px',
          transform: 'translateY(-50%)',
          zIndex: 10000,
        }}
      >
        <div 
          className="bookmark-dialog-box custom-box-anim" 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '380px',
            maxWidth: 'calc(100vw - 48px)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            fontFamily: 'var(--font-sans)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1, marginRight: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Mark Scene
              </h2>
              {videoTitle && (
                <span 
                  style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-muted)', 
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: 'block'
                  }}
                  title={videoTitle}
                >
                  {videoTitle}
                </span>
              )}
            </div>
            <button 
              onClick={onClose}
              style={{ 
                background: 'var(--surface)', 
                border: '1px solid var(--border-subtle)', 
                color: 'var(--text-primary)', 
                cursor: 'pointer', 
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-hover-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.92rem',
            color: 'var(--text-primary)',
            fontWeight: 600,
            width: 'fit-content',
            margin: '0 auto',
            border: '1px solid var(--border-subtle)'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)', boxShadow: '0 0 8px var(--accent-color)' }} />
            <span>{startTimeStr} {bookmarkType !== 'outro' ? ` - ${endTimeStr}` : ''}</span>
          </div>

          <p style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: '1.4',
            margin: '0 0 0.25rem 0',
            fontStyle: 'normal',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '0.75rem'
          }}>
            See a scene others should skip? Tap once to start, tap again to end, 2 clicks! Your mark helps everyone watching the same movie or show.
          </p>

          <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>What type of scene is this?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  className={`preset-btn ${bookmarkType === preset.value ? 'active' : ''}`}
                  onClick={() => handlePresetSelect(preset.value as any)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Scene Title / Label</label>
            <input 
              type="text" 
              style={{
                width: '100%',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '8px',
                padding: '0.75rem',
                color: 'var(--input-text)',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-color)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--input-border)'}
              value={newBookmarkLabel} 
              onChange={(e) => setNewBookmarkLabel(e.target.value)}
              placeholder="e.g. Action Scene"
            />
          </div>

          {/* Adjust segment duration toggle */}
          <div style={{ marginTop: '0.2rem' }}>
            <button
              onClick={() => setShowAdjustTimes(!showAdjustTimes)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Settings size={12} />
              <span>{showAdjustTimes ? 'Hide time adjustments' : 'Adjust times manually'}</span>
            </button>

            {showAdjustTimes && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.75rem', animation: 'customFadeIn 0.2s ease forwards' }}>
                <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Start Time</label>
                  <input 
                    type="text" 
                    style={{
                      width: '100%',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                    value={startTimeStr} 
                    onChange={(e) => {
                      setStartTimeStr(e.target.value);
                      setNewBookmarkTime(parseTimeStringToSeconds(e.target.value));
                    }}
                  />
                </div>

                <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', opacity: (bookmarkType !== 'outro') ? 1 : 0.5, pointerEvents: (bookmarkType !== 'outro') ? 'auto' : 'none' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>End Time</label>
                  <input 
                    type="text" 
                    style={{
                      width: '100%',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      color: 'var(--input-text)',
                      fontSize: '0.9rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                    value={endTimeStr} 
                    onChange={(e) => {
                      setEndTimeStr(e.target.value);
                      setNewBookmarkEndTime(parseTimeStringToSeconds(e.target.value));
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button 
              onClick={onClose}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-secondary)',
                padding: '0.7rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-hover-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveBookmark}
              style={{
                background: 'var(--accent-color)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--btn-text-color, #ffffff)',
                padding: '0.7rem 1.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-md)',
                transition: 'background 0.2s, transform 0.1s',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent-color)'}
              onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
              onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              Save Mark
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
