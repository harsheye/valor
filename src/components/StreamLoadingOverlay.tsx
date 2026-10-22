import React, { useEffect, useState } from 'react';
import { Film, Globe, ShieldCheck, Sparkles, X, Loader2, Play } from 'lucide-react';

export interface StreamLoadingOverlayProps {
  isOpen: boolean;
  step?: string;
  url?: string;
  onCancel?: () => void;
}

export const StreamLoadingOverlay: React.FC<StreamLoadingOverlayProps> = ({
  isOpen,
  step = 'Initializing remote stream...',
  url = '',
  onCancel
}) => {
  const [displayHost, setDisplayHost] = useState('');
  const [dots, setDots] = useState('');

  // Extract friendly hostname or filename from URL
  useEffect(() => {
    if (!url) {
      setDisplayHost('');
      return;
    }
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parsed = new URL(url);
        const host = parsed.hostname;
        const lastPart = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastPart && !lastPart.includes('proxy') && lastPart.length < 40) {
          setDisplayHost(`${host} • ${decodeURIComponent(lastPart)}`);
        } else {
          setDisplayHost(host);
        }
      } else {
        const clean = url.split(/[/\\]/).pop() || url;
        setDisplayHost(clean);
      }
    } catch {
      setDisplayHost(url.substring(0, 36));
    }
  }, [url]);

  // Animated dots for progress indicator
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 450);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine stage icon
  const lowerStep = (step || '').toLowerCase();
  const getStageIcon = () => {
    if (lowerStep.includes('security') || lowerStep.includes('protocol')) {
      return <ShieldCheck size={28} className="text-red-500 animate-pulse" />;
    }
    if (lowerStep.includes('prob') || lowerStep.includes('format') || lowerStep.includes('hls') || lowerStep.includes('mkv')) {
      return <Film size={28} className="text-red-500 animate-pulse" />;
    }
    if (lowerStep.includes('connection') || lowerStep.includes('capabilit')) {
      return <Globe size={28} className="text-red-500 animate-pulse" />;
    }
    return <Sparkles size={28} className="text-red-500 animate-pulse" />;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 45%, rgba(229, 9, 20, 0.15) 0%, rgba(8, 11, 18, 0.94) 60%, #04060a 100%)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        animation: 'valorFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      <style>{`
        @keyframes valorFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes valorPulseRing {
          0% { transform: scale(0.85); opacity: 0.8; }
          50% { transform: scale(1.18); opacity: 0.25; }
          100% { transform: scale(0.85); opacity: 0.8; }
        }
        @keyframes valorSpinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes valorShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      {/* Main Glassmorphic Card */}
      <div
        style={{
          width: '90%',
          maxWidth: '460px',
          background: 'rgba(18, 22, 34, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(229, 9, 20, 0.2)',
          borderRadius: '20px',
          padding: '2.5rem 2rem 2rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Subtle top red glow line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '10%',
            right: '10%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #e50914, #ff4b55, transparent)'
          }}
        />

        {/* Animated Cinema Radar Center */}
        <div
          style={{
            position: 'relative',
            width: '96px',
            height: '96px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.75rem'
          }}
        >
          {/* Outer Pulsing Aura Ring */}
          <div
            style={{
              position: 'absolute',
              inset: '-10px',
              borderRadius: '50%',
              border: '2px solid rgba(229, 9, 20, 0.35)',
              animation: 'valorPulseRing 2.8s ease-in-out infinite'
            }}
          />

          {/* Rotating Dashed Tech Ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px dashed rgba(229, 9, 20, 0.65)',
              animation: 'valorSpinSlow 12s linear infinite'
            }}
          />

          {/* Inner Glowing Core */}
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, rgba(229, 9, 20, 0.45) 0%, rgba(12, 16, 26, 0.95) 85%)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 0 24px rgba(229, 9, 20, 0.5), inset 0 0 12px rgba(229, 9, 20, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {getStageIcon()}
          </div>
        </div>

        {/* Title */}
        <h2
          style={{
            margin: '0 0 0.4rem 0',
            fontSize: '1.35rem',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            fontFamily: "'Outfit', 'Inter', sans-serif"
          }}
        >
          Connecting to Stream
        </h2>

        {/* Friendly Stream Target Pill */}
        {displayHost && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.78rem',
              color: 'rgba(255, 255, 255, 0.75)',
              fontFamily: "'Share Tech Mono', Courier, monospace",
              marginBottom: '1.25rem',
              maxWidth: '92%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#46d369',
                boxShadow: '0 0 6px #46d369'
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayHost}</span>
          </div>
        )}

        {/* Step Status Text */}
        <div
          style={{
            fontSize: '0.92rem',
            color: 'rgba(255, 255, 255, 0.92)',
            fontWeight: 600,
            minHeight: '24px',
            marginBottom: '1rem',
            fontFamily: "'Inter', sans-serif",
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Loader2 size={14} className="animate-spin text-red-500" style={{ animation: 'valorSpinSlow 1.5s linear infinite' }} />
          <span>{step}{dots}</span>
        </div>

        {/* Glowing Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative',
            marginBottom: '1.5rem'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '50%',
              height: '100%',
              background: 'linear-gradient(90deg, transparent, #e50914 40%, #ff4b55 70%, #00ffcc 100%)',
              boxShadow: '0 0 10px #e50914',
              borderRadius: '4px',
              animation: 'valorShimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite'
            }}
          />
        </div>

        {/* Cancel Button */}
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '6px 18px',
              color: 'rgba(255, 255, 255, 0.55)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.55)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={13} />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
