import React, { useState, useEffect, useRef, useCallback } from 'react';

export type StartupLogoVariant = 'monogram' | 'letters';

export interface RemoteStartupScreenProps {
  /**
   * Whether the startup screen is currently active / visible.
   * If omitted, the screen remains visible until `detectionPromise` resolves.
   */
  isOpen?: boolean;

  /**
   * The asynchronous detection Promise or Promise factory.
   * Runs silently in the background (detecting file name, subtitles, audio, CORS).
   * When this promise resolves, the screen automatically transitions out.
   */
  detectionPromise?: Promise<any> | (() => Promise<any>);

  /**
   * Animated SVG variant: 'monogram' (variant A) or 'letters' (variant B).
   * Defaults to 'letters'.
   */
  variant?: StartupLogoVariant;

  /**
   * Callback fired after detection completes and the 250ms crossfade finishes.
   * This is where playback should start or the main player mounts.
   */
  onFinish?: () => void;

  /**
   * Callback if the user clicks the subtle "Retry" link (after 30s timeout).
   */
  onRetry?: () => void;

  /**
   * Optional z-index override (defaults to 99999 for full-screen overlay).
   */
  zIndex?: number;

  /**
   * Optional additional CSS class name.
   */
  className?: string;

  /**
   * Optional inline style overrides.
   */
  style?: React.CSSProperties;
}

/**
 * Full-screen remote media startup screen.
 * 
 * - Pure black background with a very faint radial crimson vignette (#16090b center).
 * - Animated SVG logo centered, ~25% viewport width (max 320px).
 * - Silent background detection (no text, no file IDs, no checklist, no progress bar, no buttons).
 * - When detection finishes: waits for current SVG loop to finish if < 600ms remain,
 *   then crossfades to player over 250ms.
 * - At 30s: fades in a subtle, low-contrast "Retry" link.
 * - Strictly respects prefers-reduced-motion, no flashing, 3.6s calm loop.
 * - All HTML, CSS, and JS self-contained in one component.
 */
