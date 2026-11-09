import React, { useEffect, useState } from 'react';
import './PlayerLoader.css';

export type PlayerLoaderProps = {
  visible: boolean;
  variant?: 'buffering' | 'splash';
  onRetry?: () => void;
  onDownload?: () => void;
  canDownload?: boolean;
  showDelayMs?: number;   // 300ms debounce for buffering so fast loads show nothing
  errorAfterMs?: number;  // 30s timeout
  errorMessage?: string;
  isHardError?: boolean;
  animationStyle?: 'monogram' | 'satin' | 'letters';
  zIndex?: number;
  className?: string;
  style?: React.CSSProperties;
};

export const PlayerLoader: React.FC<PlayerLoaderProps> = ({
  visible,
  variant = 'buffering',
  onRetry,
  onDownload,
  canDownload = false,
  showDelayMs = 300,
  errorAfterMs = 30000,
  errorMessage,
  isHardError = false,
  zIndex,
  className = '',
  style,
}) => {
  const [mounted, setMounted] = useState(visible || isHardError);
  const [show, setShow] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const isErrorState = isHardError || timedOut;

  useEffect(() => {
    let unmountTimer: ReturnType<typeof setTimeout>;
    let showTimer: ReturnType<typeof setTimeout>;
    let timeoutTimer: ReturnType<typeof setTimeout>;

    if (visible || isHardError) {
      setMounted(true);
      if (!isHardError) {
        setTimedOut(false);
      }
      const delay = (variant === 'splash' || isHardError) ? 0 : showDelayMs;
      showTimer = setTimeout(() => setShow(true), delay);

      if (!isHardError) {
        timeoutTimer = setTimeout(() => {
          setTimedOut(true);
        }, errorAfterMs);
      }
    } else {
      setShow(false);
      setTimedOut(false);
      unmountTimer = setTimeout(() => {
        setMounted(false);
      }, 250);
    }

    return () => {
      clearTimeout(showTimer);
      clearTimeout(timeoutTimer);
      clearTimeout(unmountTimer);
    };
  }, [visible, isHardError, variant, showDelayMs, errorAfterMs]);

  if (!mounted) return null;

  return (
    <div
      className={`pl pl--${variant} ${show ? 'pl--in' : ''} ${isErrorState ? 'pl--err-active' : ''} ${className}`}
      style={{ ...(zIndex !== undefined ? { zIndex } : {}), ...style }}
      role="status"
      aria-label={isErrorState ? 'Playback error' : 'Loading'}
    >
      {isErrorState ? (
        <div className="pl-err">
          <p className="pl-err-title">Couldn't load this video</p>
          <p className="pl-err-desc">
            {errorMessage || (timedOut ? 'Playback timed out after 30 seconds.' : 'An error occurred while loading media.')}
          </p>
          {onRetry && (
            <div className="pl-err-actions">
              <button type="button" className="pl-btn pl-btn-retry" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="pl-logo-wrap">
          <svg className="pl-mk" viewBox="0 0 120 130" aria-hidden="true" width={84} height={91}>
            <defs>
              <linearGradient id="plg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ff5a68" />
                <stop offset="1" stopColor="#7a0c19" />
              </linearGradient>
            </defs>
            <path pathLength={1} d="M14 14 L60 110" />
            <path pathLength={1} d="M106 14 L60 110" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default PlayerLoader;
