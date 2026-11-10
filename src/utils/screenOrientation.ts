/**
 * screenOrientation.ts
 * Manages auto-locking to landscape orientation on mobile devices when inside video players,
 * and restoring/unlocking when exiting player view.
 */

import { useEffect, useRef } from 'react';

/**
 * Accurately determines if the current device/viewport is a mobile/tablet touch environment,
 * even when rotated into landscape mode (where viewport width may exceed 768px).
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  
  // Shorter screen dimension (phone/tablet height in landscape or width in portrait)
  const screenMinDim = Math.min(window.screen.width, window.screen.height);
  const innerMinDim = Math.min(window.innerWidth, window.innerHeight);

  const isSmallDevice = screenMinDim <= 850 || innerMinDim <= 850;
  
  return Boolean((hasTouch || isCoarsePointer) && isSmallDevice) || window.innerWidth <= 768;
};

/**
 * Attempts to lock screen orientation to landscape.
 * Uses Screen Orientation API, handling fullscreen requirement when necessary.
 */
export const lockToLandscape = async (element?: HTMLElement | null): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Direct standard Screen Orientation API
    const orientation = window.screen?.orientation as any;
    if (orientation && typeof orientation.lock === 'function') {
      try {
        await orientation.lock('landscape');
        return true;
      } catch (err: any) {
        // Mobile browsers (such as Chrome on Android) often require document to be in fullscreen before locking
        const target = element || document.documentElement;
        if (target && !document.fullscreenElement) {
          try {
            if (target.requestFullscreen) {
              await target.requestFullscreen();
            } else if ((target as any).webkitRequestFullscreen) {
              await (target as any).webkitRequestFullscreen();
            }
            if (orientation && typeof orientation.lock === 'function') {
              await orientation.lock('landscape');
              return true;
            }
          } catch (fsErr) {
            // Fullscreen or subsequent lock attempt failed
          }
        }
      }
    }

    // 2. Legacy vendor-prefixed APIs
    const screenAny = window.screen as any;
    if (typeof screenAny.lockOrientation === 'function') {
      return screenAny.lockOrientation('landscape');
    } else if (typeof screenAny.mozLockOrientation === 'function') {
      return screenAny.mozLockOrientation('landscape');
    } else if (typeof screenAny.msLockOrientation === 'function') {
      return screenAny.msLockOrientation('landscape');
    }
  } catch (e) {
    // Silently ignore on unsupported browsers (e.g. desktop)
  }

  return false;
};

/**
 * Releases any screen orientation lock back to natural orientation.
 */
export const unlockOrientation = (): void => {
  if (typeof window === 'undefined') return;

  try {
    const orientation = window.screen?.orientation as any;
    if (orientation && typeof orientation.unlock === 'function') {
      orientation.unlock();
    }
    const screenAny = window.screen as any;
    if (typeof screenAny.unlockOrientation === 'function') {
      screenAny.unlockOrientation();
    }
  } catch (e) {
    // Ignore
  }
};

/**
 * React hook that automatically locks orientation to landscape on mobile while active,
 * re-attempting upon user touch/click/fullscreen, and releasing on unmount.
 */
export const useAutoLandscape = (
  active: boolean = true,
  targetElementRef?: React.RefObject<HTMLElement | null>
) => {
  const hasLockedRef = useRef(false);

  useEffect(() => {
    if (!active || !isMobileDevice()) return;

    const attempt = async () => {
      const el = targetElementRef?.current || document.documentElement;
      const ok = await lockToLandscape(el);
      if (ok) hasLockedRef.current = true;
    };

    // 1. Attempt immediately on mount
    attempt();

    // 2. Re-attempt on touch/click gesture if browser required user activation
    const handleGesture = () => {
      if (!hasLockedRef.current) {
        attempt();
      }
    };

    // 3. Re-attempt when entering fullscreen
    const handleFullscreen = () => {
      if (document.fullscreenElement) {
        attempt();
      }
    };

    window.addEventListener('touchstart', handleGesture, { passive: true });
    window.addEventListener('click', handleGesture, { once: true });
    document.addEventListener('fullscreenchange', handleFullscreen);
    document.addEventListener('webkitfullscreenchange', handleFullscreen);

    return () => {
      window.removeEventListener('touchstart', handleGesture);
      window.removeEventListener('click', handleGesture);
      document.removeEventListener('fullscreenchange', handleFullscreen);
      document.removeEventListener('webkitfullscreenchange', handleFullscreen);
      unlockOrientation();
    };
  }, [active, targetElementRef]);
};
