import React from 'react';
import { Check } from 'lucide-react';

export interface SpeedMenuProps {
  currentSpeed: number;
  onSelectSpeed: (speed: number) => void;
  onClose: () => void;
}

export const SpeedMenu: React.FC<SpeedMenuProps> = ({ currentSpeed, onSelectSpeed, onClose }) => {
  const speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  return (
    <div
      className="animate-fade-in"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: '60px',
        right: '120px',
        zIndex: 200,
        background: 'var(--dropdown-bg, rgba(18, 18, 28, 0.95))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
        borderRadius: '12px',
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        boxShadow: 'var(--shadow-xl, 0 12px 36px rgba(0,0,0,0.7))',
        minWidth: '130px',
        fontFamily: 'var(--font-sans)'
      }}
    >
      <div style={{
        padding: '6px 10px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-muted, #9ca3af)',
        borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))'
      }}>
        Playback Speed
      </div>
      {speeds.map((s) => {
        const isSelected = Math.abs(currentSpeed - s) < 0.01;
        return (
          <button
            key={s}
            onClick={() => {
              onSelectSpeed(s);
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '6px',
              background: isSelected ? 'var(--accent-glow, rgba(229, 9, 20, 0.25))' : 'transparent',
              color: isSelected ? 'var(--accent-color, #e50914)' : 'var(--text-primary, #ffffff)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: isSelected ? 700 : 500,
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={e => {
              if (!isSelected) e.currentTarget.style.background = 'var(--surface-hover, rgba(255, 255, 255, 0.08))';
            }}
            onMouseLeave={e => {
              if (!isSelected) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span>{s === 1.0 ? 'Normal (1.0x)' : `${s}x`}</span>
            {isSelected && <Check size={14} color="var(--accent-color, #e50914)" />}
          </button>
        );
      })}
    </div>
  );
};