export const RemoteStartupScreen: React.FC<RemoteStartupScreenProps> = ({
  isOpen = true,
  detectionPromise,
  variant = 'letters',
  onFinish,
  onRetry,
  zIndex = 99999,
  className = '',
  style
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showRetryLink, setShowRetryLink] = useState(false);

  // SVG loop duration: 3.6s (satisfies >= 3.0s constraint)
  const LOOP_DURATION_MS = 3600;
  const loopStartTimeRef = useRef<number>(Date.now());
  const timer30sRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningOutRef = useRef(false);

  // Starts the smooth transition out
  const triggerCrossfadeToPlayer = useCallback(() => {
    if (isTransitioningOutRef.current) return;
    isTransitioningOutRef.current = true;

    // Calculate elapsed time in the current 3.6s SVG animation loop
    const now = Date.now();
    const elapsedInLoop = (now - loopStartTimeRef.current) % LOOP_DURATION_MS;
    const remainingInLoop = LOOP_DURATION_MS - elapsedInLoop;

    // Rule: Let the SVG finish its current loop before fading out if less than 600 ms remains
    const delayBeforeFade = remainingInLoop < 600 ? remainingInLoop : 0;

    loopWaitTimerRef.current = setTimeout(() => {
      // Crossfade over 250ms
      setIsFadingOut(true);

      crossfadeTimerRef.current = setTimeout(() => {
        setIsRendered(false);
        if (onFinish) {
          onFinish();
        }
      }, 250);
    }, delayBeforeFade);
  }, [onFinish]);

  // Handle Detection Promise if plugged in directly
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    if (detectionPromise) {
      const promise = typeof detectionPromise === 'function' ? detectionPromise() : detectionPromise;
      promise
        .then(() => {
          if (isMounted) {
            triggerCrossfadeToPlayer();
          }
        })
        .catch((err) => {
          console.warn('[RemoteStartupScreen] Detection encountered error:', err);
          // Still provide user recourse via retry link on failure
          if (isMounted) {
            setShowRetryLink(true);
          }
        });
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, detectionPromise, triggerCrossfadeToPlayer]);

  // Handle isOpen toggle from parent (if parent manages the detection state)
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsFadingOut(false);
      setShowRetryLink(false);
      isTransitioningOutRef.current = false;
      loopStartTimeRef.current = Date.now();

      // 30s timeout: reveal low-contrast subtle "Retry" link
      if (timer30sRef.current) clearTimeout(timer30sRef.current);
      timer30sRef.current = setTimeout(() => {
        setShowRetryLink(true);
      }, 30000);

      return () => {
        if (timer30sRef.current) clearTimeout(timer30sRef.current);
        if (loopWaitTimerRef.current) clearTimeout(loopWaitTimerRef.current);
        if (crossfadeTimerRef.current) clearTimeout(crossfadeTimerRef.current);
      };
    } else if (isRendered && !isTransitioningOutRef.current) {
      triggerCrossfadeToPlayer();
    }
  }, [isOpen, isRendered, triggerCrossfadeToPlayer]);

  const handleRetryClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowRetryLink(false);
    loopStartTimeRef.current = Date.now();

    if (timer30sRef.current) clearTimeout(timer30sRef.current);
    timer30sRef.current = setTimeout(() => {
      setShowRetryLink(true);
    }, 30000);

    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  if (!isRendered) return null;

  return (
    <div
      className={`valor-startup-root ${isFadingOut ? 'is-fading-out' : 'is-visible'} ${className}`}
      style={{ zIndex, ...style }}
      role="status"
      aria-live="polite"
      aria-label="Loading stream"
    >
      <style>{`
        /* ═══════════════════════════════════════════════════════════════════
           REMOTE STARTUP SCREEN — SCOPED STYLES
           ═══════════════════════════════════════════════════════════════════ */
        .valor-startup-root {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          /* Pure black with faint radial crimson vignette (#16090b center) */
          background: radial-gradient(circle at 50% 50%, #16090b 0%, #080304 42%, #000000 75%, #000000 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
          pointer-events: auto;
          opacity: 1;
          /* 250ms crossfade transition */
          transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .valor-startup-root.is-fading-out {
          opacity: 0;
          pointer-events: none;
        }

        /* Logo Container: about 25% of viewport width (max 320px) */
        .valor-startup-logo-wrapper {
          width: clamp(140px, 25vw, 320px);
          max-width: 320px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .valor-startup-svg {
          width: 100%;
          height: auto;
          display: block;
          overflow: visible;
        }

        /* Calm 3.6s SVG Line Animation (never faster than 3s, no flashing) */
        .valor-startup-letter {
          fill: none;
          stroke: #f3dcdc;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          opacity: 0;
          animation: valorStartupRise 3.6s ease-in-out infinite;
        }

        .valor-startup-letter.valor-crimson-lead {
          stroke: #e11d2e;
        }

        .valor-startup-letter:nth-child(2) { animation-delay: 0.14s; }
        .valor-startup-letter:nth-child(3) { animation-delay: 0.28s; }
        .valor-startup-letter:nth-child(4) { animation-delay: 0.42s; }
        .valor-startup-letter:nth-child(5) { animation-delay: 0.56s; }

        .valor-startup-underline {
          stroke: #e11d2e;
          stroke-width: 1.3;
          stroke-linecap: round;
          fill: none;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: valorStartupLine 3.6s ease-in-out infinite;
        }

        @keyframes valorStartupRise {
          0% {
            stroke-dashoffset: 1;
            opacity: 0;
            transform: translateY(4px);
          }
          30%, 66% {
            stroke-dashoffset: 0;
            opacity: 1;
            transform: none;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0;
            transform: translateY(-4px);
          }
        }

        @keyframes valorStartupLine {
          0%, 25% {
            stroke-dashoffset: 1;
            opacity: 0;
          }
          50%, 66% {
            stroke-dashoffset: 0;
            opacity: 0.85;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0;
          }
        }

        /* 30s Subtle "Retry" Link (small, low-contrast, no buttons) */
        .valor-startup-retry-link {
          margin-top: 26px;
          background: transparent;
          border: none;
          outline: none;
          color: rgba(255, 255, 255, 0.32);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11.5px;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
          opacity: 0;
          transform: translateY(4px);
          pointer-events: none;
          transition: opacity 450ms ease, color 180ms ease, transform 450ms ease;
        }

        .valor-startup-retry-link.is-visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        .valor-startup-retry-link:hover {
          color: #e11d2e;
        }

        /* ═══════════════════════════════════════════════════════════════════
           ACCESSIBILITY: PREFERS-REDUCED-MOTION
           ═══════════════════════════════════════════════════════════════════ */
        @media (prefers-reduced-motion: reduce) {
          .valor-startup-root {
            transition: none !important;
          }
          .valor-startup-letter,
          .valor-startup-underline {
            animation: none !important;
            stroke-dashoffset: 0 !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .valor-startup-retry-link {
            transition: none !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Centered Logo only (~25% viewport width, max 320px) */}
      <div className="valor-startup-logo-wrapper">
        {variant === 'monogram' ? (
          /* Variant A: Monogram SVG */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 100"
            className="valor-startup-svg"
            role="img"
            aria-label="Valor Monogram"
          >
            <defs>
              <filter id="valor-startup-glow-mono" x="-30%" y="-50%" width="160%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feColorMatrix
                  in="b"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0"
                />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#valor-startup-glow-mono)" transform="translate(0 6)">
              <path
                className="valor-startup-letter valor-crimson-lead"
                pathLength="1"
                d="M10 20 L32 80 L54 20"
              />
            </g>
            <path
              className="valor-startup-underline"
              pathLength="1"
              d="M16 92 H48"
              style={{ stroke: '#5a0a14' }}
            />
          </svg>
        ) : (
          /* Variant B: Letters SVG */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 336 120"
            className="valor-startup-svg"
            role="img"
            aria-label="Valor"
          >
            <defs>
              <filter id="valor-startup-glow-let" x="-30%" y="-50%" width="160%" height="200%">
                <feGaussianBlur stdDeviation="2.8" result="b" />
                <feColorMatrix
                  in="b"
                  values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.25 0"
                />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#valor-startup-glow-let)" transform="translate(0 6)">
              {/* V */}
              <path
                className="valor-startup-letter valor-crimson-lead"
                pathLength="1"
                d="M10 20 L32 80 L54 20"
              />
              {/* A */}
              <path
                className="valor-startup-letter"
                pathLength="1"
                d="M78 80 L100 20 L122 80 M85 62 H115"
              />
              {/* L */}
              <path
                className="valor-startup-letter"
                pathLength="1"
                d="M146 20 V80 H184"
              />
              {/* O */}
              <path
                className="valor-startup-letter"
                pathLength="1"
                d="M214 50 a22 30 0 1 0 44 0 a22 30 0 1 0 -44 0"
              />
              {/* R */}
              <path
                className="valor-startup-letter"
                pathLength="1"
                d="M282 80 V20 H306 a15 15 0 0 1 0 30 H282 M304 50 L326 80"
              />
            </g>
            {/* Underline */}
            <path
              className="valor-startup-underline"
              pathLength="1"
              d="M118 108 H218"
            />
          </svg>
        )}
      </div>

      {/* Low-contrast, subtle "Retry" link (after 30s) */}
      <button
        type="button"
        className={`valor-startup-retry-link ${showRetryLink ? 'is-visible' : ''}`}
        onClick={handleRetryClick}
      >
        Retry
      </button>
    </div>
  );
};

export default RemoteStartupScreen;
