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
export function getLanguageDisplayName(code?: string | null): string {
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

// Extract a clean language display name from language code or track title
export function resolveLanguage(code?: string | null, title?: string): string {
  // 1. Direct code check if valid
  if (code && code.toLowerCase() !== 'und') {
    const fromCode = getLanguageDisplayName(code);
    if (fromCode && fromCode.toLowerCase() !== code.toLowerCase() && fromCode !== 'Undetermined') {
      return fromCode;
    }
  }

  // 2. Parse language code or name enclosed in [ ] or ( ) from title or code (e.g. "[ENG]", "(hin)", "Track 3 - [ENG]")
  const candidates = [title, code].filter(Boolean) as string[];
  for (const text of candidates) {
    const bracketMatch = text.match(/(?:\[|\()([a-zA-Z]{2,12})(?:\]|\))/);
    if (bracketMatch && bracketMatch[1]) {
      const parsed = getLanguageDisplayName(bracketMatch[1]);
      if (parsed && parsed.toLowerCase() !== bracketMatch[1].toLowerCase() && parsed !== 'Undetermined') {
        return parsed;
      }
      const cap = bracketMatch[1].charAt(0).toUpperCase() + bracketMatch[1].slice(1).toLowerCase();
      if (['English', 'Hindi', 'Japanese', 'Spanish', 'French', 'German', 'Italian', 'Korean', 'Chinese', 'Russian', 'Portuguese'].includes(cap)) {
        return cap;
      }
    }

    // 3. Check for common language names in string
    const commonLangs = [
      'Hindi', 'English', 'Japanese', 'Spanish', 'French', 'German', 'Italian',
      'Korean', 'Chinese', 'Russian', 'Portuguese', 'Arabic', 'Bengali', 'Tamil',
      'Telugu', 'Kannada', 'Malayalam', 'Punjabi', 'Marathi', 'Gujarati', 'Turkish',
      'Vietnamese', 'Thai', 'Indonesian', 'Dutch', 'Polish', 'Swedish'
    ];
    for (const lang of commonLangs) {
      const reg = new RegExp(`\\b${lang}\\b`, 'i');
      if (reg.test(text)) {
        return lang;
      }
    }
  }

  // Fallback to direct name if available
  if (code && code.toLowerCase() !== 'und') {
    return getLanguageDisplayName(code);
  }

  return '';
}

export function formatAudioInfo(notif: {
  language?: string | null;
  channels?: string;
  codec?: string;
  index?: number;
  title?: string;
}): { label: string; sub: string } {
  if (notif.title === 'Default Audio' || notif.title === 'Original Audio') {
    return {
      label: 'Default Audio',
      sub: notif.codec ? `${notif.codec.toUpperCase()} · Audio` : 'Audio'
    };
  }

  const lang = resolveLanguage(notif.language, notif.title);
  let label = lang;
  if (!label) {
    if (notif.title && !/^(?:audio\s*)?track\s*#?\d+/i.test(notif.title)) {
      label = notif.title;
    } else {
      label = notif.index !== undefined ? `Audio Track ${notif.index}` : 'Audio Track';
    }
  }

  const metaParts: string[] = [];
  if (notif.channels) metaParts.push(notif.channels);
  if (notif.codec) metaParts.push(notif.codec.toUpperCase());
  if (notif.index !== undefined && notif.index > 0) metaParts.push(`Track ${notif.index}`);
  if (metaParts.length === 0) metaParts.push('Audio');

  return {
    label,
    sub: metaParts.join(' · ')
  };
}

export function formatSubtitleInfo(notif: {
  language?: string | null;
  title?: string;
  index?: number;
}): { label: string; sub: string } {
  const isOff =
    notif.language === null ||
    notif.title?.toLowerCase() === 'off' ||
    notif.language?.toLowerCase() === 'off';

  if (isOff) {
    return {
      label: 'Subtitles Off',
      sub: 'Press C to turn on'
    };
  }

  const lang = resolveLanguage(notif.language, notif.title);
  let label = lang;
  if (!label) {
    if (notif.title && !/^(?:subtitle\s*)?track\s*#?\d+/i.test(notif.title)) {
      label = notif.title;
    } else {
      label = notif.index !== undefined ? `Subtitle Track ${notif.index}` : 'Subtitles';
    }
  }

  const metaParts: string[] = ['Subtitles'];
  if (notif.index !== undefined && notif.index > 0) {
    metaParts.push(`Track ${notif.index}`);
  }

  return {
    label,
    sub: metaParts.join(' · ')
  };
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
  const [islandDimensions, setIslandDimensions] = useState<{ width: number; height: number }>({ width: 50, height: 50 });

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
      const w = Math.min(window.innerWidth - 24, el.offsetWidth + 28);
      const h = el.offsetHeight + 24;
      setIslandDimensions({ width: Math.max(260, w), height: Math.max(64, h) });
    } else if (contentMeasureRef.current) {
      const el = contentMeasureRef.current;
      const measuredWidth = Math.ceil(el.scrollWidth || el.offsetWidth);
      const measuredHeight = Math.ceil(el.scrollHeight || el.offsetHeight);
      const finalWidth = Math.min(window.innerWidth - 32, measuredWidth + 36);
      const finalHeight = Math.max(50, measuredHeight + 14);
      setIslandDimensions({ width: Math.max(160, finalWidth), height: finalHeight });
    }
  }, []);

  // Dismiss sequence
  const startCloseSequence = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);

    // Step 1: Details fade out (.16s)
    setStage('closing-details');

    // Step 2: Contract to 50x50 circle after 170ms
    stageTimerRef.current = setTimeout(() => {
      setIslandDimensions({ width: 50, height: 50 });
      setStage('contract');

      // Step 3: Scale down to .35 and fade out after 520ms
      stageTimerRef.current = setTimeout(() => {
        setStage('pop-out');

        stageTimerRef.current = setTimeout(() => {
          setStage('idle');
          setCurrentNotif(null);
        }, 240);
      }, 520);
    }, 170);
  }, []);

  // Schedule auto-dismiss with hover check
  const scheduleAutoDismiss = useCallback(
    (durationMs: number) => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

      const checkDismiss = () => {
        if (isHoveredRef.current) {
          // Hover pauses timer; re-check every 900ms
          dismissTimerRef.current = setTimeout(checkDismiss, 900);
          return;
        }
        startCloseSequence();
      };

      dismissTimerRef.current = setTimeout(checkDismiss, durationMs);
    },
    [startCloseSequence]
  );

  // Subscribe to island notifications
  useEffect(() => {
    const unsubscribe = playerIslandStore.subscribe((notif) => {
      if (!notif) {
        startCloseSequence();
        return;
      }

      const prevNotif = currentNotifRef.current;
      const prevStage = stageRef.current;

      // Rule: Same-type volume updates update in place with no re-animation; restarts 1.6s timer
      if (
        notif.type === 'volume' &&
        prevNotif?.type === 'volume' &&
        (prevStage === 'open' || prevStage === 'circle')
      ) {
        setCurrentNotif(notif);
        scheduleAutoDismiss(1600);
        return;
      }

      // Rule: New notification while closing -> cancel closing and reopen from current size
      if (
        prevStage === 'closing-details' ||
        prevStage === 'contract' ||
        prevStage === 'pop-out'
      ) {
        if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

        setCurrentNotif(notif);
        setIsCrossfading(true);
        setTimeout(() => {
          setIsCrossfading(false);
          setStage('open');
          requestAnimationFrame(() => updateMeasuredDimensions(false));
        }, 110);

        scheduleNotificationDismiss(notif);
        return;
      }

      // Rule: New notification while already open -> crossfade content with blur (~110ms) and resize
      if (prevStage === 'open' || prevStage === 'expanded') {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        setIsCrossfading(true);

        setTimeout(() => {
          setCurrentNotif(notif);
          setStage('open');
          setIsCrossfading(false);
          requestAnimationFrame(() => updateMeasuredDimensions(false));
          scheduleNotificationDismiss(notif);
        }, 110);
        return;
      }

      // Fresh Open sequence:
      // 1. Appears as 50x50 circle with icon (.45s cubic-bezier)
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

      setCurrentNotif(notif);
      setIslandDimensions({ width: 50, height: 50 });
      setStage('pop-in');

      stageTimerRef.current = setTimeout(() => {
        setStage('circle');

        // 2. After 260ms island widens to fit content
        stageTimerRef.current = setTimeout(() => {
          setStage('open');
          updateMeasuredDimensions(false);
          scheduleNotificationDismiss(notif);
        }, 260);
      }, 50);
    });

    return () => {
      unsubscribe();
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [scheduleAutoDismiss, startCloseSequence, updateMeasuredDimensions]);

  // Determine auto-dismiss timeout per type
  const scheduleNotificationDismiss = useCallback(
    (notif: PlayerIslandNotification) => {
      switch (notif.type) {
        case 'volume':
          scheduleAutoDismiss(1600);
          break;
        case 'seek':
          scheduleAutoDismiss(1400);
          break;
        case 'speed':
          scheduleAutoDismiss(1500);
          break;
        case 'bookmark':
          scheduleAutoDismiss(2200);
          break;
        case 'audio':
        case 'subtitle':
          scheduleAutoDismiss(2400);
          break;
        case 'cast':
          scheduleAutoDismiss(2600);
          break;
        default:
          scheduleAutoDismiss(2000);
          break;
      }
    },
    [scheduleAutoDismiss]
  );

  // Keyboard shortcut listener (Esc closes expanded panel or island)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (stageRef.current === 'expanded') {
          setStage('open');
          updateMeasuredDimensions(false);
          scheduleAutoDismiss(2400);
        } else if (stageRef.current === 'open') {
          startCloseSequence();
        }
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
  }, [scheduleAutoDismiss, startCloseSequence, updateMeasuredDimensions]);

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
        const { value, muted, boost = 100 } = currentNotif;
        const isBoosted = boost > 100 || value > 1.0;
        if (muted || value === 0) {
          return (
            <div className="player-island-icon-disc">
              <VolumeX size={20} color="#ef4444" />
            </div>
          );
        }
        if (isBoosted) {
          return (
            <div className="player-island-icon-disc" style={{ background: 'rgba(255, 122, 0, 0.25)', color: '#ff7a00' }}>
              <Volume2 size={20} color="#ff7a00" />
            </div>
          );
        }
        if (value < 0.4) {
          return (
            <div className="player-island-icon-disc">
              <Volume1 size={20} />
            </div>
          );
        }
        return (
          <div className="player-island-icon-disc">
            <Volume2 size={20} />
          </div>
        );
      }

      case 'audio':
        return (
          <div className="player-island-icon-disc audio-disc">
            <Disc3 size={20} />
          </div>
        );

      case 'subtitle':
        return (
          <div className="player-island-icon-disc accent-disc">
            <SubtitlesIcon size={20} />
          </div>
        );

      case 'speed':
        return (
          <div className="player-island-icon-disc">
            <Gauge size={20} />
          </div>
        );

      case 'seek':
        return (
          <div className="player-island-icon-disc">
            {currentNotif.delta < 0 ? (
              <RotateCcw size={19} />
            ) : (
              <RotateCw size={19} />
            )}
          </div>
        );

      case 'bookmark':
        return (
          <div className="player-island-icon-disc gold-disc">
            <BookmarkIcon size={19} />
          </div>
        );

      case 'cast':
        return (
          <div className="player-island-icon-disc">
            <Cast size={19} />
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
        const isBoosted = boost > 100 || value > 1.0;
        const percent = Math.round(value * 100);
        const displayPercent = boost > 100 ? boost : percent;
        return (
          <div className="player-island-volume-group">
            <div className="player-island-volume-bar-bg">
              <div
                className="player-island-volume-bar-fill"
                style={{
                  width: muted ? '0%' : `${Math.min(100, isBoosted ? (displayPercent > 100 ? displayPercent - 100 : 100) : percent)}%`,
                  background: isBoosted ? '#ff7a00' : '#ffffff',
                  boxShadow: isBoosted ? '0 0 10px rgba(255, 122, 0, 0.7)' : undefined
                }}
              />
            </div>
            <span
              className="player-island-volume-val"
              style={{
                color: isBoosted && !muted ? '#ff7a00' : '#ffffff',
                fontWeight: isBoosted ? 700 : 600
              }}
            >
              {muted ? 'Muted' : `${displayPercent}%`}
            </span>
          </div>
        );
      }

      case 'audio': {
        const info = formatAudioInfo(currentNotif);
        return (
          <div className="player-island-text-group">
            <span className="player-island-label">{info.label}</span>
            <span className="player-island-sub">{info.sub}</span>
          </div>
        );
      }

      case 'subtitle': {
        const info = formatSubtitleInfo(currentNotif);
        return (
          <div className="player-island-text-group">
            <span className="player-island-label">{info.label}</span>
            <span className="player-island-sub">{info.sub}</span>
          </div>
        );
      }

      case 'speed':
        return (
          <div className="player-island-text-group">
            <span className="player-island-label" style={{ fontSize: '15px' }}>
              {currentNotif.value}x
            </span>
            <span className="player-island-sub">Playback Speed</span>
          </div>
        );

      case 'seek': {
        const { delta, time, duration } = currentNotif;
        const sign = delta > 0 ? `+${delta}` : `${delta}`;
        const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;
        return (
          <div className="player-island-seek-group">
            <span className="player-island-label" style={{ fontSize: '13px' }}>
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
              <X size={15} />
            </button>
          </div>
          <div className="player-island-chips-grid">
            {audioTracks.length === 0 ? (
              <span style={{ fontSize: '13px', color: '#9a9ca8' }}>Default Audio</span>
            ) : (
              audioTracks.map((tr) => {
                const isSelected = selectedAudioIndex === tr.index || (selectedAudioIndex === undefined && audioTracks.length === 1);
                const langLabel = resolveLanguage(tr.language, tr.label) || tr.label || `Track ${tr.index}`;
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
            <X size={15} />
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
            const langLabel = resolveLanguage(st.language, st.label) || st.label || `Track ${st.index}`;
            return (
              <button
                key={st.index}
                type="button"
                className={`player-island-chip-btn ${isSelected ? 'active' : ''}`}
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectSubtitle) onSelectSubtitle(st.index);
                  playerIslandStore.notify({ type: 'subtitle', language: st.language ?? null, title: st.label, index: st.index });
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
