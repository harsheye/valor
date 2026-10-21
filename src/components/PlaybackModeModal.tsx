import React, { useState } from 'react';
import { Zap, Tv, Film, Server, Check, X, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
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
  videoTitle = 'Remote Video',
  onSelectMode,
  onClose,
  currentMode = null,
}) => {
  const [selectedMode, setSelectedMode] = useState<'simple' | 'server'>(currentMode || 'server');
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onSelectMode(selectedMode, rememberChoice);
  };

  return (
    <div 
      className="playback-mode-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div 
        className="playback-mode-modal-container"
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(59, 130, 246, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          userSelect: 'none'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '24px 28px 20px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          background: 'linear-gradient(to right, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                background: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                PLAYBACK ENGINE
              </span>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>Select Engine Mode</span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              How would you like to play this media?
            </h2>
            <p style={{
              fontSize: '13px',
              color: '#94a3b8',
              margin: '6px 0 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '520px'
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
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
              title="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Modal Body / Selection Cards */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            
            {/* Card 1: Simple Media */}
            <div
              onClick={() => setSelectedMode('simple')}
              style={{
                cursor: 'pointer',
                padding: '20px',
                borderRadius: '16px',
                border: selectedMode === 'simple'
                  ? '2px solid #06b6d4'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: selectedMode === 'simple'
                  ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.12), rgba(15, 23, 42, 0.8))'
                  : 'rgba(30, 41, 59, 0.4)',
                boxShadow: selectedMode === 'simple'
                  ? '0 0 24px rgba(6, 182, 212, 0.2)'
                  : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: selectedMode === 'simple' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: selectedMode === 'simple' ? '#22d3ee' : '#94a3b8'
                  }}>
                    <Zap size={22} />
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '20px',
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: '#22d3ee',
                    border: '1px solid rgba(6, 182, 212, 0.3)'
                  }}>
                    Direct HTML5
                  </span>
                </div>

                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                  Simple Media
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 14px 0' }}>
                  Standard browser HTML5 video playback. Instant, lightweight, and zero server overhead.
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} color="#06b6d4" /> MP4, WebM clips & direct streams
                  </li>
                  <li style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} color="#06b6d4" /> Native browser hardware acceleration
                  </li>
                  <li style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} color="#06b6d4" /> Instant load & fast seeking
                  </li>
                </ul>
              </div>

              <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  border: selectedMode === 'simple' ? '6px solid #06b6d4' : '2px solid rgba(255, 255, 255, 0.2)',
                  background: '#0f172a',
                  transition: 'all 0.15s'
                }} />
              </div>
            </div>

            {/* Card 2: Movies & TV Shows */}
            <div
              onClick={() => setSelectedMode('server')}
              style={{
                cursor: 'pointer',
                padding: '20px',
                borderRadius: '16px',
                border: selectedMode === 'server'
                  ? '2px solid #8b5cf6'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                background: selectedMode === 'server'
                  ? 'linear-gradient(145deg, rgba(139, 92, 246, 0.14), rgba(15, 23, 42, 0.8))'
                  : 'rgba(30, 41, 59, 0.4)',
                boxShadow: selectedMode === 'server'
                  ? '0 0 24px rgba(139, 92, 246, 0.2)'
                  : 'none',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: selectedMode === 'server' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: selectedMode === 'server' ? '#a78bfa' : '#94a3b8'
                  }}>
                    <Tv size={22} />
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '20px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: '#a78bfa',
                    border: '1px solid rgba(139, 92, 246, 0.3)'
                  }}>
                    Server Engine
                  </span>
                </div>

                <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                  Movies & TV Shows
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 14px 0' }}>
                  Server-assisted player with FFmpeg audio transcoding, multi-track subtitles, and 240s buffer.
                </p>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} color="#8b5cf6" /> AC3, EAC3, DTS, 5.1/7.1 audio tracks
                  </li>
                  <li style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} color="#8b5cf6" /> Embedded WebVTT subtitle extraction
                  </li>
                  <li style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} color="#8b5cf6" /> 240s sliding window forward cache
                  </li>
                </ul>
              </div>

              <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  border: selectedMode === 'server' ? '6px solid #8b5cf6' : '2px solid rgba(255, 255, 255, 0.2)',
                  background: '#0f172a',
                  transition: 'all 0.15s'
                }} />
              </div>
            </div>

          </div>

          {/* Remember Choice Toggle */}
          <label 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              marginTop: '6px',
              padding: '6px 2px'
            }}
          >
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={e => setRememberChoice(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: '#8b5cf6',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            />
            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
              Remember this choice for remote videos (you can switch anytime from the player bar)
            </span>
          </label>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 28px 20px 28px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.95)'
        }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Tip: You can switch engines anytime without losing your position.
          </span>

          <div style={{ display: 'flex', gap: '12px' }}>
            {onClose && (
              <Button
                variant="ghost"
                onClick={onClose}
                style={{
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: '10px'
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={handleConfirm}
              style={{
                background: selectedMode === 'simple'
                  ? 'linear-gradient(135deg, #06b6d4, #0891b2)'
                  : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '14px',
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                boxShadow: selectedMode === 'simple'
                  ? '0 4px 15px rgba(6, 182, 212, 0.4)'
                  : '0 4px 15px rgba(139, 92, 246, 0.4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {selectedMode === 'simple' ? <Zap size={16} /> : <Tv size={16} />}
              Start Playback
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
