import React, { useState } from 'react';
import { 
  Hammer, 
  Construction, 
  RefreshCw, 
  ArrowLeft, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  ExternalLink,
  Sparkles,
  Server
} from 'lucide-react';

export interface UnderConstructionPageProps {
  featureName?: string;
  isEntireApp?: boolean;
  message?: string;
  onBackHome?: () => void;
  onRetry?: () => void;
}

export const UnderConstructionPage: React.FC<UnderConstructionPageProps> = ({
  featureName = 'This Feature',
  isEntireApp = false,
  message,
  onBackHome,
  onRetry
}) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryClick = () => {
    setIsRetrying(true);
    setTimeout(() => {
      setIsRetrying(false);
      if (onRetry) {
        onRetry();
      } else {
        window.location.reload();
      }
    }, 700);
  };

  const defaultMessage = isEntireApp
    ? "Valor is currently undergoing scheduled platform upgrades and infrastructure enhancements. Our services will resume shortly with boosted speed and stability."
    : `${featureName} is temporarily undergoing scheduled maintenance and engine upgrades. Core local playback and saved library items remain fully available.`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: isEntireApp ? '100vh' : '85vh',
        width: '100%',
        padding: 'var(--space-6) var(--space-4)',
        boxSizing: 'border-box',
        backgroundColor: 'var(--bg)',
        color: 'var(--text-1)',
        fontFamily: 'var(--font-ui)',
        textAlign: 'center',
        userSelect: 'none'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '580px',
          width: '100%',
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 3rem)',
          boxShadow: 'none',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Subtle accent hairline at top of card */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, transparent, var(--accent), transparent)'
          }}
        />

        {/* Center Animated Icon Badge */}
        <div
          style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
            marginBottom: 'var(--space-5)',
            position: 'relative'
          }}
        >
          {isEntireApp ? (
            <Construction size={38} strokeWidth={1.8} />
          ) : (
            <Hammer size={38} strokeWidth={1.8} />
          )}
        </div>

        {/* Status Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--surface-2)',
            border: '1px solid var(--control-border)',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--accent)',
            marginBottom: 'var(--space-4)'
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent)',
              display: 'inline-block'
            }}
          />
          {isEntireApp ? 'Scheduled Platform Maintenance' : 'Feature Under Construction'}
        </div>

        {/* Headline */}
        <h1
          style={{
            margin: '0 0 var(--space-3) 0',
            fontSize: 'clamp(1.5rem, 3.5vw, 2.1rem)',
            fontWeight: 800,
            fontFamily: 'var(--font-display)',
            color: 'var(--text-1)',
            lineHeight: 1.25
          }}
        >
          {isEntireApp ? 'We’ll Be Right Back' : `${featureName} is Offline`}
        </h1>

        {/* Description Body */}
        <p
          style={{
            margin: '0 0 var(--space-6) 0',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            color: 'var(--text-2)',
            maxWidth: '480px'
          }}
        >
          {message || defaultMessage}
        </p>

        {/* Maintenance Details Checklist Box */}
        <div
          style={{
            width: '100%',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            boxSizing: 'border-box',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-2)' }}>
            <Sparkles size={16} color="var(--accent)" />
            <span>Infrastructure upgrades & engine optimizations in progress</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-2)' }}>
            <Server size={16} color="var(--accent)" />
            <span>Telemetry & connection health monitoring active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-3)' }}>
            <Clock size={16} color="var(--text-3)" />
            <span>Estimated return: Soon</span>
          </div>
        </div>

        {/* Interactive Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            width: '100%'
          }}
        >
          {onBackHome && !isEntireApp && (
            <button
              type="button"
              onClick={onBackHome}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'var(--accent-fill)',
                color: 'var(--on-accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease'
              }}
            >
              <ArrowLeft size={16} />
              Return to Select Media
            </button>
          )}

          <button
            type="button"
            onClick={handleRetryClick}
            disabled={isRetrying}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: 'var(--surface-3)',
              color: 'var(--text-1)',
              border: '1px solid var(--control-border)',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.92rem',
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.7 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={16} className={isRetrying ? 'animate-spin' : ''} />
            {isRetrying ? 'Checking status...' : 'Check Status Again'}
          </button>
        </div>
      </div>
    </div>
  );
};
