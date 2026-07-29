import React from 'react';
import { Check } from 'lucide-react';

interface SpeedPopoverProps {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
}

export const SpeedPopover: React.FC<SpeedPopoverProps> = ({ playbackRate, setPlaybackRate, videoRef, onClose }) => {
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  return (
    <div className="speed-popover-container animate-fade-in-pure" style={{
      position: 'absolute',
      bottom: '100%',
      right: '50%',
      transform: 'translateX(50%)',
      marginBottom: '12px',
      background: 'rgba(20, 25, 30, 0.75)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '12px 0',
      width: '160px',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      zIndex: 100,
    }}>
      <div style={{
        padding: '0 16px 8px 16px',
        fontSize: '0.9rem',
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '4px',
        textAlign: 'center'
      }}>
        Playback Speed
      </div>
      
      {speeds.map(speed => (
        <button
          key={speed}
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.playbackRate = speed;
            }
            setPlaybackRate(speed);
            onClose();
          }}
          style={{
            background: playbackRate === speed ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: 'none',
            padding: '10px 16px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '1rem',
            transition: 'background 0.2s',
            position: 'relative'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = playbackRate === speed ? 'rgba(255,255,255,0.1)' : 'transparent'}
        >
          {playbackRate === speed && (
            <Check size={16} style={{ position: 'absolute', left: '16px' }} />
          )}
          
          <span style={{ fontWeight: playbackRate === speed ? '600' : '400' }}>
            {speed}x
          </span>
        </button>
      ))}

      {/* Invisible bridge to prevent mouseleave on hover gap */}
      <div style={{
        position: 'absolute',
        bottom: '-14px',
        left: 0,
        right: 0,
        height: '14px',
        background: 'transparent',
        cursor: 'default'
      }} />

      {/* Downward pointing caret */}
      <div style={{
        position: 'absolute',
        bottom: '-6px',
        left: '50%',
        transform: 'translateX(-50%) rotate(45deg)',
        width: '12px',
        height: '12px',
        background: 'rgba(20, 25, 30, 0.75)',
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: -1
      }} />
    </div>
  );
};
