import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Volume2,
  Volume1,
  VolumeX,
  Gauge,
  RotateCcw,
  RotateCw,
  Bookmark as BookmarkIcon,
  Cast,
  Subtitles as SubtitlesIcon,
  Disc3,
  X
} from 'lucide-react';
import {
  playerIslandStore,
  type PlayerIslandNotification,
  type IslandAudioTrack,
  type IslandSubtitleTrack
} from './usePlayerIsland';
import './playerIsland.css';

export interface PlayerIslandProps {
  audioTracks?: IslandAudioTrack[];
  subtitleTracks?: IslandSubtitleTrack[];
  selectedAudioIndex?: number;
  selectedSubtitleIndex?: number;
  onSelectAudio?: (index: number) => void;
  onSelectSubtitle?: (index: number) => void;
}

// Convert ISO 639-2/1 code to full display name
function getLanguageDisplayName(code?: string | null): string {
  if (!code) return '';
  const trimmed = code.trim().toLowerCase();
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    const name = displayNames.of(trimmed);
    if (name) return name;
  } catch (e) {
    // Ignore fallback
  }
  const map: Record<string, string> = {
    hin: 'Hindi',
    eng: 'English',
    jpn: 'Japanese',
    spa: 'Spanish',
    fre: 'French',
    fra: 'French',
    ger: 'German',
    deu: 'German',
    ita: 'Italian',
    kor: 'Korean',
    chi: 'Chinese',
    zho: 'Chinese',
    rus: 'Russian',
    por: 'Portuguese',
    ara: 'Arabic',
    ben: 'Bengali',
    tam: 'Tamil',
    tel: 'Telugu',
    kan: 'Kannada',
    mal: 'Malayalam',
    pan: 'Punjabi',
    mar: 'Marathi',
    guj: 'Gujarati',
    und: 'Undetermined'
  };
  return map[trimmed] || code.toUpperCase();
}

// Format seconds into MM:SS or HH:MM:SS
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type IslandStage =
  | 'idle'
  | 'pop-in'
  | 'circle'
  | 'open'
  | 'expanded'
  | 'closing-details'
  | 'contract'
  | 'pop-out';

