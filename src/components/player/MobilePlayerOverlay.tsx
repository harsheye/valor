import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, RotateCw,
  Volume2, VolumeX, Bookmark as BookmarkIcon,
  MessageSquare, Gauge, Maximize, Minimize,
  ArrowLeft, Cast, ChevronLeft, X, Plus, Trash2, Film
} from 'lucide-react';
import type { Bookmark, VideoItem } from '../../types/media';
import { usePlayerIsland } from './usePlayerIsland';
import './MobilePlayerOverlay.css';

const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export interface MobilePlayerOverlayProps {
  title: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  bookmarks?: Bookmark[];
  upNextVideos?: VideoItem[];
  metadata?: {
    resolution?: string;
    codec?: string;
    audioChannels?: string;
    container?: string;
  };

  // Handlers
  onBack: () => void;
  onTogglePlay: () => void;
  onRewind10: () => void;
  onForward10: () => void;
  onToggleMute: () => void;
  onAddBookmark?: (time: number) => void;
  onDeleteBookmark?: (id: string) => void;
  onSeekToBookmark?: (time: number) => void;
  onOpenAudioSubMenu: () => void;
  onChangeSpeed: (speed: number) => void;
  onToggleFullscreen: () => void;
  onSeek: (time: number) => void;
  onSelectVideo?: (video: VideoItem) => void;
  formatTime: (secs: number) => string;
}

