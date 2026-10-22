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
  const displayLabel = label || bookmark?.label || bookmark?.category || 'Intro';

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
        background: 'var(--surface, rgba(18, 18, 28, 0.88))',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.25))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'var(--text-primary, #ffffff)',
        padding: '10px 22px',
        borderRadius: '30px',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.6))',
        transition: 'all 0.2s ease',
        fontFamily: 'var(--font-sans)'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.04)';
        e.currentTarget.style.borderColor = 'var(--accent-color, #e50914)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.25))';
      }}
    >
      <SkipForward size={16} color="var(--accent-color, #e50914)" />
      Skip {displayLabel}
      {shortcutHint && (
        <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '4px', padding: '2px 5px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)' }}>
          {shortcutHint}
        </span>
      )}
    </button>
  );
};
