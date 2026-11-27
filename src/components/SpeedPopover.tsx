import React from 'react';

interface SpeedPopoverProps {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
}

export const SpeedPopover: React.FC<SpeedPopoverProps> = ({ playbackRate, setPlaybackRate, videoRef, onClose }) => {
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const applySpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setPlaybackRate(speed);
    onClose();
  };

  return (
    <div
      className="speed-popover-container animate-fade-in-pure"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: '100%',
        right: 0,
        marginBottom: '12px',
        background: 'var(--dropdown-bg, rgba(18, 20, 26, 0.92))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--dropdown-border, rgba(255, 255, 255, 0.14))',
        borderRadius: '12px',
        padding: '12px 16px',
        minWidth: '340px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--text-primary, #fff)',
        }}
      >
        <span>Playback Speed</span>
        <span style={{ color: 'var(--accent-color, #8b5cf6)' }}>{playbackRate}x</span>
      </div>

      {/* Landscape horizontal speed rail */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '4px',
          borderRadius: '8px',
        }}
      >
        {speeds.map((speed) => {
          const active = Math.abs(playbackRate - speed) < 0.01;
          return (
            <button
              key={speed}
              onClick={() => applySpeed(speed)}
              style={{
                flex: 1,
                background: active ? 'var(--accent-color, #8b5cf6)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                padding: '7px 8px',
                color: active ? '#fff' : 'var(--text-secondary, rgba(255,255,255,0.78))',
                fontWeight: active ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {speed === 1 ? '1x' : `${speed}x`}
            </button>
          );
        })}
      </div>

      {/* Invisible bridge to prevent mouseleave on hover gap */}
      <div
        style={{
          position: 'absolute',
          bottom: '-14px',
          left: 0,
          right: 0,
          height: '14px',
          background: 'transparent',
          cursor: 'default',
        }}
      />
    </div>
  );
};
