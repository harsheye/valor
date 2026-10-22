import React, { useState, useRef } from 'react';
import {
  Play, Pause, RotateCcw, RotateCw,
  Volume2, Volume1, VolumeX,
  Maximize, Minimize, MonitorPlay,
  MessageSquare, Bookmark as BookmarkIcon,
  Gauge
} from 'lucide-react';
import type { Bookmark } from '../../types/media';
import { ScrubBar } from './ScrubBar';
import { OdometerClock } from './OdometerClock';
import { SpeedMenu } from './SpeedMenu';

export interface PlayerBottomBarProps {
  currentTime: number;
  duration: number;
  bufferedRanges?: { start: number; end: number }[];
  bookmarks: Bookmark[];
  onSeek: (time: number) => void;
  formatTime: (secs: number) => string;

  // Playback & Volume
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRewind10: () => void;
  onForward10: () => void;
  volume: number;
  isMuted: boolean;
  onChangeVolume: (val: number) => void;
  onToggleMute: () => void;

  // Speed
  playbackRate: number;
  onChangeSpeed: (speed: number) => void;

  // Fullscreen & PiP
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTogglePiP?: () => void;

  // Audio & Subtitles Popover
  showAudioSubMenu: boolean;
  setShowAudioSubMenu: (show: boolean) => void;
  audioSubPopoverContent?: React.ReactNode;

  // Bookmarks Panel
  showBookmarksPopover: boolean;
  setShowBookmarksPopover: (show: boolean) => void;
  bookmarkPanelContent?: React.ReactNode;

  // System Time for Clock
  systemTime: Date;
}

export const PlayerBottomBar: React.FC<PlayerBottomBarProps> = ({
  currentTime,
  duration,
  bufferedRanges = [],
  bookmarks,
  onSeek,
  formatTime,
  isPlaying,
  onTogglePlay,
  onRewind10,
  onForward10,
  volume,
  isMuted,
  onChangeVolume,
  onToggleMute,
  playbackRate,
  onChangeSpeed,
  isFullscreen,
  onToggleFullscreen,
  onTogglePiP,
  showAudioSubMenu,
  setShowAudioSubMenu,
  audioSubPopoverContent,
  showBookmarksPopover,
  setShowBookmarksPopover,
  bookmarkPanelContent,
  systemTime,
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const audioSubTimeoutRef = useRef<any>(null);
  const bookmarksTimeoutRef = useRef<any>(null);

  return (
    <div
      className="player-bottom-bar-clean"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '16px 28px 24px 28px',
        background: 'var(--player-overlay-gradient-bottom, linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, transparent 100%))',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        zIndex: 100,
        pointerEvents: 'auto',
        userSelect: 'none'
      }}
    >
      {/* Timeline Scrub Bar */}
      <ScrubBar
        currentTime={currentTime}
        duration={duration}
        bufferedRanges={bufferedRanges}
        bookmarks={bookmarks}
        onSeek={onSeek}
        formatTime={formatTime}
      />

      {/* Control Actions Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#ffffff',
        position: 'relative'
      }}>
        {/* Left Group: Play/Pause, Skips, Volume, Time, Clock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={24} fill="#ffffff" /> : <Play size={24} fill="#ffffff" />}
          </button>

          {/* Rewind 10s */}
          <button
            onClick={onRewind10}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.85)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Rewind 10s (Left Arrow)"
          >
            <RotateCcw size={20} />
          </button>

          {/* Forward 10s */}
          <button
            onClick={onForward10}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.85)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Forward 10s (Right Arrow)"
          >
            <RotateCw size={20} />
          </button>

          {/* Volume Control */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}
            onWheel={(e) => {
              e.preventDefault();
              const delta = -e.deltaY * 0.0005;
              const nextVol = Math.max(0, Math.min(1, volume + delta));
              onChangeVolume(nextVol);
            }}
          >
            <button
              onClick={onToggleMute}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.85)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              style={{
                width: '74px',
                accentColor: 'var(--accent-color, #e50914)',
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', minWidth: '24px' }}>
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>

          {/* Time Display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', fontFamily: 'monospace' }}>
            <span>{formatTime(currentTime)}</span>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Odometer Clock */}
          <div style={{ marginLeft: '12px', opacity: 0.85 }}>
            <OdometerClock date={systemTime} />
          </div>
        </div>

        {/* Center Group: Audio & Subtitles + Bookmarks */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Audio & Subtitles Popover Trigger */}
          <div
            className="popover-wrapper"
            style={{ position: 'relative' }}
            onMouseEnter={() => {
              if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
              setShowAudioSubMenu(true);
            }}
            onMouseLeave={() => {
              audioSubTimeoutRef.current = setTimeout(() => {
                setShowAudioSubMenu(false);
              }, 200);
            }}
          >
            <button
              onClick={() => setShowAudioSubMenu(!showAudioSubMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: showAudioSubMenu ? 'var(--accent-glow, rgba(229, 9, 20, 0.25))' : 'rgba(255, 255, 255, 0.08)',
                border: '1px solid',
                borderColor: showAudioSubMenu ? 'var(--accent-color, #e50914)' : 'rgba(255, 255, 255, 0.12)',
                borderRadius: '20px',
                padding: '6px 14px',
                color: showAudioSubMenu ? 'var(--accent-color, #e50914)' : '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Audio & Subtitles (C)"
            >
              <MessageSquare size={16} />
              <span>Audio & Subs</span>
            </button>

            {showAudioSubMenu && audioSubPopoverContent}
          </div>

          {/* Bookmarks Popover Trigger */}
          <div
            className="popover-wrapper"
            style={{ position: 'relative' }}
            onMouseEnter={() => {
              if (bookmarksTimeoutRef.current) clearTimeout(bookmarksTimeoutRef.current);
              setShowBookmarksPopover(true);
            }}
            onMouseLeave={() => {
              bookmarksTimeoutRef.current = setTimeout(() => {
                setShowBookmarksPopover(false);
              }, 200);
            }}
          >
            <button
              onClick={() => setShowBookmarksPopover(!showBookmarksPopover)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: showBookmarksPopover ? 'var(--accent-glow, rgba(229, 9, 20, 0.25))' : 'rgba(255, 255, 255, 0.08)',
                border: '1px solid',
                borderColor: showBookmarksPopover ? 'var(--accent-color, #e50914)' : 'rgba(255, 255, 255, 0.12)',
                borderRadius: '20px',
                padding: '6px 14px',
                color: showBookmarksPopover ? 'var(--accent-color, #e50914)' : '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Bookmarks (B)"
            >
              <BookmarkIcon size={16} />
              <span>Bookmarks ({bookmarks.length})</span>
            </button>

            {showBookmarksPopover && bookmarkPanelContent}
          </div>
        </div>

        {/* Right Group: Speed, PiP, Fullscreen */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', position: 'relative' }}>
          {/* Speed Selector */}
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            style={{
              background: showSpeedMenu ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title="Playback Speed (S)"
          >
            <Gauge size={16} />
            <span>{playbackRate}x</span>
          </button>

          {showSpeedMenu && (
            <SpeedMenu
              currentSpeed={playbackRate}
              onSelectSpeed={onChangeSpeed}
              onClose={() => setShowSpeedMenu(false)}
            />
          )}

          {/* PiP (Picture-in-Picture) */}
          {onTogglePiP && document.pictureInPictureEnabled && (
            <button
              onClick={onTogglePiP}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.85)',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Picture in Picture"
            >
              <MonitorPlay size={20} />
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={onToggleFullscreen}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center'
            }}
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
};
