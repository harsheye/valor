import React, { useState, useRef, useCallback } from 'react';
import type { Bookmark } from '../../types/media';

export interface ScrubBarProps {
  currentTime: number;
  duration: number;
  bufferedRanges?: { start: number; end: number }[];
  bookmarks?: Bookmark[];
  onSeek: (time: number) => void;
  formatTime: (secs: number) => string;
  previewThumbnailUrl?: string;
}

export const ScrubBar: React.FC<ScrubBarProps> = ({
  currentTime,
  duration,
  bufferedRanges = [],
  bookmarks = [],
  onSeek,
  formatTime,
}) => {
  const [hoverTime, setHoverTime] = useState<string>('0:00');
  const [hoverPercent, setHoverPercent] = useState<number>(0);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current || duration <= 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPercent(percent * 100);
    setHoverTime(formatTime(percent * duration));

    if (isScrubbing) {
      onSeek(percent * duration);
    }
  }, [duration, isScrubbing, onSeek, formatTime]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!barRef.current || duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsScrubbing(true);
    const rect = barRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(percent * duration);
  }, [duration, onSeek]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, [isScrubbing]);

  const getBookmarkColor = (bm: Bookmark) => {
    if (bm.isIntro || bm.category === 'Intro') return '#fbbf24'; // amber/yellow
    if (bm.category === 'Preview' || bm.category === 'Recap') return '#a78bfa'; // purple
    if (bm.isOutro || bm.category === 'Outro') return '#34d399'; // green
    if (bm.category === 'Nudity' || bm.category === 'Sex') return '#f43f5e'; // rose/red
    if (bm.category === 'Gore') return '#ef4444'; // red
    return 'var(--accent-color, #e50914)';
  };

  return (
    <div
      ref={barRef}
      className="valor-scrub-bar-container"
      style={{
        position: 'relative',
        width: '100%',
        height: '16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
        touchAction: 'none'
      }}
      onPointerEnter={() => setIsHovering(true)}
      onPointerLeave={() => setIsHovering(false)}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background Track */}
      <div style={{
        width: '100%',
        height: isHovering || isScrubbing ? '6px' : '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: '3px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'height 0.15s ease'
      }}>
        {/* Buffered Ranges */}
        {bufferedRanges.map((r, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${duration > 0 ? (r.start / duration) * 100 : 0}%`,
              width: `${duration > 0 ? ((r.end - r.start) / duration) * 100 : 0}%`,
              backgroundColor: 'rgba(255, 255, 255, 0.35)'
            }}
          />
        ))}

        {/* Played Progress Bar */}
        <div style={{
          width: `${progressPercent}%`,
          height: '100%',
          backgroundColor: 'var(--accent-color, #e50914)',
          position: 'relative'
        }} />
      </div>

      {/* Bookmark Markers along timeline */}
      {duration > 0 && bookmarks.map((bm) => {
        const leftPercent = (bm.time / duration) * 100;
        if (leftPercent < 0 || leftPercent > 100) return null;
        const color = getBookmarkColor(bm);
        const hasRange = bm.endTime && bm.endTime > bm.time;
        const rangeWidthPercent = hasRange ? ((bm.endTime! - bm.time) / duration) * 100 : 0;

        return (
          <React.Fragment key={bm.id}>
            {hasRange && (
              <div
                style={{
                  position: 'absolute',
                  left: `${leftPercent}%`,
                  width: `${rangeWidthPercent}%`,
                  top: '5px',
                  height: isHovering || isScrubbing ? '6px' : '4px',
                  backgroundColor: color,
                  opacity: 0.45,
                  pointerEvents: 'none'
                }}
              />
            )}
            <div
              title={`${bm.label || bm.category || 'Bookmark'} (${formatTime(bm.time)})`}
              style={{
                position: 'absolute',
                left: `${leftPercent}%`,
                transform: 'translateX(-50%)',
                width: '4px',
                height: isHovering || isScrubbing ? '10px' : '7px',
                borderRadius: '1px',
                backgroundColor: color,
                zIndex: 2,
                boxShadow: `0 0 4px ${color}`
              }}
            />
          </React.Fragment>
        );
      })}

      {/* Scrub Handle Thumb */}
      <div style={{
        position: 'absolute',
        left: `${progressPercent}%`,
        transform: 'translateX(-50%)',
        width: isHovering || isScrubbing ? '14px' : '10px',
        height: isHovering || isScrubbing ? '14px' : '10px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.6), 0 0 6px var(--accent-color, #e50914)',
        zIndex: 4,
        transition: 'width 0.15s ease, height 0.15s ease',
        pointerEvents: 'none'
      }} />

      {/* Hover Tooltip with Timestamp */}
      {isHovering && duration > 0 && (
        <div style={{
          position: 'absolute',
          left: `${hoverPercent}%`,
          bottom: '22px',
          transform: 'translateX(-50%)',
          background: 'var(--dropdown-bg, rgba(15, 23, 42, 0.95))',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.2))',
          borderRadius: '6px',
          padding: '3px 8px',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-primary, #ffffff)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6)',
          zIndex: 10,
          fontFamily: 'var(--font-sans)'
        }}>
          {hoverTime}
        </div>
      )}
    </div>
  );
};
