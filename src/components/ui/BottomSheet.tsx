import React, { useEffect, useRef, useState, useCallback } from 'react';
import './BottomSheet.css';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
  hideHandle?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '80vh',
  className = '',
  hideHandle = false,
}) => {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef<number | null>(null);
  const dragCurrentYRef = useRef<number>(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isOpen) {
      setMounted(true);
      timer = setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      timer = setTimeout(() => setMounted(false), 250);
    }
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch drag to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartYRef.current === null) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0 && sheetRef.current) {
      dragCurrentYRef.current = dy;
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    if (dragCurrentYRef.current > 120) {
      onClose();
    }
    dragStartYRef.current = null;
    dragCurrentYRef.current = 0;
  };

  if (!mounted) return null;

  return (
    <div
      className={`bs-backdrop ${visible ? 'bs-in' : ''}`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={sheetRef}
        className={`bs-sheet ${className}`}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {!hideHandle && <div className="bs-handle" />}
        {title && (
          <div className="bs-header">
            <h2 className="bs-title">{title}</h2>
          </div>
        )}
        <div className="bs-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default BottomSheet;
