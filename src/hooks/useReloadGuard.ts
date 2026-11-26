import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseReloadGuardOptions {
  isCollectionLoaded: boolean;
  onSaveState: () => void;
}

export function useReloadGuard({
  isCollectionLoaded,
  onSaveState,
}: UseReloadGuardOptions) {
  const [showModal, setShowModal] = useState(false);
  const guardDisabledRef = useRef(false);
  const onSaveStateRef = useRef(onSaveState);
  onSaveStateRef.current = onSaveState;

  // 1. Intercept F5, Ctrl+R, Cmd+R, Ctrl+Shift+R while a collection is loaded
  useEffect(() => {
    const isTyping = (el: any): boolean => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCollectionLoaded) return;
      if (guardDisabledRef.current) return;

      // Do not trigger while typing in an input
      if (isTyping(e.target) || isTyping(document.activeElement)) {
        return;
      }

      const isF5 = e.key === 'F5' || e.keyCode === 116;
      const isR = e.key === 'r' || e.key === 'R' || e.keyCode === 82;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isF5 || (isCtrlOrCmd && isR)) {
        e.preventDefault();
        e.stopPropagation();
        setShowModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isCollectionLoaded]);

  // 2. Register beforeunload handler active ONLY while collection is loaded
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isCollectionLoaded) return;
      if (guardDisabledRef.current) return;

      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isCollectionLoaded]);

  // 3. Save position and playlist state on pagehide and visibilitychange
  useEffect(() => {
    const handlePageHide = () => {
      if (isCollectionLoaded) {
        onSaveStateRef.current();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isCollectionLoaded) {
        onSaveStateRef.current();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isCollectionLoaded]);

  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const reloadAnyway = useCallback(() => {
    guardDisabledRef.current = true;
    setShowModal(false);
    try {
      onSaveStateRef.current();
    } catch (e) {
      console.warn('[useReloadGuard] onSaveState error during reload:', e);
    }
    window.location.reload();
  }, []);

  return {
    showModal,
    dismissModal,
    reloadAnyway,
  };
}
