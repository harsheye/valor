import React from 'react';
import { SkipForward } from 'lucide-react';
import type { Bookmark } from '../../types/media';

export interface SkipIntroButtonProps {
  bookmark?: Bookmark | null;
  onSkip: (endTimeOrEvent: any) => void;
  label?: string;
  shortcutHint?: string;
}

export const SkipIntroButton: React.FC<SkipIntroButtonProps> = ({ bookmark, onSkip, label, shortcutHint }) => {
  const isOutro = label === 'Outro' || label === 'Watch Creds' || bookmark?.isOutro || bookmark?.category === 'Outro';
  const displayLabel = isOutro ? 'Watch Creds' : `Skip ${label || bookmark?.label || bookmark?.category || 'Intro'}`;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSkip(e);
      }}
      className="animate-fade-in"
      style={{
        position: 'absolute',
        bottom: '90px',
        right: '32px',
        zIndex: 3500,
        background: isOutro ? 'rgba(65, 65, 72, 0.88)' : '#ffffff',
        border: isOutro ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid #ffffff',
        backdropFilter: isOutro ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: isOutro ? 'blur(16px)' : 'none',
        color: isOutro ? '#ffffff' : '#000000',
        padding: '10px 22px',
        borderRadius: '8px',
        fontSize: '15px',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: isOutro ? '0 4px 16px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(255, 255, 255, 0.35)',
        transition: 'all 0.18s ease',
        fontFamily: 'var(--font-sans)'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.04)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <SkipForward size={16} color={isOutro ? '#ffffff' : '#000000'} />
      {displayLabel}
      {shortcutHint && (
        <span
          className="shortcut-hint-badge desktop-only-setting"
          style={{ 
            fontSize: '11px', 
            opacity: 0.75, 
            marginLeft: '4px', 
            padding: '2px 5px', 
            borderRadius: '4px', 
            background: isOutro ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
            color: isOutro ? '#ffffff' : '#000000'
          }}
        >
          {shortcutHint}
        </span>
      )}
    </button>
  );
};
