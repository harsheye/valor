import React from 'react';
import type { Bookmark, MediaChapter } from '../types/media';

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

export function getBookmarkRangeColor(bm: Bookmark): string {
  if (bm.category === 'Hot Scene') return 'rgba(239, 68, 68, 0.9)';
  if (bm.isOutro || bm.category === 'Outro') return 'rgba(168, 85, 247, 0.9)';
  return 'rgba(59, 130, 246, 0.9)';
}

interface TimelineSegment {
  id: string;
  start: number;
  end: number;
  bookmark?: Bookmark;
}

function buildSegments(
  chapters: MediaChapter[],
  bookmarks: Bookmark[],
  duration: number
): TimelineSegment[] {
  if (chapters.length > 0) {
    return chapters.map((ch, idx) => {
      const start = Math.max(0, ch.startTime);
      const rawEnd = ch.endTime > start ? ch.endTime : (chapters[idx + 1]?.startTime ?? duration);
      const end = Math.min(duration, Math.max(start, rawEnd));
      const overlappingBm = bookmarks.find((bm) => {
        const isOutro = bm.isOutro || bm.category === 'Outro';
        const bmEnd = bm.endTime ?? (isOutro ? duration : bm.time);
        return bmEnd > start && bm.time < end;
      });
      return { id: ch.id || `ch-${idx}`, start, end, bookmark: overlappingBm };
    });
  }

  // No embedded chapters: split timeline at every bookmark point/range!
  const cuts = new Set<number>([0, duration]);
  for (const bm of bookmarks) {
    const t = Math.max(0, Math.min(duration, bm.time));
    cuts.add(t);
    const isOutro = bm.isOutro || bm.category === 'Outro';
    const bmEnd = bm.endTime ?? (isOutro ? duration : null);
    if (bmEnd !== null && bmEnd > t) {
      cuts.add(Math.max(0, Math.min(duration, bmEnd)));
    }
  }
  const sorted = Array.from(cuts).sort((a, b) => a - b);
  const segs: TimelineSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end - start < 0.05) continue;
    const mid = (start + end) * 0.5;
    const bm = bookmarks.find((b) => {
      const isOutro = b.isOutro || b.category === 'Outro';
      const bmEnd = b.endTime ?? (isOutro ? duration : null);
      return bmEnd !== null && bmEnd > b.time && mid >= b.time && mid <= bmEnd;
    });
    segs.push({ id: `bm-seg-${i}`, start, end, bookmark: bm });
  }
  return segs;
}

interface ChapterScrubSegmentsProps {
  chapters: MediaChapter[];
  duration: number;
  currentTime: number;
  bufferedPercent: number;
  hoverTime: number | null;
  bookmarks?: Bookmark[];
  accentColor?: string;
}

export const ChapterScrubSegments: React.FC<ChapterScrubSegmentsProps> = ({
  chapters,
  duration,
  currentTime,
  bufferedPercent,
  hoverTime,
  bookmarks = [],
  accentColor = 'var(--accent-color, #8b5cf6)',
}) => {
  if (duration <= 0 || (chapters.length === 0 && bookmarks.length === 0)) {
    return null;
  }

  const segments = buildSegments(chapters, bookmarks, duration);
  if (segments.length === 0) return null;

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
      {segments.map((seg, idx) => {
        const span = Math.max(0.01, seg.end - seg.start);
        const widthPct = (span / duration) * 100;
        const playedRatio = Math.min(1, Math.max(0, (currentTime - seg.start) / span));
        const bufferedRatio = Math.min(1, Math.max(0, (bufferedTime - seg.start) / span));
        const isHovered =
          hoverTime !== null && hoverTime >= seg.start && (hoverTime < seg.end || idx === segments.length - 1);

        const bmColor = seg.bookmark ? getBookmarkRangeColor(seg.bookmark) : null;
        const segBg = bmColor ? bmColor.replace('0.9', '0.35') : 'rgba(255, 255, 255, 0.25)';
        const segFill = bmColor || accentColor;

        return (
          <div
            key={seg.id}
            style={{
              position: 'relative',
              width: `${widthPct}%`,
              height: isHovered ? '6px' : '4px',
              background: segBg,
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
                  background: segFill,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