export const PlayerIsland: React.FC<PlayerIslandProps> = ({
  audioTracks: propAudioTracks,
  subtitleTracks: propSubtitleTracks,
  selectedAudioIndex: propSelectedAudioIndex,
  selectedSubtitleIndex: propSelectedSubtitleIndex,
  onSelectAudio: propOnSelectAudio,
  onSelectSubtitle: propOnSelectSubtitle
}) => {
  const [currentNotif, setCurrentNotif] = useState<PlayerIslandNotification | null>(null);
  const [stage, setStage] = useState<IslandStage>('idle');
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [islandDimensions, setIslandDimensions] = useState<{ width: number; height: number }>({ width: 40, height: 40 });

  const containerRef = useRef<HTMLDivElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const expandedMeasureRef = useRef<HTMLDivElement>(null);

  const stageTimerRef = useRef<any>(null);
  const dismissTimerRef = useRef<any>(null);
  const currentNotifRef = useRef<PlayerIslandNotification | null>(null);
  currentNotifRef.current = currentNotif;
  const stageRef = useRef<IslandStage>('idle');
  stageRef.current = stage;
  const isHoveredRef = useRef(false);
  isHoveredRef.current = isHovered;

  // Track options state (props override store)
  const [storeTracks, setStoreTracks] = useState(playerIslandStore.getTracks());
  useEffect(() => {
    return playerIslandStore.subscribeTracks((t) => setStoreTracks(t));
  }, []);

  const audioTracks = propAudioTracks ?? storeTracks.audioTracks ?? [];
  const subtitleTracks = propSubtitleTracks ?? storeTracks.subtitleTracks ?? [];
  const selectedAudioIndex = propSelectedAudioIndex ?? storeTracks.selectedAudioIndex;
  const selectedSubtitleIndex = propSelectedSubtitleIndex ?? storeTracks.selectedSubtitleIndex;
  const onSelectAudio = propOnSelectAudio ?? storeTracks.onSelectAudio;
  const onSelectSubtitle = propOnSelectSubtitle ?? storeTracks.onSelectSubtitle;

  // Measure content size
  const updateMeasuredDimensions = useCallback((expanded = false) => {
    if (expanded && expandedMeasureRef.current) {
      const el = expandedMeasureRef.current;
      const w = Math.min(window.innerWidth - 32, el.offsetWidth + 28);
      const h = el.offsetHeight + 24;
      setIslandDimensions({ width: Math.max(220, w), height: Math.max(60, h) });
    } else if (contentMeasureRef.current) {
      const el = contentMeasureRef.current;
      const measuredWidth = el.offsetWidth;
      const measuredHeight = el.offsetHeight;
      const finalWidth = Math.min(window.innerWidth - 32, measuredWidth + 20);
      const finalHeight = Math.max(40, measuredHeight + 14);
      setIslandDimensions({ width: finalWidth, height: finalHeight });
    }
  }, []);

  // Dismiss sequence
  const startCloseSequence = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);

    // Step 1: Details fade out (.16s)
    setStage('closing-details');

    // Step 2: Contract to 40x40 circle after 170ms
    stageTimerRef.current = setTimeout(() => {
      setIslandDimensions({ width: 40, height: 40 });
      setStage('contract');

      // Step 3: Scale down to .35 and fade out after 520ms
      stageTimerRef.current = setTimeout(() => {
        setStage('pop-out');

        // Step 4: Unmount after animation completes (.45s)
        stageTimerRef.current = setTimeout(() => {
          setStage('idle');
          setCurrentNotif(null);
          playerIslandStore.dismiss();
        }, 450);
      }, 520);
    }, 170);
  }, []);

  // Schedule auto-dismiss with hover pause
  const scheduleAutoDismiss = useCallback((durationMs: number) => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

    const checkAndDismiss = () => {
      if (isHoveredRef.current) {
        dismissTimerRef.current = setTimeout(checkAndDismiss, 900);
      } else {
        startCloseSequence();
      }
    };

    dismissTimerRef.current = setTimeout(checkAndDismiss, durationMs);
  }, [startCloseSequence]);

  // Open sequence
  const runOpenSequence = useCallback((notif: PlayerIslandNotification) => {
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

    setCurrentNotif(notif);
    setIslandDimensions({ width: 40, height: 40 });
    setStage('pop-in');

    // Pop-in circle transition starts immediately, reaches 40x40
    stageTimerRef.current = setTimeout(() => {
      setStage('circle');

      // After 260ms, expand width/height to fit content
      stageTimerRef.current = setTimeout(() => {
        updateMeasuredDimensions(false);
        setStage('open');

        // Compute auto-dismiss timer
        let dur = 2000;
        switch (notif.type) {
          case 'volume':
            dur = 1600;
            break;
          case 'seek':
            dur = 1400;
            break;
          case 'speed':
            dur = 1500;
            break;
          case 'bookmark':
            dur = 2200;
            break;
          case 'audio':
          case 'subtitle':
            dur = 2400;
            break;
          case 'cast':
            dur = 2600;
            break;
        }
        scheduleAutoDismiss(dur);
      }, 260);
    }, 20);
  }, [scheduleAutoDismiss, updateMeasuredDimensions]);

  // Listen to store updates
  useEffect(() => {
    return playerIslandStore.subscribe((nextNotif) => {
      if (!nextNotif) {
        if (stageRef.current !== 'idle' && stageRef.current !== 'pop-out') {
          startCloseSequence();
        }
        return;
      }

      const prev = currentNotifRef.current;
      const currentStage = stageRef.current;

      // 1. Same-type volume updates update in place with no re-animation; restarts 1.6s timer
      if (prev?.type === 'volume' && nextNotif.type === 'volume' && (currentStage === 'open' || currentStage === 'circle')) {
        setCurrentNotif(nextNotif);
        scheduleAutoDismiss(1600);
        return;
      }

      // 2. New notification while open or expanded: crossfade content with blur (~110ms) and resize
      if (currentStage === 'open' || currentStage === 'expanded') {
        setIsCrossfading(true);
        setTimeout(() => {
          setCurrentNotif(nextNotif);
          setIsCrossfading(false);
          updateMeasuredDimensions(false);
          setStage('open');

          let dur = 2000;
          switch (nextNotif.type) {
            case 'volume': dur = 1600; break;
            case 'seek': dur = 1400; break;
            case 'speed': dur = 1500; break;
            case 'bookmark': dur = 2200; break;
            case 'audio':
            case 'subtitle': dur = 2400; break;
            case 'cast': dur = 2600; break;
          }
          scheduleAutoDismiss(dur);
        }, 110);
        return;
      }

      // 3. New notification while closing: cancel close and reopen smoothly
      if (currentStage === 'closing-details' || currentStage === 'contract' || currentStage === 'pop-out') {
        runOpenSequence(nextNotif);
        return;
      }

      // 4. Default: fresh open sequence
      runOpenSequence(nextNotif);
    });
  }, [runOpenSequence, scheduleAutoDismiss, startCloseSequence, updateMeasuredDimensions]);

  // Handle outside click & Esc to close expanded panel or island
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stageRef.current !== 'idle') {
        startCloseSequence();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (stageRef.current === 'expanded' && containerRef.current && !containerRef.current.contains(e.target as Node)) {
        startCloseSequence();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [startCloseSequence]);

  // Toggle expanded panel for audio/subtitle
  const handleIslandClick = () => {
    if (!currentNotif) return;
    if (currentNotif.type === 'audio' || currentNotif.type === 'subtitle') {
      if (stage === 'expanded') {
        setStage('open');
        updateMeasuredDimensions(false);
        scheduleAutoDismiss(2400);
      } else if (stage === 'open') {
        setStage('expanded');
        updateMeasuredDimensions(true);
        scheduleAutoDismiss(6000);
      }
    }
  };

  // Render Icon according to notification type
  const renderIcon = () => {
    if (!currentNotif) return null;

    switch (currentNotif.type) {
      case 'volume': {
        const { value, muted } = currentNotif;
        if (muted || value === 0) {
          return (
            <div className="player-island-icon-disc">
              <VolumeX size={16} color="#ef4444" />
            </div>
          );
        }
        if (value < 0.4) {
          return (
            <div className="player-island-icon-disc">
              <Volume1 size={16} />
            </div>
          );
        }
        return (
          <div className="player-island-icon-disc">
            <Volume2 size={16} />
          </div>
        );
      }

      case 'audio':
        return (
          <div className="player-island-icon-disc audio-disc">
            <Disc3 size={16} />
          </div>
        );

      case 'subtitle':
        return (
          <div className="player-island-icon-disc accent-disc">
            <SubtitlesIcon size={16} />
          </div>
        );

      case 'speed':
        return (
          <div className="player-island-icon-disc">
            <Gauge size={16} />
          </div>
        );

      case 'seek':
        return (
          <div className="player-island-icon-disc">
            {currentNotif.delta < 0 ? (
              <RotateCcw size={15} />
            ) : (
              <RotateCw size={15} />
            )}
          </div>
        );

      case 'bookmark':
        return (
          <div className="player-island-icon-disc gold-disc">
            <BookmarkIcon size={15} />
          </div>
        );

      case 'cast':
        return (
          <div className="player-island-icon-disc">
            <Cast size={15} />
          </div>
        );

      default:
        return null;
    }
  };

  // Render Details Content
  const renderDetails = () => {
    if (!currentNotif) return null;

    switch (currentNotif.type) {
      case 'volume': {
        const { value, muted, boost = 100 } = currentNotif;
        const percent = Math.round(value * 100);
        return (
          <div className="player-island-volume-group">
            <div className="player-island-volume-bar-bg">
              <div
                className="player-island-volume-bar-fill"
                style={{
                  width: muted ? '0%' : `${Math.min(100, percent)}%`,
                  background: boost > 100 ? 'var(--accent, #ff5a68)' : '#ffffff'
                }}
              />
            </div>
            <span className="player-island-volume-val">
              {muted ? 'Muted' : boost > 100 ? `${boost}%` : `${percent}%`}
            </span>
          </div>
        );
      }

      case 'audio': {
        const { language, channels, codec, index = 1, title } = currentNotif;
        const langName = getLanguageDisplayName(language) || title || `Audio track ${index}`;
        const metaParts = [];
        if (channels) metaParts.push(channels);
        if (codec) metaParts.push(codec.toUpperCase());
        metaParts.push(`Track ${index}`);
        return (
          <div className="player-island-text-group">
            <span className="player-island-label">{langName}</span>
            <span className="player-island-sub">{metaParts.join(' · ')}</span>
          </div>
        );
      }

      case 'subtitle': {
        const { language, title } = currentNotif;
        const isOff = !language;
        const langName = isOff ? 'Subtitles off' : getLanguageDisplayName(language) || title || 'Subtitles';
        return (
          <div className="player-island-text-group">
            <span className="player-island-label">{langName}</span>
            <span className="player-island-sub">
              {isOff ? 'Press C to turn on' : 'Subtitles'}
            </span>
          </div>
        );
      }

      case 'speed':
        return (
          <div className="player-island-text-group">
            <span className="player-island-label" style={{ fontSize: '14px' }}>
              {currentNotif.value}x
            </span>
          </div>
        );

      case 'seek': {
        const { delta, time, duration } = currentNotif;
        const sign = delta > 0 ? `+${delta}` : `${delta}`;
        const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
        return (
          <div className="player-island-seek-group">
            <span className="player-island-label" style={{ fontSize: '12px' }}>
              {sign} s · {formatTime(time)}
            </span>
            <div className="player-island-seek-progress-bg">
              <div
                className="player-island-seek-progress-fill"
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
          </div>
        );
      }

      case 'bookmark': {
        const { time, count } = currentNotif;
        return (
          <div className="player-island-text-group">
            <span className="player-island-label">Bookmarked</span>
            <span className="player-island-sub">
              {formatTime(time)} · {count} saved
            </span>
          </div>
        );
      }

      case 'cast': {
        const { device, onStop } = currentNotif;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="player-island-text-group">
              <span className="player-island-label">Casting to {device}</span>
              <span className="player-island-sub">Connected</span>
            </div>
            {onStop && (
              <button
                type="button"
                className="player-island-cast-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onStop();
                  startCloseSequence();
                }}
              >
                Tap to stop
              </button>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // Render Expanded Track Chips Panel (audio or subtitles)
  const renderExpandedPanel = () => {
    if (!currentNotif || (currentNotif.type !== 'audio' && currentNotif.type !== 'subtitle')) {
      return null;
    }

    if (currentNotif.type === 'audio') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <div className="player-island-expanded-header">
            <span className="player-island-expanded-title">Audio Tracks</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startCloseSequence();
              }}
              style={{ background: 'none', border: 'none', color: '#9a9ca8', cursor: 'pointer', padding: 2 }}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="player-island-chips-grid">
            {audioTracks.length === 0 ? (
              <span style={{ fontSize: '12px', color: '#9a9ca8' }}>Default Audio</span>
            ) : (
              audioTracks.map((tr) => {
                const isSelected = selectedAudioIndex === tr.index;
                const langLabel = getLanguageDisplayName(tr.language) || tr.label || `Track ${tr.index}`;
                return (
                  <button
                    key={tr.index}
                    type="button"
                    className={`player-island-chip-btn ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectAudio) onSelectAudio(tr.index);
                      playerIslandStore.notify({
                        type: 'audio',
                        language: tr.language,
                        channels: tr.channels,
                        codec: tr.codec,
                        index: tr.index,
                        title: tr.label
                      });
                      scheduleAutoDismiss(6000);
                    }}
                  >
                    <span>{langLabel}</span>
                    {tr.codec && <span style={{ opacity: 0.7, fontSize: '10px' }}>{tr.codec}</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      );
    }

    // Subtitle Chips
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
        <div className="player-island-expanded-header">
          <span className="player-island-expanded-title">Subtitles</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startCloseSequence();
            }}
            style={{ background: 'none', border: 'none', color: '#9a9ca8', cursor: 'pointer', padding: 2 }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="player-island-chips-grid">
          {/* Off Chip */}
          <button
            type="button"
            className={`player-island-chip-btn ${selectedSubtitleIndex === -1 || selectedSubtitleIndex === undefined ? 'active' : ''}`}
            aria-pressed={selectedSubtitleIndex === -1 || selectedSubtitleIndex === undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectSubtitle) onSelectSubtitle(-1);
              playerIslandStore.notify({ type: 'subtitle', language: null });
              scheduleAutoDismiss(6000);
            }}
          >
            Off
          </button>
          {subtitleTracks.map((st) => {
            const isSelected = selectedSubtitleIndex === st.index;
            const langLabel = getLanguageDisplayName(st.language) || st.label || `Track ${st.index}`;
            return (
              <button
                key={st.index}
                type="button"
                className={`player-island-chip-btn ${isSelected ? 'active' : ''}`}
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectSubtitle) onSelectSubtitle(st.index);
                  playerIslandStore.notify({ type: 'subtitle', language: st.language, title: st.label });
                  scheduleAutoDismiss(6000);
                }}
              >
                {langLabel}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (stage === 'idle' || !currentNotif) {
    return null;
  }

  const isClickable =
    currentNotif.type === 'audio' ||
    currentNotif.type === 'subtitle' ||
    stage === 'expanded';

  return (
    <div className="player-island-wrapper">
      {/* Hidden Offscreen Measurers for Dynamic Sizing */}
      <div ref={contentMeasureRef} className="player-island-measure" aria-hidden="true">
        {renderIcon()}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {renderDetails()}
        </div>
      </div>

      <div ref={expandedMeasureRef} className="player-island-measure" aria-hidden="true" style={{ width: '320px', flexDirection: 'column' }}>
        {renderExpandedPanel()}
      </div>

      {/* Main Dynamic Island Component */}
      <div
        ref={containerRef}
        role="status"
        aria-live="polite"
        tabIndex={0}
        className={`player-island stage-${stage} ${stage === 'expanded' ? 'is-expanded' : ''}`}
        style={{
          width: `${islandDimensions.width}px`,
          height: `${islandDimensions.height}px`,
          cursor: isClickable ? 'pointer' : 'default'
        }}
        onClick={handleIslandClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={() => setIsHovered(false)}
      >
        <div className="player-island-inner">
          {stage === 'expanded' ? (
            renderExpandedPanel()
          ) : (
            <>
              {renderIcon()}
              <div
                className={`player-island-details ${isCrossfading ? 'is-crossfading' : ''}`}
              >
                {renderDetails()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
