import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { 
  Play, Pause, Square, SkipBack, SkipForward, Camera,
  Volume2, VolumeX, LogOut, ChevronRight, Check,
  FolderOpen, Globe, PlusCircle, List
} from 'lucide-react';
import type { CustomAudioTrack, CustomSubtitleTrack } from '../../types/media';
import type { MediaStream } from '../../services/ffmpeg';

export interface VlcContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  // Media & Playlist
  onOpenFile?: () => void;
  onOpenNetworkStream?: () => void;
  onAddToPlaylist?: () => void;
  playlist?: any[];
  onSelectPlaylistItem?: (item: any) => void;
  // Playback
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onJumpForward: () => void;
  onJumpBackward: () => void;
  playbackRate: number;
  onSetPlaybackRate: (rate: number) => void;
  // Audio
  audioStreams: MediaStream[];
  audioTracks: CustomAudioTrack[];
  selectedAudioTrack: CustomAudioTrack | null;
  onSelectAudioStream?: (index: number, codec: string, lang?: string) => void;
  onSelectAudioTrack?: (track: CustomAudioTrack | null) => void;
  volume: number;
  isMuted: boolean;
  onIncreaseVolume: () => void;
  onDecreaseVolume: () => void;
  onToggleMute: () => void;
  // Video
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTakeSnapshot: () => void;
  aspectRatio?: string;
  onSetAspectRatio?: (ratio: string) => void;
  // Subtitles
  subtitleStreams: MediaStream[];
  subtitleTracks: CustomSubtitleTrack[];
  selectedSubTrack: CustomSubtitleTrack | null;
  onSelectSubStream?: (index: number, codec: string, lang?: string) => void;
  onSelectSubTrack?: (track: CustomSubtitleTrack | null) => void;
  onAddSubtitleFile: () => void;
  onOpenSubtitleSettings?: () => void;
  onOpenSubtitleTranscript?: () => void;
  // View & Tools
  isTimelineOnly?: boolean;
  onToggleTimelineOnly: () => void;
  onOpenSettings: () => void;
  onOpenAudioSubMenu: () => void;
  bookmarks?: any[];
  onSeekToBookmark?: (time: number) => void;
  onAddBookmark?: () => void;
}

interface MenuItemData {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  shortcut?: string;
  checked?: boolean;
  isRadio?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: MenuItemData[];
  isDivider?: boolean;
}

// Submenu container with smart viewport detection (flips upside and leftside)
const SubmenuContainer: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const subRect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal placement:
    // If opening to the right would overflow the viewport, flip to the left
    if (parentRect.right + subRect.width > vw - 10) {
      el.style.left = 'auto';
      el.style.right = '100%';
    } else {
      el.style.left = '100%';
      el.style.right = 'auto';
    }

    // Vertical placement:
    // If opening downwards overflows viewport bottom, open UPWARDS!
    const overflowBottom = parentRect.top + subRect.height > vh - 10;
    if (overflowBottom) {
      el.style.top = 'auto';
      el.style.bottom = '-3px';
      
      const spaceAbove = parentRect.bottom - 10;
      if (subRect.height > spaceAbove) {
        el.style.maxHeight = `${Math.max(160, spaceAbove)}px`;
        el.style.overflowY = 'auto';
      }
    } else {
      el.style.top = '-3px';
      el.style.bottom = 'auto';
      
      const spaceBelow = vh - parentRect.top - 10;
      if (subRect.height > spaceBelow) {
        el.style.maxHeight = `${Math.max(160, spaceBelow)}px`;
        el.style.overflowY = 'auto';
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="vlc-submenu-container"
      style={{
        position: 'absolute',
        left: '100%',
        top: '-3px',
        zIndex: 1000000
      }}
    >
      {children}
    </div>
  );
};

