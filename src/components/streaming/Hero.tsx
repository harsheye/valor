import React, { useRef, useEffect } from 'react';
import { Play, Plus, Check } from 'lucide-react';
import './streaming.css';

interface HeroProps {
  title: string;
  backdropUrl?: string;
  synopsis?: string;
  matchScore?: number;
  ageRating?: string;
  seasonsOrDuration?: string;
  quality?: string;
  audioFormat?: string;
  playButtonLabel?: string;
  onPlay: () => void;
  onToggleLibrary?: () => void;
  isInLibrary?: boolean;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export const Hero: React.FC<HeroProps> = ({
  title,
  backdropUrl,
  synopsis = '',
  matchScore = 97,
  ageRating = '16+',
  seasonsOrDuration = '1 Season',
  quality = '4K',
  audioFormat = '5.1',
  playButtonLabel = 'Play S1 · E1',
  onPlay,
  onToggleLibrary,
  isInLibrary = false,
  scrollContainerRef
}) => {
  const heroRef = useRef<HTMLDivElement>(null);

  // Parallax on scroll using CSS custom properties --py and --sc
  useEffect(() => {
    const targetEl = scrollContainerRef?.current || window;

    const handleScroll = () => {
      const scrollY = targetEl === window ? window.scrollY : (targetEl as HTMLElement).scrollTop;
      if (!heroRef.current) return;

      const py = Math.min(65, scrollY * 0.28);
      const sc = 1 + Math.min(0.09, scrollY * 0.00035);

      heroRef.current.style.setProperty('--py', `${py.toFixed(1)}px`);
      heroRef.current.style.setProperty('--sc', `${sc.toFixed(3)}`);
    };

    targetEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => targetEl.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef]);

  return (
    <div
      ref={heroRef}
      className="streaming-hero-root"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '68vh',
        display: 'flex',
        alignItems: 'flex-end',
        padding: 'var(--space-8) var(--space-7) var(--space-7) var(--space-7)',
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: 'var(--bg)'
      }}
    >
      {/* Full-bleed hero backdrop on the right with parallax */}
      {backdropUrl && (
        <div
          className="streaming-hero-backdrop"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '78%',
            height: '100%',
            backgroundImage: `url("${backdropUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'top right',
            backgroundRepeat: 'no-repeat',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />
      )}

      {/* Scrim fade on the left and bottom */}
      <div
        className="streaming-hero-scrim"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          background: `
            linear-gradient(to right, var(--bg) 0%, color-mix(in srgb, var(--bg) 95%, transparent) 35%, color-mix(in srgb, var(--bg) 60%, transparent) 65%, transparent 100%),
            linear-gradient(to top, var(--bg) 0%, color-mix(in srgb, var(--bg) 75%, transparent) 30%, transparent 80%)
          `,
          pointerEvents: 'none'
        }}
      />

      {/* Hero Foreground Content */}
      <div
        className="animate-rise"
        style={{
          position: 'relative',
          zIndex: 3,
          maxWidth: '1440px',
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)'
        }}
      >
        {/* Chip row: match %, age, seasons, 4K, 5.1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 700,
              color: 'var(--success)',
              background: 'rgba(11, 12, 16, 0.75)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
              backdropFilter: 'blur(8px)',
              letterSpacing: '0.02em',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {matchScore}% Match
          </span>

          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'var(--surface-2)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--control-border)'
            }}
          >
            {ageRating}
          </span>

          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: 500,
              color: 'var(--text-2)',
              background: 'var(--surface-2)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)'
            }}
          >
            {seasonsOrDuration}
          </span>

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text-3)',
              background: 'var(--surface-1)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)'
            }}
          >
            {quality}
          </span>

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-3)',
              background: 'var(--surface-1)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)'
            }}
          >
            {audioFormat}
          </span>
        </div>

        {/* Big Display Title */}
        <h1
          className="streaming-hero-title"
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.2rem, 5vw, 3.8rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            color: 'var(--text-1)',
            letterSpacing: '-0.02em',
            maxWidth: '18ch',
            textShadow: '0 2px 16px rgba(0,0,0,0.7)'
          }}
        >
          {title}
        </h1>

        {/* Synopsis (max 52ch) */}
        {synopsis && (
          <p
            style={{
              margin: 0,
              maxWidth: '52ch',
              fontSize: 'clamp(0.92rem, 1.2vw, 1.05rem)',
              lineHeight: 1.6,
              color: 'var(--text-2)',
              textShadow: '0 1px 8px rgba(0,0,0,0.85)'
            }}
          >
            {synopsis}
          </p>
        )}

        {/* Action Buttons: Primary "Play" and Ghost "+ Library" */}
        <div className="streaming-hero-buttons" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          {/* Primary Play Button (--accent-fill / --on-accent) */}
          <button
            type="button"
            className="streaming-play-btn"
            onClick={onPlay}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              background: 'var(--accent-fill)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 28px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              outline: 'none',
              boxShadow: '0 6px 20px color-mix(in srgb, var(--accent-fill) 40%, transparent)'
            }}
          >
            <Play size={18} fill="currentColor" />
            <span>{playButtonLabel}</span>
          </button>

          {/* Ghost "+ Library" Button */}
          {onToggleLibrary && (
            <button
              type="button"
              onClick={onToggleLibrary}
              aria-label={isInLibrary ? 'In library' : 'Add to library'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                background: isInLibrary ? 'var(--surface-3)' : 'var(--accent-soft)',
                color: isInLibrary ? 'var(--accent)' : 'var(--text-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 22px',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {isInLibrary ? <Check size={18} /> : <Plus size={18} />}
              <span>{isInLibrary ? 'In Library' : 'Add to Library'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