export const MobilePlayerOverlay: React.FC<MobilePlayerOverlayProps> = ({
  title,
  currentTime,
  duration,
  isPlaying,
  isMuted,
  playbackRate,
  isFullscreen,
  bookmarks = [],
  upNextVideos = [],
  metadata,
  onBack,
  onTogglePlay,
  onRewind10,
  onForward10,
  onToggleMute,
  onAddBookmark,
  onDeleteBookmark,
  onSeekToBookmark,
  onOpenAudioSubMenu,
  onChangeSpeed,
  onToggleFullscreen,
  onSeek,
  onSelectVideo,
  formatTime
}) => {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'now' | 'bookmarks' | 'next'>('now');
  const island = usePlayerIsland();

  const hideTimeoutRef = useRef<any>(null);
  const scrubTrackRef = useRef<HTMLDivElement>(null);
  const [isDraggingScrub, setIsDraggingScrub] = useState(false);

  // Auto-hide controls after 3 seconds of inactivity during playback
  const resetHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (isPlaying && !isDrawerOpen) {
      hideTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [isPlaying, isDrawerOpen]);

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    } else {
      resetHideTimer();
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [isPlaying, resetHideTimer]);

  const handleTapScreen = () => {
    if (isDrawerOpen) {
      setIsDrawerOpen(false);
      return;
    }
    setControlsVisible(v => {
      const next = !v;
      if (next) resetHideTimer();
      return next;
    });
  };

  // Speed cycler (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
  const handleCycleSpeed = () => {
    resetHideTimer();
    const currIdx = SPEED_STEPS.indexOf(playbackRate);
    const nextIdx = (currIdx + 1) % SPEED_STEPS.length;
    const nextSpeed = SPEED_STEPS[nextIdx];
    onChangeSpeed(nextSpeed);
    island.notify({ type: 'speed', value: nextSpeed });
  };

  // Bookmark handler
  const handleBookmarkClick = () => {
    resetHideTimer();
    if (onAddBookmark) {
      onAddBookmark(currentTime);
    }
    island.notify({
      type: 'bookmark',
      time: Math.floor(currentTime),
      count: bookmarks.length + 1
    });
  };

  // Scrubber drag / tap handler
  const handleScrubMove = (clientX: number) => {
    if (!scrubTrackRef.current || duration <= 0) return;
    const rect = scrubTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    resetHideTimer();
    setIsDraggingScrub(true);
    handleScrubMove(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDraggingScrub) {
      resetHideTimer();
      handleScrubMove(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    setIsDraggingScrub(false);
    resetHideTimer();
  };

  // Progress percentage
  const progressRatio = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  const remainingSecs = Math.max(0, duration - currentTime);

  return (
    <div
      className={`mobile-player-overlay ${controlsVisible ? 'controls-visible' : 'controls-hidden'}`}
      onTouchStart={resetHideTimer}
    >
      {/* Tap Video Zone to Toggle Controls */}
      <div
        className="mobile-player-tap-zone"
        onClick={handleTapScreen}
      />

      {/* Top Row */}
      <div className="mobile-player-top-bar" onClick={(e) => e.stopPropagation()}>
        {/* 38px Circular Back Button (exits player, saves resume position) */}
        <button
          type="button"
          onClick={onBack}
          className="mobile-player-circle-btn"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Centered single-line ellipsis title */}
        <h2 className="mobile-player-title" title={title}>
          {title}
        </h2>

        {/* Right: Cast icon */}
        <button
          type="button"
          onClick={() => island.notify({ type: 'cast', device: 'Screen / TV' })}
          className="mobile-player-circle-btn"
          aria-label="Cast to screen"
        >
          <Cast size={18} />
        </button>
      </div>

      {/* Right-Edge Drawer Tab (22x70px rounded pill on right screen edge) */}
      {!isDrawerOpen && controlsVisible && (
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="mobile-player-drawer-tab"
          aria-label="Open playback drawer"
        >
          <ChevronLeft size={16} />
        </button>
      )}

      {/* Bottom Block */}
      <div className="mobile-player-bottom-block" onClick={(e) => e.stopPropagation()}>
        {/* Scrubber row: 4px accent scrubber + remaining time */}
        <div className="mobile-player-scrubber-row">
          <div
            ref={scrubTrackRef}
            className="mobile-player-scrub-track"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => handleScrubMove(e.clientX)}
          >
            <div className="mobile-player-scrub-bar">
              <div
                className="mobile-player-scrub-fill"
                style={{ width: `${progressRatio * 100}%` }}
              />
              <div
                className="mobile-player-scrub-thumb"
                style={{ left: `${progressRatio * 100}%` }}
              />
            </div>
          </div>

          <span className="mobile-player-time-remaining">
            -{formatTime(remainingSecs)}
          </span>
        </div>

        {/* Controls row with 8 touch targets (min 40px each, evenly spaced) */}
        <div className="mobile-player-controls-row">
          {/* 1. Play / Pause */}
          <button
            type="button"
            onClick={onTogglePlay}
            className={`mobile-player-btn primary-play`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>

          {/* 2. Rewind 10s */}
          <button
            type="button"
            onClick={onRewind10}
            className="mobile-player-btn"
            aria-label="Rewind 10 seconds"
          >
            <div className="mobile-player-icon-hud">
              <RotateCcw size={20} />
              <span className="mobile-player-hud-text">10</span>
            </div>
          </button>

          {/* 3. Forward 10s */}
          <button
            type="button"
            onClick={onForward10}
            className="mobile-player-btn"
            aria-label="Forward 10 seconds"
          >
            <div className="mobile-player-icon-hud">
              <RotateCw size={20} />
              <span className="mobile-player-hud-text">10</span>
            </div>
          </button>

          {/* 4. Mute / Unmute */}
          <button
            type="button"
            onClick={onToggleMute}
            className="mobile-player-btn"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          {/* 5. Bookmark */}
          <button
            type="button"
            onClick={handleBookmarkClick}
            className="mobile-player-btn"
            aria-label="Add bookmark"
          >
            <BookmarkIcon size={19} />
          </button>

          {/* 6. Subtitles & Audio (opens 4-tab bottom sheet) */}
          <button
            type="button"
            onClick={() => {
              setControlsVisible(true);
              onOpenAudioSubMenu();
            }}
            className="mobile-player-btn"
            aria-label="Subtitles & Audio"
          >
            <MessageSquare size={19} />
          </button>

          {/* 7. Speed (cycles 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x) */}
          <button
            type="button"
            onClick={handleCycleSpeed}
            className="mobile-player-btn"
            aria-label={`Playback speed ${playbackRate}x`}
          >
            <span className="mobile-player-speed-text">
              {playbackRate}x
            </span>
          </button>

          {/* 8. Fullscreen toggle */}
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="mobile-player-btn"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>

      {/* Right Drawer (78% width: Now playing, Bookmarks, Up next) */}
      {isDrawerOpen && (
        <div className="mobile-player-drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="mobile-player-drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-player-drawer-header">
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx, #fff)' }}>
                {activeDrawerTab === 'now' ? 'Now Playing' : activeDrawerTab === 'bookmarks' ? 'Bookmarks' : 'Up Next'}
              </span>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--mut, #8b93a5)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Segmented 3-tab switcher */}
            <div className="mobile-player-drawer-tabs">
              <button
                type="button"
                className={`mobile-player-drawer-tab-btn ${activeDrawerTab === 'now' ? 'active' : ''}`}
                onClick={() => setActiveDrawerTab('now')}
              >
                Now playing
              </button>
              <button
                type="button"
                className={`mobile-player-drawer-tab-btn ${activeDrawerTab === 'bookmarks' ? 'active' : ''}`}
                onClick={() => setActiveDrawerTab('bookmarks')}
              >
                Bookmarks ({bookmarks.length})
              </button>
              <button
                type="button"
                className={`mobile-player-drawer-tab-btn ${activeDrawerTab === 'next' ? 'active' : ''}`}
                onClick={() => setActiveDrawerTab('next')}
              >
                Up next
              </button>
            </div>

            <div className="mobile-player-drawer-body">
              {/* Tab 1: Now Playing Metadata */}
              {activeDrawerTab === 'now' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: 'var(--s1, #141a25)', padding: '12px', borderRadius: '12px', border: '1px solid var(--ln, #232b3a)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--mut, #8b93a5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title</span>
                    <p style={{ margin: '4px 0 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--tx, #fff)', wordBreak: 'break-word' }}>
                      {title}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ background: 'var(--s1, #141a25)', padding: '10px', borderRadius: '10px', border: '1px solid var(--ln, #232b3a)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--mut, #8b93a5)', textTransform: 'uppercase' }}>Resolution</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--tx, #fff)' }}>
                        {metadata?.resolution || '1080p'}
                      </p>
                    </div>

                    <div style={{ background: 'var(--s1, #141a25)', padding: '10px', borderRadius: '10px', border: '1px solid var(--ln, #232b3a)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--mut, #8b93a5)', textTransform: 'uppercase' }}>Codec</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--tx, #fff)' }}>
                        {metadata?.codec || 'H.264 / AAC'}
                      </p>
                    </div>

                    <div style={{ background: 'var(--s1, #141a25)', padding: '10px', borderRadius: '10px', border: '1px solid var(--ln, #232b3a)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--mut, #8b93a5)', textTransform: 'uppercase' }}>Audio Layout</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--tx, #fff)' }}>
                        {metadata?.audioChannels || 'Stereo 2.0'}
                      </p>
                    </div>

                    <div style={{ background: 'var(--s1, #141a25)', padding: '10px', borderRadius: '10px', border: '1px solid var(--ln, #232b3a)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--mut, #8b93a5)', textTransform: 'uppercase' }}>Duration</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '13px', fontWeight: 600, color: 'var(--tx, #fff)' }}>
                        {formatTime(duration)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Bookmarks */}
              {activeDrawerTab === 'bookmarks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleBookmarkClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px',
                      background: 'var(--ac, #ff5a68)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={16} />
                    <span>Bookmark at {formatTime(currentTime)}</span>
                  </button>

                  {bookmarks.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--mut, #8b93a5)', textAlign: 'center', margin: '20px 0' }}>
                      No bookmarks saved yet.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {bookmarks.map((bm) => (
                        <div
                          key={bm.id || bm.time}
                          onClick={() => {
                            if (onSeekToBookmark) onSeekToBookmark(bm.time);
                            else onSeek(bm.time);
                            setIsDrawerOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'var(--s1, #141a25)',
                            border: '1px solid var(--ln, #232b3a)',
                            borderRadius: '10px',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx, #fff)' }}>
                              {bm.title || `Bookmark`}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--ac, #ff5a68)', fontFamily: 'monospace' }}>
                              {formatTime(bm.time)}
                            </span>
                          </div>

                          {onDeleteBookmark && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteBookmark(bm.id);
                              }}
                              style={{ background: 'none', border: 'none', color: '#ef4444', padding: '4px', cursor: 'pointer' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Up Next */}
              {activeDrawerTab === 'next' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {upNextVideos.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--mut, #8b93a5)', textAlign: 'center', margin: '20px 0' }}>
                      No more videos in this playlist.
                    </p>
                  ) : (
                    upNextVideos.map((v) => (
                      <div
                        key={v.id}
                        onClick={() => {
                          if (onSelectVideo) {
                            onSelectVideo(v);
                            setIsDrawerOpen(false);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px',
                          background: 'var(--s1, #141a25)',
                          border: '1px solid var(--ln, #232b3a)',
                          borderRadius: '10px',
                          cursor: 'pointer'
                        }}
                      >
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            background: 'var(--surface-3, #232b3a)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--ac, #ff5a68)',
                            flexShrink: 0
                          }}
                        >
                          <Film size={16} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx, #fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.title}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--mut, #8b93a5)' }}>
                            {v.duration ? formatTime(Number(v.duration)) : 'Video'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