export const VlcContextMenu: React.FC<VlcContextMenuProps> = ({
  x,
  y,
  onClose,
  onOpenFile,
  onOpenNetworkStream,
  onAddToPlaylist,
  playlist = [],
  onSelectPlaylistItem,
  isPlaying,
  onPlayPause,
  onStop,
  onPrevious,
  onNext,
  onJumpForward,
  onJumpBackward,
  playbackRate,
  onSetPlaybackRate,
  audioStreams = [],
  audioTracks = [],
  selectedAudioTrack,
  onSelectAudioStream,
  onSelectAudioTrack,
  volume: _volume,
  isMuted,
  onIncreaseVolume,
  onDecreaseVolume,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  onTakeSnapshot,
  aspectRatio = 'default',
  onSetAspectRatio,
  subtitleStreams = [],
  subtitleTracks = [],
  selectedSubTrack,
  onSelectSubStream,
  onSelectSubTrack,
  onAddSubtitleFile,
  onOpenSubtitleSettings,
  onOpenSubtitleTranscript,
  isTimelineOnly = false,
  onToggleTimelineOnly,
  onOpenSettings,
  onOpenAudioSubMenu,
  bookmarks = [],
  onSeekToBookmark,
  onAddBookmark
}) => {
  const [activeSubmenuPath, setActiveSubmenuPath] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x, y });

  // Close on outside click or ESC
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  // Adjust root menu coords if it overflows window
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let newX = x;
      let newY = y;
      if (x + rect.width > vw - 10) {
        newX = Math.max(10, vw - rect.width - 10);
      }
      if (y + rect.height > vh - 10) {
        newY = Math.max(10, vh - rect.height - 10);
      }
      setCoords({ x: newX, y: newY });
    }
  }, [x, y]);

  // Audio Tracks (Only real available tracks)
  const audioTrackItems: MenuItemData[] = [
    {
      id: 'audio-default',
      label: 'Original (Default)',
      isRadio: true,
      checked: selectedAudioTrack === null,
      onClick: () => {
        onSelectAudioTrack?.(null);
        onClose();
      }
    },
    ...audioStreams.map((s, idx) => ({
      id: `audio-stream-${s.index}`,
      label: `Track ${idx + 1} - [${(s.language || 'und').toUpperCase()}]`,
      isRadio: true,
      checked: selectedAudioTrack?.streamIndex === s.index,
      onClick: () => {
        onSelectAudioStream?.(s.index, s.codec, s.language);
        onClose();
      }
    })),
    ...audioTracks.map((t) => ({
      id: `audio-custom-${t.id}`,
      label: t.name,
      isRadio: true,
      checked: selectedAudioTrack?.id === t.id,
      onClick: () => {
        onSelectAudioTrack?.(t);
        onClose();
      }
    }))
  ];

  // Subtitle Tracks (Only real available tracks)
  const subTrackItems: MenuItemData[] = [
    {
      id: 'sub-disable',
      label: 'Disable',
      isRadio: true,
      checked: selectedSubTrack === null,
      onClick: () => {
        onSelectSubTrack?.(null);
        onClose();
      }
    },
    ...subtitleStreams.map((s, idx) => ({
      id: `sub-stream-${s.index}`,
      label: `Track ${idx + 1} - [${(s.language || 'und').toUpperCase()}]`,
      isRadio: true,
      checked: selectedSubTrack?.streamIndex === s.index,
      onClick: () => {
        onSelectSubStream?.(s.index, s.codec, s.language);
        onClose();
      }
    })),
    ...subtitleTracks.map((t) => ({
      id: `sub-custom-${t.id}`,
      label: t.name,
      isRadio: true,
      checked: selectedSubTrack?.id === t.id,
      onClick: () => {
        onSelectSubTrack?.(t);
        onClose();
      }
    }))
  ];

  // Bookmarks
  const bookmarkItems: MenuItemData[] = [
    {
      id: 'bm-add',
      label: 'Add Bookmark...',
      shortcut: 'T',
      onClick: () => {
        onAddBookmark?.();
        onClose();
      }
    },
    ...(bookmarks.length > 0 ? [{ id: 'bm-div', isDivider: true, label: '' }] : []),
    ...bookmarks.map((bm, idx) => ({
      id: `bm-item-${bm.id || idx}`,
      label: `${bm.title || bm.label || `Bookmark ${idx + 1}`} (${Math.floor(bm.time / 60)}:${String(Math.floor(bm.time % 60)).padStart(2, '0')})`,
      onClick: () => {
        onSeekToBookmark?.(bm.time);
        onClose();
      }
    }))
  ];

  // Clean, 100% Functional Menu Data (all dummy/non-working items removed)
  const menuData: MenuItemData[] = [
    {
      id: 'media',
      label: <span><u>M</u>edia</span>,
      icon: <FolderOpen size={12} color="#000" />,
      children: [
        {
          id: 'open-file',
          label: <span>Open <u>F</u>ile...</span>,
          shortcut: 'Ctrl+O',
          icon: <FolderOpen size={12} color="#555" />,
          onClick: () => {
            onOpenFile?.();
            onClose();
          }
        },
        {
          id: 'open-network-stream',
          label: <span>Open <u>N</u>etwork Stream...</span>,
          shortcut: 'Ctrl+N',
          icon: <Globe size={12} color="#555" />,
          onClick: () => {
            onOpenNetworkStream?.();
            onClose();
          }
        },
        { id: 'media-div-1', isDivider: true, label: '' },
        {
          id: 'add-to-playlist',
          label: <span><u>A</u>dd File to Playlist...</span>,
          icon: <PlusCircle size={12} color="#555" />,
          onClick: () => {
            onAddToPlaylist?.();
            onClose();
          }
        },
        {
          id: 'open-sub-file',
          label: <span>Open Subtitle File...</span>,
          onClick: () => {
            onAddSubtitleFile();
            onClose();
          }
        },
        ...(playlist && playlist.length > 0 ? [
          { id: 'media-div-2', isDivider: true, label: '' },
          {
            id: 'playlist-items',
            label: <span><u>P</u>laylist ({playlist.length})</span>,
            icon: <List size={12} color="#555" />,
            children: playlist.map((item, idx) => ({
              id: `pl-${item.id || idx}`,
              label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                    {item.title || item.name || `Video #${idx + 1}`}
                  </span>
                  {item.duration ? (
                    <span style={{ fontSize: '11px', opacity: 0.6, flexShrink: 0 }}>
                      {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
                    </span>
                  ) : null}
                </div>
              ),
              onClick: () => {
                onSelectPlaylistItem?.(item);
                onClose();
              }
            }))
          }
        ] : [])
      ]
    },
    { id: 'media-top-div', isDivider: true, label: '' },
    {
      id: 'play-pause',
      label: isPlaying ? <span><u>P</u>ause</span> : <span><u>P</u>lay</span>,
      icon: isPlaying ? <Pause size={12} fill="#000" /> : <Play size={12} fill="#000" />,
      onClick: () => {
        onPlayPause();
        onClose();
      }
    },
    {
      id: 'stop',
      label: <span><u>S</u>top</span>,
      icon: <Square size={11} fill="#555" color="#555" />,
      onClick: () => {
        onStop();
        onClose();
      }
    },
    {
      id: 'previous',
      label: <span>Pre<u>v</u>ious (-10s)</span>,
      icon: <SkipBack size={12} fill="#000" />,
      onClick: () => {
        onPrevious();
        onClose();
      }
    },
    {
      id: 'next',
      label: <span><u>N</u>ext (+10s)</span>,
      icon: <SkipForward size={12} fill="#000" />,
      onClick: () => {
        onNext();
        onClose();
      }
    },
    {
      id: 'snapshot-top',
      label: <span>Take <u>S</u>napshot</span>,
      shortcut: 'Shift+S',
      icon: <Camera size={12} color="#000" />,
      onClick: () => {
        onTakeSnapshot();
        onClose();
      }
    },
    { id: 'div-1', isDivider: true, label: '' },
    {
      id: 'audio',
      label: <span><u>A</u>udio</span>,
      children: [
        {
          id: 'audio-track',
          label: <span>Audio <u>T</u>rack</span>,
          children: audioTrackItems
        },
        { id: 'audio-div-1', isDivider: true, label: '' },
        {
          id: 'vol-up',
          label: 'Increase Volume (+5%)',
          shortcut: '↑',
          icon: <Volume2 size={13} color="#555" />,
          onClick: () => onIncreaseVolume()
        },
        {
          id: 'vol-down',
          label: 'Decrease Volume (-5%)',
          shortcut: '↓',
          icon: <Volume2 size={13} color="#555" />,
          onClick: () => onDecreaseVolume()
        },
        {
          id: 'vol-mute',
          label: <span><u>M</u>ute</span>,
          shortcut: 'M',
          icon: isMuted ? <VolumeX size={13} color="#e50914" /> : <Volume2 size={13} color="#555" />,
          checked: isMuted,
          onClick: () => onToggleMute()
        }
      ]
    },
    {
      id: 'video',
      label: <span><u>V</u>ideo</span>,
      children: [
        {
          id: 'fullscreen',
          label: <span><u>F</u>ullscreen</span>,
          shortcut: 'F',
          checked: isFullscreen,
          onClick: () => {
            onToggleFullscreen();
            onClose();
          }
        },
        {
          id: 'aspect-ratio',
          label: <span><u>A</u>spect Ratio / Crop</span>,
          shortcut: 'C',
          children: [
            { 
              id: 'ar-def', 
              label: 'Default (Fit)', 
              isRadio: true, 
              checked: !aspectRatio || aspectRatio === 'default',
              onClick: () => { onSetAspectRatio?.('default'); onClose(); }
            },
            { 
              id: 'ar-stretch', 
              label: 'Stretch to Screen (0% Detail Lost)', 
              isRadio: true, 
              checked: aspectRatio === 'stretch',
              onClick: () => { onSetAspectRatio?.('stretch'); onClose(); }
            },
            { 
              id: 'ar-149', 
              label: 'Smart Crop (14:9 - Minimal Loss)', 
              isRadio: true, 
              checked: aspectRatio === '14:9',
              onClick: () => { onSetAspectRatio?.('14:9'); onClose(); }
            },
            { 
              id: 'ar-1610', 
              label: '16:10 Minimal Crop', 
              isRadio: true, 
              checked: aspectRatio === '16:10',
              onClick: () => { onSetAspectRatio?.('16:10'); onClose(); }
            },
            { 
              id: 'ar-169', 
              label: '16:9 Widescreen', 
              isRadio: true, 
              checked: aspectRatio === '16:9',
              onClick: () => { onSetAspectRatio?.('16:9'); onClose(); }
            },
            { 
              id: 'ar-185', 
              label: '1.85:1 Cinema', 
              isRadio: true, 
              checked: aspectRatio === '1.85:1',
              onClick: () => { onSetAspectRatio?.('1.85:1'); onClose(); }
            },
            { 
              id: 'ar-219', 
              label: '21:9 Ultrawide Cinema', 
              isRadio: true, 
              checked: aspectRatio === '21:9',
              onClick: () => { onSetAspectRatio?.('21:9'); onClose(); }
            },
            { 
              id: 'ar-cover', 
              label: 'Fill / Crop Screen (Full Zoom)', 
              isRadio: true, 
              checked: aspectRatio === 'cover',
              onClick: () => { onSetAspectRatio?.('cover'); onClose(); }
            },
            { 
              id: 'ar-43', 
              label: '4:3 Standard', 
              isRadio: true, 
              checked: aspectRatio === '4:3',
              onClick: () => { onSetAspectRatio?.('4:3'); onClose(); }
            }
          ]
        },
        { id: 'vid-div-1', isDivider: true, label: '' },
        {
          id: 'snapshot',
          label: <span>Take <u>S</u>napshot</span>,
          shortcut: 'Shift+S',
          onClick: () => {
            onTakeSnapshot();
            onClose();
          }
        }
      ]
    },
    {
      id: 'subtitle',
      label: <span>Subti<u>t</u>le</span>,
      children: [
        {
          id: 'sub-add-file',
          label: 'Add Subtitle File...',
          onClick: () => {
            onAddSubtitleFile();
            onClose();
          }
        },
        {
          id: 'sub-track',
          label: <span>Sub <u>T</u>rack</span>,
          children: subTrackItems
        },
        { id: 'sub-div-1', isDivider: true, label: '' },
        {
          id: 'sub-view',
          label: 'Subtitle View (Transcript)',
          onClick: () => {
            onOpenSubtitleTranscript?.();
            onClose();
          }
        },
        {
          id: 'sub-style',
          label: 'Subtitle Style Settings',
          onClick: () => {
            onOpenSubtitleSettings?.();
            onClose();
          }
        }
      ]
    },
    {
      id: 'playback',
      label: <span><u>P</u>layback</span>,
      children: [
        {
          id: 'pb-bookmarks',
          label: <span>Custom <u>B</u>ookmarks</span>,
          children: bookmarkItems
        },
        {
          id: 'speed',
          label: <span><u>S</u>peed</span>,
          children: [
            {
              id: 'spd-20',
              label: '2.0x (Double)',
              isRadio: true,
              checked: playbackRate === 2.0,
              onClick: () => onSetPlaybackRate(2.0)
            },
            {
              id: 'spd-15',
              label: '1.5x (Fast)',
              isRadio: true,
              checked: playbackRate === 1.5,
              onClick: () => onSetPlaybackRate(1.5)
            },
            {
              id: 'spd-125',
              label: '1.25x (Faster)',
              isRadio: true,
              checked: playbackRate === 1.25,
              onClick: () => onSetPlaybackRate(1.25)
            },
            {
              id: 'spd-normal',
              label: '1.0x (Normal)',
              isRadio: true,
              checked: playbackRate === 1.0,
              onClick: () => onSetPlaybackRate(1.0)
            },
            {
              id: 'spd-075',
              label: '0.75x (Slower)',
              isRadio: true,
              checked: playbackRate === 0.75,
              onClick: () => onSetPlaybackRate(0.75)
            },
            {
              id: 'spd-05',
              label: '0.5x (Half)',
              isRadio: true,
              checked: playbackRate === 0.5,
              onClick: () => onSetPlaybackRate(0.5)
            }
          ]
        },
        { id: 'pb-div-1', isDivider: true, label: '' },
        {
          id: 'jump-fwd',
          label: 'Jump Forward (+10s)',
          shortcut: '→',
          onClick: () => {
            onJumpForward();
            onClose();
          }
        },
        {
          id: 'jump-bwd',
          label: 'Jump Backward (-10s)',
          shortcut: '←',
          onClick: () => {
            onJumpBackward();
            onClose();
          }
        }
      ]
    },
    { id: 'div-2', isDivider: true, label: '' },
    {
      id: 'view',
      label: <span><u>V</u>iew</span>,
      children: [
        {
          id: 'view-timeline-only',
          label: 'Timeline Only (VLC Mode)',
          shortcut: 'G',
          checked: isTimelineOnly,
          onClick: () => {
            onToggleTimelineOnly();
            onClose();
          }
        },
        {
          id: 'view-fullscreen',
          label: 'Fullscreen Interface',
          shortcut: 'F',
          checked: isFullscreen,
          onClick: () => {
            onToggleFullscreen();
            onClose();
          }
        },
        {
          id: 'view-audiosub',
          label: 'Audio & Subtitle Menu',
          onClick: () => {
            onOpenAudioSubMenu();
            onClose();
          }
        }
      ]
    },
    {
      id: 'tools',
      label: <span><u>T</u>ools</span>,
      children: [
        {
          id: 'tools-settings',
          label: 'Player UI Settings',
          shortcut: 'Del',
          onClick: () => {
            onOpenSettings();
            onClose();
          }
        },
        {
          id: 'tools-audiosub',
          label: 'Track Sync & Audio/Sub Menu',
          onClick: () => {
            onOpenAudioSubMenu();
            onClose();
          }
        }
      ]
    },
    { id: 'div-3', isDivider: true, label: '' },
    {
      id: 'quit',
      label: <span><u>Q</u>uit</span>,
      shortcut: 'Ctrl+Q',
      icon: <LogOut size={13} />,
      onClick: () => {
        onClose();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          window.history.back();
        }
      }
    }
  ];

  // Helper to render menu items recursively
  const renderMenuItems = (items: MenuItemData[], pathPrefix: string[] = []) => {
    const depth = pathPrefix.length;

    return (
      <div className="vlc-menu-list">
        {items.map((item, index) => {
          if (item.isDivider) {
            return <div key={`div-${index}`} className="vlc-menu-divider" />;
          }

          const itemPath = [...pathPrefix, item.id];
          const hasChildren = item.children && item.children.length > 0;
          const isSubmenuOpen = activeSubmenuPath[depth] === item.id;

          return (
            <div
              key={item.id}
              className={`vlc-menu-item ${item.disabled ? 'disabled' : ''} ${isSubmenuOpen ? 'active' : ''}`}
              onMouseEnter={() => {
                if (hasChildren) {
                  setActiveSubmenuPath(itemPath);
                } else {
                  setActiveSubmenuPath(pathPrefix);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                if (item.onClick) {
                  item.onClick();
                }
              }}
            >
              {/* Left slot (radio / check / icon) */}
              <div className="vlc-menu-left-slot">
                {item.checked && (
                  item.isRadio ? (
                    <span className="vlc-radio-dot">●</span>
                  ) : (
                    <Check size={12} strokeWidth={3} className="vlc-check-icon" />
                  )
                )}
                {!item.checked && item.icon && (
                  <span className="vlc-icon-wrapper">{item.icon}</span>
                )}
              </div>

              {/* Label */}
              <span className="vlc-menu-label">{item.label}</span>

              {/* Right slot (shortcut or chevron) */}
              <div className="vlc-menu-right-slot">
                {item.shortcut && (
                  <span className="vlc-menu-shortcut">{item.shortcut}</span>
                )}
                {hasChildren && (
                  <ChevronRight size={12} className="vlc-submenu-arrow" />
                )}
              </div>

              {/* Smart Viewport-aware Submenu */}
              {hasChildren && isSubmenuOpen && (
                <SubmenuContainer>
                  {renderMenuItems(item.children!, itemPath)}
                </SubmenuContainer>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={menuRef}
      className="vlc-context-menu"
      style={{
        position: 'fixed',
        left: `${coords.x}px`,
        top: `${coords.y}px`,
        zIndex: 999999,
        overflow: 'visible'
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {renderMenuItems(menuData)}

      <style>{`
        .vlc-context-menu {
          background: color-mix(in srgb, var(--surface-1) 94%, transparent);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm, 8px);
          box-shadow: 0 12px 36px var(--scrim, rgba(0, 0, 0, 0.45)), 0 0 0 1px var(--border);
          font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          font-size: 12.5px;
          color: var(--text-1);
          user-select: none;
          min-width: 185px;
          padding: 5px 0;
          line-height: 1.4;
          scrollbar-width: thin;
        }

        .vlc-context-menu::-webkit-scrollbar,
        .vlc-submenu-container::-webkit-scrollbar {
          width: 5px;
        }
        .vlc-context-menu::-webkit-scrollbar-thumb,
        .vlc-submenu-container::-webkit-scrollbar-thumb {
          background: var(--control-border);
          border-radius: 3px;
        }

        .vlc-menu-list {
          display: flex;
          flex-direction: column;
        }

        .vlc-menu-item {
          display: flex;
          align-items: center;
          position: relative;
          padding: 5px 14px 5px 28px;
          cursor: pointer;
          color: var(--text-1);
          white-space: nowrap;
          border-left: 2px solid transparent;
          transition: background 0.12s ease, color 0.12s ease;
        }

        .vlc-menu-item:hover,
        .vlc-menu-item.active {
          background: var(--surface-2);
          color: var(--text-1);
          border-left-color: var(--accent);
        }

        .vlc-menu-item.disabled {
          color: var(--text-3);
          opacity: 0.5;
          pointer-events: none;
        }

        .vlc-menu-left-slot {
          position: absolute;
          left: 7px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vlc-radio-dot {
          font-size: 11px;
          color: var(--accent);
          line-height: 1;
        }

        .vlc-check-icon {
          color: var(--accent);
        }

        .vlc-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-2);
        }
        .vlc-menu-item:hover .vlc-icon-wrapper,
        .vlc-menu-item.active .vlc-icon-wrapper {
          color: var(--text-1);
        }

        .vlc-menu-label {
          flex: 1;
          margin-right: 18px;
        }

        .vlc-menu-label u {
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .vlc-menu-right-slot {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }

        .vlc-menu-shortcut {
          font-size: 11px;
          color: var(--text-3);
          margin-right: 4px;
          font-family: monospace;
        }

        .vlc-menu-item:hover .vlc-menu-shortcut,
        .vlc-menu-item.active .vlc-menu-shortcut {
          color: var(--text-2);
        }

        .vlc-submenu-arrow {
          color: var(--text-3);
        }
        .vlc-menu-item:hover .vlc-submenu-arrow,
        .vlc-menu-item.active .vlc-submenu-arrow {
          color: var(--text-1);
        }

        .vlc-menu-divider {
          height: 1px;
          background: var(--border);
          margin: 4px 6px;
        }

        .vlc-submenu-container {
          background: color-mix(in srgb, var(--surface-1) 96%, transparent);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm, 8px);
          box-shadow: 0 12px 36px var(--scrim, rgba(0, 0, 0, 0.45)), 0 0 0 1px var(--border);
          min-width: 175px;
          padding: 5px 0;
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  );
};
