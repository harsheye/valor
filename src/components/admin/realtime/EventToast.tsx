import React from 'react';
import { AlertCircle, AlertTriangle, Info, X, Check, Clock } from 'lucide-react';

export interface ToastItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
}

interface EventToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onAcknowledge?: (id: string) => void;
}

export const EventToastContainer: React.FC<EventToastProps> = ({
  toasts,
  onDismiss,
  onAcknowledge
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: '380px',
        pointerEvents: 'none'
      }}
    >
      {toasts.map(t => {
        const isCritical = t.severity === 'critical';
        const isWarning = t.severity === 'warning';
        const borderColor = isCritical ? 'var(--danger, #EC8F95)' : (isWarning ? 'var(--warning, #E3BD7A)' : 'var(--accent, #8CA9EE)');
        const iconColor = borderColor;

        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              background: 'var(--surface-2, #1B212A)',
              borderLeft: `4px solid ${borderColor}`,
              borderTop: '1px solid var(--border, #262D39)',
              borderRight: '1px solid var(--border, #262D39)',
              borderBottom: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '12px 14px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              animation: 'fadeInRise 0.3s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isCritical ? <AlertCircle size={16} color={iconColor} /> : (isWarning ? <AlertTriangle size={16} color={iconColor} /> : <Info size={16} color={iconColor} />)}
                <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-1, #E4E8EE)' }}>
                  {t.title}
                </span>
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-2, #A9B2C0)', lineHeight: 1.4 }}>
              {t.message}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-3, #8F99AA)' }}>
                {new Date(t.timestamp).toLocaleTimeString()}
              </span>
              {onAcknowledge && (
                <button
                  onClick={() => onAcknowledge(t.id)}
                  style={{
                    background: 'var(--accent-soft, rgba(140, 169, 238, 0.14))',
                    border: '1px solid var(--accent, #8CA9EE)',
                    color: 'var(--accent, #8CA9EE)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Acknowledge
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
