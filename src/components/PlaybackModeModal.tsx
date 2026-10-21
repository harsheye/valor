import React, { useState } from 'react';
import { Tv, Zap, X, Film } from 'lucide-react';
import { Button } from './ui/button';

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
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
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
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          userSelect: 'none',
          padding: '24px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <Film size={16} color="#a78bfa" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Playback Engine
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Choose Playback Mode
            </h3>
            <p style={{
              fontSize: '12px',
              color: '#94a3b8',
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
                color: '#94a3b8',
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
              border: '1px solid rgba(139, 92, 246, 0.4)',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(15, 23, 42, 0.8))',
              cursor: 'pointer',
              color: '#ffffff',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.15)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(30, 41, 59, 0.9))';
              e.currentTarget.style.borderColor = '#8b5cf6';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(15, 23, 42, 0.8))';
              e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(139, 92, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c4b5fd',
              flexShrink: 0
            }}>
              <Tv size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                Movies & TV Shows
              </div>
              <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
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
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(30, 41, 59, 0.5)',
              cursor: 'pointer',
              color: '#ffffff',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(30, 41, 59, 0.85)';
              e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.5)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(6, 182, 212, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22d3ee',
              flexShrink: 0
            }}>
              <Zap size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                Simple Videos & Clips
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
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
            style={{ accentColor: '#8b5cf6', width: '15px', height: '15px', cursor: 'pointer' }}
          />
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            Remember choice for unrecognized videos
          </span>
        </label>
      </div>
    </div>
  );
};
