import React, { useEffect, useState } from 'react';
import './Toast.css';

export interface ToastProps {
  message: string;
  visible: boolean;
  onClose: () => void;
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  visible,
  onClose,
  durationMs = 1800,
}) => {
  const [mounted, setMounted] = useState(visible);
  const [inClass, setInClass] = useState(false);

  useEffect(() => {
    let unmountTimer: ReturnType<typeof setTimeout>;
    let dismissTimer: ReturnType<typeof setTimeout>;

    if (visible) {
      setMounted(true);
      setTimeout(() => setInClass(true), 10);
      dismissTimer = setTimeout(() => {
        setInClass(false);
        unmountTimer = setTimeout(() => {
          setMounted(false);
          onClose();
        }, 200);
      }, durationMs);
    } else {
      setInClass(false);
      unmountTimer = setTimeout(() => {
        setMounted(false);
      }, 200);
    }

    return () => {
      clearTimeout(dismissTimer);
      clearTimeout(unmountTimer);
    };
  }, [visible, durationMs, onClose]);

  if (!mounted) return null;

  return (
    <div className={`valor-toast ${inClass ? 'valor-toast-in' : ''}`} role="status">
      <span>{message}</span>
    </div>
  );
};

export default Toast;
