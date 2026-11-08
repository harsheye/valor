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
  const [bookmarkType, setBookmarkType] = useState<'nudity' | 'sex' | 'gore' | 'intro' | 'outro' | 'preview' | 'custom'>(
    initialBookmark?.category === 'Nudity' ? 'nudity' : 
    initialBookmark?.category === 'Sex' ? 'sex' : 
    initialBookmark?.category === 'Gore' ? 'gore' : 
    initialBookmark?.category === 'Intro' ? 'intro' : 
    initialBookmark?.category === 'Outro' ? 'outro' : 
    (initialBookmark?.category === 'Preview' || initialBookmark?.category === 'Recap') ? 'preview' : 'custom'
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
    if (bookmarkType === 'preview') finalCategory = 'Preview';

    onSave({
      title: newBookmarkLabel || finalCategory || 'Untitled Bookmark',
      label: newBookmarkLabel || finalCategory || 'Untitled Bookmark',
      description: '',
      category: finalCategory,
      isIntro: bookmarkType === 'intro' || bookmarkType === 'preview',
      isOutro: bookmarkType === 'outro',
      skipEnabled: bookmarkType === 'intro' || bookmarkType === 'outro' || bookmarkType === 'preview' || bookmarkType === 'nudity' || bookmarkType === 'sex',
      favorite: initialBookmark?.favorite || false,
      thumbnail: thumbnail,
      time: newBookmarkTime,
      endTime: (bookmarkType !== 'outro') ? newBookmarkEndTime : undefined,
      createdAt: initialBookmark?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  const presets = [
    { value: 'intro', label: 'Intro' },
    { value: 'outro', label: 'Outro' },
    { value: 'preview', label: 'Preview / Recap' },
    { value: 'nudity', label: 'Nudity' },
    { value: 'sex', label: 'Sex' },
    { value: 'gore', label: 'Gore' },
    { value: 'custom', label: 'Custom' }
  ];

  const handlePresetSelect = (val: 'nudity' | 'sex' | 'gore' | 'intro' | 'outro' | 'preview' | 'custom') => {
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '16px',
          boxSizing: 'border-box'
        }}
      >
        <div 
          className="bookmark-dialog-box custom-box-anim" 
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--card-bg, #141414)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
            borderRadius: '14px',
            padding: '1.25rem',
            width: '100%',
            maxWidth: '360px',
            maxHeight: 'min(90vh, 520px)',
            overflowY: 'auto',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            fontFamily: 'var(--font-sans, sans-serif)',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1, marginRight: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                Mark Scene
              </h2>
              {videoTitle && (
                <span 
                  style={{ 
                    fontSize: '0.72rem', 
                    color: 'var(--text-muted, rgba(255, 255, 255, 0.5))', 
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
                background: 'var(--surface, rgba(255, 255, 255, 0.06))', 
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))', 
                color: 'var(--text-primary, #ffffff)', 
                cursor: 'pointer', 
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
                flexShrink: 0
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-hover-bg, rgba(255, 255, 255, 0.12))'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface, rgba(255, 255, 255, 0.06))'}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{
            background: 'var(--surface, rgba(255, 255, 255, 0.05))',
            borderRadius: '8px',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            color: 'var(--text-primary, #ffffff)',
            fontWeight: 600,
            width: 'fit-content',
            margin: '0 auto',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))'
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-color, #e50914)', boxShadow: '0 0 6px var(--accent-color, #e50914)' }} />
            <span>{startTimeStr} {bookmarkType !== 'outro' ? ` - ${endTimeStr}` : ''}</span>
          </div>

          <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scene Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  className={`preset-btn ${bookmarkType === preset.value ? 'active' : ''}`}
                  onClick={() => handlePresetSelect(preset.value as any)}
                  style={{ padding: '0.45rem 0.35rem', fontSize: '0.78rem', borderRadius: '6px' }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scene Title / Label</label>
            <input 
              type="text" 
              style={{
                width: '100%',
                background: 'var(--input-bg, rgba(0, 0, 0, 0.3))',
                border: '1px solid var(--input-border, rgba(255, 255, 255, 0.15))',
                borderRadius: '8px',
                padding: '0.55rem 0.75rem',
                color: 'var(--input-text, #ffffff)',
                fontSize: '0.88rem',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent-color, #e50914)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--input-border, rgba(255, 255, 255, 0.15))'}
              value={newBookmarkLabel} 
              onChange={(e) => setNewBookmarkLabel(e.target.value)}
              placeholder="e.g. Action Scene"
            />
          </div>

          {/* Adjust segment duration toggle */}
          <div style={{ marginTop: '0.1rem' }}>
            <button
              onClick={() => setShowAdjustTimes(!showAdjustTimes)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, rgba(255, 255, 255, 0.5))',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                padding: 0,
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary, #ffffff)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted, rgba(255, 255, 255, 0.5))'}
            >
              <Settings size={12} />
              <span>{showAdjustTimes ? 'Hide time adjustments' : 'Adjust times manually'}</span>
            </button>

            {showAdjustTimes && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem', animation: 'customFadeIn 0.2s ease forwards' }}>
                <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted, rgba(255, 255, 255, 0.5))' }}>Start Time</label>
                  <input 
                    type="text" 
                    style={{
                      width: '100%',
                      background: 'var(--input-bg, rgba(0, 0, 0, 0.3))',
                      border: '1px solid var(--input-border, rgba(255, 255, 255, 0.15))',
                      borderRadius: '6px',
                      padding: '0.45rem 0.6rem',
                      color: 'var(--input-text, #ffffff)',
                      fontSize: '0.82rem',
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

                <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', opacity: (bookmarkType !== 'outro') ? 1 : 0.5, pointerEvents: (bookmarkType !== 'outro') ? 'auto' : 'none' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted, rgba(255, 255, 255, 0.5))' }}>End Time</label>
                  <input 
                    type="text" 
                    style={{
                      width: '100%',
                      background: 'var(--input-bg, rgba(0, 0, 0, 0.3))',
                      border: '1px solid var(--input-border, rgba(255, 255, 255, 0.15))',
                      borderRadius: '6px',
                      padding: '0.45rem 0.6rem',
                      color: 'var(--input-text, #ffffff)',
                      fontSize: '0.82rem',
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

          <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.3rem' }}>
            <button 
              onClick={onClose}
              style={{
                background: 'var(--surface, rgba(255, 255, 255, 0.06))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                borderRadius: '8px',
                color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))',
                padding: '0.5rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-hover-bg, rgba(255, 255, 255, 0.12))'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface, rgba(255, 255, 255, 0.06))'}
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveBookmark}
              style={{
                background: 'var(--accent-color, #e50914)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--btn-text-color, #ffffff)',
                padding: '0.5rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-md)',
                transition: 'background 0.2s, transform 0.1s',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-hover, #f40b17)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent-color, #e50914)'}
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
