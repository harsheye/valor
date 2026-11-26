import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getRegexedTitleWithYear } from '../utils/libraryClassifier';

export interface StreamLoadingOverlayProps {
  isOpen: boolean;
  step?: string;
  url?: string;
  title?: string;
  onCancel?: () => void;
}

export const StreamLoadingOverlay: React.FC<StreamLoadingOverlayProps> = ({
  isOpen,
  step = 'Connecting to stream...',
  url = '',
  title = '',
  onCancel
}) => {
  const [displayName, setDisplayName] = useState('');
  const [dots, setDots] = useState('');

  // Extract friendly display name from title or URL
  useEffect(() => {
    if (title) {
      setDisplayName(getRegexedTitleWithYear(title));
      return;
    }
    if (!url) {
      setDisplayName('');
      return;
    }
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parsed = new URL(url);
        const lastPart = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastPart && !lastPart.includes('proxy') && lastPart.length > 2) {
          const clean = decodeURIComponent(lastPart).replace(/\.[^/.]+$/, '');
          setDisplayName(getRegexedTitleWithYear(clean));
        } else {
          setDisplayName(parsed.hostname);
        }
      } else {
        const clean = (url.split(/[/\\]/).pop() || url).replace(/\.[^/.]+$/, '');
        setDisplayName(getRegexedTitleWithYear(clean));
      }
    } catch {
      setDisplayName(url.substring(0, 36));
    }
  }, [url, title]);

  // Animated dots for progress indicator
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Handle ESC key to cancel
  useEffect(() => {
    if (!isOpen || !onCancel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
        color: '#ffffff',
        userSelect: 'none',
        overflow: 'hidden'
      }}
    >
      <style>{`
        @keyframes netflixRedPulse {
          0% {
            transform: scale(0.97);
            filter: drop-shadow(0 0 10px rgba(229, 9, 20, 0.45));
            opacity: 0.92;
          }
          50% {
            transform: scale(1.025);
            filter: drop-shadow(0 0 32px rgba(229, 9, 20, 0.95)) drop-shadow(0 0 65px rgba(229, 9, 20, 0.45));
            opacity: 1;
          }
          100% {
            transform: scale(0.97);
            filter: drop-shadow(0 0 10px rgba(229, 9, 20, 0.45));
            opacity: 0.92;
          }
        }
        @keyframes netflixSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes nameFadePulse {
          0%, 100% { opacity: 0.72; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-1px); }
        }
      `}</style>

      {/* Center Cinematic Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2rem',
          maxWidth: '850px',
          width: '90%'
        }}
      >
        {/* Netflix-style VALOR Wordmark */}
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(3.8rem, 9vw, 6.2rem)',
            fontWeight: 900,
            fontFamily: "'Bebas Neue', 'Impact', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#E50914',
            lineHeight: 1,
            animation: 'netflixRedPulse 2.6s ease-in-out infinite',
            textShadow: '0 0 40px rgba(229, 9, 20, 0.7), 0 0 80px rgba(229, 9, 20, 0.35)'
          }}
        >
          VALOR
        </h1>

        {/* Netflix Circular Red Spinner */}
        <div
          style={{
            margin: '2.5rem 0 1.75rem 0',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: '3.5px solid rgba(229, 9, 20, 0.15)',
            borderTopColor: '#E50914',
            animation: 'netflixSpin 0.85s linear infinite',
            boxShadow: '0 0 14px rgba(229, 9, 20, 0.4)'
          }}
        />

        {/* Media / Server Name */}
        {displayName && (
          <div
            style={{
              fontSize: 'clamp(1.1rem, 2.2vw, 1.45rem)',
              fontWeight: 700,
              color: 'rgba(255, 255, 255, 0.95)',
              letterSpacing: '-0.015em',
              fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              marginBottom: '0.65rem',
              maxWidth: '90%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              animation: 'nameFadePulse 2.8s ease-in-out infinite'
            }}
            title={displayName}
          >
            {displayName}
          </div>
        )}

        {/* Step Status Text */}
        <div
          style={{
            fontSize: '0.88rem',
            color: 'rgba(255, 255, 255, 0.45)',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            letterSpacing: '0.02em',
            fontWeight: 500,
            minHeight: '22px'
          }}
        >
          {step}{dots}
        </div>
      </div>

      {/* Cancel Button */}
      {onCancel && (
        <div
          style={{
            position: 'absolute',
            bottom: '2.8rem',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center'
          }}
        >
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: '24px',
              padding: '7px 22px',
              color: 'rgba(255, 255, 255, 0.55)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
              letterSpacing: '0.03em',
              transition: 'all 0.2s ease',
              outline: 'none'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.45)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.16)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={14} />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};
