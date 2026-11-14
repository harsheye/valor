import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings } from 'lucide-react';
import type { Bookmark } from '../types/media';
import { isMobileDevice } from '../utils/screenOrientation';

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

  const isLandscapeMobile = (deviceState.isMobile || deviceState.height <= 600) && deviceState.isLandscape;

  const getPortalTarget = () => {
    if (typeof document === 'undefined') return null;
    return (document.fullscreenElement as HTMLElement) || document.body;
  };

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

  const modalContent = (
    <div 
      className="bookmark-dialog-overlay custom-overlay-anim" 
      onClick={onClose}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--overlay-bg, rgba(0, 0, 0, 0.75))',
        backdropFilter: 'var(--glass-blur, blur(10px))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(10px))',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isLandscapeMobile ? '8px max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left))' : '16px',
        boxSizing: 'border-box'
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
          background: var(--surface, rgba(255, 255, 255, 0.05));
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-size: 0.88rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          font-family: inherit;
        }
        .preset-btn:hover {
          background: var(--card-hover-bg, rgba(255, 255, 255, 0.1));
          color: var(--text-primary, #ffffff);
        }
        .preset-btn.active {
          background: var(--accent-glow, rgba(229, 9, 20, 0.2));
          border-color: var(--accent-color, #e50914);
          color: var(--accent-color, #e50914);
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(0,0,0,0.3));
        }
      `}</style>
      
      <div 
        className="bookmark-dialog-box custom-box-anim" 
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card-bg, #141414)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
          borderRadius: '14px',
          padding: isLandscapeMobile ? '10px 16px' : '1.25rem',
          width: '100%',
          maxWidth: isLandscapeMobile ? 'min(620px, calc(100vw - 32px))' : '360px',
          maxHeight: isLandscapeMobile ? 'calc(100vh - 16px)' : 'min(90vh, 520px)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          gap: isLandscapeMobile ? '0.45rem' : '0.85rem',
          fontFamily: 'var(--font-sans, sans-serif)',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, marginRight: '10px' }}>
            <h2 style={{ margin: 0, fontSize: isLandscapeMobile ? '0.95rem' : '1.1rem', fontWeight: 700, color: 'var(--text-primary, #ffffff)', whiteSpace: 'nowrap' }}>
              Mark Scene
            </h2>

            {/* Time badge in header for landscape */}
            {isLandscapeMobile && (
              <div style={{
                background: 'var(--surface, rgba(255, 255, 255, 0.06))',
                borderRadius: '6px',
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                color: 'var(--text-primary, #ffffff)',
                fontWeight: 600,
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                whiteSpace: 'nowrap'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-color, #e50914)', boxShadow: '0 0 5px var(--accent-color, #e50914)' }} />
                <span>{startTimeStr} {bookmarkType !== 'outro' ? ` - ${endTimeStr}` : ''}</span>
              </div>
            )}

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
            type="button"
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
          >
            <X size={15} />
          </button>
        </div>

        {/* Time badge for portrait / desktop */}
        {!isLandscapeMobile && (
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
        )}

        {/* Content Layout: 2 Columns on Mobile Landscape, 1 Column on Portrait/Desktop */}
        {isLandscapeMobile ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '14px', alignItems: 'start' }}>
            {/* Left Column: Preset buttons */}
            <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Scene Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem' }}>
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`preset-btn ${bookmarkType === preset.value ? 'active' : ''}`}
                    onClick={() => handlePresetSelect(preset.value as any)}
                    style={{ padding: '0.35rem 0.25rem', fontSize: '0.75rem', borderRadius: '6px' }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: Title input, adjusters, actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Scene Title / Label
                </label>
                <input 
                  type="text" 
                  style={{
                    width: '100%',
                    background: 'var(--input-bg, rgba(0, 0, 0, 0.3))',
                    border: '1px solid var(--input-border, rgba(255, 255, 255, 0.15))',
                    borderRadius: '6px',
                    padding: '0.45rem 0.65rem',
                    color: 'var(--input-text, #ffffff)',
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                  value={newBookmarkLabel} 
                  onChange={(e) => setNewBookmarkLabel(e.target.value)}
                  placeholder="e.g. Action Scene"
                />
              </div>

              {/* Adjust segment duration toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdjustTimes(!showAdjustTimes)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, rgba(255, 255, 255, 0.5))',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit'
                  }}
                >
                  <Settings size={11} />
                  <span>{showAdjustTimes ? 'Hide time adjustments' : 'Adjust times manually'}</span>
                </button>

                {showAdjustTimes && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.35rem', animation: 'customFadeIn 0.2s ease forwards' }}>
                    <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted, rgba(255, 255, 255, 0.5))' }}>Start Time</label>
                      <input 
                        type="text" 
                        style={{
                          width: '100%',
                          background: 'var(--input-bg, rgba(0, 0, 0, 0.3))',
                          border: '1px solid var(--input-border, rgba(255, 255, 255, 0.15))',
                          borderRadius: '6px',
                          padding: '0.35rem 0.5rem',
                          color: 'var(--input-text, #ffffff)',
                          fontSize: '0.78rem',
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

                    <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: (bookmarkType !== 'outro') ? 1 : 0.5, pointerEvents: (bookmarkType !== 'outro') ? 'auto' : 'none' }}>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted, rgba(255, 255, 255, 0.5))' }}>End Time</label>
                      <input 
                        type="text" 
                        style={{
                          width: '100%',
                          background: 'var(--input-bg, rgba(0, 0, 0, 0.3))',
                          border: '1px solid var(--input-border, rgba(255, 255, 255, 0.15))',
                          borderRadius: '6px',
                          padding: '0.35rem 0.5rem',
                          color: 'var(--input-text, #ffffff)',
                          fontSize: '0.78rem',
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

              {/* Action Buttons */}
              <div className="dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button 
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'var(--surface, rgba(255, 255, 255, 0.06))',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                    borderRadius: '7px',
                    color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))',
                    padding: '0.4rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit'
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleSaveBookmark}
                  style={{
                    background: 'var(--accent-color, #e50914)',
                    border: 'none',
                    borderRadius: '7px',
                    color: '#ffffff',
                    padding: '0.4rem 1.1rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-md, 0 4px 12px rgba(229, 9, 20, 0.3))',
                    fontFamily: 'inherit'
                  }}
                >
                  Save Mark
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Portrait & Desktop Flow */
          <>
            <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary, rgba(255, 255, 255, 0.7))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Scene Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
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
                value={newBookmarkLabel} 
                onChange={(e) => setNewBookmarkLabel(e.target.value)}
                placeholder="e.g. Action Scene"
              />
            </div>

            {/* Adjust segment duration toggle */}
            <div style={{ marginTop: '0.1rem' }}>
              <button
                type="button"
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
                type="button"
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
                  fontFamily: 'inherit'
                }}
              >
                Cancel
              </button>
              <button 
                type="button"
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
                  boxShadow: 'var(--shadow-md, 0 4px 12px rgba(229, 9, 20, 0.3))',
                  fontFamily: 'inherit'
                }}
              >
                Save Mark
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const target = getPortalTarget();
  return target ? createPortal(modalContent, target) : modalContent;
};
