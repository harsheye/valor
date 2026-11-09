import React, { useState, useEffect, useRef, useCallback } from 'react';

export type ReloadingLogoVariant = 'monogram' | 'letters';

export interface ReloadingOverlayProps {
  /**
   * Whether the reloading overlay is active / visible.
   * Defaults to true when mounted.
   * When switched to false, triggers a 250ms fade-out before unmounting.
   */
  isReloading?: boolean;

  /**
   * Logo variant:
   * - 'monogram' (variant A): Valor stylized 'V' monogram
   * - 'letters' (variant B): Full 'VALOR' animated lettering
   * Defaults to 'letters'.
   */
  variant?: ReloadingLogoVariant;

  /**
   * Optional URL / data URL of the last video frame to keep blurred behind the overlay.
   * If not provided, backdrop-filter will blur any underlying video element in DOM.
   */
  lastFrameUrl?: string;

  /**
   * Optional HTMLVideoElement reference. If provided and lastFrameUrl is omitted,
   * the component can capture the current video frame into a blurred canvas background.
   */
  videoElement?: HTMLVideoElement | null;

  /**
   * Callback fired when playback is ready and the 250ms fade-out finishes.
   */
  onReady?: () => void;

  /**
   * Callback fired when the 30s timeout elapses and enters the error state.
   */
  onErrorState?: () => void;

  /**
   * Optional custom error message displayed in the 30s error state.
   */
  errorMessage?: string;

  /**
   * Optional forced error state trigger (e.g. if parent detects a fatal reload failure immediately).
   */
  isError?: boolean;

  /**
   * Optional z-index override (defaults to 90 so player overlays sit over video but under menus).
   */
  zIndex?: number;

  /**
   * Optional additional class name.
   */
  className?: string;

  /**
   * Optional inline styles.
   */
  style?: React.CSSProperties;
}

/**
 * ReloadingOverlay
 *
 * Cinematic "reloading" overlay for the video player (works for embed player
 * and remote media player).
 *
 * - 16:9 ratio player area preserved.
 * - Blurred last video frame kept behind overlay (blur 10px, brightness 0.45).
 * - Animated SVG logo centered over the player (~12–18% player width).
 * - Pure clean design: all skeletons, retry, and switch server buttons removed.
 * - Fade in over 150ms.
 * - At 30s: transitions to a clear error indicator.
 * - Fade out over 250ms when playback is ready.
 * - Respects prefers-reduced-motion (static logo, no animations).
 * - Colors: crimson #e11d2e to #5a0a14, background #000, no pure #ff0000, no heavy glow.
 */
