import React, { useState } from 'react';
import { Tv, Zap, X, Film } from 'lucide-react';

export interface PlaybackModeModalProps {
  isOpen: boolean;
  videoTitle?: string;
  onSelectMode: (mode: 'simple' | 'server', remember: boolean) => void;
  onClose?: () => void;
  currentMode?: 'simple' | 'server' | null;
}

export const PlaybackModeModal: React.FC<PlaybackModeModalProps> = ({
  isOpen,
  videoTitle = 'Remote Media',
  onSelectMode,
  onClose,
  currentMode = null,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!isOpen) return null;

  return (
    <div 
      className="playback-mode-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'var(--overlay-bg, rgba(0, 0, 0, 0.75))',
        backdropFilter: 'var(--glass-blur, blur(16px))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={e => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div 
        className="playback-mode-modal-container"
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--card-bg, #161622)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-xl, 0 20px 45px rgba(0, 0, 0, 0.6))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-primary, #ffffff)',
          fontFamily: 'var(--font-sans)',
          userSelect: 'none',
          padding: '24px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Film size={16} color="var(--accent-color, #e50914)" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-color, #e50914)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Playback Engine
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary, #ffffff)' }}>
              Choose Playback Mode
            </h3>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-muted, #9ca3af)',
              margin: '4px 0 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '330px'
            }}>
              {videoTitle}
            </p>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #9ca3af)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px'
              }}
              title="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Buttons List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {/* Button 1: Movies & TV Shows (Server Remote Player) */}
          <button
            onClick={() => onSelectMode('server', rememberChoice)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              background: 'var(--surface, #12121a)',
              cursor: 'pointer',
              color: 'var(--text-primary, #ffffff)',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--card-hover-bg, #222234)';
              e.currentTarget.style.borderColor = 'var(--accent-color, #e50914)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--surface, #12121a)';
              e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.1))';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--accent-glow, rgba(229, 9, 20, 0.25))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-color, #e50914)',
              flexShrink: 0
            }}>
              <Tv size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                Movies & TV Shows
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', marginTop: '2px' }}>
                Server decoding for AC3/DTS audio & subtitles
              </div>
            </div>
          </button>

          {/* Button 2: Simple Video (Direct HTML5) */}
          <button
            onClick={() => onSelectMode('simple', rememberChoice)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              background: 'var(--surface, #12121a)',
              cursor: 'pointer',
              color: 'var(--text-primary, #ffffff)',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--card-hover-bg, #222234)';
              e.currentTarget.style.borderColor = 'var(--border-focus, rgba(255, 255, 255, 0.25))';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--surface, #12121a)';
              e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.1))';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--surface-elevated, #161622)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary, #d1d5db)',
              flexShrink: 0
            }}>
              <Zap size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                Simple Videos & Clips
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)', marginTop: '2px' }}>
                Fast direct HTML5 playback for MP4/WebM
              </div>
            </div>
          </button>
        </div>

        {/* Remember choice toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '2px' }}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={e => setRememberChoice(e.target.checked)}
            style={{ accentColor: 'var(--accent-color, #e50914)', width: '15px', height: '15px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #9ca3af)' }}>
            Remember choice for unrecognized videos
          </span>
        </label>
      </div>
    </div>
  );
};
