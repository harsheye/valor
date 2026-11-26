import React, { useEffect } from 'react';
import { Check } from 'lucide-react';

export interface ToastProps {
  message?: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message = 'Saved',
  visible,
  onDismiss,
  duration = 2400,
}) => {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="settings-autosave-toast"
      style={{
        position: 'fixed',
        bottom: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 18px',
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        borderRadius: '9999px',
        color: 'var(--text-1)',
        fontSize: '0.85rem',
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      <Check size={15} color="var(--success)" strokeWidth={3} />
      <span>{message}</span>
    </div>
  );
};
