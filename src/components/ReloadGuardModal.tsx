import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ReloadGuardModalProps {
  isOpen: boolean;
  onStay: () => void;
  onReloadAnyway: () => void;
}

export const ReloadGuardModal: React.FC<ReloadGuardModalProps> = ({
  isOpen,
  onStay,
  onReloadAnyway,
}) => {
  const stayButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus "Stay here" button by default
      const timer = setTimeout(() => {
        stayButtonRef.current?.focus();
      }, 30);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onStay();
        }
      };

      window.addEventListener('keydown', handleKeyDown, true);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [isOpen, onStay]);

  if (!isOpen) return null;

  return (
    <div
      className="reload-guard-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reload-guard-title"
        aria-describedby="reload-guard-desc"
        style={{
          background: 'linear-gradient(145deg, #161b26 0%, #0d111a 100%)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '16px',
          padding: '28px 30px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={22} color="#f59e0b" />
          </div>
          <h2
            id="reload-guard-title"
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#ffffff',
              margin: 0,
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}
          >
            Whoa, hold up. This isn't Netflix, mate.
          </h2>
        </div>

        <p
          id="reload-guard-desc"
          style={{
            fontSize: '0.92rem',
            color: 'rgba(255, 255, 255, 0.78)',
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Refreshing makes the browser forget file access, and the user would have to grant it again; the playlist and position are saved either way.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
          }}
        >
          <button
            type="button"
            onClick={onReloadAnyway}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              color: 'rgba(255, 255, 255, 0.75)',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.75)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
            }}
          >
            Reload anyway
          </button>

          <button
            ref={stayButtonRef}
            type="button"
            onClick={onStay}
            style={{
              background: '#2563eb',
              border: 'none',
              color: '#ffffff',
              padding: '10px 22px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }}
          >
            Stay here
          </button>
        </div>
      </div>
    </div>
  );
};
