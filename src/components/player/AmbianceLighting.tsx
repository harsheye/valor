import React, { useEffect, useRef } from 'react';

export interface AmbianceLightingProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isEnabled: boolean;
  blur?: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * High-performance ambient lighting canvas for video playback.
 * Renders a blurred, dynamically scaled color halo behind the active video element.
 * Throttles draw calls to ~30 FPS during playback and updates on pause/seek to conserve GPU/CPU.
 */
export const AmbianceLighting: React.FC<AmbianceLightingProps> = ({
  videoRef,
  isEnabled,
  blur = 54,
  opacity = 0.7,
  className,
  style
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!isEnabled) {
      // Clear canvas when disabled
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let rafId: number | null = null;
    let isActive = true;
    let lastDrawTime = 0;
    const FRAME_INTERVAL = 1000 / 30; // 30 FPS target for smooth ambient backlight

    const drawFrame = () => {
      const video = videoRef.current;
      if (!video || !canvas) return;
      if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!ctx) return;

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        // Tainted canvas or cross-origin security fallback - fail silently
      }
    };

    const renderLoop = (time: number) => {
      if (!isActive) return;

      const video = videoRef.current;
      if (video && !video.paused && !video.ended) {
        if (time - lastDrawTime >= FRAME_INTERVAL) {
          lastDrawTime = time;
          drawFrame();
        }
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    // Draw immediately for current state (e.g. paused or ready)
    drawFrame();

    // Start requestAnimationFrame loop
    rafId = requestAnimationFrame(renderLoop);

    // Event listeners to keep ambiance perfectly synced with playback lifecycle
    const video = videoRef.current;
    const handleSyncDraw = () => {
      drawFrame();
    };

    if (video) {
      video.addEventListener('play', handleSyncDraw);
      video.addEventListener('pause', handleSyncDraw);
      video.addEventListener('seeked', handleSyncDraw);
      video.addEventListener('loadeddata', handleSyncDraw);
      video.addEventListener('timeupdate', handleSyncDraw);
    }

    return () => {
      isActive = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (video) {
        video.removeEventListener('play', handleSyncDraw);
        video.removeEventListener('pause', handleSyncDraw);
        video.removeEventListener('seeked', handleSyncDraw);
        video.removeEventListener('loadeddata', handleSyncDraw);
        video.removeEventListener('timeupdate', handleSyncDraw);
      }
    };
  }, [isEnabled, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={90}
      aria-hidden="true"
      className={`ambiance-lighting-canvas ${className || ''}`.trim()}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: '100%',
        height: '100%',
        transform: 'translate(-50%, -50%) scale(1.18)',
        filter: `blur(${blur}px)`,
        opacity: isEnabled ? opacity : 0,
        pointerEvents: 'none',
        zIndex: 0,
        display: isEnabled ? 'block' : 'none',
        transition: 'opacity 0.35s ease, filter 0.25s ease',
        willChange: isEnabled ? 'transform, filter, opacity' : 'auto',
        ...style
      }}
    />
  );
};
