import React from 'react';
import { 
  FileQuestion, 
  Home, 
  History, 
  Film, 
  Settings, 
  ArrowLeft,
  Compass
} from 'lucide-react';

export interface NotFoundPageProps {
  onBackHome?: () => void;
  onNavigate?: (tab: 'home' | 'history' | 'library' | 'settings') => void;
  requestedRoute?: string;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  onBackHome,
  onNavigate,
  requestedRoute
}) => {
  const handleNav = (tab: 'home' | 'history' | 'library' | 'settings') => {
    if (onNavigate) {
      onNavigate(tab);
    } else if (onBackHome) {
      onBackHome();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '85vh',
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
          maxWidth: '560px',
          width: '100%',
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 3rem)',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Accent top line */}
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

        {/* 404 Large Display Heading */}
        <div
          style={{
            fontSize: 'clamp(4rem, 10vw, 6.5rem)',
            fontWeight: 900,
            fontFamily: 'var(--font-display)',
            lineHeight: 1,
            color: 'var(--accent)',
            letterSpacing: '-2px',
            marginBottom: 'var(--space-3)'
          }}
        >
          404
        </div>

        {/* Icon Pill */}
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
            color: 'var(--text-2)',
            marginBottom: 'var(--space-4)'
          }}
        >
          <Compass size={14} color="var(--accent)" />
          Destination Not Found
        </div>

        <h1
          style={{
            margin: '0 0 var(--space-3) 0',
            fontSize: 'clamp(1.4rem, 3vw, 1.85rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            color: 'var(--text-1)'
          }}
        >
          Page or Stream Missing
        </h1>

        <p
          style={{
            margin: '0 0 var(--space-6) 0',
            fontSize: '0.92rem',
            lineHeight: 1.6,
            color: 'var(--text-2)',
            maxWidth: '440px'
          }}
        >
          {requestedRoute
            ? `The requested route "${requestedRoute}" could not be located.`
            : "The page, stream, or media view you requested has been moved, disabled, or does not exist."}
        </p>

        {/* Quick Links Row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            width: '100%',
            marginBottom: 'var(--space-5)'
          }}
        >
          <button
            type="button"
            onClick={() => handleNav('home')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'var(--accent-fill)',
              color: 'var(--on-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer'
            }}
          >
            <Home size={16} />
            Go to Select Media (Home)
          </button>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 'var(--space-2)',
              width: '100%'
            }}
          >
            <button
              type="button"
              onClick={() => handleNav('history')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                background: 'var(--surface-3)',
                color: 'var(--text-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <History size={14} color="var(--accent)" />
              History
            </button>

            <button
              type="button"
              onClick={() => handleNav('library')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                background: 'var(--surface-3)',
                color: 'var(--text-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Film size={14} color="var(--accent)" />
              Library
            </button>

            <button
              type="button"
              onClick={() => handleNav('settings')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 8px',
                background: 'var(--surface-3)',
                color: 'var(--text-1)',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Settings size={14} color="var(--accent)" />
              Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
