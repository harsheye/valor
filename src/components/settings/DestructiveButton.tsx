import React, { useState, useEffect, useRef } from 'react';

export interface DestructiveButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  timeoutMs?: number;
}

export const DestructiveButton: React.FC<DestructiveButtonProps> = ({
  label,
  confirmLabel = 'Click again to confirm',
  onConfirm,
  icon,
  className = '',
  style,
  timeoutMs = 3000,
}) => {
  const [confirming, setConfirming] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (confirming) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirming(false);
      onConfirm();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => {
        setConfirming(false);
      }, timeoutMs);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`settings-btn-destructive ${confirming ? 'confirming' : ''} ${className}`}
      style={style}
      aria-label={confirming ? confirmLabel : label}
    >
      {icon}
      <span>{confirming ? confirmLabel : label}</span>
    </button>
  );
};
