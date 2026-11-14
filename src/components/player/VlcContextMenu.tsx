import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { 
  Play, Pause, Square, SkipBack, SkipForward, Camera,
  Volume2, VolumeX, LogOut, ChevronRight, Check,
  FolderOpen, Globe, PlusCircle, List, Sparkles
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
  toneMappingMode?: string;
  onSetToneMappingMode?: (mode: string) => void;
  // Ambiance Lighting
  isAmbianceEnabled?: boolean;
  onToggleAmbiance?: () => void;
  ambianceBlur?: number;
  onSetAmbianceBlur?: (blurPx: number) => void;
  ambianceOpacity?: number;
  onSetAmbianceOpacity?: (opacity: number) => void;
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
  onToggleTimelineOnly?: () => void;
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
  closeOnClick?: boolean;
}

// Submenu container with smart viewport detection (flips upside and leftside)
const SubmenuContainer: React.FC<{
  children: React.ReactNode;
  onMouseEnter?: () => void;
}> = ({ children, onMouseEnter }) => {
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
      onMouseEnter={onMouseEnter}
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
  toneMappingMode = 'off',
  onSetToneMappingMode,
  isAmbianceEnabled = true,
  onToggleAmbiance,
  ambianceBlur = 54,
  onSetAmbianceBlur,
  ambianceOpacity = 0.7,
  onSetAmbianceOpacity,
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
  const hoverTimerRef = useRef<any>(null);
  const [coords, setCoords] = useState({ x, y });

  // Read config setting for click-off behavior (defaults to true)
  const getClickOffConfig = useCallback((): boolean => {
    try {
      const saved = localStorage.getItem('valor_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.clickOffToHide !== undefined) return Boolean(parsed.clickOffToHide);
        if (parsed.closeOnClickOutside !== undefined) return Boolean(parsed.closeOnClickOutside);
        if (parsed.clickOff !== undefined) return Boolean(parsed.clickOff);
      }
    } catch {}
    return true;
  }, []);

  // Robust containment check covering root menu AND all submenu containers/items
  const isInsideMenuTree = useCallback((target: Node | null): boolean => {
    if (!target) return false;
    if (menuRef.current && menuRef.current.contains(target)) return true;
    if (target instanceof Element) {
      if (target.closest('.vlc-context-menu, .vlc-submenu-container, .vlc-menu-item, .vlc-menu-list')) {
        return true;
      }
    }
    return false;
  }, []);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Close on outside click (capture phase, consuming event), window blur, or ESC
  useEffect(() => {
    const handleCapturePointerDown = (e: MouseEvent | PointerEvent) => {
      // Allow right-click to pass through so onContextMenu can open/reposition the menu at the new location
      if (e.button === 2) {
        return;
      }
      if (!isInsideMenuTree(e.target as Node)) {
        if (getClickOffConfig()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          onClose();
        }
      }
    };

    const handleCaptureClick = (e: MouseEvent) => {
      if (e.button === 2) return;
      if (!isInsideMenuTree(e.target as Node)) {
        if (getClickOffConfig()) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handleWindowBlur = () => {
      onClose();
    };

    window.addEventListener('pointerdown', handleCapturePointerDown, true);
    window.addEventListener('mousedown', handleCapturePointerDown, true);
    window.addEventListener('click', handleCaptureClick, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('pointerdown', handleCapturePointerDown, true);
      window.removeEventListener('mousedown', handleCapturePointerDown, true);
      window.removeEventListener('click', handleCaptureClick, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [onClose, isInsideMenuTree, getClickOffConfig]);

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
      closeOnClick: false,
      checked: selectedAudioTrack === null,
      onClick: () => {
        onSelectAudioTrack?.(null);
      }
    },
    ...audioStreams.map((s, idx) => ({
      id: `audio-stream-${s.index}`,
      label: `Track ${idx + 1} - [${(s.language || 'und').toUpperCase()}]`,
      isRadio: true,
      closeOnClick: false,
      checked: selectedAudioTrack?.streamIndex === s.index,
      onClick: () => {
        onSelectAudioStream?.(s.index, s.codec, s.language);
      }
    })),
    ...audioTracks.map((t) => ({
      id: `audio-custom-${t.id}`,
      label: t.name,
      isRadio: true,
      closeOnClick: false,
      checked: selectedAudioTrack?.id === t.id,
      onClick: () => {
        onSelectAudioTrack?.(t);
      }
    }))
  ];

  // Subtitle Tracks (Only real available tracks)
  const subTrackItems: MenuItemData[] = [
    {
      id: 'sub-disable',
      label: 'Disable',
      isRadio: true,
      closeOnClick: false,
      checked: selectedSubTrack === null,
      onClick: () => {
        onSelectSubTrack?.(null);
      }
    },
    ...subtitleStreams.map((s, idx) => ({
      id: `sub-stream-${s.index}`,
      label: `Track ${idx + 1} - [${(s.language || 'und').toUpperCase()}]`,
      isRadio: true,
      closeOnClick: false,
      checked: selectedSubTrack?.streamIndex === s.index,
      onClick: () => {
        onSelectSubStream?.(s.index, s.codec, s.language);
      }
    })),
    ...subtitleTracks.map((t) => ({
      id: `sub-custom-${t.id}`,
      label: t.name,
      isRadio: true,
      closeOnClick: false,
      checked: selectedSubTrack?.id === t.id,
      onClick: () => {
        onSelectSubTrack?.(t);
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
      }
    },
    {
      id: 'stop',
      label: <span><u>S</u>top</span>,
      icon: <Square size={11} fill="#555" color="#555" />,
      onClick: () => {
        onStop();
      }
    },
    {
      id: 'previous',
      label: <span>Pre<u>v</u>ious (-10s)</span>,
      icon: <SkipBack size={12} fill="#000" />,
      onClick: () => {
        onPrevious();
      }
    },
    {
      id: 'next',
      label: <span><u>N</u>ext (+10s)</span>,
      icon: <SkipForward size={12} fill="#000" />,
      onClick: () => {
        onNext();
      }
    },
    {
      id: 'snapshot-top',
      label: <span>Take <u>S</u>napshot</span>,
      shortcut: 'Shift+S',
      icon: <Camera size={12} color="#000" />,
      onClick: () => {
        onTakeSnapshot();
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
          closeOnClick: false,
          icon: <Volume2 size={13} color="#555" />,
          onClick: () => onIncreaseVolume()
        },
        {
          id: 'vol-down',
          label: 'Decrease Volume (-5%)',
          shortcut: '↓',
          closeOnClick: false,
          icon: <Volume2 size={13} color="#555" />,
          onClick: () => onDecreaseVolume()
        },
        {
          id: 'vol-mute',
          label: <span><u>M</u>ute</span>,
          shortcut: 'M',
          closeOnClick: false,
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
          closeOnClick: false,
          checked: isFullscreen,
          onClick: () => {
            onToggleFullscreen();
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
              closeOnClick: false,
              checked: !aspectRatio || aspectRatio === 'default',
              onClick: () => { onSetAspectRatio?.('default'); }
            },
            { 
              id: 'ar-stretch', 
              label: 'Stretch to Screen (0% Detail Lost)', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === 'stretch',
              onClick: () => { onSetAspectRatio?.('stretch'); }
            },
            { 
              id: 'ar-149', 
              label: 'Smart Crop (14:9 - Minimal Loss)', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === '14:9',
              onClick: () => { onSetAspectRatio?.('14:9'); }
            },
            { 
              id: 'ar-1610', 
              label: '16:10 Minimal Crop', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === '16:10',
              onClick: () => { onSetAspectRatio?.('16:10'); }
            },
            { 
              id: 'ar-169', 
              label: '16:9 Widescreen', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === '16:9',
              onClick: () => { onSetAspectRatio?.('16:9'); }
            },
            { 
              id: 'ar-185', 
              label: '1.85:1 Cinema', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === '1.85:1',
              onClick: () => { onSetAspectRatio?.('1.85:1'); }
            },
            { 
              id: 'ar-219', 
              label: '21:9 Ultrawide Cinema', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === '21:9',
              onClick: () => { onSetAspectRatio?.('21:9'); }
            },
            { 
              id: 'ar-cover', 
              label: 'Fill / Crop Screen (Full Zoom)', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === 'cover',
              onClick: () => { onSetAspectRatio?.('cover'); }
            },
            { 
              id: 'ar-43', 
              label: '4:3 Standard', 
              isRadio: true, 
              closeOnClick: false,
              checked: aspectRatio === '4:3',
              onClick: () => { onSetAspectRatio?.('4:3'); }
            }
          ]
        },
        {
          id: 'ambiance-lighting',
          label: <span><u>A</u>mbiance Glow</span>,
          icon: <Sparkles size={12} color="#000" />,
          checked: isAmbianceEnabled,
          onClick: () => {
            onToggleAmbiance?.();
          },
          children: [
            {
              id: 'amb-toggle',
              label: isAmbianceEnabled ? 'Turn Off Ambiance Glow' : 'Turn On Ambiance Glow',
              checked: isAmbianceEnabled,
              closeOnClick: false,
              onClick: () => {
                onToggleAmbiance?.();
              }
            },
            { id: 'amb-div-1', isDivider: true, label: '' },
            {
              id: 'amb-blur',
              label: <span><u>B</u>lur ({ambianceBlur}px)</span>,
              disabled: !isAmbianceEnabled,
              children: [
                {
                  id: 'blur-16',
                  label: '16px (Light)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceBlur === 16,
                  onClick: () => {
                    onSetAmbianceBlur?.(16);
                  }
                },
                {
                  id: 'blur-32',
                  label: '32px (Subtle)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceBlur === 32,
                  onClick: () => {
                    onSetAmbianceBlur?.(32);
                  }
                },
                {
                  id: 'blur-54',
                  label: '54px (Default)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceBlur === 54,
                  onClick: () => {
                    onSetAmbianceBlur?.(54);
                  }
                },
                {
                  id: 'blur-75',
                  label: '75px (Soft)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceBlur === 75,
                  onClick: () => {
                    onSetAmbianceBlur?.(75);
                  }
                },
                {
                  id: 'blur-100',
                  label: '100px (Strong)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceBlur === 100,
                  onClick: () => {
                    onSetAmbianceBlur?.(100);
                  }
                },
                {
                  id: 'blur-140',
                  label: '140px (Max)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceBlur === 140,
                  onClick: () => {
                    onSetAmbianceBlur?.(140);
                  }
                }
              ]
            },
            {
              id: 'amb-opacity',
              label: <span><u>O</u>pacity ({Math.round(ambianceOpacity * 100)}%)</span>,
              disabled: !isAmbianceEnabled,
              children: [
                {
                  id: 'op-40',
                  label: '40% (Soft)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceOpacity === 0.4,
                  onClick: () => {
                    onSetAmbianceOpacity?.(0.4);
                  }
                },
                {
                  id: 'op-70',
                  label: '70% (Default)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceOpacity === 0.7,
                  onClick: () => {
                    onSetAmbianceOpacity?.(0.7);
                  }
                },
                {
                  id: 'op-90',
                  label: '90% (Vivid)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceOpacity === 0.9,
                  onClick: () => {
                    onSetAmbianceOpacity?.(0.9);
                  }
                },
                {
                  id: 'op-100',
                  label: '100% (Max)',
                  isRadio: true,
                  closeOnClick: false,
                  checked: isAmbianceEnabled && ambianceOpacity === 1.0,
                  onClick: () => {
                    onSetAmbianceOpacity?.(1.0);
                  }
                }
              ]
            }
          ]
        },
        { id: 'vid-div-1', isDivider: true, label: '' },
        {
          id: 'hdr-tonemapping',
          label: <span><u>H</u>DR Tone Mapping</span>,
          icon: <Sparkles size={12} color="#000" />,
          children: [
            {
              id: 'hdr-off',
              label: 'Off',
              isRadio: true,
              closeOnClick: false,
              checked: !toneMappingMode || toneMappingMode === 'off',
              onClick: () => {
                onSetToneMappingMode?.('off');
              }
            },
            {
              id: 'hdr-aces',
              label: 'ACES Filmic',
              isRadio: true,
              closeOnClick: false,
              checked: toneMappingMode === 'aces',
              onClick: () => {
                onSetToneMappingMode?.('aces');
              }
            },
            {
              id: 'hdr-vibrant',
              label: 'Vibrant',
              isRadio: true,
              closeOnClick: false,
              checked: toneMappingMode === 'vibrant',
              onClick: () => {
                onSetToneMappingMode?.('vibrant');
              }
            },
            {
              id: 'hdr-reinhard',
              label: 'Reinhard',
              isRadio: true,
              closeOnClick: false,
              checked: toneMappingMode === 'reinhard',
              onClick: () => {
                onSetToneMappingMode?.('reinhard');
              }
            }
          ]
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
              closeOnClick: false,
              checked: playbackRate === 2.0,
              onClick: () => onSetPlaybackRate(2.0)
            },
            {
              id: 'spd-15',
              label: '1.5x (Fast)',
              isRadio: true,
              closeOnClick: false,
              checked: playbackRate === 1.5,
              onClick: () => onSetPlaybackRate(1.5)
            },
            {
              id: 'spd-125',
              label: '1.25x (Faster)',
              isRadio: true,
              closeOnClick: false,
              checked: playbackRate === 1.25,
              onClick: () => onSetPlaybackRate(1.25)
            },
            {
              id: 'spd-normal',
              label: '1.0x (Normal)',
              isRadio: true,
              closeOnClick: false,
              checked: playbackRate === 1.0,
              onClick: () => onSetPlaybackRate(1.0)
            },
            {
              id: 'spd-075',
              label: '0.75x (Slower)',
              isRadio: true,
              closeOnClick: false,
              checked: playbackRate === 0.75,
              onClick: () => onSetPlaybackRate(0.75)
            },
            {
              id: 'spd-05',
              label: '0.5x (Half)',
              isRadio: true,
              closeOnClick: false,
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
          }
        },
        {
          id: 'jump-bwd',
          label: 'Jump Backward (-10s)',
          shortcut: '←',
          onClick: () => {
            onJumpBackward();
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
          closeOnClick: false,
          checked: isTimelineOnly,
          onClick: () => {
            onToggleTimelineOnly?.();
          }
        },
        {
          id: 'view-ambiance-toggle',
          label: 'Ambiance Glow',
          shortcut: 'A',
          closeOnClick: false,
          checked: isAmbianceEnabled,
          onClick: () => {
            onToggleAmbiance?.();
          }
        },
        {
          id: 'view-fullscreen',
          label: 'Fullscreen Interface',
          shortcut: 'F',
          closeOnClick: false,
          checked: isFullscreen,
          onClick: () => {
            onToggleFullscreen();
          }
        },
        {
          id: 'view-audiosub',
          label: 'Audio & Subtitle Menu',
          onClick: () => {
            onOpenAudioSubMenu();
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
                if (hoverTimerRef.current) {
                  clearTimeout(hoverTimerRef.current);
                }
                hoverTimerRef.current = setTimeout(() => {
                  if (hasChildren) {
                    setActiveSubmenuPath(itemPath);
                  } else {
                    setActiveSubmenuPath(pathPrefix);
                  }
                }, 180);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                
                if (hoverTimerRef.current) {
                  clearTimeout(hoverTimerRef.current);
                }

                // If item has children, toggle or open submenu and DO NOT close context menu
                if (hasChildren) {
                  setActiveSubmenuPath(prev => 
                    prev[depth] === item.id ? pathPrefix : itemPath
                  );
                  if (item.onClick) {
                    item.onClick();
                  }
                  return;
                }

                // Leaf item: run action
                if (item.onClick) {
                  item.onClick();
                }

                // Close menu unless closeOnClick is explicitly false (e.g. toggles, radios)
                if (item.closeOnClick !== false) {
                  onClose();
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
                <SubmenuContainer
                  onMouseEnter={() => {
                    if (hoverTimerRef.current) {
                      clearTimeout(hoverTimerRef.current);
                    }
                  }}
                >
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
    <>
      {/* Full-screen transparent backdrop to catch and consume outside clicks without touching underlying video */}
      <div
        className="vlc-context-menu-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 999998,
          background: 'transparent',
          cursor: 'default'
        }}
        onPointerDown={(e) => {
          if (e.button === 2) return;
          if (getClickOffConfig()) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 2) return;
          if (getClickOffConfig()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          if (e.button === 2) return;
          if (getClickOffConfig()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      />
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
    </>
  );
};
