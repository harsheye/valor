import React, { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Unlock, Terminal, X, Tv, Zap } from 'lucide-react';
import { sidecarService } from '../../services/remote/sidecarService';

export interface PlayerTopBarProps {
  title: string;
  episodeInfo?: string;
  onBack: () => void;
  currentMode?: 'simple' | 'server';
  onSwitchMode?: (mode: 'simple' | 'server') => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  showConsole?: boolean;
  onToggleConsole?: () => void;
  onClose?: () => void;
  onOpenCompanion?: () => void;
}

export const PlayerTopBar: React.FC<PlayerTopBarProps> = ({
  title,
  episodeInfo,
  onBack,
  currentMode = 'simple',
  onSwitchMode,
  isLocked = false,
  onToggleLock,
  showConsole,
  onToggleConsole,
  onClose,
  onOpenCompanion
}) => {
  const [isSidecarActive, setIsSidecarActive] = useState<boolean>(() => sidecarService.isEnabled());

  useEffect(() => {
    const unsub = sidecarService.subscribe(s => setIsSidecarActive(s.isAvailable));
    return () => unsub();
  }, []);
  return (
    <div
      className="player-top-bar"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '20px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--player-overlay-gradient-top, linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%))',
        zIndex: 100,
        pointerEvents: 'auto',
        userSelect: 'none'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Left: Back & Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            flexShrink: 0
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--card-hover-bg, rgba(255, 255, 255, 0.18))';
            e.currentTarget.style.borderColor = 'var(--accent-color, #e50914)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.12))';
          }}
          title="Back (Esc)"
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h1 style={{
            fontSize: '18px',
            fontWeight: 700,
            margin: 0,
            color: 'var(--text-primary, #ffffff)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--font-sans)'
          }}>
            {title}
          </h1>
          {episodeInfo && (
            <span style={{
              fontSize: '13px',
              color: 'var(--text-muted, #9ca3af)',
              marginTop: '2px',
              fontWeight: 500
            }}>
              {episodeInfo}
            </span>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Switch Mode Pill */}
        {onSwitchMode && (
          <button
            onClick={() => onSwitchMode(currentMode === 'simple' ? 'server' : 'simple')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface, rgba(18, 18, 28, 0.75))',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
              borderRadius: '20px',
              padding: '6px 14px',
              color: 'var(--text-secondary, #d1d5db)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent-color, #e50914)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.15))';
              e.currentTarget.style.color = 'var(--text-secondary, #d1d5db)';
            }}
            title={currentMode === 'simple' ? 'Switch to Server Player (AC3/DTS audio & advanced subs)' : 'Switch to Fast Simple HTML5'}
          >
            {currentMode === 'simple' ? <Tv size={14} color="var(--accent-color, #e50914)" /> : <Zap size={14} color="#06b6d4" />}
            <span>{currentMode === 'simple' ? 'Switch to Movies/TV Engine' : 'Simple Player'}</span>
          </button>
        )}

        {/* Lock UI Button */}
        {onToggleLock && (
          <button
            onClick={onToggleLock}
            style={{
              background: 'transparent',
              border: 'none',
              color: isLocked ? 'var(--accent-color, #e50914)' : 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px'
            }}
            title={isLocked ? 'Unlock UI' : 'Lock UI'}
          >
            {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
        )}

        {/* Companion Engine Status Badge */}
        {onOpenCompanion && (
          <button 
            onClick={onOpenCompanion}
            title={isSidecarActive 
              ? "⚡ Running via Local Companion Engine (127.0.0.1:45454) - Zero server load. Click to manage." 
              : "☁️ Running via Central Server Relay - Click to install Local Companion Engine for 0% server lag"}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: isSidecarActive ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(148, 163, 184, 0.3)',
              backgroundColor: isSidecarActive ? 'rgba(16, 185, 129, 0.18)' : 'rgba(30, 41, 59, 0.7)',
              color: isSidecarActive ? '#34d399' : '#94a3b8',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
              letterSpacing: '0.02em',
              marginRight: '4px'
            }}
          >
            <Zap size={13} color={isSidecarActive ? '#34d399' : '#94a3b8'} />
            <span>{isSidecarActive ? 'Local Engine' : 'Server Mode'}</span>
          </button>
        )}

        {/* Console Overlay Toggle */}
        {onToggleConsole && (
          <button
            onClick={onToggleConsole}
            style={{
              background: 'transparent',
              border: 'none',
              color: showConsole ? 'var(--accent-color, #e50914)' : 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px'
            }}
            title="Stream Stats Console"
          >
            <Terminal size={18} />
          </button>
        )}

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px'
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
};
