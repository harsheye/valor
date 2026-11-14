import React, { useState } from 'react';
import { AlertTriangle, X, Keyboard, ShieldAlert, Check } from 'lucide-react';

interface OnlineStreamAdBannerProps {
  onDismiss?: () => void;
  className?: string;
}

export const OnlineStreamAdBanner: React.FC<OnlineStreamAdBannerProps> = ({ onDismiss, className }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const handleClose = () => {
    setIsOpen(false);
    onDismiss?.();
  };

  return (
    <>
      {/* Simple Hazard Icon Button (No Text, Matches Top-Right Controls) */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: isOpen ? 'rgba(245, 158, 11, 0.25)' : 'rgba(10, 10, 15, 0.85)',
          backdropFilter: 'blur(15px)',
          WebkitBackdropFilter: 'blur(15px)',
          border: isOpen ? '1px solid #fbbf24' : '1px solid rgba(245, 158, 11, 0.4)',
          color: '#fbbf24',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          transition: 'all 0.2s ease',
          flexShrink: 0,
          padding: 0
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#ffffff';
          e.currentTarget.style.background = 'rgba(245, 158, 11, 0.35)';
          e.currentTarget.style.borderColor = '#fbbf24';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#fbbf24';
          e.currentTarget.style.background = isOpen ? 'rgba(245, 158, 11, 0.25)' : 'rgba(10, 10, 15, 0.85)';
          e.currentTarget.style.borderColor = isOpen ? '#fbbf24' : 'rgba(245, 158, 11, 0.4)';
        }}
        title="Stream Ad Notice & Keyboard Shortcuts"
      >
        <AlertTriangle size={18} />
      </button>

      {/* Modal Dialog Overlay when Hazard Icon is Clicked */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            pointerEvents: 'auto'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            className={className}
            style={{
              position: 'relative',
              width: 'min(92vw, 700px)',
              background: 'linear-gradient(145deg, rgba(18, 22, 33, 0.98) 0%, rgba(13, 16, 26, 0.98) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              borderRadius: '16px',
              padding: '20px 24px',
              color: '#ffffff',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85), 0 0 24px rgba(245, 158, 11, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              animation: 'onlineAdBannerFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            {/* Header Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.16)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fbbf24',
                  flexShrink: 0
                }}>
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.01em' }}>
                      Online Stream Notice: 3rd-Party Ads On Click
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(245, 158, 11, 0.2)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}>
                      External Provider
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                    External streaming source disclaimer & keyboard navigation
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9ca3af';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }}
                title="Dismiss notice"
              >
                <X size={16} />
              </button>
            </div>

            {/* Main Announcement Description */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '10px',
              padding: '12px 14px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '13px',
              lineHeight: 1.55,
              color: '#d1d5db'
            }}>
              <strong style={{ color: '#fbbf24' }}>Notice:</strong> Clicking anywhere directly inside the video player may open third-party pop-up or redirect ads.
              <span style={{ display: 'block', marginTop: '6px' }}>
                These advertisements are <strong>third-party ads served directly by the external stream provider</strong>, not by Valor. We cannot control, filter, or remove them, as ad revenue helps the third-party providers keep their streaming servers running.
              </span>
            </div>

            {/* Keyboard Controls Tip Box */}
            <div style={{
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#c4b5fd' }}>
                <Keyboard size={16} />
                <span>Recommended: Use Keyboard Shortcuts to avoid clicking the player directly:</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0, 0, 0, 0.4)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <kbd style={{ background: '#1e2433', padding: '2px 6px', borderRadius: '4px', border: '1px solid #374151', color: '#ffffff', fontWeight: 700, fontFamily: 'monospace' }}>Space</kbd>
                  <span style={{ color: '#d1d5db' }}>Play / Pause</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0, 0, 0, 0.4)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <kbd style={{ background: '#1e2433', padding: '2px 6px', borderRadius: '4px', border: '1px solid #374151', color: '#ffffff', fontWeight: 700, fontFamily: 'monospace' }}>← / →</kbd>
                  <span style={{ color: '#d1d5db' }}>Rewind / Skip 10s</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0, 0, 0, 0.4)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <kbd style={{ background: '#1e2433', padding: '2px 6px', borderRadius: '4px', border: '1px solid #374151', color: '#ffffff', fontWeight: 700, fontFamily: 'monospace' }}>F</kbd>
                  <span style={{ color: '#d1d5db' }}>Fullscreen</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(0, 0, 0, 0.4)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <kbd style={{ background: '#1e2433', padding: '2px 6px', borderRadius: '4px', border: '1px solid #374151', color: '#ffffff', fontWeight: 700, fontFamily: 'monospace' }}>M</kbd>
                  <span style={{ color: '#d1d5db' }}>Mute / Unmute</span>
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: '4px' }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.5)',
                  borderRadius: '8px',
                  padding: '8px 22px',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(217, 119, 6, 0.35)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 18px rgba(217, 119, 6, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(217, 119, 6, 0.35)';
                }}
              >
                <Check size={16} />
                <span>Got It</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes onlineAdBannerFadeIn {
          0% {
            opacity: 0;
            transform: scale(0.96) translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
};
