import React from 'react';
import type { MediaChapter } from '../types/media';

export function getActiveChapter(
  chapters: MediaChapter[],
  timeSecs: number
): MediaChapter | null {
  if (!chapters || chapters.length === 0) return null;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const nextStart = chapters[i + 1]?.startTime ?? ch.endTime ?? Infinity;
    if (timeSecs >= ch.startTime && timeSecs < nextStart) {
      return ch;
    }
  }
  return chapters[chapters.length - 1] || null;
}

interface ChapterScrubSegmentsProps {
  chapters: MediaChapter[];
  duration: number;
  currentTime: number;
  bufferedPercent: number;
  hoverTime: number | null;
  accentColor?: string;
}

export const ChapterScrubSegments: React.FC<ChapterScrubSegmentsProps> = ({
  chapters,
  duration,
  currentTime,
  bufferedPercent,
  hoverTime,
  accentColor = 'var(--accent-color, #8b5cf6)',
}) => {
  if (!chapters || chapters.length === 0 || duration <= 0) {
    return null;
  }

  const bufferedTime = (Math.min(100, Math.max(0, bufferedPercent)) / 100) * duration;

  return (
    <div
      className="chapter-scrub-segments"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
        height: '6px',
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      {chapters.map((ch, idx) => {
        const start = Math.max(0, ch.startTime);
        const rawEnd = ch.endTime > start ? ch.endTime : (chapters[idx + 1]?.startTime ?? duration);
        const end = Math.min(duration, Math.max(start, rawEnd));
        const span = Math.max(0.01, end - start);
        const widthPct = (span / duration) * 100;

        const playedRatio = Math.min(1, Math.max(0, (currentTime - start) / span));
        const bufferedRatio = Math.min(1, Math.max(0, (bufferedTime - start) / span));
        const isHovered =
          hoverTime !== null && hoverTime >= start && (hoverTime < end || idx === chapters.length - 1);

        return (
          <div
            key={ch.id || idx}
            style={{
              position: 'relative',
              width: `${widthPct}%`,
              height: isHovered ? '6px' : '4px',
              background: 'rgba(255, 255, 255, 0.25)',
              borderRadius: '2px',
              overflow: 'hidden',
              transition: 'height 0.12s ease',
            }}
          >
            {bufferedRatio > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${bufferedRatio * 100}%`,
                  background: 'rgba(255, 255, 255, 0.32)',
                }}
              />
            )}
            {isHovered && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(255, 255, 255, 0.35)',
                }}
              />
            )}
            {playedRatio > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: `${playedRatio * 100}%`,
                  background: accentColor,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