export const ReloadingOverlay: React.FC<ReloadingOverlayProps> = ({
  isReloading = true,
  variant = 'letters',
  lastFrameUrl,
  videoElement,
  onReady,
  onErrorState,
  errorMessage,
  isError = false,
  zIndex = 90,
  className = '',
  style
}) => {
  const [isRendered, setIsRendered] = useState(isReloading || isError);
  const [isFadingIn, setIsFadingIn] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isInErrorState, setIsInErrorState] = useState(isError);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(lastFrameUrl || null);

  const timer30sRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningOutRef = useRef(false);

  // Synchronize captured frame if lastFrameUrl prop changes
  useEffect(() => {
    if (lastFrameUrl) {
      setCapturedFrame(lastFrameUrl);
    }
  }, [lastFrameUrl]);

  // Attempt to capture last video frame if videoElement is passed and no URL provided
  useEffect(() => {
    if (capturedFrame || !videoElement) return;
    try {
      if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(videoElement.videoWidth, 640);
        canvas.height = Math.min(videoElement.videoHeight, 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          setCapturedFrame(canvas.toDataURL('image/jpeg', 0.65));
        }
      }
    } catch {
      // Cross-origin videos might taint canvas; backdrop-filter seamlessly handles blurring
    }
  }, [videoElement, capturedFrame]);

  // Handle external isError prop change
  useEffect(() => {
    if (isError) {
      setIsInErrorState(true);
    }
  }, [isError]);

  // Fade-out trigger when isReloading changes from true to false
  const triggerFadeOut = useCallback(() => {
    if (isTransitioningOutRef.current) return;
    isTransitioningOutRef.current = true;
    setIsFadingOut(true);

    if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
    fadeOutTimerRef.current = setTimeout(() => {
      setIsRendered(false);
      if (onReady) {
        onReady();
      }
    }, 250); // 250 ms fade-out
  }, [onReady]);

  // State machine lifecycle
  useEffect(() => {
    if (isReloading || isError) {
      setIsRendered(true);
      setIsFadingOut(false);
      isTransitioningOutRef.current = false;

      // 150ms fade-in phase
      setIsFadingIn(true);
      if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
      fadeInTimerRef.current = setTimeout(() => {
        setIsFadingIn(false);
      }, 150);

      if (!isError) {
        setIsInErrorState(false);

        // 30-second timer: switch to clear error state
        if (timer30sRef.current) clearTimeout(timer30sRef.current);
        timer30sRef.current = setTimeout(() => {
          setIsInErrorState(true);
          if (onErrorState) {
            onErrorState();
          }
        }, 30000);
      }

      return () => {
        if (timer30sRef.current) clearTimeout(timer30sRef.current);
        if (fadeInTimerRef.current) clearTimeout(fadeInTimerRef.current);
        if (fadeOutTimerRef.current) clearTimeout(fadeOutTimerRef.current);
      };
    } else if (isRendered && !isTransitioningOutRef.current) {
      triggerFadeOut();
    }
  }, [isReloading, isError, isRendered, triggerFadeOut, onErrorState]);

  if (!isRendered) return null;

  return (
    <div
      className={`valor-reloading-root ${isFadingIn ? 'is-fading-in' : ''} ${
        isFadingOut ? 'is-fading-out' : ''
      } ${isInErrorState ? 'is-error-state' : ''} ${className}`}
      style={{ zIndex, ...style }}
      role="status"
      aria-live="polite"
      aria-label={isInErrorState ? 'Stream reload failed' : 'Reloading media stream'}
    >
      <style>{`
        /* ═══════════════════════════════════════════════════════════════════
           VALOR RELOADING OVERLAY — SELF-CONTAINED STYLES
           ═══════════════════════════════════════════════════════════════════ */
        .valor-reloading-root {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background: #000000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          user-select: none;
          -webkit-user-select: none;
          pointer-events: auto;
          opacity: 1;
          /* Fade-in over 150ms / Fade-out over 250ms */
          transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .valor-reloading-root.is-fading-in {
          animation: valorFadeIn 150ms ease-out forwards;
        }

        .valor-reloading-root.is-fading-out {
          opacity: 0;
          pointer-events: none;
        }

        @keyframes valorFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        /* ─── BLURRED LAST FRAME (blur 10px, brightness 0.45) ─── */
        .valor-reloading-lastframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: blur(10px) brightness(0.45);
          transform: scale(1.08); /* prevents blur boundary bleeding */
          z-index: 1;
          pointer-events: none;
        }

        .valor-reloading-glass {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          backdrop-filter: blur(10px) brightness(0.45);
          -webkit-backdrop-filter: blur(10px) brightness(0.45);
          background: rgba(0, 0, 0, 0.52);
          z-index: 2;
          pointer-events: none;
        }

        /* ─── 16:9 PLAYER RATIO STAGE ─── */
        .valor-reloading-stage {
          position: relative;
          width: 100%;
          height: 100%;
          max-width: 100%;
          max-height: 100%;
          aspect-ratio: 16 / 9;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          z-index: 3;
          overflow: hidden;
        }

        /* ─── CENTER LOGO (12–18% player width) ─── */
        .valor-reloading-center-anchor {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10;
          pointer-events: auto;
          text-align: center;
          width: 100%;
          max-width: 90%;
        }

        /* Logo box sized to 12–18% of player width */
        .valor-reloading-logo-container {
          width: 15%;
          min-width: 12%;
          max-width: 18%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .valor-reloading-logo-svg {
          width: 100%;
          height: auto;
          display: block;
          overflow: visible;
        }

        /* SVG Lettering animation: crimson #e11d2e to #5a0a14, no pure red, no heavy glow */
        .valor-reloading-path {
          fill: none;
          stroke: #f3dcdc;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          opacity: 0;
          animation: valorLogoRise 3.6s ease-in-out infinite;
        }

        .valor-reloading-path.valor-lead-crimson {
          stroke: #e11d2e;
        }

        .valor-reloading-path:nth-child(2) { animation-delay: 0.14s; }
        .valor-reloading-path:nth-child(3) { animation-delay: 0.28s; }
        .valor-reloading-path:nth-child(4) { animation-delay: 0.42s; }
        .valor-reloading-path:nth-child(5) { animation-delay: 0.56s; }

        .valor-reloading-underline {
          stroke: #e11d2e;
          stroke-width: 1.3;
          stroke-linecap: round;
          fill: none;
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: valorLogoLine 3.6s ease-in-out infinite;
        }

        @keyframes valorLogoRise {
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

        @keyframes valorLogoLine {
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

        /* ─── 30S CLEAR ERROR STATE ─── */
        .valor-reloading-error-card {
          margin-top: clamp(14px, 2.5vw, 22px);
          max-width: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          animation: valorErrorFadeIn 350ms ease-out forwards;
        }

        @keyframes valorErrorFadeIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .valor-error-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(90, 10, 20, 0.45);
          border: 1px solid rgba(225, 29, 46, 0.4);
          border-radius: 9999px;
          color: #f1aeb5;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .valor-error-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #e11d2e;
        }

        .valor-error-title {
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13.5px;
          font-weight: 600;
          letter-spacing: -0.01em;
          margin: 0;
        }

        .valor-error-desc {
          color: rgba(255, 255, 255, 0.6);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 11.5px;
          line-height: 1.45;
          margin: 0;
          text-align: center;
        }

        /* ─── PREFERS-REDUCED-MOTION (static logo) ─── */
        @media (prefers-reduced-motion: reduce) {
          .valor-reloading-root,
          .valor-reloading-error-card {
            transition: none !important;
            animation: none !important;
          }
          .valor-reloading-path,
          .valor-reloading-underline {
            animation: none !important;
            stroke-dashoffset: 0 !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* Blurred previous video frame image */}
      {capturedFrame && (
        <img
          src={capturedFrame}
          className="valor-reloading-lastframe"
          alt=""
          aria-hidden="true"
        />
      )}

      {/* Backdrop-filter glass layer (blurs underlying video element or captured frame) */}
      <div className="valor-reloading-glass" aria-hidden="true" />

      {/* 16:9 aspect ratio stage containing centered logo */}
      <div className="valor-reloading-stage">
        {/* Center Logo & Interactive State Anchor (12–18% player width) */}
        <div className="valor-reloading-center-anchor">
          <div className="valor-reloading-logo-container">
            {variant === 'monogram' ? (
              /* Variant A: Monogram SVG (valor-logo-monogram.svg) */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 64 100"
                className="valor-reloading-logo-svg"
                role="img"
                aria-label="Valor Monogram"
              >
                <defs>
                  <filter id="valor-reloading-glow-mono" x="-30%" y="-50%" width="160%" height="200%">
                    <feGaussianBlur stdDeviation="2.2" result="b" />
                    <feColorMatrix
                      in="b"
                      values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0"
                    />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <g filter="url(#valor-reloading-glow-mono)" transform="translate(0 6)">
                  <path
                    className="valor-reloading-path valor-lead-crimson"
                    pathLength="1"
                    d="M10 20 L32 80 L54 20"
                  />
                </g>
                <path
                  className="valor-reloading-underline"
                  pathLength="1"
                  d="M16 92 H48"
                  style={{ stroke: '#5a0a14' }}
                />
              </svg>
            ) : (
              /* Variant B: Letters SVG (valor-logo-letters.svg) */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 336 120"
                className="valor-reloading-logo-svg"
                role="img"
                aria-label="Valor"
              >
                <defs>
                  <filter id="valor-reloading-glow-let" x="-30%" y="-50%" width="160%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="b" />
                    <feColorMatrix
                      in="b"
                      values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.22 0"
                    />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <g filter="url(#valor-reloading-glow-let)" transform="translate(0 6)">
                  {/* V */}
                  <path
                    className="valor-reloading-path valor-lead-crimson"
                    pathLength="1"
                    d="M10 20 L32 80 L54 20"
                  />
                  {/* A */}
                  <path
                    className="valor-reloading-path"
                    pathLength="1"
                    d="M78 80 L100 20 L122 80 M85 62 H115"
                  />
                  {/* L */}
                  <path
                    className="valor-reloading-path"
                    pathLength="1"
                    d="M146 20 V80 H184"
                  />
                  {/* O */}
                  <path
                    className="valor-reloading-path"
                    pathLength="1"
                    d="M214 50 a22 30 0 1 0 44 0 a22 30 0 1 0 -44 0"
                  />
                  {/* R */}
                  <path
                    className="valor-reloading-path"
                    pathLength="1"
                    d="M282 80 V20 H306 a15 15 0 0 1 0 30 H282 M304 50 L326 80"
                  />
                </g>
                {/* Underline */}
                <path
                  className="valor-reloading-underline"
                  pathLength="1"
                  d="M118 108 H218"
                />
              </svg>
            )}
          </div>

          {/* 30s Error State Card */}
          {isInErrorState && (
            <div className="valor-reloading-error-card">
              <div className="valor-error-badge">
                <span className="valor-error-badge-dot" />
                Connection Timeout
              </div>
              <h4 className="valor-error-title">
                {errorMessage || 'Playback Stalled'}
              </h4>
              <p className="valor-error-desc">
                Unable to resume playback after 30 seconds.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReloadingOverlay;
