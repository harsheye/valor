import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, RotateCw, Cast, X, 
  MessageSquare, Maximize, Minimize, MonitorPlay,
  Volume2, Volume1, VolumeX, AlertCircle, Lock, Unlock,
  Layers, Type, Clock, Sliders, SkipForward, Ban, FastForward, Zap, Coffee, ChevronRight, ChevronLeft, Eye, Settings, Bookmark as BookmarkIcon, Activity, Terminal
} from 'lucide-react';
import { Button } from './ui/button';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack, Bookmark } from '../types/media';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from './SubtitleOverlay';
import { AudioSubPopover } from './AudioSubPopover';
import { BookmarkPanel } from './BookmarkPanel';
import { BookmarkModal } from './BookmarkModal';
import { AudioSyncEngine } from '../services/remote/audioSync';
import { parseSubtitles, cleanSubtitleText } from '../utils/subtitleParser';
import { parseMkv, parseMp4, extractMkvSubtitles } from '../utils/containerParser';
import { ffmpegService } from '../services/ffmpeg';
import { HttpByteSource, CachedByteSource } from '../services/remote/remoteByteSource';
import { FileByteSource } from '../services/local/localByteSource';
import { extractLocalAudioSegment, extractLocalSubtitleSegment } from '../services/local/ffmpegLocal';
import { extractRemoteAudioSegment, extractRemoteSubtitleSegment, extractHlsAudioSegment } from '../services/remote/ffmpegRemote';
import { FFmpegManager } from '../services/ffmpeg/FFmpegManager';
import { DemuxManager } from '../services/ffmpeg/DemuxManager';
import { PlaybackController } from '../services/playback/PlaybackController';
import { logger } from '../utils/logger';

const getAudioBoostMultiplier = (boostPercent: number): number => {
  if (boostPercent <= 100) return 1.0;
  if (boostPercent <= 150) {
    return 1.0 + (boostPercent - 100) * 0.04;
  }
  if (boostPercent <= 200) {
    return 3.0 + (boostPercent - 150) * 0.02;
  }
  return 1.0;
};
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { LoadingSpinner, BufferingOverlay } from './LoadingSpinner';
import { RadialMenu } from './RadialMenu';
import { ConsoleOverlay } from './ConsoleOverlay';
import { SpeedPopover } from './SpeedPopover';
import { EsportsLiveOverlay } from './EsportsLiveOverlay';

interface VideoPlayerProps {
  video: VideoItem;
  customLoaderUrl?: string;
  customLoaderType?: 'default' | 'image' | 'video' | 'gif';
  spinnerPreset?: string;
  userId?: string;
  profileName?: string;
  videos?: VideoItem[];
  onBack: () => void;
  onUpdateVideo: (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting?: boolean, targetVideoId?: string, forceSave?: boolean) => void;
  hideUIOverlays?: boolean;
  hideVideoName?: boolean;
  toastDuration?: number;
  disableAnimations?: boolean;
  pauseOnFocusChange?: boolean;
  showPlayButton?: boolean;
  showTimeDisplay?: boolean;
  showPlayBar?: boolean;
  showVolumeControl?: boolean;
  showFullscreen?: boolean;
  subSettings: SubtitleSettings;
  onUpdateSubSettings: (settings: Partial<SubtitleSettings>) => void;
  historySaveInterval?: number;
  saveVolume?: boolean;
  ratingThreshold?: number;
  getOverlayDataFromTmdb?: boolean;
  overlayPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  overlayShowBackground?: boolean;
  overlayShowRating?: boolean;
  overlayShowOverview?: boolean;
  openSubtitlesApiKey?: string;
  onUpdateSettings?: (settings: Partial<any>) => void;
  allowUiSkipping?: boolean;
  blockSeekingCompletely?: boolean;
  autoSkipIntroOutro?: boolean;
  autoSkipSexScenes?: boolean;
  lockModeActive?: boolean;
  settingsOrder?: string[];
  radialMenuConfig?: any;
  uiHideTimeout?: number;
  onReassociate?: (videoId: string) => void;
}

const OdometerDigit: React.FC<{ val: string }> = ({ val }) => {
  const num = parseInt(val, 10);
  const isNumber = !isNaN(num);

  if (!isNumber) {
    return <span className="odo-separator">{val}</span>;
  }

  return (
    <div className="odo-digit-container">
      <div 
        className="odo-digit-strip" 
        style={{ transform: `translateY(-${num * 10}%)` }}
      >
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
        <span>7</span>
        <span>8</span>
        <span>9</span>
      </div>
    </div>
  );
};

const OdometerClock: React.FC<{ date: Date }> = ({ date }) => {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return (
    <div className="odo-clock-container">
      <span className="odo-hours-group" style={{ color: '#e50914', display: 'inline-flex' }}>
        <OdometerDigit val={hh[0]} />
        <OdometerDigit val={hh[1]} />
      </span>
      <span className="odo-separator" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>:</span>
      <span className="odo-minutes-group" style={{ color: '#ffffff', display: 'inline-flex' }}>
        <OdometerDigit val={mm[0]} />
        <OdometerDigit val={mm[1]} />
      </span>
      <span className="odo-separator" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>:</span>
      <span className="odo-seconds-group" style={{ color: '#ffffff', display: 'inline-flex' }}>
        <OdometerDigit val={ss[0]} />
        <OdometerDigit val={ss[1]} />
      </span>
    </div>
  );
};


export interface MediaDetails {
  title: string;
  episodeTitle?: string;
  season?: number;
  episode?: number;
  releaseDate?: string;
  overview?: string;
  imageUrl?: string;
  logoUrl?: string;
  rating?: number;
}

export const LocalVideoPlayer: React.FC<VideoPlayerProps> = ({ 
  video: rawVideo, 
  videos,
  onBack, 
  onUpdateVideo, 
  customLoaderUrl,
  customLoaderType = 'default',
  spinnerPreset = 'fire-circle',
  userId = 'local',
  profileName = 'Local Profile',
  hideUIOverlays: propHideUIOverlays = false,
  hideVideoName: propHideVideoName = false,
  toastDuration = 0.5,
  disableAnimations = false,
  pauseOnFocusChange = false,
  showPlayButton: propShowPlayButton = true,
  showTimeDisplay: propShowTimeDisplay = true,
  showPlayBar: propShowPlayBar = true,
  showVolumeControl: propShowVolumeControl = true,
  showFullscreen: propShowFullscreen = true,
  subSettings,
  onUpdateSubSettings,
  historySaveInterval = 5,
  saveVolume = true,
  ratingThreshold = 3,
  getOverlayDataFromTmdb = true,
  overlayPosition = 'bottom-left',
  overlayShowBackground = true,
  overlayShowRating = true,
  overlayShowOverview = true,
  openSubtitlesApiKey = '',
  onUpdateSettings,
  allowUiSkipping = true,
  blockSeekingCompletely = false,
  autoSkipIntroOutro = true,
  autoSkipSexScenes = true,
  lockModeActive: propLockModeActive = false,
  settingsOrder,
  radialMenuConfig,
  uiHideTimeout = 1.5,
  onReassociate
}) => {
  const isFile = (obj: any): obj is File => obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
  const video = useMemo(() => ({
    ...rawVideo,
    file: isFile(rawVideo.file) ? rawVideo.file : undefined
  }), [rawVideo]);

  const [resolvedFile, setResolvedFile] = useState<File | Blob | null>(() => {
    return isFile(rawVideo.file) ? rawVideo.file : null;
  });

  const activeFile = isFile(video.file) ? video.file : resolvedFile;

  useEffect(() => {
    setHasFileAccessError(false);
    if (isFile(video.file)) {
      setResolvedFile(video.file);
    } else {
      setResolvedFile(null);
    }
  }, [video.id, video.url, video.file]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaDetails, setMediaDetails] = useState<MediaDetails | null>(null);
  const [videoLayout, setVideoLayout] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [openSubtitles, setOpenSubtitles] = useState<any[]>([]);
  const [isOpenSubLoading, setIsOpenSubLoading] = useState(false);
  const [hasFetchedOpenSubtitles, setHasFetchedOpenSubtitles] = useState(false);
  const [hasFileAccessError, setHasFileAccessError] = useState(false);

  const updateVideoLayout = useCallback(() => {
    if (!videoRef.current || !containerRef.current) return;
    const videoEl = videoRef.current;
    const containerEl = containerRef.current;
    
    const containerWidth = containerEl.clientWidth;
    const containerHeight = containerEl.clientHeight;
    const videoWidth = videoEl.videoWidth;
    const videoHeight = videoEl.videoHeight;
    
    if (!videoWidth || !videoHeight || !containerWidth || !containerHeight) return;
    
    const containerRatio = containerWidth / containerHeight;
    const videoRatio = videoWidth / videoHeight;
    
    let left = 0;
    let top = 0;
    let width = containerWidth;
    let height = containerHeight;
    
    if (containerRatio > videoRatio) {
      width = containerHeight * videoRatio;
      left = (containerWidth - width) / 2;
    } else {
      height = containerWidth / videoRatio;
      top = (containerHeight - height) / 2;
    }
    
    setVideoLayout({ left, top, width, height });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      updateVideoLayout();
    };
    window.addEventListener('resize', handleResize);
    
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(containerRef.current);
    }

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.addEventListener('loadedmetadata', handleResize);
      videoEl.addEventListener('canplay', handleResize);
      videoEl.addEventListener('play', handleResize);
      videoEl.addEventListener('pause', handleResize);
    }
    
    setTimeout(handleResize, 100);
    setTimeout(handleResize, 500);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (videoEl) {
        videoEl.removeEventListener('loadedmetadata', handleResize);
        videoEl.removeEventListener('canplay', handleResize);
        videoEl.removeEventListener('play', handleResize);
        videoEl.removeEventListener('pause', handleResize);
      }
    };
  }, [updateVideoLayout, video.url]);

  const fetchOpenSubtitles = useCallback(async () => {
    if (!openSubtitlesApiKey) {
      logger.player('[OpenSubtitles] No API key provided in props.');
      return;
    }

    setIsOpenSubLoading(true);
    setHasFetchedOpenSubtitles(true);
    setOpenSubtitles([]);
    try {
      const savedSettings = localStorage.getItem('valor_settings');
      let defaultSubCode = 'en';
      if (savedSettings) {
        try {
          const defaultSub = JSON.parse(savedSettings).defaultSub || 'ENG';
          if (defaultSub === 'ENG') defaultSubCode = 'en';
          else if (defaultSub === 'JAP') defaultSubCode = 'ja';
          else if (defaultSub === 'CHN') defaultSubCode = 'zh';
          else if (defaultSub === 'Off') defaultSubCode = 'en';
        } catch {}
      }

      const seriesInfo = classifyVideoTitle(video.title);
      let searchUrl = '';
      if (seriesInfo.type === 'series' && seriesInfo.seriesTitle) {
        searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(seriesInfo.seriesTitle)}&season_number=${seriesInfo.season || 1}&episode_number=${seriesInfo.episode || 1}&languages=${defaultSubCode}`;
        logger.player(`[OpenSubtitles] Querying TV Subtitles: "${seriesInfo.seriesTitle}" S${seriesInfo.season}E${seriesInfo.episode} in language: ${defaultSubCode}`);
      } else {
        const cleanName = video.title.replace(/\.[^/.]+$/, "");
        searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(cleanName)}&languages=${defaultSubCode}`;
        logger.player(`[OpenSubtitles] Querying Movie Subtitles: "${cleanName}" in language: ${defaultSubCode}`);
      }
      
      const res = await fetch(searchUrl, {
        headers: {
          'Api-Key': openSubtitlesApiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Valor v1.0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const items = (data.data || []).map((d: any) => {
          const file = d.attributes.files?.[0];
          return {
            id: d.id,
            fileName: file?.file_name || d.attributes.release || 'Subtitle',
            fileId: file?.file_id,
            language: d.attributes.language,
            release: d.attributes.release || ''
          };
        }).filter((item: any) => item.fileId);

        // Sort items: default language first, then other languages alphabetically
        const savedSettings = localStorage.getItem('valor_settings');
        let defaultLang = 'en';
        if (savedSettings) {
          try {
            defaultLang = JSON.parse(savedSettings).defaultSub || 'en';
          } catch {}
        }
        
        items.sort((a: any, b: any) => {
          if (a.language === defaultLang && b.language !== defaultLang) return -1;
          if (a.language !== defaultLang && b.language === defaultLang) return 1;
          return a.language.localeCompare(b.language);
        });
        
        setOpenSubtitles(items);
        logger.player(`[OpenSubtitles] Found ${items.length} subtitles.`);
      } else {
        logger.player(`[OpenSubtitles] Search failed: HTTP ${res.status}`);
      }
    } catch (err) {
      logger.player(`[OpenSubtitles] Search error: ${err}`);
    } finally {
      setIsOpenSubLoading(false);
    }
  }, [openSubtitlesApiKey, video.title, video.url]);

  const downloadOpenSubtitle = useCallback(async (fileId: number, fileName: string, language: string) => {
    if (!openSubtitlesApiKey) {
      triggerSwitchToast("OpenSubtitles API Key is required.");
      return;
    }

    triggerSwitchToast("Downloading subtitle...");
    try {
      const res = await fetch('https://api.opensubtitles.com/api/v1/download', {
        method: 'POST',
        headers: {
          'Api-Key': openSubtitlesApiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Valor v1.0'
        },
        body: JSON.stringify({ file_id: fileId })
      });
      if (res.ok) {
        const data = await res.json();
        const downloadLink = data.link;
        if (!downloadLink) {
          throw new Error("No download link in response.");
        }
        
        const fileRes = await fetch(downloadLink);
        if (fileRes.ok) {
          const text = await fileRes.text();
          const cues = parseSubtitles(text, fileName);
          const newTrack: CustomSubtitleTrack = {
            id: `opensub-${fileId}`,
            name: `OpenSubtitles (${language.toUpperCase()}) - ${fileName}`,
            url: '',
            cues: cues,
            isExtracted: false
          };
          
          onUpdateVideo((prev: any) => ({
            ...prev,
            subtitleTracks: [...(prev.subtitleTracks || []), newTrack]
          }));
          handleSelectSubTrack(newTrack);
          triggerSwitchToast("Subtitle loaded successfully!");
        } else {
          throw new Error("Failed to fetch subtitle file.");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      logger.player(`[OpenSubtitles] Download error: ${err}`);
      triggerSwitchToast(`Download failed: ${err.message || err}`);
    }
  }, [openSubtitlesApiKey, onUpdateVideo]);

  useEffect(() => {
    setHasFetchedOpenSubtitles(false);
    setOpenSubtitles([]);
  }, [video.id]);

  // UI Customization & Bookmarks State
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBookmarksPopover, setShowBookmarksPopover] = useState(false);
  const [bookmarks, setBookmarks] = useState<any[]>(() => video.bookmarks || []);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | undefined>(undefined);
  const [markingStartTime, setMarkingStartTime] = useState<number | null>(null);

  const [hoveredSetting, setHoveredSetting] = useState<string | null>(null);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

  interface PlayerSettings {
    hideUIOverlays: boolean | 'enable' | 'hide' | 'disable';
    hideVideoName: boolean | 'enable' | 'hide' | 'disable';
    showPlayButton: boolean | 'enable' | 'hide' | 'disable';
    showTimeDisplay: boolean | 'enable' | 'hide' | 'disable';
    showPlayBar: boolean | 'enable' | 'hide' | 'disable';
    showVolumeControl: boolean | 'enable' | 'hide' | 'disable';
    showFullscreen: boolean | 'enable' | 'hide' | 'disable';
    allowUiSkipping: boolean;
    blockSeekingCompletely: boolean;
    autoSkipIntroOutro: boolean;
    autoSkipSexScenes: boolean;
    lockModeActive: boolean;
    disableAnimations: boolean;
    pauseOnFocusChange: boolean;
  }

  const [playerSettings, setPlayerSettings] = useState<PlayerSettings>({
    hideUIOverlays: !!propHideUIOverlays,
    hideVideoName: !!propHideVideoName,
    showPlayButton: propShowPlayButton !== false,
    showTimeDisplay: propShowTimeDisplay !== false,
    showPlayBar: propShowPlayBar !== false,
    showVolumeControl: propShowVolumeControl !== false,
    showFullscreen: propShowFullscreen !== false,
    allowUiSkipping: allowUiSkipping !== false,
    blockSeekingCompletely: !!blockSeekingCompletely,
    autoSkipIntroOutro: autoSkipIntroOutro !== false,
    autoSkipSexScenes: autoSkipSexScenes !== false,
    lockModeActive: !!propLockModeActive,
    disableAnimations: !!disableAnimations,
    pauseOnFocusChange: !!pauseOnFocusChange
  });

  const [vctOverlayEnabled, setVctOverlayEnabled] = useState(() => localStorage.getItem('vct_overlay_enabled') === 'true');
  useEffect(() => {
    const handleStorage = () => setVctOverlayEnabled(localStorage.getItem('vct_overlay_enabled') === 'true');
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    // If settings already exist in state, don't overwrite with raw boolean props
    setPlayerSettings(prev => ({
      hideUIOverlays: prev.hideUIOverlays !== undefined ? prev.hideUIOverlays : !!propHideUIOverlays,
      hideVideoName: prev.hideVideoName !== undefined ? prev.hideVideoName : !!propHideVideoName,
      showPlayButton: prev.showPlayButton !== undefined ? prev.showPlayButton : (propShowPlayButton !== false),
      showTimeDisplay: prev.showTimeDisplay !== undefined ? prev.showTimeDisplay : (propShowTimeDisplay !== false),
      showPlayBar: prev.showPlayBar !== undefined ? prev.showPlayBar : (propShowPlayBar !== false),
      showVolumeControl: prev.showVolumeControl !== undefined ? prev.showVolumeControl : (propShowVolumeControl !== false),
      showFullscreen: prev.showFullscreen !== undefined ? prev.showFullscreen : (propShowFullscreen !== false),
      allowUiSkipping: allowUiSkipping !== false,
      blockSeekingCompletely: !!blockSeekingCompletely,
      autoSkipIntroOutro: autoSkipIntroOutro !== false,
      autoSkipSexScenes: autoSkipSexScenes !== false,
      lockModeActive: !!propLockModeActive,
      disableAnimations: !!disableAnimations,
      pauseOnFocusChange: !!pauseOnFocusChange
    }));
  }, [propHideUIOverlays, propHideVideoName, propShowPlayButton, propShowTimeDisplay, propShowPlayBar, propShowVolumeControl, propShowFullscreen, allowUiSkipping, blockSeekingCompletely, autoSkipIntroOutro, autoSkipSexScenes, propLockModeActive, disableAnimations, pauseOnFocusChange]);

  const updatePlayerSetting = (key: keyof typeof playerSettings, value: any) => {
    setPlayerSettings(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'blockSeekingCompletely' && value) {
        next.allowUiSkipping = false;
      }
      return next;
    });

    // Invoke callback side-effects after state update scheduling to prevent updating parent while rendering child
    const nextSettings = { ...playerSettings, [key]: value };
    if (key === 'blockSeekingCompletely' && value) {
      nextSettings.allowUiSkipping = false;
    }
    if (onUpdateSettings) {
      onUpdateSettings(nextSettings);
    }
  };

  const uiConfig = {
    allowUiSkipping: playerSettings.allowUiSkipping,
    blockSeekingCompletely: playerSettings.blockSeekingCompletely,
    autoSkipIntroOutro: playerSettings.autoSkipIntroOutro,
    autoSkipSexScenes: playerSettings.autoSkipSexScenes
  };

  // Helper to determine mode (enable, hide, disable)
  const getSettingMode = (value: any, isNegativeKey: boolean): 'enable' | 'hide' | 'disable' => {
    if (value === 'disable') return 'disable';
    if (isNegativeKey) {
      if (value === false || value === 'enable') return 'enable';
      return 'hide'; // true or 'hide'
    } else {
      if (value === true || value === 'enable') return 'enable';
      return 'hide'; // false or 'hide'
    }
  };

  const showUIOverlaysMode = getSettingMode(playerSettings.hideUIOverlays, true);
  const showVideoNameMode = getSettingMode(playerSettings.hideVideoName, true);
  const showPlayButtonMode = getSettingMode(playerSettings.showPlayButton, false);
  const showTimeDisplayMode = getSettingMode(playerSettings.showTimeDisplay, false);
  const showPlayBarMode = getSettingMode(playerSettings.showPlayBar, false);
  const showVolumeControlMode = getSettingMode(playerSettings.showVolumeControl, false);
  const showFullscreenMode = getSettingMode(playerSettings.showFullscreen, false);

  // Shadow props with reactive state values for settings (booleans for rendering)
  const hideUIOverlays = showUIOverlaysMode !== 'enable' && hoveredSetting !== 'showUIOverlays';
  const hideVideoName = showVideoNameMode !== 'enable' && hoveredSetting !== 'showVideoName';
  const showPlayButton = showPlayButtonMode === 'enable' || hoveredSetting === 'showPlayButton';
  const showTimeDisplay = showTimeDisplayMode === 'enable' || hoveredSetting === 'showTimeDisplay';
  const showPlayBar = showPlayBarMode === 'enable' || hoveredSetting === 'showPlayBar';
  const showVolumeControl = showVolumeControlMode === 'enable' || hoveredSetting === 'showVolumeControl';
  const showFullscreen = showFullscreenMode === 'enable' || hoveredSetting === 'showFullscreen';

  const getHighlightClass = (key: string): string => {
    if (hoveredSetting !== key) return '';

    // Check if the setting is a 3-mode setting
    if (
      key === 'showUIOverlays' ||
      key === 'showVideoName' ||
      key === 'showPlayButton' ||
      key === 'showTimeDisplay' ||
      key === 'showPlayBar' ||
      key === 'showVolumeControl' ||
      key === 'showFullscreen'
    ) {
      let stateVal = (playerSettings as any)[key];
      const isNegative = key === 'showUIOverlays' || key === 'showVideoName';
      // Normalize stateVal for negative keys:
      let actualVal = stateVal;
      if (key === 'showUIOverlays') {
        actualVal = playerSettings.hideUIOverlays;
      } else if (key === 'showVideoName') {
        actualVal = playerSettings.hideVideoName;
      }
      
      const mode = getSettingMode(actualVal, isNegative);
      if (mode === 'hide') return 'highlight-active-orange';
      if (mode === 'disable') return 'highlight-active-red';
      return 'highlight-active-blue';
    }

    // Standard boolean toggles:
    if (key === 'blockSeekingCompletely' || key === 'disableAnimations' || key === 'pauseOnFocusChange') {
      const val = (playerSettings as any)[key];
      return val ? 'highlight-active-red' : 'highlight-active-blue';
    }

    // Positive options
    if (key === 'allowUiSkipping' || key === 'autoSkipIntroOutro' || key === 'lockModeActive') {
      const val = (playerSettings as any)[key];
      return val ? 'highlight-active-blue' : 'highlight-active-red';
    }

    return 'highlight-active-blue';
  };

  const cycleSetting = (key: keyof typeof playerSettings) => {
    setPlayerSettings(prev => {
      const val = prev[key];
      let nextVal: any;
      if (key === 'hideUIOverlays' || key === 'hideVideoName') {
        // Negative key names:
        // false ('enable') -> true ('hide') -> 'disable' -> false ('enable')
        if (val === false || val === 'enable') {
          nextVal = true; // hide
        } else if (val === true || val === 'hide') {
          nextVal = 'disable';
        } else {
          nextVal = false; // enable
        }
      } else {
        // Positive key names:
        // true ('enable') -> false ('hide') -> 'disable' -> true ('enable')
        if (val === true || val === 'enable') {
          nextVal = false; // hide
        } else if (val === false || val === 'hide') {
          nextVal = 'disable';
        } else {
          nextVal = true; // enable
        }
      }
      const next = { ...prev, [key]: nextVal };
      if (onUpdateSettings) {
        onUpdateSettings(next);
      }
      return next;
    });
  };

  const getToggleBtnClass = (key: keyof typeof playerSettings): string => {
    const val = playerSettings[key];
    if (key === 'hideUIOverlays' || key === 'hideVideoName') {
      if (val === false || val === 'enable') return 'settings-icon-toggle active-blue';
      if (val === true || val === 'hide') return 'settings-icon-toggle active-orange';
      return 'settings-icon-toggle active-red';
    } else {
      if (val === true || val === 'enable') return 'settings-icon-toggle active-blue';
      if (val === false || val === 'hide') return 'settings-icon-toggle active-orange';
      return 'settings-icon-toggle active-red';
    }
  };

  const getSettingLabelSuffix = (key: keyof typeof playerSettings): string => {
    const val = playerSettings[key];
    let mode: string;
    if (key === 'hideUIOverlays' || key === 'hideVideoName') {
      mode = (val === false || val === 'enable') ? 'Enable' : (val === true || val === 'hide') ? 'Hide' : 'Disable';
    } else {
      mode = (val === true || val === 'enable') ? 'Enable' : (val === false || val === 'hide') ? 'Hide' : 'Disable';
    }
    return ` (Current: ${mode})`;
  };

  // Series Bookmarks Preset Syncing
  useEffect(() => {
    if (!videos) return;
    try {
      const seriesInfo = classifyVideoTitle(video.title);
      if (seriesInfo.type === 'series' && seriesInfo.seriesTitle) {
        const currentBookmarks = video.bookmarks || [];
        const hasIntro = currentBookmarks.some((b: any) => b.isIntro);
        const hasOutro = currentBookmarks.some((b: any) => b.isOutro);

        if (!hasIntro || !hasOutro) {
          const otherEpisodes = videos.filter(
            v => v.id !== video.id && v.title && classifyVideoTitle(v.title).type === 'series' && classifyVideoTitle(v.title).seriesTitle === seriesInfo.seriesTitle
          );
          
          let introToCopy: any = null;
          let outroToCopy: any = null;
          let outroSourceEp: any = null;

          for (const ep of otherEpisodes) {
            const epBms = ep.bookmarks || [];
            if (!introToCopy) introToCopy = epBms.find((b: any) => b.isIntro);
            if (!outroToCopy) {
              outroToCopy = epBms.find((b: any) => b.isOutro);
              if (outroToCopy) outroSourceEp = ep;
            }
            if (introToCopy && outroToCopy) break;
          }

          const newBms = [...currentBookmarks];
          let updated = false;

          if (introToCopy && !hasIntro) {
            newBms.push({ ...introToCopy, id: `bm-intro-${video.id}`, createdBy: 'system' });
            updated = true;
          }
          if (outroToCopy && !hasOutro) {
            const outroOffset = outroSourceEp?.duration ? (outroSourceEp.duration - outroToCopy.time) : null;
            const newOutroTime = (outroOffset !== null && duration) 
              ? Math.max(0, Math.round(duration - outroOffset)) 
              : outroToCopy.time;
            newBms.push({ ...outroToCopy, time: newOutroTime, id: `bm-outro-${video.id}`, createdBy: 'system' });
            updated = true;
          }

          if (updated) {
            const sortedBms = newBms.sort((a, b) => a.time - b.time);
            setBookmarks(sortedBms);
            onUpdateVideo((prev: any) => ({
              ...prev,
              bookmarks: sortedBms
            }));
            logger.player(`Auto-populated series bookmarks for ${video.title}`);
          }
        }
      }
    } catch (err) {
      console.error('Error loading series presets:', err);
    }
  }, [video.id, video.title, videos]);

  // Sync bookmarks to server via GraphQL (for all profiles)
  const syncBookmarksToServer = async (updatedBookmarks: any[]) => {
    try {
      const activeUserId = userId || 'local';
      
      const seriesInfo = classifyVideoTitle(video.title);
      const isTV = seriesInfo.type === 'series';
      const resolvedTmdbId = video.tmdbId || tmdbIdRef.current;
      if (!resolvedTmdbId) {
        logger.player('[Bookmark Sync] Skipping sync: tmdbId is not resolved yet.');
        return;
      }

      // Filter only bookmarks created by the current user
      const userBookmarks = updatedBookmarks.filter(bm => {
        return !bm.createdBy || bm.createdBy === 'manual' || bm.userId === activeUserId || bm.userName === profileName;
      });

      const mutation = `
        mutation SaveBookmarks($userId: String!, $videoId: String!, $tmdbId: Int!, $season: Int, $episode: Int, $bookmarks: [BookmarkInput!]!) {
          saveBookmarks(userId: $userId, videoId: $videoId, tmdbId: $tmdbId, season: $season, episode: $episode, bookmarks: $bookmarks) {
            success
            count
          }
        }
      `;
      
      const serializedBookmarks = userBookmarks.map(bm => ({
        id: bm.id,
        time: bm.time,
        endTime: bm.endTime !== undefined ? bm.endTime : null,
        label: bm.label || '',
        isIntro: bm.isIntro || false,
        isOutro: bm.isOutro || false,
        skipEnabled: bm.skipEnabled || false,
        title: bm.title || '',
        description: bm.description || '',
        category: bm.category || 'Custom',
        thumbnail: bm.thumbnail || '',
        favorite: bm.favorite || false,
        createdAt: bm.createdAt || new Date().toISOString(),
        updatedAt: bm.updatedAt || new Date().toISOString(),
        userName: bm.userName || profileName || 'Local Profile',
        userTime: bm.userTime || new Date().toISOString(),
        mediaName: bm.mediaName || video.title || ''
      }));
      
      const response = await fetch('http://127.0.0.1:50001/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: mutation,
          variables: { 
            userId: activeUserId, 
            videoId: video.id, 
            tmdbId: resolvedTmdbId,
            season: isTV ? (seriesInfo.season || 1) : null,
            episode: isTV ? (seriesInfo.episode || 1) : null,
            bookmarks: serializedBookmarks 
          }
        })
      });
      
      const result = await response.json();
      if (result.errors) {
        logger.error('[Bookmark Sync] GraphQL error:', result.errors[0].message);
      } else {
        logger.player(`[Bookmark Sync] Synced ${serializedBookmarks.length} bookmarks to server for tmdbId: ${resolvedTmdbId}`);
      }
    } catch (err) {
      logger.error('[Bookmark Sync] Failed to sync bookmarks:', err);
    }
  };

  // Auto-submit existing bookmarks to TheIntroDB when TIDB has no data
  const autoSubmitBookmarksToTidb = async (currentBookmarks: any[]) => {
    if (hadTidbDataRef.current) return; // TIDB already has data
    
    const introOutroBookmarks = currentBookmarks.filter(
      bm => bm.isIntro || bm.isOutro || bm.category === 'Intro' || bm.category === 'Outro'
    );
    if (introOutroBookmarks.length === 0) return; // No intro/outro bookmarks to submit
    
    for (const bm of introOutroBookmarks) {
      await submitToTheIntroDb(bm);
    }
  };

  const submitToTheIntroDb = async (bookmark: any) => {
    if (hadTidbDataRef.current) {
      logger.player('[TheIntroDB Submit] Skipping submission: TIDB already has data for this video.');
      return;
    }

    const tmdbId = tmdbIdRef.current;
    if (!tmdbId) {
      logger.player('[TheIntroDB Submit] Skipping submission: No TMDB ID resolved.');
      return;
    }

    const savedSettings = localStorage.getItem('valor_settings');
    let apiKey = "";
    let mode = "fetch";
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        apiKey = parsed.theIntroDbApiKey || "";
        mode = parsed.theIntroDbMode || "fetch";
      } catch {}
    }
    if (mode === 'fetch') {
      logger.player('[TheIntroDB Submit] Skipping submission: TheIntroDB Mode is set to Fetch Only.');
      return;
    }
    if (!apiKey) {
      logger.player('[TheIntroDB Submit] Skipping submission: No API key found in settings.');
      return;
    }

    const seriesInfo = classifyVideoTitle(video.title);
    const isTV = seriesInfo.type === 'series';

    let segment = "intro";
    if (bookmark.isOutro) {
      segment = "credits";
    } else if (bookmark.isIntro) {
      const labelLower = (bookmark.label || "").toLowerCase();
      if (labelLower.includes("recap")) {
        segment = "recap";
      }
    } else {
      return;
    }

    const payload: any = {
      tmdb_id: tmdbId,
      type: isTV ? "tv" : "movie",
      segment: segment,
      start_sec: Number(bookmark.time),
      end_sec: bookmark.endTime !== undefined && bookmark.endTime !== null ? Number(bookmark.endTime) : null,
      video_duration_ms: Math.round(duration * 1000)
    };

    if (isTV) {
      payload.season = String(seriesInfo.season || 1);
      payload.episode = String(seriesInfo.episode || 1);
    }

    logger.player('[TheIntroDB Submit] Submitting segment to TIDB: ' + JSON.stringify(payload));
    try {
      const res = await fetch('https://api.theintrodb.org/v3/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        logger.player('[TheIntroDB Submit] Submission failed. HTTP Status: ' + res.status);
        const errText = await res.text();
        logger.player('[TheIntroDB Submit] Error detail: ' + errText);
        triggerSwitchToast("Failed to submit to TIDB");
      } else {
        const resData = await res.json();
        logger.player('[TheIntroDB Submit] Submission success: ' + JSON.stringify(resData));
        triggerSwitchToast("Submitted to TIDB successfully");
      }
    } catch (err) {
      logger.player('[TheIntroDB Submit] Network/Fetch error: ' + err);
      triggerSwitchToast("Failed to submit to TIDB");
    }
  };

  const handleSaveBookmark = (bmData: Bookmark) => {
    let newBookmark: Bookmark;
    let updatedBookmarks: Bookmark[];
    
    if (editingBookmark && editingBookmark.id) {
      newBookmark = { ...editingBookmark, ...bmData };
      updatedBookmarks = bookmarks.map(b => b.id === newBookmark.id ? newBookmark : b).sort((a, b) => a.time - b.time);
    } else {
      newBookmark = {
        ...bmData,
        id: `bm-${Date.now()}`,
        createdBy: bmData.createdBy || 'manual'
      };
      updatedBookmarks = [...bookmarks, newBookmark].sort((a, b) => a.time - b.time);
    }
    
    setBookmarks(updatedBookmarks);

    onUpdateVideo((prev: any) => ({
      ...prev,
      bookmarks: updatedBookmarks
    }), false, undefined, true); // forceSave = true

    if (newBookmark.favorite) {
      syncFavoriteToTrakt(true);
    }
    submitToTheIntroDb(newBookmark);
    syncBookmarksToServer(updatedBookmarks);

    setShowAddDialog(false);
    setEditingBookmark(undefined);
    if (videoRef.current && isPlaying) {
      videoRef.current.play().catch(console.error);
    }
  };

  const handleDeleteBookmark = (id: string) => {
    const updatedBookmarks = bookmarks.filter(bm => bm.id !== id);
    setBookmarks(updatedBookmarks);

    onUpdateVideo((prev: any) => ({
      ...prev,
      bookmarks: updatedBookmarks
    }), false, undefined, true); // forceSave = true

    if (updatedBookmarks.length === 0) {
      syncFavoriteToTrakt(false);
    }
    syncBookmarksToServer(updatedBookmarks);
  };
  const [currentTime, setCurrentTime] = useState(video.currentTime || 0);
  const latestTimeRef = useRef<number>(video.currentTime || 0);
  useEffect(() => {
    latestTimeRef.current = currentTime;
  }, [currentTime]);


  const [duration, setDuration] = useState(0);
  const [resumePromptTime, setResumePromptTime] = useState<number | null>(null);

  const totalTimeWatchedRef = useRef<number>((video as any).totalTimeWatched || 0);
  const sessionStartRef = useRef<number | null>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [userRating, setUserRating] = useState<number | null>((video as any).rating || null);
  const ratingPromptedRef = useRef<boolean>(!!(video as any).rating);

  const tmdbIdRef = useRef<number | null>(null);
  const hadTidbDataRef = useRef<boolean>(false);
  const hasScrobbledTraktRef = useRef<boolean>(!!(video as any).hasScrobbledTrakt);

  const scrobbleToTrakt = async () => {
    const savedSettings = localStorage.getItem('valor_settings');
    if (!savedSettings) return;
    try {
      const parsed = JSON.parse(savedSettings);
      const token = parsed.traktAccessToken;
      const syncHistory = parsed.traktSyncHistory;
      if (!token || !syncHistory) return;

      if (hasScrobbledTraktRef.current) return;
      hasScrobbledTraktRef.current = true;

      const seriesInfo = classifyVideoTitle(video.title);
      const isTV = seriesInfo.type === 'series';
      const tmdbId = tmdbIdRef.current;
      const nowIso = new Date().toISOString();

      const body: any = {};
      if (isTV) {
        if (!tmdbId) {
          logger.player('Skipping Trakt.tv scrobble: no TMDB ID resolved for series.');
          return;
        }
        body.shows = [
          {
            ids: { tmdb: tmdbId },
            seasons: [
              {
                number: seriesInfo.season || 1,
                episodes: [
                  {
                    number: seriesInfo.episode || 1,
                    watched_at: nowIso
                  }
                ]
              }
            ]
          }
        ];
      } else {
        body.movies = [
          {
            title: seriesInfo.displayTitle,
            watched_at: nowIso,
            ids: tmdbId ? { tmdb: tmdbId } : undefined
          }
        ];
        if (!tmdbId && !seriesInfo.displayTitle) {
          logger.player('Skipping Trakt.tv scrobble: no TMDB ID or movie title.');
          return;
        }
      }

      logger.player(`Scrobbling watch history to Trakt.tv...`);
      const res = await fetch('https://api.trakt.tv/sync/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'trakt-api-key': 'f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289',
          'trakt-api-version': '2'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        logger.player('Successfully scrobbled to Trakt.tv watch history!');
        try {
          const resData = await res.json();
          triggerSwitchToast(`Trakt Scrobble Success: Added ${resData.added?.movies || resData.added?.episodes || 1} item`);
        } catch {
          triggerSwitchToast(`Trakt Scrobble Success (Status: ${res.status})`);
        }
        onUpdateVideoRef.current((prev: any) => ({
          ...prev,
          hasScrobbledTrakt: true
        }), false, video.id);
      } else {
        logger.player(`Trakt.tv scrobble failed with status: ${res.status}`);
        try {
          const errText = await res.text();
          triggerSwitchToast(`Trakt Scrobble Failed: ${res.status} - ${errText.substring(0, 40)}`);
        } catch {
          triggerSwitchToast(`Trakt Scrobble Failed (Status: ${res.status})`);
        }
      }
    } catch (err) {
      console.error('Error scrobbling to Trakt.tv:', err);
    }
  };

  const syncFavoriteToTrakt = async (isAdd: boolean) => {
    const savedSettings = localStorage.getItem('valor_settings');
    if (!savedSettings) return;
    try {
      const parsed = JSON.parse(savedSettings);
      const token = parsed.traktAccessToken;
      const syncFavoritesSetting = parsed.traktSyncFavorites;
      if (!token || !syncFavoritesSetting) return;

      const seriesInfo = classifyVideoTitle(video.title);
      const isTV = seriesInfo.type === 'series';
      const tmdbId = tmdbIdRef.current;
      if (!tmdbId) {
        logger.player('Skipping Trakt.tv favorites sync: no TMDB ID resolved.');
        return;
      }

      const body: any = {};
      if (isTV) {
        body.shows = [{ ids: { tmdb: tmdbId } }];
      } else {
        body.movies = [{ ids: { tmdb: tmdbId } }];
      }

      const endpoint = isAdd ? 'favorites' : 'favorites/remove';
      logger.player(`Syncing Trakt.tv favorites (${isAdd ? 'add' : 'remove'})...`);

      const res = await fetch(`https://api.trakt.tv/sync/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'trakt-api-key': 'f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289',
          'trakt-api-version': '2'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        logger.player(`Successfully synced favorites to Trakt.tv!`);
        try {
          const resData = await res.json();
          triggerSwitchToast(`Trakt Favorite Sync: ${isAdd ? 'Added' : 'Removed'} ${resData.added?.movies || resData.added?.shows || resData.deleted?.movies || resData.deleted?.shows || 1} item`);
        } catch {
          triggerSwitchToast(`Trakt Sync Success (Status: ${res.status})`);
        }
      } else {
        logger.player(`Trakt.tv favorites sync failed: ${res.status}`);
        try {
          const errText = await res.text();
          triggerSwitchToast(`Trakt Sync Failed: ${res.status} - ${errText.substring(0, 40)}`);
        } catch {
          triggerSwitchToast(`Trakt Sync Failed (Status: ${res.status})`);
        }
      }
    } catch (err) {
      console.error('Error syncing favorites to Trakt.tv:', err);
    }
  };

  // TheIntroDB Bookmarks Fetching
  useEffect(() => {
    if (duration <= 0) return;

    const fetchAllBookmarks = async () => {
      let resolvedTmdbId = video.tmdbId || tmdbIdRef.current;
      const seriesInfo = classifyVideoTitle(video.title);
      const isTV = seriesInfo.type === 'series';
      const season = seriesInfo.season || 1;
      const episode = seriesInfo.episode || 1;

      if (!resolvedTmdbId) {
        try {
          const tmdbToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";
          let searchUrl = "";
          if (isTV && seriesInfo.seriesTitle) {
            searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(seriesInfo.seriesTitle)}&include_adult=false`;
          } else {
            searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(seriesInfo.displayTitle)}&include_adult=false`;
          }

          logger.player(`[Bookmarks Sync] Querying TMDB search: "${searchUrl}"`);
          const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
          });

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            if (searchData.results && searchData.results.length > 0) {
              const matchedItem = searchData.results[0];
              resolvedTmdbId = matchedItem.id;
              tmdbIdRef.current = resolvedTmdbId;

              // Save tmdbId in the video metadata
              onUpdateVideo((prev: any) => ({
                ...prev,
                tmdbId: resolvedTmdbId
              }));

              // Resolve full metadata details for paused overlay card
              if (getOverlayDataFromTmdb) {
                const mediaImg = matchedItem.poster_path ? `https://image.tmdb.org/t/p/w500${matchedItem.poster_path}` : (matchedItem.backdrop_path ? `https://image.tmdb.org/t/p/w500${matchedItem.backdrop_path}` : '');
                const details: MediaDetails = {
                  title: matchedItem.name || matchedItem.title || seriesInfo.seriesTitle || 'Unknown Title',
                  overview: matchedItem.overview || '',
                  imageUrl: mediaImg,
                  releaseDate: matchedItem.release_date ? matchedItem.release_date.split('-')[0] : (matchedItem.first_air_date ? matchedItem.first_air_date.split('-')[0] : ''),
                  rating: matchedItem.vote_average || undefined
                };

                // Fetch show/movie logos from TMDB images endpoint
                try {
                  const imagesUrl = `https://api.themoviedb.org/3/${isTV ? 'tv' : 'movie'}/${resolvedTmdbId}/images`;
                  const imagesRes = await fetch(imagesUrl, {
                    headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
                  });
                  if (imagesRes.ok) {
                    const imagesData = await imagesRes.ok ? await imagesRes.json() : null;
                    if (imagesData) {
                      const logos = imagesData.logos || [];
                      let selectedLogo = logos.find((l: any) => l.iso_639_1 === 'en') || logos.find((l: any) => !l.iso_639_1) || logos[0];
                      if (selectedLogo) {
                        details.logoUrl = `https://image.tmdb.org/t/p/w500${selectedLogo.file_path}`;
                      }
                    }
                  }
                } catch {}

                if (isTV) {
                  try {
                    const epUrl = `https://api.themoviedb.org/3/tv/${resolvedTmdbId}/season/${season}/episode/${episode}`;
                    const epRes = await fetch(epUrl, {
                      headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
                    });
                    if (epRes.ok) {
                      const epData = await epRes.json();
                      details.episodeTitle = epData.name;
                      details.season = epData.season_number;
                      details.episode = epData.episode_number;
                      if (epData.overview) details.overview = epData.overview;
                      if (epData.still_path) {
                        details.imageUrl = `https://image.tmdb.org/t/p/w500${epData.still_path}`;
                      }
                    }
                  } catch {}
                }
                setMediaDetails(details);
              }
            }
          }
        } catch (err) {
          logger.player(`[Bookmarks Sync] TMDB search error: ${err}`);
        }
      }

      if (!resolvedTmdbId) {
        logger.player('[Bookmarks Sync] Could not resolve TMDB ID, skipping global bookmarks fetch.');
        return;
      }

      let serverBms: any[] = [];
      let tidbBms: any[] = [];
      hadTidbDataRef.current = false;

      // 1. Fetch from our SQLite server using tmdbId
      try {
        const queryStr = `
          query GetVideoBookmarks($tmdbId: Int!, $season: Int, $episode: Int) {
            videoBookmarks(tmdbId: $tmdbId, season: $season, episode: $episode) {
              id
              time
              endTime
              label
              isIntro
              isOutro
              skipEnabled
              title
              description
              category
              thumbnail
              favorite
              createdAt
              updatedAt
              userName
              userTime
              mediaName
              tmdbId
              episode
              season
              color
              userId
              createdBy
            }
          }
        `;
        const res = await fetch('http://127.0.0.1:50001/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: queryStr,
            variables: { 
              tmdbId: resolvedTmdbId,
              season: isTV ? season : null,
              episode: isTV ? episode : null
            }
          })
        });
        if (res.ok) {
          const result = await res.json();
          if (result.data && Array.isArray(result.data.videoBookmarks)) {
            serverBms = result.data.videoBookmarks.map((bm: any) => ({
              ...bm,
              isIntro: !!bm.isIntro,
              isOutro: !!bm.isOutro,
              skipEnabled: !!bm.skipEnabled,
              favorite: !!bm.favorite
            }));
            logger.player(`[Server Bookmarks] Loaded ${serverBms.length} bookmarks from our server.`);
          }
        }
      } catch (err) {
        logger.player('[Server Bookmarks] Failed to fetch from our server: ' + err);
      }

      // 2. Fetch from TiDB (TheIntroDB)
      try {
        const durationMs = Math.round(duration * 1000);
        let introDbUrl = `https://api.theintrodb.org/v3/media?tmdb_id=${resolvedTmdbId}`;
        if (isTV) {
          introDbUrl += `&season=${season}&episode=${episode}`;
        }
        introDbUrl += `&duration_ms=${durationMs}`;

        const savedSettings = localStorage.getItem('valor_settings');
        let apiKey = "";
        if (savedSettings) {
          try {
            apiKey = JSON.parse(savedSettings).theIntroDbApiKey || "";
          } catch {}
        }

        const headers: Record<string, string> = { 'accept': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const introDbRes = await fetch(introDbUrl, { headers });
        if (introDbRes.ok) {
          const introDbData = await introDbRes.json();
          const msToSec = (ms: number | null | undefined) => ms ? Math.round(ms / 1000) : 0;

          if (introDbData.intro && Array.isArray(introDbData.intro)) {
            introDbData.intro.forEach((item: any, idx: number) => {
              tidbBms.push({
                id: `api-intro-${idx}`,
                time: msToSec(item.start_ms),
                endTime: msToSec(item.end_ms),
                label: 'Intro',
                isIntro: true,
                isOutro: false,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }

          if (introDbData.recap && Array.isArray(introDbData.recap)) {
            introDbData.recap.forEach((item: any, idx: number) => {
              tidbBms.push({
                id: `api-recap-${idx}`,
                time: msToSec(item.start_ms),
                endTime: msToSec(item.end_ms),
                label: 'Recap',
                isIntro: true,
                isOutro: false,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }

          if (introDbData.credits && Array.isArray(introDbData.credits)) {
            introDbData.credits.forEach((item: any, idx: number) => {
              tidbBms.push({
                id: `api-credits-${idx}`,
                time: msToSec(item.start_ms),
                endTime: msToSec(item.end_ms),
                label: 'Credits/Outro',
                isIntro: false,
                isOutro: true,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }

          if (tidbBms.length > 0) {
            hadTidbDataRef.current = true;
          }
        }
      } catch (err) {
        logger.player('[TheIntroDB Sync] Failed to fetch from TheIntroDB: ' + err);
      }

      // Merge local, server, and tidb bookmarks
      const mergeBookmarks = (existing: any[], newBms: any[]) => {
        const map = new Map<string, any>();
        existing.forEach(bm => map.set(bm.id, bm));
        newBms.forEach(bm => map.set(bm.id, bm));
        return Array.from(map.values()).sort((a, b) => a.time - b.time);
      };

      const initialBms = video.bookmarks || [];
      const merged = mergeBookmarks(mergeBookmarks(initialBms, serverBms), tidbBms);
      
      setBookmarks(merged);
      onUpdateVideo((prev: any) => ({
        ...prev,
        bookmarks: merged,
        tmdbId: resolvedTmdbId
      }));
    };

    fetchAllBookmarks();
  }, [duration, video.id, video.title, video.tmdbId]);

  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('valor_volume');
      return saved ? parseFloat(saved) : 1.0;
    } catch (err) {
      return 1.0;
    }
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('valor_muted');
      return saved === 'true';
    } catch (err) {
      return false;
    }
  });

  const [volumeToast, setVolumeToast] = useState<{ volume: number; boost: number; visible: boolean; isMuted: boolean }>({ volume: 1, boost: 100, visible: false, isMuted: false });
  const volumeToastTimeoutRef = useRef<any>(null);

  const triggerVolumeToast = (vol: number, muted: boolean, boost: number = audioBoost) => {
    if (volumeToastTimeoutRef.current) clearTimeout(volumeToastTimeoutRef.current);
    setVolumeToast({ volume: vol, boost, visible: true, isMuted: muted });
    volumeToastTimeoutRef.current = setTimeout(() => {
      setVolumeToast(prev => ({ ...prev, visible: false }));
    }, 1500);
  };
  const [showControls, setShowControls] = useState(true);
  const [showConsoleOverlay, setShowConsoleOverlay] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [radialMenuState, setRadialMenuState] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const isScrubbingRef = useRef(false);
  isScrubbingRef.current = isScrubbing;
  const scrubTimeRef = useRef<number | null>(null);
  scrubTimeRef.current = scrubTime;
  const debouncedSeekTimeoutRef = useRef<any>(null);
  const [systemTime, setSystemTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setSystemTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Global mouseup/touchend listener to safely complete scrubbing free hand with 500ms debounce
  useEffect(() => {
    if (!isScrubbing) return;

    const handleScrubEnd = () => {
      setIsScrubbing(false);
      if (debouncedSeekTimeoutRef.current) {
        clearTimeout(debouncedSeekTimeoutRef.current);
      }
      const targetTime = scrubTimeRef.current;
      if (targetTime !== null && targetTime !== undefined && videoRef.current) {
        debouncedSeekTimeoutRef.current = setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = targetTime;
            setCurrentTime(targetTime);
            if (playbackControllerRef.current) {
              playbackControllerRef.current.seek(targetTime).catch(console.error);
            }
            onUpdateVideoRef.current((prev: any) => ({
              ...prev,
              currentTime: targetTime
            }), false, video.id);
          }
          setScrubTime(null);
        }, 250);
      } else {
        setScrubTime(null);
      }
    };

    window.addEventListener('mouseup', handleScrubEnd);
    window.addEventListener('touchend', handleScrubEnd);

    return () => {
      window.removeEventListener('mouseup', handleScrubEnd);
      window.removeEventListener('touchend', handleScrubEnd);
    };
  }, [isScrubbing, video.id]);

  // Tracks Selection State
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<CustomAudioTrack | null>(null);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(null);
  const [extractingStreamIndex, setExtractingStreamIndex] = useState<number | null>(null);
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isKeyInitiated, setIsKeyInitiated] = useState(false);
  if (false as boolean) {
    console.log(extractingStreamIndex, isKeyInitiated);
  }
  const [activeAudioStartOffset, setActiveAudioStartOffset] = useState(0);
  const [activeSubtitleStartOffset, setActiveSubtitleStartOffset] = useState(0);
  const [activeAudioStreamIndex, setActiveAudioStreamIndex] = useState<number | null>(null);
  const [activeSubStreamIndex, setActiveSubStreamIndex] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [audioBoost, setAudioBoost] = useState<number>(100);

  // Refs for Web Audio API audio boost
  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const videoGainRef = useRef<GainNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);

  const initAudioBoost = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(console.error);
    }

    if (videoRef.current && !videoSourceRef.current) {
      try {
        const source = ctx.createMediaElementSource(videoRef.current);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);
        videoSourceRef.current = source;
        videoGainRef.current = gain;
        logger.player('Web Audio API initialized for main video element');
      } catch (err) {
        logger.player('Error setting up Web Audio for video element:', err);
      }
    }

    if (audioRef.current && !audioSourceRef.current) {
      try {
        const source = ctx.createMediaElementSource(audioRef.current);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);
        audioSourceRef.current = source;
        audioGainRef.current = gain;
        logger.player('Web Audio API initialized for secondary audio element');
      } catch (err) {
        logger.player('Error setting up Web Audio for audio element:', err);
      }
    }
  };

  const handleSetAudioBoost = (boost: number) => {
    setAudioBoost(boost);
    if (boost > 100) {
      setVolume(1.0);
    }
    triggerVolumeToast(boost > 100 ? 1.0 : volume, isMuted, boost);
  };

  // Synchronize Audio Boost values to Web Audio API gain nodes and PlaybackController
  useEffect(() => {
    if (audioBoost > 100) {
      initAudioBoost();
    }
    const multiplier = getAudioBoostMultiplier(audioBoost);
    if (videoGainRef.current) {
      videoGainRef.current.gain.setValueAtTime(multiplier, audioCtxRef.current?.currentTime || 0);
    }
    if (audioGainRef.current) {
      audioGainRef.current.gain.setValueAtTime(multiplier, audioCtxRef.current?.currentTime || 0);
    }
    if (playbackControllerRef.current) {
      playbackControllerRef.current.setAudioBoost(audioBoost);
    }
  }, [audioBoost]);

  // If a secondary audio track gets enabled while audioBoost is active, make sure Web Audio is bound to it
  useEffect(() => {
    if (audioBoost > 100) {
      initAudioBoost();
    }
  }, [selectedAudioTrack, audioBoost]);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(console.error);
        audioCtxRef.current = null;
        videoSourceRef.current = null;
        audioSourceRef.current = null;
        videoGainRef.current = null;
        audioGainRef.current = null;
      }
    };
  }, []);



  const subCues = selectedSubTrack?.cues || [];
  const activeCueIdx = subCues.findIndex(cue => currentTime >= cue.startTime && currentTime <= cue.endTime);

  useEffect(() => {
    if (activeCueIdx !== -1 && showAudioSubMenu) {
      const activeEl = document.getElementById(`cue-item-${activeCueIdx}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeCueIdx, showAudioSubMenu]);



  // Buffering States
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedPercent, setBufferedPercent] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hasSeekedRef = useRef(false);
  const wasPausedByFocusLossRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [flashHud, setFlashHud] = useState<'play' | 'pause' | 'rewind' | 'forward' | null>(null);
  const hudTimeoutRef = useRef<any>(null);

  const triggerHudFlash = (action: 'play' | 'pause' | 'rewind' | 'forward') => {
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    setFlashHud(action);
    hudTimeoutRef.current = setTimeout(() => {
      setFlashHud(null);
    }, 600);
  };

  const [switchToast, setSwitchToast] = useState<{ text: string; visible: boolean }>({ text: '', visible: false });
  const switchToastTimeoutRef = useRef<any>(null);

  const triggerSwitchToast = (text: string) => {
    if (switchToastTimeoutRef.current) clearTimeout(switchToastTimeoutRef.current);
    setSwitchToast({ text, visible: true });
    switchToastTimeoutRef.current = setTimeout(() => {
      setSwitchToast(prev => ({ ...prev, visible: false }));
    }, toastDuration * 1000);
  };
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackControllerRef = useRef<PlaybackController | null>(null);
  const prevDestroyPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const containerRef = useRef<HTMLDivElement>(null);
  const syncEngineRef = useRef<AudioSyncEngine | null>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const audioSubTimeoutRef = useRef<any>(null);
  const bookmarksTimeoutRef = useRef<any>(null);
  const customAudioInputRef = useRef<HTMLInputElement>(null);
  const customSubInputRef = useRef<HTMLInputElement>(null);

  const cachedSourceRef = useRef<CachedByteSource | null>(null);
  const audioAbortControllerRef = useRef<AbortController | null>(null);
  const subAbortControllerRef = useRef<AbortController | null>(null);
  const currentAudioOptionIndexRef = useRef<number>(-1);
  const currentSubOptionIndexRef = useRef<number>(-1);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const heartbeatCountRef = useRef<number>(0);
  const audioDebounceTimeoutRef = useRef<any>(null);
  const subDebounceTimeoutRef = useRef<any>(null);
  const hasAutoSelectedRef = useRef(false);
  const activeAudioStartOffsetRef = useRef(0);
  const activeSubtitleStartOffsetRef = useRef(0);

  useEffect(() => {
    hasAutoSelectedRef.current = false;
    const startFromTime = (video.resumeTime && video.resumeTime > 5) ? 0 : (video.currentTime || 0);
    activeAudioStartOffsetRef.current = Math.floor(startFromTime / 10) * 10;
    activeSubtitleStartOffsetRef.current = startFromTime;
    setCurrentTime(startFromTime);
    setResumePromptTime(null);
    setSelectedAudioTrack(null);
    setSelectedSubTrack(null);
    setActiveAudioStreamIndex(null);
    setActiveSubStreamIndex(null);
    setActiveAudioStartOffset(Math.floor(startFromTime / 10) * 10);
    setActiveSubtitleStartOffset(startFromTime);
  }, [video.id]);

  const onUpdateVideoRef = useRef(onUpdateVideo);
  const durationRef = useRef(duration);

  useEffect(() => {
    onUpdateVideoRef.current = onUpdateVideo;
  }, [onUpdateVideo]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (video.isRemote) {
      const byteSource = new HttpByteSource(video.url);
      cachedSourceRef.current = new CachedByteSource(byteSource, 4 * 1024 * 1024, 16); // 4MB chunks, cache size 16 (64MB)
    } else if (video.type === 'local') {
      const byteSource = activeFile
        ? new FileByteSource(activeFile instanceof File ? activeFile : new File([activeFile], (activeFile as any)?.name || 'video.mp4'))
        : new HttpByteSource(video.url);
      cachedSourceRef.current = new CachedByteSource(byteSource, 4 * 1024 * 1024, 16); // 4MB chunks, cache size 16 (64MB)
    } else {
      cachedSourceRef.current = null;
    }
    return () => {
      if (audioAbortControllerRef.current) {
        audioAbortControllerRef.current.abort();
      }
      if (subAbortControllerRef.current) {
        subAbortControllerRef.current.abort();
      }
      if (audioDebounceTimeoutRef.current) {
        clearTimeout(audioDebounceTimeoutRef.current);
      }
      if (subDebounceTimeoutRef.current) {
        clearTimeout(subDebounceTimeoutRef.current);
      }
    };
  }, [video.url, video.isRemote, video.file, video.type, activeFile]);

  const getByteOffsetForTime = (seekMap: { time: number; offset: number }[], time: number): number => {
    if (!seekMap || seekMap.length === 0) return 0;
    const entry = seekMap.reduce((prev: any, curr: any) => {
      if (curr.time <= time) {
        return curr;
      }
      return prev;
    }, seekMap[0]);
    return entry.offset;
  };

  // Background prefetch next chunks as video plays
  useEffect(() => {
    if ((video.isRemote || video.type === 'local') && video.seekMap && video.seekMap.length > 0 && cachedSourceRef.current) {
      const currentOffset = getByteOffsetForTime(video.seekMap, currentTime);
      const chunkSize = 4 * 1024 * 1024; // 4MB chunks
      const currentChunk = Math.floor(currentOffset / chunkSize);
      
      // Prefetch next 3 chunks in background
      for (let i = 1; i <= 3; i++) {
        const nextChunk = currentChunk + i;
        const start = nextChunk * chunkSize;
        const end = (nextChunk + 1) * chunkSize - 1;
        
        cachedSourceRef.current.read(start, end).catch(() => {});
      }
    }
  }, [currentTime, video.isRemote, video.type, video.url, video.seekMap]);

  // Load next chunk during normal playback when crossing chunk boundaries
  useEffect(() => {
    if (isPlaying) {
      const isRemote = video.isRemote;
      const audioDuration = 30;
      
      const containerType = (video.containerType || '').toLowerCase();
      const isMkv = containerType.includes('mkv') || containerType.includes('matroska') || (video.format || '').toLowerCase().includes('mkv') || (video.format || '').toLowerCase().includes('matroska');
      const subDuration = isRemote ? (isMkv ? 300 : 60) : 300;

      if (activeAudioStreamIndex !== null && selectedAudioTrack && selectedAudioTrack.streamIndex === activeAudioStreamIndex && selectedAudioTrack.url) {
        if (currentTime - activeAudioStartOffsetRef.current > audioDuration - 15) {
          logger.player(`Playback crossed audio chunk boundary. Loading next chunk at ${currentTime}s.`);
          const activeStream = audioStreams.find(s => s.index === activeAudioStreamIndex);
          loadAudioChunk(currentTime, activeAudioStreamIndex, activeStream?.codec || 'mp3', false);
        }
      }

      if (activeSubStreamIndex !== null && selectedSubTrack && selectedSubTrack.streamIndex === activeSubStreamIndex && (selectedSubTrack.url || selectedSubTrack.cues.length > 0)) {
        if (currentTime - activeSubtitleStartOffsetRef.current > subDuration - 10) {
          logger.player(`Playback crossed subtitle chunk boundary. Loading next subtitles at ${currentTime}s.`);
          loadSubtitleChunk(currentTime, activeSubStreamIndex);
        }
      }
    }
  }, [currentTime, isPlaying, activeAudioStreamIndex, activeSubStreamIndex, video.seekMap, video.isRemote, video.containerType, video.format, selectedAudioTrack, selectedSubTrack]);

  const getLangLabel = (lang?: string, fallback: string = '') => {
    if (!lang) return fallback;
    const clean = lang.toLowerCase().trim();
    if (clean === 'eng' || clean === 'en') return 'ENG';
    if (clean === 'jpn' || clean === 'ja') return 'JAP';
    if (clean === 'chi' || clean === 'zho' || clean === 'zh') return 'CHN';
    return clean.toUpperCase();
  };

  // Auto probing states
  const [isAutoProbing, setIsAutoProbing] = useState(false);
  if (false as boolean) {
    console.log(isAutoProbing);
  }
  const probingVideoIdRef = useRef<string | null>(null);

  // Safeguarded arrays
  const audioTracks = video.audioTracks || [];
  const subtitleTracks = video.subtitleTracks || [];
  const streams = video.streams || [];
  const audioStreams = streams.filter(s => s.type === 'audio');
  const subtitleStreams = streams.filter(s => 
    s.type === 'subtitle' && 
    !/dvd_subtitle|dvdsub|pgs|hdmv_pgs|xsub|vobsub/i.test(s.codec || '')
  );

  // Clear hover timeouts and reset FFmpeg on unmount or when changing videos
  useEffect(() => {
    return () => {
      if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
      if (bookmarksTimeoutRef.current) clearTimeout(bookmarksTimeoutRef.current);
      logger.player('VideoPlayer resetting FFmpeg worker and lock queue due to unmount or video change');
      ffmpegService.reset();
      console.clear();
    };
  }, [video.id]);

  const lastAudioUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const newUrl = selectedAudioTrack?.url || null;
    const oldUrl = lastAudioUrlRef.current;
    if (oldUrl && oldUrl !== newUrl && oldUrl.startsWith('blob:')) {
      logger.player(`Revoking old audio Blob URL: ${oldUrl}`);
      try {
        URL.revokeObjectURL(oldUrl);
      } catch (e) {}
    }
    lastAudioUrlRef.current = newUrl;
  }, [selectedAudioTrack?.url]);

  useEffect(() => {
    return () => {
      const oldUrl = lastAudioUrlRef.current;
      if (oldUrl && oldUrl.startsWith('blob:')) {
        logger.player(`Revoking active audio Blob URL on unmount: ${oldUrl}`);
        try {
          URL.revokeObjectURL(oldUrl);
        } catch (e) {}
      }
    };
  }, []);

  const lastSubUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const newUrl = selectedSubTrack?.url || null;
    const oldUrl = lastSubUrlRef.current;
    if (oldUrl && oldUrl !== newUrl && oldUrl.startsWith('blob:')) {
      logger.player(`Revoking old subtitle Blob URL: ${oldUrl}`);
      try {
        URL.revokeObjectURL(oldUrl);
      } catch (e) {}
    }
    lastSubUrlRef.current = newUrl;
  }, [selectedSubTrack?.url]);

  useEffect(() => {
    return () => {
      const oldUrl = lastSubUrlRef.current;
      if (oldUrl && oldUrl.startsWith('blob:')) {
        logger.player(`Revoking active subtitle Blob URL on unmount: ${oldUrl}`);
        try {
          URL.revokeObjectURL(oldUrl);
        } catch (e) {}
      }
    };
  }, []);

  // Auto-probe local file streams on startup if not already scanned
  useEffect(() => {
    const autoProbe = async () => {
      if (video.type === 'local' && video.file && !video.streams && probingVideoIdRef.current !== video.id) {
        probingVideoIdRef.current = video.id;

        // Verify that the file is actually readable
        try {
          await video.file.slice(0, 1).arrayBuffer();
        } catch (readErr) {
          logger.error('Local file is not readable on auto-probe:', readErr);
          probingVideoIdRef.current = null;
          return;
        }

        setIsAutoProbing(true);
        try {
          if (!ffmpegService.isReady()) {
            await ffmpegService.load(video.id);
          }
          const result = await ffmpegService.probeFile(video.file, video.id);

          let seekMap: any[] = [];
          let timecodeScale: number | undefined = undefined;
          try {
            const fileSource = new FileByteSource(video.file);
            const cachedFileSource = new CachedByteSource(fileSource);
            const containerType = (result.format || '').toLowerCase();
            if (containerType.includes('mkv') || containerType.includes('matroska')) {
              const mkvInfo = await parseMkv(cachedFileSource);
              seekMap = mkvInfo.seekMap || [];
              timecodeScale = mkvInfo.timecodeScale;
            } else if (containerType.includes('mp4')) {
              const mp4Info = await parseMp4(cachedFileSource);
              seekMap = mp4Info.tracks[0]?.seekMap?.timeToOffset || [];
            }
          } catch (parseErr) {
            logger.warn('Failed parsing local container for seekMap:', parseErr);
          }

          const updatedVideo = {
            ...video,
            duration: result.duration,
            format: result.format,
            streams: result.streams,
            seekMap: seekMap.length > 0 ? seekMap : undefined,
            timecodeScale
          };
          onUpdateVideoRef.current(updatedVideo);
        } catch (err) {
          logger.error('Auto probe streams failed:', err);
          probingVideoIdRef.current = null; // allow retry
        } finally {
          setIsAutoProbing(false);
        }
      }
    };
    autoProbe();
  }, [video.id, video.type, video.file]);

  // Synchronize Audio Volume / Muted State to video element and PlaybackController
  useEffect(() => {
    if (saveVolume) {
      localStorage.setItem('valor_volume', volume.toString());
      localStorage.setItem('valor_muted', isMuted ? 'true' : 'false');
    } else {
      localStorage.removeItem('valor_volume');
      localStorage.removeItem('valor_muted');
    }

    const hasAlternateAudio = audioStreams.length > 0 || audioTracks.length > 0;

    if (videoRef.current) {
      videoRef.current.volume = hasAlternateAudio ? 0 : volume;
      videoRef.current.muted = hasAlternateAudio ? true : isMuted;
    }

    if (playbackControllerRef.current) {
      playbackControllerRef.current.setVolume(volume, isMuted);
    }
  }, [volume, isMuted, saveVolume, activeAudioStreamIndex]);

  // Reset audio boost to normal (100) if volume drops below 1.0
  useEffect(() => {
    if (volume < 1.0 && audioBoost > 100) {
      setAudioBoost(100);
    }
  }, [volume, audioBoost]);

  // RequestAnimationFrame tick loop for micro-fine time updates (essential for subtitles)
  useEffect(() => {
    let frameId: number;

    const tick = () => {
      if (videoRef.current && !videoRef.current.paused) {
        const shouldUpdate = !video.currentTime || hasSeekedRef.current || videoRef.current.currentTime > 0;
        if (shouldUpdate && !isScrubbingRef.current && !debouncedSeekTimeoutRef.current) {
          setCurrentTime(videoRef.current.currentTime);
        }

        // Heartbeat ping — adaptive: 1 min for first 5 calls, then 5 min
        const now = Date.now();
        const heartbeatInterval = heartbeatCountRef.current < 5 ? 60000 : 300000;
        if (now - lastHeartbeatTimeRef.current > heartbeatInterval) {
          lastHeartbeatTimeRef.current = now;
          heartbeatCountRef.current += 1;
          fetch('http://127.0.0.1:50001/api/heartbeat', { method: 'POST' }).catch(() => {});
        }
        
        // Update buffered percentage
        const buffered = videoRef.current.buffered;
        if (buffered.length > 0 && duration) {
          let currentBufferEnd = 0;
          const currentPlayhead = videoRef.current.currentTime;
          for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentPlayhead && buffered.end(i) >= currentPlayhead) {
              currentBufferEnd = buffered.end(i);
              break;
            }
          }
          setBufferedPercent((currentBufferEnd / duration) * 100);
        }
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [duration]);

  // Controls Auto-Hide
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showAudioSubMenu && !showSettingsPanel && !showBookmarksPopover && !showAddDialog) {
        setShowControls(false);
      }
    }, uiHideTimeout * 1000);
  };

  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    if (clientX === lastMousePosRef.current.x && clientY === lastMousePosRef.current.y) {
      return;
    }
    lastMousePosRef.current = { x: clientX, y: clientY };
    resetControlsTimeout();
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, showAudioSubMenu, showSettingsPanel, showBookmarksPopover, showAddDialog]);

  const parseDurationToSeconds = (dur: any): number => {
    if (!dur) return 0;
    if (typeof dur === 'number') return dur;
    const parts = String(dur).split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  };

  // Helper to resolve byte range for a target time duration using the seekMap (or linear interpolation fallback)
  const getByteRangeForTimeRange = async (time: number, targetDuration: number, source: any): Promise<{ startOffset: number; endOffset: number; offsetTime: number }> => {
    const seekMap = video.seekMap || [];
    if (seekMap.length === 0) {
      // Linear interpolation fallback if no seekMap is available
      const totalDurSeconds = duration || parseDurationToSeconds(video.duration) || 1;
      const fileSize = video.file ? video.file.size : await source.getSize().catch(() => 100 * 1024 * 1024);
      const startOffset = Math.floor((time / totalDurSeconds) * fileSize);
      const endOffset = Math.min(startOffset + 8 * 1024 * 1024, fileSize); // default 8MB chunk size
      return { startOffset, endOffset, offsetTime: time };
    }

    // Find entry for start time
    const startEntry = seekMap.reduce((prev: any, curr: any) => {
      if (curr.time <= time) {
        return curr;
      }
      return prev;
    }, seekMap[0]);

    const offsetTime = startEntry.time;
    const startOffset = startEntry.offset;

    // Find entry for end time (time + targetDuration)
    const endEntry = seekMap.reduce((prev: any, curr: any) => {
      if (curr.time <= time + targetDuration) {
        return curr;
      }
      return prev;
    }, startEntry);

    let endOffset = endEntry.offset;
    if (endOffset <= startOffset) {
      endOffset = startOffset + 8 * 1024 * 1024; // default 8MB chunk
    } else {
      // Add extra padding (e.g. 1MB) to ensure we get the full packets at the boundary
      endOffset += 1024 * 1024;
    }

    return { startOffset, endOffset, offsetTime };
  };

  // Audio/subtitle segment chunk loading on demand
  const loadAudioChunk = async (time: number, streamIndex: number, codec: string, isSeek = false) => {
    // Legacy Blob-based audio loading is disabled. Audio playback is handled entirely by PlaybackController via Web Audio API.
  };

  const loadSubtitleChunk = async (time: number, streamIndex: number) => {
    const isResolvingBlob = video.type === 'local' && video.url && video.url.startsWith('blob:') && !activeFile;
    if (isResolvingBlob) {
      logger.player('[LocalVideoPlayer] loadSubtitleChunk deferred: still resolving blob URL.');
      return;
    }

    // Seek optimization: abort any active remote fetches
    if (subAbortControllerRef.current) {
      subAbortControllerRef.current.abort();
    }
    subAbortControllerRef.current = new AbortController();
    const signal = subAbortControllerRef.current.signal;

    setExtractingStreamIndex(streamIndex);
    
    try {
      let cues: any[] = [];
      let format: 'srt' | 'vtt' | 'ass' = 'srt';

      const cachedSource = cachedSourceRef.current || (
        activeFile
          ? new CachedByteSource(new FileByteSource(activeFile instanceof File ? activeFile : new File([activeFile], (activeFile as any)?.name || 'video.mp4')), 4 * 1024 * 1024, 16)
          : new CachedByteSource(new HttpByteSource(video.url), 4 * 1024 * 1024, 16)
      );

      let offsetTime = time;

      const containerType = (video.containerType || '').toLowerCase();
      const isMkv = containerType.includes('mkv') || containerType.includes('matroska') || (video.format || '').toLowerCase().includes('mkv') || (video.format || '').toLowerCase().includes('matroska');

      if (isMkv) {
        const subStream = subtitleStreams.find(s => s.index === streamIndex);
        const codec = subStream?.codec || 'srt';
        logger.player(`MKV container detected: Direct JS demuxing of subtitle track index ${streamIndex} (${codec})`);

        const mkvInfo = await parseMkv(cachedSource);
        const mkvSubTracks = mkvInfo.tracks.filter(t => 
          t.type === 'subtitle' && 
          !/dvd_subtitle|dvdsub|pgs|hdmv_pgs|xsub|vobsub/i.test(t.codec || '')
        );
        const streamLang = subStream?.language?.toLowerCase().trim();
        let targetTrack = mkvSubTracks.find(t => {
          const trackLang = t.language?.toLowerCase().trim();
          return trackLang && streamLang && (trackLang === streamLang || trackLang.startsWith(streamLang) || streamLang.startsWith(trackLang));
        });
        if (!targetTrack) {
          const subStreamIdx = subtitleStreams.findIndex(s => s.index === streamIndex);
          targetTrack = mkvSubTracks[subStreamIdx !== -1 ? subStreamIdx : 0];
        }
        
        if (targetTrack) {
          const trackNumber = targetTrack.number;
          const scale = mkvInfo.timecodeScale || 1000000;
          
          const isRemote = video.isRemote;
          const subDuration = isRemote ? 300 : 600; // 5 mins / 10 mins
          const sMap = mkvInfo.seekMap || [];

          offsetTime = time;
          setActiveSubtitleStartOffset(offsetTime);
          activeSubtitleStartOffsetRef.current = offsetTime;

          const isAss = /ass|ssa/i.test(codec);
          const isVtt = /webvtt/i.test(codec);
          const formatExt: 'ass' | 'vtt' | 'srt' = isAss ? 'ass' : (isVtt ? 'vtt' : 'srt');

          const isNewTrack = !selectedSubTrack || selectedSubTrack.streamIndex !== streamIndex;
          let trackCues = isNewTrack ? [] : [...selectedSubTrack.cues];

          const onProgress = (newCues: any[]) => {
            const merged = [...trackCues];
            const existingIds = new Set(merged.map(c => c.id));
            for (const cue of newCues) {
              if (!existingIds.has(cue.id)) {
                const duplicate = merged.find(c => Math.abs(c.startTime - cue.startTime) < 0.05 && c.text === cue.text);
                if (!duplicate) {
                  merged.push(cue);
                }
              }
            }
            merged.sort((a, b) => a.startTime - b.startTime);

            const newTrack: CustomSubtitleTrack = {
              id: `remote-sub-${streamIndex}`,
              name: `Subtitles`,
              url: '',
              cues: merged,
              isExtracted: true,
              streamIndex,
              format: formatExt
            };
            setSelectedSubTrack(newTrack);
          };

          const finalCues = await extractMkvSubtitles(
            cachedSource,
            trackNumber,
            scale,
            sMap,
            mkvInfo.firstClusterOffset || 0,
            time,
            subDuration,
            onProgress,
            signal,
            isAss
          );

          const merged = [...trackCues];
          const existingIds = new Set(merged.map(c => c.id));
          for (const cue of finalCues) {
            if (!existingIds.has(cue.id)) {
              const duplicate = merged.find(c => Math.abs(c.startTime - cue.startTime) < 0.05 && c.text === cue.text);
              if (!duplicate) {
                merged.push(cue);
              }
            }
          }
          merged.sort((a, b) => a.startTime - b.startTime);

          const newTrack: CustomSubtitleTrack = {
            id: `remote-sub-${streamIndex}`,
            name: `Subtitles`,
            url: '',
            cues: merged,
            isExtracted: true,
            streamIndex,
            format: formatExt
          };
          setSelectedSubTrack(newTrack);
          setExtractingStreamIndex(null);
          return;
        }
      }

      const subStream = subtitleStreams.find(s => s.index === streamIndex);
      const codec = subStream?.codec || 'srt';
      const subDuration = video.isRemote ? 60 : 300;

      let startOffset = 0;
      let endOffset = 0;

      if (!video.isRemote && video.file) {
        offsetTime = Math.max(0, time - 10);
      } else {
        const { startOffset: sOff, endOffset: eOff, offsetTime: resolvedOffsetTime } = await getByteRangeForTimeRange(time, subDuration, cachedSource);
        offsetTime = resolvedOffsetTime;
        startOffset = sOff;
        endOffset = eOff;
      }

      setActiveSubtitleStartOffset(offsetTime);
      activeSubtitleStartOffsetRef.current = offsetTime;

      let fetchedCues: any[] | null = null;

      if (playbackControllerRef.current) {
        const bm = playbackControllerRef.current.getBufferManager();
        const ff = playbackControllerRef.current.getFFmpeg();
        if (ff) {
          fetchedCues = await bm.getOrFetchSubtitles(
            video.id,
            streamIndex,
            offsetTime,
            subDuration,
            codec,
            !!video.isRemote,
            video.file || null,
            cachedSource,
            startOffset,
            endOffset,
            signal
          );
          const isAss = /ass|ssa/i.test(codec);
          const isVtt = /webvtt/i.test(codec);
          format = isAss ? 'ass' : (isVtt ? 'vtt' : 'srt');
        }
      }

      if (fetchedCues !== null) {
        cues = fetchedCues;
      } else {
        // Fallback if playback controller or FFmpeg is not loaded yet
        if (!ffmpegService.isReady()) {
          await ffmpegService.load(video.id);
        }
        
        let subtitleText = '';
        if (!video.isRemote && video.file) {
          subtitleText = await extractLocalSubtitleSegment(
            video.id,
            video.file,
            offsetTime,
            subDuration,
            { index: streamIndex, codec },
            signal
          );
        } else {
          subtitleText = await extractRemoteSubtitleSegment(
            video.id,
            cachedSource,
            startOffset,
            endOffset,
            { index: streamIndex, codec },
            signal
          );
        }
        const isAss = /ass|ssa/i.test(codec);
        const isVtt = /webvtt/i.test(codec);
        const formatExt = isAss ? 'ass' : (isVtt ? 'vtt' : 'srt');
        cues = parseSubtitles(subtitleText, `subtitles.${formatExt}`);
        format = formatExt === 'vtt' ? 'vtt' : (formatExt === 'ass' ? 'ass' : 'srt');
      }

      if (cues && cues.length > 0) {
        const newTrack: CustomSubtitleTrack = {
          id: `remote-sub-${streamIndex}`,
          name: `Remote Subtitles`,
          url: '',
          cues,
          isExtracted: true,
          streamIndex,
          format
        };
        setSelectedSubTrack(newTrack);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.remote('Load aborted');
        return;
      }
      logger.error('Failed to extract remote subtitles:', err);
      if (video.type === 'local' && video.url && video.url.startsWith('blob:') && (err instanceof TypeError || err.message?.includes('fetch') || err.message?.includes('net::'))) {
        if (onReassociate) {
          onReassociate(video.id);
        }
      }
    } finally {
      setExtractingStreamIndex(null);
      setIsKeyInitiated(false);
    }
  };

  const handleVideoError = () => {
    if (!videoRef.current) return;
    const err = videoRef.current.error;

    if (video.type === 'local' && video.url && video.url.startsWith('blob:') && (err?.code === 4 || !video.file)) {
      if (onReassociate) {
        onReassociate(video.id);
        return;
      }
    }

    let message = 'An unknown playback error occurred.';
    
    if (video.probingError) {
      message = video.probingError.startsWith('File URL not supported by the source')
        ? video.probingError
        : `File URL not supported by the source: ${video.probingError}`;
    } else if (err) {
      switch (err.code) {
        case 1: // MEDIA_ERR_ABORTED
          message = 'Playback was aborted by the user or browser.';
          break;
        case 2: // MEDIA_ERR_NETWORK
          message = 'A network error occurred while downloading the video.';
          break;
        case 3: // MEDIA_ERR_DECODE
          message = 'The video playback was aborted due to a corruption problem or because the video used features your browser did not support.';
          break;
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          if (video.isRemote) {
            message = 'File URL not supported by the source, or the format/codecs are not supported by your browser.';
          } else {
            message = 'The video format or codecs are not supported by your browser.';
          }
          break;
      }
    } else if (video.isRemote) {
      message = 'File URL not supported by the source, or a network connection failure occurred.';
    }
    
    logger.error(`Playback error code: ${err?.code || 'unknown'} message: ${message}`);
    setPlaybackError(message);
  };

  const handleVideoSeeked = async () => {
    setIsBuffering(false);
    if (!videoRef.current) return;
    const newTime = videoRef.current.currentTime;

    // Suppress parent history state updates while user is actively freehand scrubbing
    if (!isScrubbingRef.current) {
      onUpdateVideo({
        ...video,
        currentTime: newTime
      });
    }

    // Sync PlaybackController playhead on seek
    if (playbackControllerRef.current) {
      const ctrlTime = playbackControllerRef.current.getCurrentTime();
      if (Math.abs(ctrlTime - newTime) > 0.2) {
        logger.player(`Seek detected to ${newTime}s in player. Updating playback controller...`);
        activeAudioStartOffsetRef.current = Math.floor(newTime / 10) * 10;
        playbackControllerRef.current.seek(newTime).catch(console.error);
      }
    }

    const containerType = (video.containerType || '').toLowerCase();
    const isMkv = containerType.includes('mkv') || containerType.includes('matroska') || (video.format || '').toLowerCase().includes('mkv') || (video.format || '').toLowerCase().includes('matroska');

    if (activeSubStreamIndex !== null && !subDebounceTimeoutRef.current) {
      let needLoad = false;
      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const oldSegIdx = segments.findIndex((s: any) => s.startTime <= activeSubtitleStartOffsetRef.current && activeSubtitleStartOffsetRef.current < s.startTime + s.duration);
        const newSegIdx = segments.findIndex((s: any) => s.startTime <= newTime && newTime < s.startTime + s.duration);
        if (oldSegIdx !== newSegIdx) {
          needLoad = true;
        }
      } else {
        const isRemote = video.isRemote;
        const subDuration = isRemote ? (isMkv ? 300 : 60) : 300;
        if (newTime < activeSubtitleStartOffsetRef.current || newTime > activeSubtitleStartOffsetRef.current + subDuration - 5) {
          needLoad = true;
        }
      }

      if (needLoad) {
        logger.player(`Seek detected to ${newTime}s outside current subtitle range. Fetching new subtitles.`);
        await loadSubtitleChunk(newTime, activeSubStreamIndex);
      }
    }
  };

  // On-the-fly selection handlers for embedded streams selected in-player using container-direct chunk reading
  const handleSelectEmbeddedAudio = async (streamIndex: number, codec: string, language?: string, skipLoad = false) => {
    // Guard: if this stream is already active, don't restart the engine
    if (activeAudioStreamIndex === streamIndex && selectedAudioTrack?.streamIndex === streamIndex && selectedAudioTrack?.url) {
      return;
    }
    if (audioDebounceTimeoutRef.current) {
      clearTimeout(audioDebounceTimeoutRef.current);
      audioDebounceTimeoutRef.current = null;
    }
    setActiveAudioStreamIndex(streamIndex);
    const label = getLangLabel(language, `Track #${streamIndex}`);
    setSelectedAudioTrack({
      id: `remote-aud-${streamIndex}`,
      name: `Audio (${label})`,
      url: '',
      isExtracted: true,
      streamIndex,
      codec
    });
    syncAudioRef(null, streamIndex);
    if (!skipLoad) {
      await loadAudioChunk(currentTime, streamIndex, codec, false);
    }
  };

  const handleSelectEmbeddedSubtitle = async (streamIndex: number, codec: string, language?: string, skipLoad = false) => {
    if (subDebounceTimeoutRef.current) {
      clearTimeout(subDebounceTimeoutRef.current);
      subDebounceTimeoutRef.current = null;
    }
    setActiveSubStreamIndex(streamIndex);
    const label = getLangLabel(language, `Track #${streamIndex}`);
    setSelectedSubTrack({
      id: `remote-sub-${streamIndex}`,
      name: `Subtitles (${label})`,
      url: '',
      cues: [],
      isExtracted: true,
      streamIndex,
      format: /ass|ssa/i.test(codec) ? 'ass' : (/webvtt/i.test(codec) ? 'vtt' : 'srt')
    });
    syncSubRef(null, streamIndex);
    if (!skipLoad) {
      await loadSubtitleChunk(currentTime, streamIndex);
    }
  };

  const handleExit = () => {
    onUpdateVideo({
      ...video,
      currentTime: latestTimeRef.current
    }, true);
    console.clear();
    onBack();
  };

  const getLockShortcutKey = () => {
    try {
      const saved = localStorage.getItem('valor_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.keybinds?.lockControls) {
          return parsed.keybinds.lockControls.toUpperCase();
        }
      }
    } catch {}
    return 'W';
  };

  // Playback Control Handlers
  const togglePlay = () => {
    if (video.type === 'local' && !video.file) {
      if (onReassociate) {
        onReassociate(video.id);
        return;
      }
    }
    if (!videoRef.current) return;
    if (isPlaying) {
      if (playbackControllerRef.current) {
        playbackControllerRef.current.pause();
      } else {
        videoRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      if (playbackControllerRef.current) {
        playbackControllerRef.current.play().catch(console.error);
      } else {
        videoRef.current.play().catch(console.error);
      }
      setIsPlaying(true);
    }
    resetControlsTimeout();
  };

  const handleRewind = () => {
    if (!videoRef.current) return;
    const targetTime = Math.max(0, videoRef.current.currentTime - 10);
    if (playbackControllerRef.current) {
      playbackControllerRef.current.seek(targetTime);
    } else {
      videoRef.current.currentTime = targetTime;
    }
    setCurrentTime(targetTime);
    resetControlsTimeout();
  };

  const handleForward = () => {
    if (!videoRef.current) return;
    const targetTime = Math.min(duration, videoRef.current.currentTime + 10);
    if (playbackControllerRef.current) {
      playbackControllerRef.current.seek(targetTime);
    } else {
      videoRef.current.currentTime = targetTime;
    }
    setCurrentTime(targetTime);
    resetControlsTimeout();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uiConfig.blockSeekingCompletely) return;
    const seekTime = parseFloat(e.target.value);
    if (isScrubbingRef.current) {
      setScrubTime(seekTime);
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = seekTime;
      }
    } else {
      if (playbackControllerRef.current) {
        playbackControllerRef.current.seek(seekTime);
      } else if (videoRef.current) {
        videoRef.current.currentTime = seekTime;
      }
      setCurrentTime(seekTime);
      resetControlsTimeout();
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = seekTime;
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
    resetControlsTimeout();
  };

  // Picture-in-Picture Support
  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error('Failed to trigger PiP:', err);
    }
  };

  const handleCast = () => {
    if (!videoRef.current) return;
    const video = videoRef.current as any;
    
    // HTML5 Remote Playback Web API (Chrome/Edge Native Cast)
    if (video.remote && typeof video.remote.prompt === 'function') {
      video.remote.prompt().catch((err: any) => {
        logger.player('Failed to trigger remote playback prompt:', err);
      });
    }
    // Safari / iOS AirPlay target picker
    else if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
      video.webkitShowPlaybackTargetPicker();
    }
    // Fallback: use togglePiP
    else {
      logger.player('Cast API not supported in this browser. Falling back to Picture-in-Picture.');
      togglePiP();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Helper to compile subtitle options
  const getSubOptions = () => {
    const list: any[] = [{ type: 'off', name: 'Off', track: null }];
    subtitleStreams.forEach((s) => {
      const label = getLangLabel(s.language, `Track #${s.index}`);
      list.push({
        type: 'embedded',
        name: `Subtitles (${label})`,
        streamIndex: s.index,
        codec: s.codec,
        language: s.language
      });
    });
    subtitleTracks.forEach((t) => {
      list.push({
        type: 'custom',
        name: t.name,
        track: t
      });
    });
    return list;
  };

  // Helper to compile audio options
  const getAudioOptions = () => {
    const list: any[] = [];
    if (audioStreams.length === 0 && audioTracks.length === 0) {
      list.push({ type: 'original', name: 'Original', track: null });
    }
    audioStreams.forEach((s) => {
      const label = getLangLabel(s.language, `Track #${s.index}`);
      list.push({
        type: 'embedded',
        name: `Audio (${label})`,
        streamIndex: s.index,
        codec: s.codec,
        language: s.language
      });
    });
    audioTracks.forEach((t) => {
      list.push({
        type: 'custom',
        name: t.name,
        track: t
      });
    });
    return list;
  };

  const syncAudioRef = (track: CustomAudioTrack | null, streamIndex: number | null) => {
    const options = getAudioOptions();
    let idx = 0;
    if (streamIndex !== null) {
      idx = options.findIndex(opt => opt.type === 'embedded' && opt.streamIndex === streamIndex);
    } else if (track) {
      idx = options.findIndex(opt => opt.type === 'custom' && opt.track?.id === track.id);
    }
    currentAudioOptionIndexRef.current = idx !== -1 ? idx : 0;
  };

  const syncSubRef = (track: CustomSubtitleTrack | null, streamIndex: number | null) => {
    const options = getSubOptions();
    let idx = 0;
    if (streamIndex !== null) {
      idx = options.findIndex(opt => opt.type === 'embedded' && opt.streamIndex === streamIndex);
    } else if (track) {
      idx = options.findIndex(opt => opt.type === 'custom' && opt.track?.id === track.id);
    }
    currentSubOptionIndexRef.current = idx !== -1 ? idx : 0;
  };

  const handleSelectAudioTrack = (track: CustomAudioTrack | null) => {
    if (audioDebounceTimeoutRef.current) {
      clearTimeout(audioDebounceTimeoutRef.current);
      audioDebounceTimeoutRef.current = null;
    }
    setSelectedAudioTrack(track);
    const targetIdx = track === null ? -1 : (track.streamIndex !== undefined ? track.streamIndex : -1);
    setActiveAudioStreamIndex(targetIdx === -1 ? null : targetIdx);
    
    if (targetIdx !== -1) {
      playbackControllerRef.current?.switchAudioTrack(targetIdx);
    }
    
    if (track === null) {
      syncAudioRef(null, null);
    } else if (track.streamIndex !== undefined) {
      syncAudioRef(null, track.streamIndex);
    } else {
      syncAudioRef(track, null);
    }
  };

  const handleSelectSubTrack = (track: CustomSubtitleTrack | null) => {
    if (subDebounceTimeoutRef.current) {
      clearTimeout(subDebounceTimeoutRef.current);
      subDebounceTimeoutRef.current = null;
    }
    setSelectedSubTrack(track);
    if (track === null) {
      setActiveSubStreamIndex(null);
      syncSubRef(null, null);
    } else if (track.streamIndex !== undefined) {
      setActiveSubStreamIndex(track.streamIndex);
      syncSubRef(null, track.streamIndex);
    } else {
      setActiveSubStreamIndex(null);
      syncSubRef(track, null);
    }
  };

  const cycleSubtitles = () => {
    const options = getSubOptions();
    if (options.length === 0) return;

    if (currentSubOptionIndexRef.current === -1 || currentSubOptionIndexRef.current >= options.length) {
      let currentIndex = 0;
      if (selectedSubTrack) {
        if (selectedSubTrack.streamIndex !== undefined) {
          currentIndex = options.findIndex(opt => opt.type === 'embedded' && opt.streamIndex === selectedSubTrack.streamIndex);
        } else {
          currentIndex = options.findIndex(opt => opt.type === 'custom' && opt.track?.id === selectedSubTrack.id);
        }
      }
      currentSubOptionIndexRef.current = currentIndex !== -1 ? currentIndex : 0;
    }

    const nextIndex = (currentSubOptionIndexRef.current + 1) % options.length;
    currentSubOptionIndexRef.current = nextIndex;
    const nextOpt = options[nextIndex];

    setIsKeyInitiated(true);
    if (subDebounceTimeoutRef.current) {
      clearTimeout(subDebounceTimeoutRef.current);
      subDebounceTimeoutRef.current = null;
    }

    if (nextOpt.type === 'off') {
      setSelectedSubTrack(null);
      setActiveSubStreamIndex(null);
      setIsKeyInitiated(false);
    } else if (nextOpt.type === 'embedded') {
      handleSelectEmbeddedSubtitle(nextOpt.streamIndex, nextOpt.codec, nextOpt.language, true);
      subDebounceTimeoutRef.current = setTimeout(async () => {
        subDebounceTimeoutRef.current = null;
        if (currentSubOptionIndexRef.current === nextIndex) {
          await loadSubtitleChunk(videoRef.current ? videoRef.current.currentTime : currentTime, nextOpt.streamIndex);
        }
      }, 350);
    } else if (nextOpt.type === 'custom') {
      setSelectedSubTrack(nextOpt.track);
      setActiveSubStreamIndex(null);
      setIsKeyInitiated(false);
    }

    triggerSwitchToast(nextOpt.name);
  };

  const cycleAudio = () => {
    const options = getAudioOptions();
    if (options.length === 0) return;

    if (currentAudioOptionIndexRef.current === -1 || currentAudioOptionIndexRef.current >= options.length) {
      let currentIndex = 0;
      if (selectedAudioTrack) {
        if (selectedAudioTrack.streamIndex !== undefined) {
          currentIndex = options.findIndex(opt => opt.type === 'embedded' && opt.streamIndex === selectedAudioTrack.streamIndex);
        } else {
          currentIndex = options.findIndex(opt => opt.type === 'custom' && opt.track?.id === selectedAudioTrack.id);
        }
      }
      currentAudioOptionIndexRef.current = currentIndex !== -1 ? currentIndex : 0;
    }

    const nextIndex = (currentAudioOptionIndexRef.current + 1) % options.length;
    currentAudioOptionIndexRef.current = nextIndex;
    const nextOpt = options[nextIndex];

    setIsKeyInitiated(true);
    if (audioDebounceTimeoutRef.current) {
      clearTimeout(audioDebounceTimeoutRef.current);
      audioDebounceTimeoutRef.current = null;
    }

    if (nextOpt.type === 'original') {
      setSelectedAudioTrack(null);
      setActiveAudioStreamIndex(null);
      setIsKeyInitiated(false);
    } else if (nextOpt.type === 'embedded') {
      handleSelectEmbeddedAudio(nextOpt.streamIndex, nextOpt.codec, nextOpt.language, true);
      audioDebounceTimeoutRef.current = setTimeout(async () => {
        audioDebounceTimeoutRef.current = null;
        if (currentAudioOptionIndexRef.current === nextIndex) {
          await loadAudioChunk(videoRef.current ? videoRef.current.currentTime : currentTime, nextOpt.streamIndex, nextOpt.codec, true);
        }
      }, 350);
    } else if (nextOpt.type === 'custom') {
      setSelectedAudioTrack(nextOpt.track);
      setActiveAudioStreamIndex(null);
      setIsKeyInitiated(false);
    }

    triggerSwitchToast(nextOpt.name);
  };

  const handleKeyDownRef = useRef<((e: KeyboardEvent) => void) | undefined>(undefined);
  handleKeyDownRef.current = (e: KeyboardEvent) => {
    const pressedKey = e.key.toLowerCase();
    
    // If add bookmark dialog or settings panel is open, ignore player hotkeys
    // (Except Escape to close the dialog/panel)
    if (showAddDialog || showSettingsPanel) {
      if (pressedKey === 'escape') {
        e.preventDefault();
        setShowAddDialog(false);
        setShowSettingsPanel(false);
        setIsSettingsExpanded(false);
      }
      return;
    }

    // Ignore key events if the user is typing in a text field
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
      return;
    }

    // Ignore browser/system shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // Load keybind settings
    const saved = localStorage.getItem('valor_settings');
    const defaultKeybinds = {
      playPause: ' ',
      rewind: 'ArrowLeft',
      forward: 'ArrowRight',
      fullscreen: 'f',
      exit: 'Escape',
      nextSubtitle: 'b',
      nextAudio: 'v',
      lockControls: 'w',
      openSettings: 'Delete',
      addBookmark: 't',
      toggleMute: 'm',
      audioBoost: 'n',
      frameStep: 'e',
      screenshot: 's'
    };
    const parsed = saved ? JSON.parse(saved) : {};
    const keybinds = {
      ...defaultKeybinds,
      ...(parsed.keybinds || {})
    };

    const lockControlsKey = (keybinds.lockControls || 'w').toLowerCase();
    const openSettingsKey = (keybinds.openSettings || 'delete').toLowerCase();
    const addBookmarkKey = (keybinds.addBookmark || 't').toLowerCase();
    const toggleMuteKey = (keybinds.toggleMute || 'm').toLowerCase();
    const audioBoostKey = (keybinds.audioBoost || 'n').toLowerCase();
    const frameStepKey = (keybinds.frameStep || 'e').toLowerCase();
    const screenshotKey = (keybinds.screenshot || 's').toLowerCase();

    if (pressedKey === openSettingsKey) {
      e.preventDefault();
      if (isLocked) {
        triggerSwitchToast("Controls are Locked");
        return;
      }
      setShowSettingsPanel(prev => {
        const next = !prev;
        if (!next) {
          setIsSettingsExpanded(false);
        }
        return next;
      });
      return;
    }

    if (pressedKey === addBookmarkKey) {
      e.preventDefault();
      if (isLocked) {
        triggerSwitchToast("Controls are Locked");
        return;
      }
      if (showAddDialog) {
        setShowAddDialog(false);
        return;
      }
      if (markingStartTime !== null) {
        if (videoRef.current) {
          const endTime = Math.round(videoRef.current.currentTime);
          const startTime = markingStartTime;
          setMarkingStartTime(null);
          setEditingBookmark({
            id: '',
            time: startTime,
            endTime: endTime,
            title: '',
            label: '',
            category: 'Nudity',
            description: '',
            createdAt: '',
            updatedAt: ''
          });
          setShowAddDialog(true);
        }
        return;
      }
      if (markingStartTime === null) {
        if (videoRef.current) {
          setMarkingStartTime(Math.round(videoRef.current.currentTime));
          setEditingBookmark(undefined);
        }
        return;
      }
      return;
    }
    
    if (pressedKey === lockControlsKey) {
      e.preventDefault();
      e.stopPropagation();
      setIsLocked(prev => {
        const next = !prev;
        triggerSwitchToast(next ? `Controls Locked (${lockControlsKey.toUpperCase()})` : `Controls Unlocked (${lockControlsKey.toUpperCase()})`);
        if (next) {
          setShowSettingsPanel(false);
          setIsSettingsExpanded(false);
          setShowBookmarksPopover(false);
          setShowAudioSubMenu(false);
          setShowAddDialog(false);
        }
        return next;
      });
      return;
    }

    if (isLocked) {
      const isVolumeKey = pressedKey === 'arrowup' || pressedKey === 'arrowdown';
      const isBoostKey = pressedKey === audioBoostKey;
      const isScreenshotKey = pressedKey === screenshotKey;
      const isSkipKey = pressedKey === 'c';
      if (!isVolumeKey && !isBoostKey && !isScreenshotKey && !isSkipKey) {
        e.preventDefault();
        e.stopPropagation();
        triggerSwitchToast("Controls are Locked");
        return;
      }
    }
    const playPauseKey = (keybinds.playPause || ' ').toLowerCase();
    const rewindKey = (keybinds.rewind || 'arrowleft').toLowerCase();
    const forwardKey = (keybinds.forward || 'arrowright').toLowerCase();
    const fullscreenKey = (keybinds.fullscreen || 'f').toLowerCase();
    const exitKey = (keybinds.exit || 'escape').toLowerCase();
    const nextSubKey = (keybinds.nextSubtitle || 'b').toLowerCase();
    const nextAudioKey = (keybinds.nextAudio || 'v').toLowerCase();

    if (pressedKey === fullscreenKey) {
      e.preventDefault();
      if (showFullscreenMode === 'disable') {
        triggerSwitchToast('Fullscreen hotkey is disabled');
        return;
      }
      if (containerRef.current) {
        if (!document.fullscreenElement) {
          containerRef.current.requestFullscreen().catch(console.error);
        } else {
          document.exitFullscreen().catch(console.error);
        }
      }
    } else if (pressedKey === exitKey) {
      e.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen()
          .then(() => handleExit())
          .catch(() => handleExit());
      } else {
        handleExit();
      }
    } else if (pressedKey === playPauseKey) {
      e.preventDefault();
      if (showPlayButtonMode === 'disable') {
        triggerSwitchToast('Playback hotkeys are disabled');
        return;
      }
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play().catch(console.error);
          triggerHudFlash('play');
        } else {
          videoRef.current.pause();
          triggerHudFlash('pause');
        }
      }
    } else if (pressedKey === rewindKey) {
      e.preventDefault();
      if (showPlayBarMode === 'disable') {
        triggerSwitchToast('Seeking hotkeys are disabled');
        return;
      }
      if (uiConfig.blockSeekingCompletely) {
        triggerSwitchToast('Seeking is blocked');
        return;
      }
      if (videoRef.current) {
        handleRewind();
        triggerHudFlash('rewind');
      }
    } else if (pressedKey === forwardKey) {
      e.preventDefault();
      if (showPlayBarMode === 'disable') {
        triggerSwitchToast('Seeking hotkeys are disabled');
        return;
      }
      if (uiConfig.blockSeekingCompletely) {
        triggerSwitchToast('Seeking is blocked');
        return;
      }
      if (videoRef.current) {
        handleForward();
        triggerHudFlash('forward');
      }
    } else if (pressedKey === 'c') {
      e.preventDefault();
      if (activeSkipBookmarkRef.current) {
        const bm = activeSkipBookmarkRef.current;
        const targetTime = (bm.isOutro || bm.category === 'Outro') 
          ? duration 
          : (bm.endTime !== undefined && bm.endTime !== null ? bm.endTime : bm.time + 90);
        if (videoRef.current) {
          if (playbackControllerRef.current) {
            playbackControllerRef.current.seek(targetTime).catch(console.error);
          } else {
            videoRef.current.currentTime = targetTime;
          }
          setCurrentTime(targetTime);
          triggerSwitchToast(`Skipped ${bm.label || bm.title || bm.category || 'Scene'}`);
        }
      }
    } else if (pressedKey === nextSubKey) {
      e.preventDefault();
      cycleSubtitles();
    } else if (pressedKey === nextAudioKey) {
      e.preventDefault();
      cycleAudio();
    } else if (pressedKey === toggleMuteKey) {
      e.preventDefault();
      if (showVolumeControlMode === 'disable') {
        triggerSwitchToast('Volume hotkeys are disabled');
        return;
      }
      setIsMuted(prev => {
        const nextMuted = !prev;
        triggerVolumeToast(volume, nextMuted);
        return nextMuted;
      });
    } else if (pressedKey === audioBoostKey) {
      e.preventDefault();
      let nextBoost = 100;
      if (audioBoost === 100) nextBoost = 150;
      else if (audioBoost === 150) nextBoost = 200;
      else nextBoost = 100;
      handleSetAudioBoost(nextBoost);
    } else if (pressedKey === frameStepKey) {
      e.preventDefault();
      if (videoRef.current) {
        if (!videoRef.current.paused) {
          videoRef.current.pause();
        }
        // Step forward by 1 frame (assume 24 fps, so 1/24 = ~0.0417s)
        const frameTime = 1 / 24;
        videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + frameTime);
        triggerSwitchToast('Frame Step (+0.04s)');
      }
    } else if (pressedKey === screenshotKey) {
      e.preventDefault();
      if (videoRef.current) {
        try {
          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || video.clientWidth;
          canvas.height = video.videoHeight || video.clientHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const videoTitle = video.title || 'video';
            const sanitizedTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `${sanitizedTitle}_screenshot_${Math.floor(video.currentTime)}s.png`;
            link.href = dataUrl;
            link.click();
            triggerSwitchToast('Screenshot Saved!');
          }
        } catch (err) {
          console.error('Failed to capture screenshot:', err);
          triggerSwitchToast('Screenshot capture blocked by security policy');
        }
      }
    } else if (pressedKey === 'arrowup') {
      e.preventDefault();
      if (showVolumeControlMode === 'disable') {
        triggerSwitchToast('Volume hotkeys are disabled');
        return;
      }
      setIsMuted(false);
      if (volume < 1.0) {
        setVolume(prev => {
          const nextVol = Math.min(1.0, prev + 0.05);
          triggerVolumeToast(nextVol, false, 100);
          return nextVol;
        });
      } else {
        setAudioBoost(prev => {
          const nextBoost = Math.min(200, prev + 5);
          triggerVolumeToast(1.0, false, nextBoost);
          return nextBoost;
        });
      }
    } else if (pressedKey === 'arrowdown') {
      e.preventDefault();
      if (showVolumeControlMode === 'disable') {
        triggerSwitchToast('Volume hotkeys are disabled');
        return;
      }
      setIsMuted(false);
      if (audioBoost > 100) {
        setAudioBoost(prev => {
          const nextBoost = Math.max(100, prev - 5);
          triggerVolumeToast(1.0, false, nextBoost);
          return nextBoost;
        });
      } else {
        setVolume(prev => {
          const nextVol = Math.max(0.0, prev - 0.05);
          triggerVolumeToast(nextVol, false, 100);
          return nextVol;
        });
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleKeyDownRef.current?.(e);
    
    const handleMouseDown = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      
      const target = e.target as HTMLElement;
      if (!container.contains(target)) return;

      if (
        target.closest('button') || 
        target.closest('input') || 
        target.closest('.seekbar-row') || 
        target.closest('.volume-control-group-premium') ||
        target.closest('.popover-wrapper') ||
        target.closest('.audio-sub-popover') ||
        target.closest('.floating-rating-prompt') ||
        target.closest('.settings-panel')
      ) {
        return;
      }

      let pressedKey = '';
      if (e.button === 0) pressedKey = 'leftclick';
      else if (e.button === 1) pressedKey = 'middleclick';
      else if (e.button === 2) pressedKey = 'rightclick';

      if (pressedKey) {
        // Only intercept if the clicked mouse button is bound to a hotkey
        const saved = localStorage.getItem('valor_settings');
        const parsed = saved ? JSON.parse(saved) : {};
        const keybinds = parsed.keybinds || {};
        const isBound = Object.values(keybinds).some(v => (v as string).toLowerCase() === pressedKey);
        
        if (isBound) {
          e.preventDefault();
          e.stopPropagation();
          const fakeEvent = {
            key: pressedKey,
            preventDefault: () => {},
            stopPropagation: () => {}
          } as KeyboardEvent;
          handleKeyDownRef.current?.(fakeEvent);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, []);

  // Reset seek state when video url changes
  useEffect(() => {
    hasSeekedRef.current = false;
  }, [video.url]);

  // PlaybackController lifecycle hook
  useEffect(() => {
    let active = true;
    let controller: PlaybackController | null = null;

    const init = async () => {
      // Wait for any previous controller to finish destroying completely
      await prevDestroyPromiseRef.current;
      if (!active) return;

      // Don't initialize playback for local videos without a valid file —
      // the blob URL is dead after page reload. The lock overlay handles reassociation.
      if (video.type === 'local' && !activeFile) return;

      if (videoRef.current) {
        const fileOrSource = activeFile
          ? (activeFile instanceof File ? activeFile : new File([activeFile], (activeFile as any)?.name || 'video.mp4'))
          : new HttpByteSource(video.url);

        const ffmpegMgr = new FFmpegManager(video.id);
        const demuxMgr = new DemuxManager(ffmpegMgr, fileOrSource);
        controller = new PlaybackController(ffmpegMgr, demuxMgr, video.seekMap);
        controller.pauseOnFocusChange = playerSettings.pauseOnFocusChange;
        controller.setAudioBoost(audioBoost);
        playbackControllerRef.current = controller;

        controller.setBufferingCallback((buffering) => {
          if (active) setIsBuffering(buffering);
        });

        controller.setOnErrorCallback((err) => {
          if (!active) return;
          console.error(`[LocalVideoPlayer] PlaybackController reported error:`, err);
          const errMsg = err?.message || String(err);
          const isFileAccessError = errMsg.includes('FileReaderSync') || 
                                    errMsg.includes('could not be found') || 
                                    errMsg.includes('NotFoundError') ||
                                    errMsg.includes('revoked');
          if (isFileAccessError) {
            console.warn('[LocalVideoPlayer] File access error detected. Showing restore access overlay.');
            setHasFileAccessError(true);
          }
        });

        try {
          await controller.initialize(videoRef.current, activeAudioStreamIndex);
        } catch (err) {
          console.warn(`[LocalVideoPlayer] PlaybackController init failed:`, err);
          return;
        }
        
        if (!active) return;

        const mediaName = (video.title || video.fileName || 'Unknown media')
          .replace(/\.[a-z\d]{2,5}$/i, '')
          .replace(/[._]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        logger.playback(`ready • ${mediaName}`);
        
        if (controller) {
          controller.play()
            .then(() => { if (active) setIsPlaying(true); })
            .catch(err => logger.player('Autoplay blocked:', err));
        }
      }
    };

    init().catch(console.error);

    return () => {
      active = false;
      playbackControllerRef.current = null;
      if (controller) {
        prevDestroyPromiseRef.current = controller.destroy();
      }
    };
  }, [video.id, video.file, video.url, activeFile]);

  // Handle track switches on-the-fly without rebuilding the controller
  useEffect(() => {
    if (playbackControllerRef.current) {
      playbackControllerRef.current.switchAudioTrack(activeAudioStreamIndex);
    }
  }, [activeAudioStreamIndex]);

  // Sync focus loss auto-pause setting to the playback controller
  useEffect(() => {
    if (playbackControllerRef.current) {
      playbackControllerRef.current.pauseOnFocusChange = playerSettings.pauseOnFocusChange;
    }
  }, [playerSettings.pauseOnFocusChange]);

  const pauseOnFocusChangeRef = useRef(playerSettings.pauseOnFocusChange);
  useEffect(() => {
    pauseOnFocusChangeRef.current = playerSettings.pauseOnFocusChange;
  }, [playerSettings.pauseOnFocusChange]);

  // Pause/Resume on Window Focus changes if enabled (Fullscreen only)
  useEffect(() => {
    const handleFocusLoss = () => {

      if (!pauseOnFocusChangeRef.current || isLocked) return;
      const isCurrentFullscreen = !!document.fullscreenElement || isFullscreen;
      if (!isCurrentFullscreen) return;
      if (videoRef.current && !videoRef.current.paused) {
        logger.player('Focus lost, auto-pausing video playback');
        if (playbackControllerRef.current) {
          playbackControllerRef.current.pause();
        } else {
          videoRef.current.pause();
        }
        setIsPlaying(false);
        wasPausedByFocusLossRef.current = true;
      }
    };

    const handleFocusGain = () => {

      if (!pauseOnFocusChangeRef.current || isLocked) return;
      if (wasPausedByFocusLossRef.current && videoRef.current && videoRef.current.paused) {
        logger.player('Focus regained, auto-resuming video playback');
        const p = playbackControllerRef.current 
          ? playbackControllerRef.current.play() 
          : videoRef.current.play();
        p.then(() => setIsPlaying(true))
         .catch(err => logger.player('Autoplay play error on focus gain:', err));
        wasPausedByFocusLossRef.current = false;
      }
    };

    const handleVisibilityChange = () => {

      if (!pauseOnFocusChangeRef.current || isLocked) return;
      const isCurrentFullscreen = !!document.fullscreenElement || isFullscreen;
      if (!isCurrentFullscreen) return;
      if (document.visibilityState === 'hidden') {
        if (videoRef.current && !videoRef.current.paused) {
          logger.player('Tab hidden, auto-pausing video playback');
          if (playbackControllerRef.current) {
            playbackControllerRef.current.pause();
          } else {
            videoRef.current.pause();
          }
          setIsPlaying(false);
          wasPausedByFocusLossRef.current = true;
        }
      } else if (document.visibilityState === 'visible') {
        handleFocusGain();
      }
    };

    window.addEventListener('blur', handleFocusLoss);
    window.addEventListener('focus', handleFocusGain);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleFocusLoss);
      window.removeEventListener('focus', handleFocusGain);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isFullscreen, isLocked]);

  // Re-engage fullscreen on window focus if locked
  useEffect(() => {
    if (!isLocked) return;

    const handleFocus = () => {
      if (containerRef.current && !document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(err => {
          logger.player('Failed to re-engage fullscreen on focus:', err);
        });
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [isLocked]);

  // Track active play duration (totalTimeWatched)
  useEffect(() => {
    if (isPlaying) {
      sessionStartRef.current = Date.now();
      const interval = setInterval(() => {
        if (sessionStartRef.current) {
          const now = Date.now();
          const delta = (now - sessionStartRef.current) / 1000;
          sessionStartRef.current = now;
          totalTimeWatchedRef.current += delta;

          // Check if remaining time is below rating threshold (minutes) to show rating prompt
          if (videoRef.current && duration > 0 && !ratingPromptedRef.current) {
            const remaining = duration - videoRef.current.currentTime;
            if (remaining <= (ratingThreshold || 3) * 60 && remaining > 5) {
              setShowRatingPrompt(true);
              ratingPromptedRef.current = true;
            }
          }
        }
      }, 1000);
      return () => {
        clearInterval(interval);
        if (sessionStartRef.current) {
          const now = Date.now();
          const delta = (now - sessionStartRef.current) / 1000;
          totalTimeWatchedRef.current += delta;
          sessionStartRef.current = null;
        }
      };
    }
  }, [isPlaying, duration, ratingThreshold]);

  // Session Logging on Mount/Unmount
  useEffect(() => {
    return () => {
      const exitTime = Date.now();
      const sessionDuration = (exitTime - mountTimeRef.current) / 1000;
      const newSession = {
        startedAt: new Date(mountTimeRef.current).toISOString(),
        endedAt: new Date(exitTime).toISOString(),
        durationWatched: Math.round(sessionDuration)
      };

      const existingSessions = (video as any).sessions || [];
      const updatedSessions = [...existingSessions, newSession];

      let timeToFinish = (video as any).timeToFinish;
      const currentDuration = durationRef.current;
      if (!timeToFinish && currentDuration > 0 && (latestTimeRef.current / currentDuration) >= 0.95) {
        const firstPlay = (video as any).firstPlayTimestamp || mountTimeRef.current;
        timeToFinish = (exitTime - firstPlay) / 1000;
        scrobbleToTrakt();
      }

      onUpdateVideoRef.current((prev: any) => ({
        ...prev,
        currentTime: latestTimeRef.current,
        totalTimeWatched: Math.round(totalTimeWatchedRef.current),
        sessions: updatedSessions,
        timeToFinish: timeToFinish ? Math.round(timeToFinish) : prev.timeToFinish,
        firstPlayTimestamp: prev.firstPlayTimestamp || mountTimeRef.current
      }), true, video.id);
    };
  }, []);

  // Periodically save current playback position to parent state
  useEffect(() => {
    const intervalMs = Math.max(5, historySaveInterval || 5) * 1000;
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const exitTime = Date.now();
        const currentSession = {
          startedAt: new Date(mountTimeRef.current).toISOString(),
          endedAt: new Date(exitTime).toISOString(),
          durationWatched: Math.round((exitTime - mountTimeRef.current) / 1000)
        };
        const existingSessions = (video as any).sessions || [];
        const updatedSessions = [...existingSessions, currentSession];

        let timeToFinish = (video as any).timeToFinish;
        const currentDuration = durationRef.current;
        if (!timeToFinish && currentDuration > 0 && (latestTimeRef.current / currentDuration) >= 0.95) {
          const firstPlay = (video as any).firstPlayTimestamp || mountTimeRef.current;
          timeToFinish = (exitTime - firstPlay) / 1000;
          scrobbleToTrakt();
        }

        onUpdateVideoRef.current((prev: any) => ({
          ...prev,
          currentTime: latestTimeRef.current,
          totalTimeWatched: Math.round(totalTimeWatchedRef.current),
          sessions: updatedSessions,
          timeToFinish: timeToFinish ? Math.round(timeToFinish) : prev.timeToFinish,
          firstPlayTimestamp: prev.firstPlayTimestamp || mountTimeRef.current
        }), false, video.id);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [historySaveInterval]);

  // Auto-select preferred default audio/subtitle streams
  useEffect(() => {
    if (streams.length > 0 && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      try {
        const saved = localStorage.getItem('valor_settings');
        const settings = saved ? JSON.parse(saved) : { defaultAudio: 'ENG', defaultSub: 'ENG' };
        const targetAudio = settings.defaultAudio || 'ENG';
        const targetSub = settings.defaultSub || 'ENG';

        // Auto-select audio stream (for both local and remote)
        if (targetAudio !== 'Original' && !selectedAudioTrack) {
          const stream = audioStreams.find(s => (
            targetAudio === 'ENG' ? (s.language?.toLowerCase() === 'eng' || s.language?.toLowerCase() === 'en') :
            targetAudio === 'JAP' ? (s.language?.toLowerCase() === 'jpn' || s.language?.toLowerCase() === 'ja') :
            targetAudio === 'CHN' ? (s.language?.toLowerCase() === 'chi' || s.language?.toLowerCase() === 'zho' || s.language?.toLowerCase() === 'zh') :
            s.language?.toUpperCase() === targetAudio
          ));
          if (stream) {
            logger.player(`Auto-selecting audio track: ${stream.language}`);
            handleSelectEmbeddedAudio(stream.index, stream.codec, stream.language);
          }
        }

        // Always auto-select the first audio track when available (for both local and remote)
        // Browser native decoding from MKV container is unreliable, so always extract via FFmpeg
        if (!selectedAudioTrack && audioStreams.length > 0) {
          const firstAudio = audioStreams[0];
          logger.player(`Auto-selecting first audio track: ${firstAudio.language || 'unknown'} (${firstAudio.codec})`);
          handleSelectEmbeddedAudio(firstAudio.index, firstAudio.codec, firstAudio.language);
        }

        // Auto-select subtitle stream
        if (targetSub !== 'Off' && !selectedSubTrack) {
          const stream = subtitleStreams.find(s => (
            targetSub === 'ENG' ? (s.language?.toLowerCase() === 'eng' || s.language?.toLowerCase() === 'en') :
            targetSub === 'JAP' ? (s.language?.toLowerCase() === 'jpn' || s.language?.toLowerCase() === 'ja') :
            targetSub === 'CHN' ? (s.language?.toLowerCase() === 'chi' || s.language?.toLowerCase() === 'zho' || s.language?.toLowerCase() === 'zh') :
            s.language?.toUpperCase() === targetSub
          ));
          if (stream) {
            logger.player(`Auto-selecting subtitle track: ${stream.language}`);
            handleSelectEmbeddedSubtitle(stream.index, stream.codec, stream.language);
          }
        }
      } catch (err) {
        logger.error('Failed auto-selecting defaults:', err);
      }
    }
  }, [streams]);

  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      const newTrack: CustomAudioTrack = {
        id: `custom-aud-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        url: url,
        isExtracted: false,
        language: 'custom'
      };
      
      const updatedVideo = {
        ...video,
        audioTracks: [...audioTracks, newTrack]
      };
      onUpdateVideo(updatedVideo);
      handleSelectAudioTrack(newTrack);
    }
  };

  const handleCustomSubUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const text = await file.text();
      const cues = parseSubtitles(text, file.name);
      
      const newTrack: CustomSubtitleTrack = {
        id: `custom-sub-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        url: '',
        cues: cues,
        isExtracted: false,
        language: 'custom'
      };

      const updatedVideo = {
        ...video,
        subtitleTracks: [...subtitleTracks, newTrack]
      };
      onUpdateVideo(updatedVideo);
      handleSelectSubTrack(newTrack);
    }
  };
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);

    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');

    if (h > 0) {
      return `${h}:${mStr}:${sStr}`;
    }
    return `${m}:${sStr}`;
  };

  const formatRuntime = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '0m';
    const mins = Math.round(secs / 60);
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hrs > 0) {
      return `${hrs}h ${remainingMins}m`;
    }
    return `${mins}m`;
  };


  // Progress Bar Hover Indicator
  const handleProgressMouseMove = (e: React.MouseEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * duration;
    
    setHoverTime(formatTime(time));
    setHoverPercent(pct * 100);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = time;
    }
  };

  const handleProgressMouseLeave = () => {
    setHoverTime(null);
  };

  const renderSettingsButton = (key: string) => {
    switch (key) {
      case 'hideUIOverlays':
        return (
          <button
            key="hideUIOverlays"
            onClick={() => cycleSetting('hideUIOverlays')}
            onMouseEnter={() => setHoveredSetting('showUIOverlays')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable All Overlays (Keyboard Only Mode)" + getSettingLabelSuffix('hideUIOverlays')}
            className={getToggleBtnClass('hideUIOverlays')}
          >
            <Layers size={22} />
          </button>
        );
      case 'hideVideoName':
        return (
          <button
            key="hideVideoName"
            onClick={() => cycleSetting('hideVideoName')}
            onMouseEnter={() => setHoveredSetting('showVideoName')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable Video Name Display" + getSettingLabelSuffix('hideVideoName')}
            className={getToggleBtnClass('hideVideoName')}
          >
            <Type size={22} />
          </button>
        );
      case 'showPlayButton':
        return (
          <button
            key="showPlayButton"
            onClick={() => cycleSetting('showPlayButton')}
            onMouseEnter={() => setHoveredSetting('showPlayButton')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable Play Button Overlay" + getSettingLabelSuffix('showPlayButton')}
            className={getToggleBtnClass('showPlayButton')}
          >
            <Play size={22} />
          </button>
        );
      case 'showTimeDisplay':
        return (
          <button
            key="showTimeDisplay"
            onClick={() => cycleSetting('showTimeDisplay')}
            onMouseEnter={() => setHoveredSetting('showTimeDisplay')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable Time Display" + getSettingLabelSuffix('showTimeDisplay')}
            className={getToggleBtnClass('showTimeDisplay')}
          >
            <Clock size={22} />
          </button>
        );
      case 'showPlayBar':
        return (
          <button
            key="showPlayBar"
            onClick={() => cycleSetting('showPlayBar')}
            onMouseEnter={() => setHoveredSetting('showPlayBar')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable Timeline Scrub Bar" + getSettingLabelSuffix('showPlayBar')}
            className={getToggleBtnClass('showPlayBar')}
          >
            <Sliders size={22} />
          </button>
        );
      case 'showVolumeControl':
        return (
          <button
            key="showVolumeControl"
            onClick={() => cycleSetting('showVolumeControl')}
            onMouseEnter={() => setHoveredSetting('showVolumeControl')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable Volume Control" + getSettingLabelSuffix('showVolumeControl')}
            className={getToggleBtnClass('showVolumeControl')}
          >
            <Volume2 size={22} />
          </button>
        );
      case 'showFullscreen':
        return (
          <button
            key="showFullscreen"
            onClick={() => cycleSetting('showFullscreen')}
            onMouseEnter={() => setHoveredSetting('showFullscreen')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={"Disable Fullscreen Toggle Button" + getSettingLabelSuffix('showFullscreen')}
            className={getToggleBtnClass('showFullscreen')}
          >
            <Maximize size={22} />
          </button>
        );
      case 'disableAnimations':
        return (
          <button
            key="disableAnimations"
            onClick={() => updatePlayerSetting('disableAnimations', !playerSettings.disableAnimations)}
            onMouseEnter={() => setHoveredSetting('disableAnimations')}
            onMouseLeave={() => setHoveredSetting(null)}
            title="Disable Floating & Hover Animations"
            className={`settings-icon-toggle ${playerSettings.disableAnimations ? 'active-red' : ''}`}
          >
            <Zap size={22} />
          </button>
        );
      case 'pauseOnFocusChange':
        return (
          <button
            key="pauseOnFocusChange"
            onClick={() => updatePlayerSetting('pauseOnFocusChange', !playerSettings.pauseOnFocusChange)}
            onMouseEnter={() => setHoveredSetting('pauseOnFocusChange')}
            onMouseLeave={() => setHoveredSetting(null)}
            title="Disable Focus Loss Auto-Pause"
            className={`settings-icon-toggle ${!playerSettings.pauseOnFocusChange ? 'active-red' : ''}`}
          >
            <Coffee size={22} />
          </button>
        );
      case 'allowUiSkipping':
        return (
          <button
            key="allowUiSkipping"
            onClick={() => {
              if (!playerSettings.blockSeekingCompletely) {
                updatePlayerSetting('allowUiSkipping', !playerSettings.allowUiSkipping);
              }
            }}
            onMouseEnter={() => setHoveredSetting('allowUiSkipping')}
            onMouseLeave={() => setHoveredSetting(null)}
            disabled={playerSettings.blockSeekingCompletely}
            title={playerSettings.blockSeekingCompletely ? "Show Skip Buttons (Disabled - Seeking Blocked)" : "Show Skip Buttons in Player UI"}
            className={`settings-icon-toggle ${playerSettings.blockSeekingCompletely ? 'disabled' : ''} ${playerSettings.allowUiSkipping ? 'active-blue' : 'active-red'}`}
          >
            <SkipForward size={22} />
          </button>
        );
      case 'blockSeekingCompletely':
        return (
          <button
            key="blockSeekingCompletely"
            onClick={() => updatePlayerSetting('blockSeekingCompletely', !playerSettings.blockSeekingCompletely)}
            onMouseEnter={() => setHoveredSetting('blockSeekingCompletely')}
            onMouseLeave={() => setHoveredSetting(null)}
            title="Block Seeking / Skipping Completely"
            className={`settings-icon-toggle ${playerSettings.blockSeekingCompletely ? 'active-red' : ''}`}
          >
            <Ban size={22} />
          </button>
        );
      case 'autoSkipIntroOutro':
        return (
          <button
            key="autoSkipIntroOutro"
            onClick={() => updatePlayerSetting('autoSkipIntroOutro', !playerSettings.autoSkipIntroOutro)}
            onMouseEnter={() => setHoveredSetting('autoSkipIntroOutro')}
            onMouseLeave={() => setHoveredSetting(null)}
            title="Auto-Skip Intros & Outros"
            className={`settings-icon-toggle ${playerSettings.autoSkipIntroOutro ? 'active-blue' : ''}`}
          >
            <FastForward size={22} />
          </button>
        );
      case 'lockModeActive':
        return (
          <button
            key="lockModeActive"
            onClick={() => {
              const nextVal = !isLocked;
              setIsLocked(nextVal);
              if (nextVal) {
                setShowSettingsPanel(false);
                setIsSettingsExpanded(false);
                setShowBookmarksPopover(false);
                setShowAudioSubMenu(false);
                setShowAddDialog(false);
                triggerSwitchToast(`Controls Locked (${getLockShortcutKey().toUpperCase()})`);
              }
            }}
            onMouseEnter={() => setHoveredSetting('lockModeActive')}
            onMouseLeave={() => setHoveredSetting(null)}
            title="Lock Controls"
            className={`settings-icon-toggle ${isLocked ? 'active-blue' : ''}`}
          >
            <Lock size={22} />
          </button>
        );
      default:
        return null;
    }
  };



  const activeSkipBookmark = useMemo(() => {
    if (isScrubbing) return null;
    return bookmarks.find(bm => {
      if (bm.category !== 'Intro' && bm.category !== 'Outro' && !bm.isIntro && !bm.isOutro && !bm.skipEnabled) return false;
      if (bm.category === 'Outro' || bm.isOutro) {
        return currentTime >= bm.time && currentTime < (duration - 1);
      }
      return bm.endTime && currentTime >= bm.time && currentTime < bm.endTime;
    }) || null;
  }, [bookmarks, currentTime, duration, isScrubbing]);

  const activeSkipBookmarkRef = useRef<Bookmark | null>(null);
  activeSkipBookmarkRef.current = activeSkipBookmark;

  const controlsVisible = showControls && !isLocked;
  const effectiveDuration = duration || parseDurationToSeconds(video.duration) || 0;

  const handleWheel = (e: React.WheelEvent) => {
    if (showSettingsPanel || showAddDialog || showBookmarksPopover || showAudioSubMenu || showConsoleOverlay) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('.player-settings-panel') || target.closest('.bookmarks-popover') || target.closest('.audio-sub-popover') || target.closest('.speed-popover-container')) return;

    if (e.deltaY < 0) {
      handleKeyDownRef.current?.(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    } else if (e.deltaY > 0) {
      handleKeyDownRef.current?.(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`player-container ${controlsVisible ? 'show-cursor' : 'hide-cursor'} ${hideUIOverlays ? 'keyboard-only' : ''} ${disableAnimations ? 'no-animations' : ''} ${hoveredSetting === 'lockModeActive' || hoveredSetting === 'pauseOnFocusChange' || hoveredSetting === 'disableAnimations' ? 'highlight-active' : ''}`}
      onMouseMove={(e) => {
        if (!isLocked) handleMouseMove(e);
      }}
      onWheel={handleWheel}
      onDoubleClick={(e) => {
        // Removed toggleFullscreen() on double click to prevent accidental fullscreen exits
        // when the user clicks multiple times rapidly to pause/play.
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!hideUIOverlays) {
          setRadialMenuState({ visible: true, x: e.clientX, y: e.clientY });
        }
      }}
    >


      {video.type === 'local' && (!activeFile || hasFileAccessError) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 600,
          color: '#ffffff',
          fontFamily: "'Inter', sans-serif"
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '2.5rem',
            borderRadius: '16px',
            textAlign: 'center',
            maxWidth: '450px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem'
          }}>
            <Lock size={48} color="#ff7a00" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Restore Access to File</h2>
            <p style={{ fontSize: '0.95rem', color: 'rgba(255, 255, 255, 0.7)', margin: 0, lineHeight: 1.5 }}>
              To resume watching <strong>{video.title}</strong>, please restore permission to access the local file.
            </p>
            <button 
              className="btn btn-primary"
              style={{
                background: '#ff7a00',
                border: 'none',
                color: '#ffffff',
                fontWeight: 700,
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(255, 122, 0, 0.3)',
                marginTop: '0.5rem'
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onReassociate) {
                  onReassociate(video.id);
                }
              }}
            >
              <Play size={16} fill="white" />
              <span>Resume Playback</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                textDecoration: 'underline'
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (onBack) onBack();
              }}
            >
              Cancel & Go Back
            </button>
          </div>
        </div>
      )}

      <div 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          zIndex: 10 
        }}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRadialMenuState({ visible: true, x: e.clientX, y: e.clientY });
        }}
      >
        <video
          ref={videoRef}
          onContextMenu={(e) => e.preventDefault()}
          src={video.url}
          controls={false}
          crossOrigin={video.playbackMode === 'advanced' ? 'anonymous' : undefined}
          className="main-video-element"
           onLoadedMetadata={() => {
            if (videoRef.current) {
              const videoDuration = videoRef.current.duration;
              setDuration(videoDuration);
              
              const directResumeTime = video.resumeTime || 0;
              if (directResumeTime > 5 && videoDuration - directResumeTime > 10) {
                setResumePromptTime(directResumeTime);
                videoRef.current.currentTime = 0;
                hasSeekedRef.current = true;
                return;
              }

              if (video.currentTime && !hasSeekedRef.current) {
                const remainingTime = videoDuration - video.currentTime;
                // Lenient resume limits: resume if watched > 5s and remaining > 10s
                if (video.currentTime > 5 && remainingTime > 10) {
                  logger.player(`Resume limits met: seeking to ${video.currentTime}s`);
                  videoRef.current.currentTime = video.currentTime;
                } else {
                  logger.player(`Resume limits not met (currentTime: ${video.currentTime}s, remaining: ${remainingTime}s). Starting from 0.`);
                  videoRef.current.currentTime = 0;
                }
                hasSeekedRef.current = true;
              }
            }
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              const time = videoRef.current.currentTime;
              const shouldUpdate = !video.currentTime || hasSeekedRef.current || time > 0;
              if (shouldUpdate && !isScrubbingRef.current && !debouncedSeekTimeoutRef.current) {
                setCurrentTime(time);
                latestTimeRef.current = time;
              }
  
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => {
            // If focus loss auto-pause is disabled and this pause was triggered by browser 
            // background tab throttling, ignore it — don't update UI state.
            if (!pauseOnFocusChangeRef.current && document.visibilityState === 'hidden') {
              console.log('[LocalVideoPlayer] Ignoring browser background throttle onPause event');
              return;
            }
            setIsPlaying(false);
            onUpdateVideoRef.current((prev: any) => ({
              ...prev,
              currentTime: latestTimeRef.current,
              totalTimeWatched: Math.round(totalTimeWatchedRef.current)
            }), false, video.id);
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onSeeked={handleVideoSeeked}
          onSeeking={() => setIsBuffering(true)}
          onError={handleVideoError}
          onEnded={() => {
            scrobbleToTrakt();
            if (!ratingPromptedRef.current) {
              setShowRatingPrompt(true);
              ratingPromptedRef.current = true;
            }

            const exitTime = Date.now();
            const sessionDuration = (exitTime - mountTimeRef.current) / 1000;
            const newSession = {
              startedAt: new Date(mountTimeRef.current).toISOString(),
              endedAt: new Date(exitTime).toISOString(),
              durationWatched: Math.round(sessionDuration)
            };
            const existingSessions = (video as any).sessions || [];
            const updatedSessions = [...existingSessions, newSession];

            let timeToFinish = (video as any).timeToFinish;
            if (!timeToFinish && duration > 0) {
              const firstPlay = (video as any).firstPlayTimestamp || mountTimeRef.current;
              timeToFinish = (exitTime - firstPlay) / 1000;
            }

            onUpdateVideoRef.current((prev: any) => ({
              ...prev,
              currentTime: duration,
              totalTimeWatched: Math.round(totalTimeWatchedRef.current),
              sessions: updatedSessions,
              timeToFinish: timeToFinish ? Math.round(timeToFinish) : prev.timeToFinish,
              firstPlayTimestamp: prev.firstPlayTimestamp || mountTimeRef.current
            }), true, video.id, true);

            // Auto-submit bookmarks to TheIntroDB when video finishes
            if (!hadTidbDataRef.current && bookmarks.length > 0) {
              logger.player('[TheIntroDB] Video ended. Auto-submitting existing bookmarks to TIDB...');
              autoSubmitBookmarksToTidb(bookmarks);
            }
          }}
          playsInline
        />
      </div>

      {false && activeSubtitleStartOffset}

      {/* Subtitles Overlay */}
      {selectedSubTrack && (
        <SubtitleOverlay 
          cues={selectedSubTrack.cues} 
          currentTime={currentTime} 
          settings={subSettings} 
          controlsVisible={controlsVisible}
        />
      )}

      {/* Paused Metadata Overlay Card */}
      {!isPlaying && mediaDetails && getOverlayDataFromTmdb && !hideUIOverlays && !isLocked && !showAudioSubMenu && (
        <>
          {/* Dark gradient scrim — adapts direction based on overlay corner position */}
          {overlayShowBackground && (
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: (() => {
                const hGrad = overlayPosition.includes('left')
                  ? 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.2) 50%, transparent 70%)'
                  : 'linear-gradient(to left, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.2) 50%, transparent 70%)';
                const vGrad = overlayPosition.includes('top')
                  ? 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)'
                  : 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 40%, transparent 70%)';
                return `${hGrad}, ${vGrad}`;
              })(),
              zIndex: 45,
              pointerEvents: 'none',
              animation: 'overlayScrimFadeIn 0.8s ease forwards'
            }}
          />
          )}
          <div 
            className="paused-metadata-overlay animate-metadata-slide-in"
            style={{
              position: 'absolute',
              ...(overlayPosition === 'bottom-left' && {
                bottom: '140px',
                left: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
              }),
              ...(overlayPosition === 'bottom-right' && {
                bottom: '140px',
                right: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
              }),
              ...(overlayPosition === 'top-left' && {
                top: videoLayout.top > 0 ? `${videoLayout.top + 60}px` : '5%',
                left: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
              }),
              ...(overlayPosition === 'top-right' && {
                top: videoLayout.top > 0 ? `${videoLayout.top + 60}px` : '5%',
                right: videoLayout.left > 0 ? `${videoLayout.left + 24}px` : '2.5%',
              }),
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxWidth: videoLayout.width > 0 ? `${Math.min(videoLayout.width * 0.45, 550)}px` : '40%',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.95), 0 0 20px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'none',
              fontFamily: "'Inter', sans-serif",
              alignItems: overlayPosition.includes('right') ? 'flex-end' : 'flex-start',
              textAlign: overlayPosition.includes('right') ? 'right' : 'left'
            }}
          >
          {mediaDetails.logoUrl ? (
            <img 
              src={mediaDetails.logoUrl} 
              alt={mediaDetails.title}
              crossOrigin="anonymous"
              onError={() => {
                // Logo failed to load, clear it so we fall back to text title
                setMediaDetails(prev => prev ? { ...prev, logoUrl: undefined } : prev);
              }}
              style={{
                height: '60px',
                maxWidth: '300px',
                width: 'auto',
                objectFit: 'contain',
                alignSelf: overlayPosition.includes('right') ? 'flex-end' : 'flex-start',
                marginBottom: '4px',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))'
              }}
            />
          ) : (
            <h2 style={{ 
              margin: 0, 
              fontSize: '2.8rem', 
              fontWeight: 800, 
              color: '#fff',
              fontFamily: "'Outfit', 'Inter', sans-serif",
              letterSpacing: '-0.02em',
              lineHeight: '1.1'
            }}>
              {mediaDetails.title}
            </h2>
          )}
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            fontSize: '0.95rem', 
            color: 'rgba(255, 255, 255, 0.7)',
            fontWeight: 500,
            margin: '2px 0',
            fontFamily: "'Inter', sans-serif"
          }}>
            {mediaDetails.episodeTitle ? (
              <>
                <span>Season {mediaDetails.season}</span>
                <span>·</span>
                <span>Episode {mediaDetails.episode}</span>
              </>
            ) : (
              <span>Movie</span>
            )}
            <span>·</span>
            <span>{formatRuntime(duration)}</span>
          </div>

          {mediaDetails.episodeTitle && (
            <h3 style={{ 
              margin: '2px 0 0 0', 
              fontSize: '1.2rem', 
              fontWeight: 700, 
              color: '#fff',
              fontFamily: "'Inter', sans-serif"
            }}>
              {mediaDetails.episodeTitle}
            </h3>
          )}

          {overlayShowOverview && mediaDetails.overview && (
            <p style={{ 
              margin: 0, 
              fontSize: '0.95rem', 
              color: 'rgba(255, 255, 255, 0.8)', 
              lineHeight: '1.5',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '550px',
              fontFamily: "'Inter', sans-serif"
            }}>
              {mediaDetails.overview}
            </p>
          )}

          {/* Rating badge */}
          {overlayShowRating && mediaDetails.rating && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              marginTop: '4px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#fbbf24'
            }}>
              <span>★</span>
              <span>{mediaDetails.rating.toFixed(1)}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: 400 }}>/ 10</span>
            </div>
          )}
          </div>
        </>
      )}

      {/* Lock Overlay to block mouse clicks and all settings */}
      {isLocked && activeFile && !hasFileAccessError && (
        <div 
          className="player-lock-overlay"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRadialMenuState({ visible: true, x: e.clientX, y: e.clientY });
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9999,
            background: 'transparent',
            cursor: 'default',
            pointerEvents: 'auto'
          }}
        >
          {/* Lock Indicator Button */}
          <button 
            className="player-lock-indicator"
            onClick={(e) => {
              e.stopPropagation();
              setIsLocked(false);
              triggerSwitchToast(`Controls Unlocked (${getLockShortcutKey()})`);
            }}
            title={`Unlock Controls (Shortcut: ${getLockShortcutKey()})`}
            style={{
              pointerEvents: 'auto'
            }}
          >
            <Lock size={20} />
          </button>
        </div>
      )}

      {/* Buffering ring loader */}
      <BufferingOverlay 
        isBuffering={isBuffering}
        customLoaderUrl={customLoaderUrl} 
        customLoaderType={customLoaderType} 
        preset={(spinnerPreset || 'fire-circle') as any} 
      />

      {/* Top Header Overlay */}
      {!isLocked && (!hideUIOverlays || hoveredSetting === 'showUIOverlays') && (
        <div 
          className={`player-overlay top-overlay-clean ${controlsVisible ? 'visible' : 'hidden'} ${getHighlightClass('showUIOverlays')}`} 
          onClick={(e) => e.stopPropagation()}
          style={{
            opacity: controlsVisible ? (showUIOverlaysMode === 'enable' ? 1 : 0.5) : 0,
            pointerEvents: controlsVisible ? (showUIOverlaysMode === 'enable' ? 'auto' : 'none') : 'none'
          }}
        >
          {/* Chromecast trigger (acting as native browser cast prompt) */}
          <button className="cast-btn" onClick={handleCast} title="Chromecast">
            <Cast size={24} />
          </button>
          
          {/* Centered video title & Playback mode badge */}
          {(!hideVideoName || video.isRemote || hoveredSetting === 'showVideoName') && (
            <div className={`top-title-container ${getHighlightClass('showVideoName')}`}>
              {(showVideoNameMode === 'enable' || hoveredSetting === 'showVideoName') && video.playbackMode !== 'native' && (
                <h2 
                  className="top-title-clean" 
                  style={{ 
                    marginBottom: '0.2rem',
                    opacity: showVideoNameMode === 'enable' ? 1 : 0.5
                  }}
                >
                  {video.title}
                </h2>
              )}
              {(showVideoNameMode === 'enable' || hoveredSetting === 'showVideoName') && (
                <div style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#00ffcc',
                  fontFamily: "'Share Tech Mono', Courier, monospace",
                  background: 'rgba(0, 255, 204, 0.05)',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(0, 255, 204, 0.15)',
                  marginTop: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  textShadow: '0 0 5px rgba(0, 255, 204, 0.4)',
                  letterSpacing: '1px'
                }}>
                  <OdometerClock date={systemTime} />
                </div>
              )}
              {video.isRemote && (
                <div className="playback-mode-badge-container">
                  {video.playbackMode === 'advanced' ? (
                    <span className="playback-badge badge-advanced" title="FFmpeg-powered custom stream demuxing enabled">
                      <span className="badge-dot"></span> Playback Mode: Advanced
                    </span>
                  ) : (
                    <div className="native-badge-wrapper">
                      <span 
                        className="playback-badge badge-native"
                      >
                        <span className="badge-dot"></span> Playback Mode: Native Browser
                        <span className="tooltip-text">Advanced metadata access is unavailable because the remote server blocks cross-origin byte access.</span>
                      </span>
                      <button 
                        className="btn-enable-advanced" 
                        onClick={() => triggerSwitchToast("Advanced Mode via proxy is a future feature. Currently playing in Native Mode.")}
                      >
                        Enable Advanced Mode
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Close Button */}
          <button className="close-btn" onClick={handleExit} title="Close">
            <X size={24} />
          </button>
        </div>
      )}

      {/* Center Screen HUD Controls */}
      {!isLocked && !hideUIOverlays && (showPlayButton || uiConfig.allowUiSkipping || hoveredSetting === 'showPlayButton' || hoveredSetting === 'allowUiSkipping') && (
        <div 
          className={`center-controls-hud ${(controlsVisible || hoveredSetting === 'showPlayButton' || hoveredSetting === 'allowUiSkipping') ? 'visible' : 'hidden'} ${getHighlightClass('showPlayButton')}`} 
          onClick={(e) => {
            e.stopPropagation();
            if (showPlayButtonMode === 'enable') togglePlay();
          }}
          style={{
            pointerEvents: (controlsVisible || hoveredSetting === 'showPlayButton' || hoveredSetting === 'allowUiSkipping') ? 'auto' : 'none'
          }}
        >
          {(uiConfig.allowUiSkipping || hoveredSetting === 'allowUiSkipping') && (
            <button 
              className={`hud-btn-clean ${getHighlightClass('allowUiSkipping')}`} 
              onClick={(e) => { e.stopPropagation(); if (uiConfig.blockSeekingCompletely) return; handleRewind(); }} 
              title="Rewind 10s"
              style={{
                opacity: uiConfig.allowUiSkipping ? 1 : 0.5,
                pointerEvents: uiConfig.allowUiSkipping ? 'auto' : 'none'
              }}
            >
              <div className="seek-hud-container">
                <RotateCcw size={64} strokeWidth={1.2} />
                <span className="seek-hud-text">10</span>
              </div>
            </button>
          )}
          
          <button 
            className={`hud-btn-clean play-pause-hud-clean ${getHighlightClass('showPlayButton')}`} 
            onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
            title={isPlaying ? "Pause" : "Play"}
            style={{
              opacity: showPlayButtonMode === 'enable' ? 1 : 0.5,
              pointerEvents: showPlayButtonMode === 'enable' ? 'auto' : 'none'
            }}
          >
            {isPlaying ? <Pause size={72} strokeWidth={1.2} /> : <Play size={72} strokeWidth={1.2} style={{ marginLeft: '6px' }} />}
          </button>
          
          {(uiConfig.allowUiSkipping || hoveredSetting === 'allowUiSkipping') && (
            <button 
              className={`hud-btn-clean ${getHighlightClass('allowUiSkipping')}`} 
              onClick={(e) => { e.stopPropagation(); if (uiConfig.blockSeekingCompletely) return; handleForward(); }} 
              title="Forward 10s"
              style={{
                opacity: uiConfig.allowUiSkipping ? 1 : 0.5,
                pointerEvents: uiConfig.allowUiSkipping ? 'auto' : 'none'
              }}
            >
              <div className="seek-hud-container">
                <RotateCw size={64} strokeWidth={1.2} />
                <span className="seek-hud-text">10</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Floating Rating Prompt Overlay */}
      {showRatingPrompt && (
        <div className="floating-rating-prompt animate-slide-in" onClick={(e) => e.stopPropagation()}>
          <div className="rating-header">
            <span>Enjoying this video? Rate it:</span>
            <button className="rating-close" onClick={() => setShowRatingPrompt(false)}>
              <X size={14} />
            </button>
          </div>
          <div className="rating-stars">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = userRating !== null && star <= userRating;
              return (
                <button
                  key={star}
                  type="button"
                  className={`star-btn ${active ? 'active' : ''}`}
                  onClick={() => {
                    setUserRating(star);
                    onUpdateVideo((prev: any) => ({ ...prev, rating: star }));
                    // Show a quick thank you message and then close
                    setTimeout(() => {
                      setShowRatingPrompt(false);
                    }, 1500);
                  }}
                >
                  ★
                </button>
              );
            })}
          </div>
          {userRating !== null && (
            <div className="rating-thanks">Thanks for rating! ({userRating}/5)</div>
          )}
        </div>
      )}

      {/* Resume Button for direct URL/path opens with saved progress */}
      {resumePromptTime !== null && currentTime < 3 && !activeSkipBookmark && (
        <button 
          className="skip-btn resume-playback-btn"
          style={{
            position: 'absolute',
            bottom: controlsVisible ? '160px' : '40px',
            right: '40px',
            zIndex: 90,
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={(e) => {
            e.stopPropagation();
            const targetTime = resumePromptTime;
            setResumePromptTime(null);
            if (videoRef.current) {
              videoRef.current.currentTime = targetTime;
              setCurrentTime(targetTime);
              if (playbackControllerRef.current) {
                playbackControllerRef.current.seek(targetTime).catch(console.error);
              }
            }
          }}
        >
          Resume from {formatTime(resumePromptTime)}
        </button>
      )}

      {/* Skip Button */}
      {activeSkipBookmark && (
        <Button
          key={activeSkipBookmark.id}
          variant='destructive'
          className="skip-btn-premium animate-heartbeat bg-destructive! dark:bg-destructive! text-white"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            const targetTime = (activeSkipBookmark.isOutro || activeSkipBookmark.category === 'Outro') 
              ? duration 
              : (activeSkipBookmark.endTime !== undefined && activeSkipBookmark.endTime !== null ? activeSkipBookmark.endTime : activeSkipBookmark.time + 90);
            if (videoRef.current) {
              videoRef.current.currentTime = targetTime;
              setCurrentTime(targetTime);
              triggerSwitchToast(`Skipped ${activeSkipBookmark.label || activeSkipBookmark.title || activeSkipBookmark.category || 'Scene'}`);
            }
          }}
        >
          <span>Skip {
            activeSkipBookmark.category === 'Intro' || activeSkipBookmark.isIntro ? 'Intro' 
            : activeSkipBookmark.category === 'Outro' || activeSkipBookmark.isOutro ? 'Outro' 
            : activeSkipBookmark.label || activeSkipBookmark.category || 'Scene'
          } (C)</span>
          <FastForward size={18} />
          <div className="skip-progress-bar" />
        </Button>
      )}

      {/* Bottom Controls Overlay */}
      {!isLocked && (((!hideUIOverlays && (showPlayBar || showTimeDisplay || showVolumeControl || showFullscreen || video.isRemote)) ||
        (hoveredSetting === 'showUIOverlays' || hoveredSetting === 'showPlayBar' || hoveredSetting === 'showTimeDisplay' || hoveredSetting === 'showVolumeControl' || hoveredSetting === 'showFullscreen'))) && (
        <div 
          className={`player-overlay bottom-overlay ${controlsVisible ? 'visible' : 'hidden'} ${getHighlightClass('showUIOverlays')}`} 
          onClick={(e) => e.stopPropagation()}
          style={{
            opacity: controlsVisible ? (showUIOverlaysMode === 'enable' ? 1 : 0.5) : 0,
            pointerEvents: controlsVisible ? (showUIOverlaysMode === 'enable' ? 'auto' : 'none') : 'none'
          }}
        >
          
          {/* Seekbar timeline row */}
          {(showPlayBar || showTimeDisplay || hoveredSetting === 'showPlayBar' || hoveredSetting === 'showTimeDisplay') && (
            <div className="seekbar-row">
              {(showPlayBar || hoveredSetting === 'showPlayBar') && (
                <div 
                  className={`scrub-container-premium ${uiConfig.blockSeekingCompletely ? 'seeking-blocked' : ''} ${getHighlightClass('showPlayBar') || getHighlightClass('blockSeekingCompletely')}`}
                  style={{
                    opacity: showPlayBarMode === 'enable' ? 1 : 0.5,
                    pointerEvents: showPlayBarMode === 'enable' ? 'auto' : 'none'
                  }}
                >
                  <div className="scrub-track-bg"></div>
                  <div className="scrub-track-buffered" style={{ width: `${effectiveDuration > 0 ? Math.min(100, Math.max(0, bufferedPercent)) : 0}%` }}></div>
                  <div className="scrub-track-progress" style={{ width: `${effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0}%` }}></div>

                  {/* Bookmark Timeline Dots */}
                  {effectiveDuration > 0 && bookmarks.map((bm) => {
                    const percent = Math.min(100, Math.max(0, (bm.time / effectiveDuration) * 100));
                    const isOutro = bm.isOutro || bm.category === 'Outro';
                    const isIntro = bm.isIntro || bm.category === 'Intro';
                    const isOutroWithoutEnd = isOutro && (bm.endTime === undefined || bm.endTime === null);
                    const effectiveEndTime = isOutroWithoutEnd ? effectiveDuration : bm.endTime;
                    const hasRange = (effectiveEndTime !== undefined && effectiveEndTime !== null && effectiveEndTime > bm.time) || isOutro;
                    const endPercent = hasRange ? Math.min(100, Math.max(0, ((effectiveEndTime || effectiveDuration) / effectiveDuration) * 100)) : percent;
                    const widthPercent = Math.max(0, endPercent - percent);
                    
                    if (hasRange) {
                      return (
                        <div 
                          key={bm.id}
                          className={`timeline-bookmark-range ${isIntro ? 'intro-range' : isOutro ? 'outro-range' : ''}`}
                          style={{ 
                            left: `${percent}%`,
                            width: `${widthPercent}%`,
                            position: 'absolute',
                            height: '4px',
                            background: bm.category === 'Hot Scene' ? 'rgba(239, 68, 68, 0.8)' : isOutro ? 'rgba(168, 85, 247, 0.8)' : 'rgba(59, 130, 246, 0.8)',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            zIndex: 4
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (uiConfig.blockSeekingCompletely) return;
                            if (videoRef.current) {
                              videoRef.current.currentTime = bm.time;
                              setCurrentTime(bm.time);
                            }
                          }}
                        >
                          <div className="timeline-bookmark-tooltip">
                            <span className="tooltip-label">{bm.label || (isIntro ? 'Intro' : isOutro ? 'Outro' : 'Bookmark')} {isOutro ? '(Outro)' : '(Range)'}</span>
                            <span className="tooltip-time">{formatTime(bm.time)} - {isOutroWithoutEnd ? 'End' : formatTime(effectiveEndTime!)}</span>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div 
                        key={bm.id}
                        className={`timeline-bookmark-dot ${hoveredSetting === 'autoSkipIntroOutro' ? 'highlight-active' : ''}`}
                        style={{ 
                          left: `${percent}%`,
                          position: 'absolute',
                          height: '100%',
                          width: '4px',
                          background: bm.category === 'Hot Scene' ? 'rgba(239, 68, 68, 0.8)' : isOutro ? 'rgba(168, 85, 247, 0.8)' : 'rgba(59, 130, 246, 0.8)',
                          borderRadius: '2px',
                          zIndex: 4,
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (uiConfig.blockSeekingCompletely) return;
                          if (videoRef.current) {
                            videoRef.current.currentTime = bm.time;
                            setCurrentTime(bm.time);
                          }
                        }}
                      >
                        <div className="timeline-bookmark-tooltip">
                          <span className="tooltip-label">{bm.label || (isIntro ? 'Intro' : isOutro ? 'Outro' : 'Bookmark')}</span>
                          <span className="tooltip-time">{formatTime(bm.time)}</span>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Hover / Scrub Preview Tooltip (Always rendered to keep preview video loaded and warm) */}
                  <div 
                    className={`scrub-hover-tooltip ${(hoverTime || isScrubbing) ? 'visible' : ''}`} 
                    style={{ left: `${isScrubbing ? (effectiveDuration > 0 ? Math.min(100, Math.max(0, ((scrubTime !== null ? scrubTime : currentTime) / effectiveDuration) * 100)) : 0) : hoverPercent}%` }}
                  >
                    <div className="scrub-hover-preview-box">
                      <video
                        ref={previewVideoRef}
                        src={video.url}
                        crossOrigin={video.playbackMode === 'advanced' ? 'anonymous' : undefined}
                        className="scrub-hover-preview-video"
                        muted
                        playsInline
                      />
                    </div>
                    {showTimeDisplay && (
                      <div className="scrub-hover-time">
                        {isScrubbing ? formatTime(scrubTime !== null ? scrubTime : currentTime) : hoverTime}
                      </div>
                    )}
                  </div>
 
                   <input
                     type="range"
                     min={0}
                     max={effectiveDuration || 100}
                     step={0.1}
                     value={isScrubbing && scrubTime !== null ? scrubTime : currentTime}
                    onChange={handleSeek}
                    onMouseMove={handleProgressMouseMove}
                    onMouseLeave={handleProgressMouseLeave}
                    onMouseDown={() => {
                      if (debouncedSeekTimeoutRef.current) {
                        clearTimeout(debouncedSeekTimeoutRef.current);
                      }
                      setIsScrubbing(true);
                      setScrubTime(currentTime);
                    }}
                    onTouchStart={() => {
                      if (debouncedSeekTimeoutRef.current) {
                        clearTimeout(debouncedSeekTimeoutRef.current);
                      }
                      setIsScrubbing(true);
                      setScrubTime(currentTime);
                    }}
                    className="scrub-bar-premium"
                  />
                </div>
              )}
              {(showTimeDisplay || hoveredSetting === 'showTimeDisplay') && (
                <div 
                  className={`time-display-clean ${getHighlightClass('showTimeDisplay')}`}
                  style={{
                    opacity: showTimeDisplayMode === 'enable' ? 1 : 0.5
                  }}
                >
                  {formatTime(duration - currentTime)}
                </div>
              )}
            </div>
          )}

          {/* Bottom controls bar: PiP on left, Audio & Subtitles in center, Fullscreen on right */}
          {(!hideUIOverlays || hoveredSetting === 'showUIOverlays' || hoveredSetting === 'showVolumeControl' || hoveredSetting === 'showFullscreen') && (
            <div className={`bottom-controls-bar ${getHighlightClass('showUIOverlays')}`}>
              <div className="bottom-controls-left-spacer">
                <button className="control-btn-pip" onClick={togglePiP} title="Picture in Picture">
                  <MonitorPlay size={22} />
                </button>                 {(showVolumeControl || hoveredSetting === 'showVolumeControl') && (
                  <div 
                    className={`volume-control-group-premium ${getHighlightClass('showVolumeControl')}`}
                    style={{
                      opacity: showVolumeControlMode === 'enable' ? 1 : 0.5,
                      pointerEvents: showVolumeControlMode === 'enable' ? 'auto' : 'none'
                    }}
                    onWheel={(e) => {
                      e.preventDefault();
                      setIsMuted(false);
                      setVolume(prev => {
                        const delta = -e.deltaY * 0.00025;
                        const nextVol = Math.max(0.0, Math.min(1.0, prev + delta));
                        return nextVol;
                      });
                    }}
                  >
                    <button 
                      className="control-btn-volume" 
                      onClick={() => {
                        setIsMuted(prev => !prev);
                      }}
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
                    </button>
                    <div className="volume-slider-container-premium">
                      <input 
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        onWheel={(e) => {
                          // Prevent default range wheel scroll to let parent's high-res free wheel scroll control take over
                          e.preventDefault();
                        }}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const nextVol = parseFloat(e.target.value);
                          setVolume(nextVol);
                          setIsMuted(nextVol === 0);
                        }}
                        className="volume-slider-premium"
                        style={{
                          background: `linear-gradient(to right, #007aff 0%, #007aff ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.08) ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.08) 100%)`
                        }}
                      />
                    </div>
                    <span className="volume-percent-text-premium">
                      {Math.round((isMuted ? 0 : volume) * 100)}
                    </span>
                  </div>
                )}
              </div>

              <div className="bottom-controls-center-group">
                <div 
                  className="popover-wrapper"
                  onMouseEnter={() => {
                    if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
                    setShowAudioSubMenu(true);
                  }}
                  onMouseLeave={() => {
                    audioSubTimeoutRef.current = setTimeout(() => {
                      setShowAudioSubMenu(false);
                    }, 150);
                  }}
                >
                  <button className="audio-sub-trigger-btn">
                    <MessageSquare size={18} />
                    <span>Audio & Subtitles</span>
                  </button>
                  
                  {showAudioSubMenu && (
                    <AudioSubPopover
                      audioStreams={audioStreams}
                      audioTracks={audioTracks}
                      selectedAudioTrack={selectedAudioTrack}
                      setSelectedAudioTrack={handleSelectAudioTrack}
                      setActiveAudioStreamIndex={setActiveAudioStreamIndex}
                      handleSelectEmbeddedAudio={handleSelectEmbeddedAudio}
                      customAudioInputRef={customAudioInputRef}
                      subtitleStreams={subtitleStreams}
                      subtitleTracks={subtitleTracks}
                      selectedSubTrack={selectedSubTrack}
                      setSelectedSubTrack={handleSelectSubTrack}
                      setActiveSubStreamIndex={setActiveSubStreamIndex}
                      handleSelectEmbeddedSubtitle={handleSelectEmbeddedSubtitle}
                      customSubInputRef={customSubInputRef}
                      currentTime={currentTime}
                      videoRef={videoRef}
                      setCurrentTime={setCurrentTime}
                      setShowAudioSubMenu={setShowAudioSubMenu}
                      audioSubTimeoutRef={audioSubTimeoutRef}
                      getLangLabel={getLangLabel}
                      formatTime={formatTime}
                      cleanSubtitleText={cleanSubtitleText}
                      subSettings={subSettings}
                      onUpdateSubSettings={onUpdateSubSettings}
                      audioBoost={audioBoost}
                      setAudioBoost={handleSetAudioBoost}
                      openSubtitles={openSubtitles}
                      isOpenSubLoading={isOpenSubLoading}
                      onDownloadOpenSubtitle={downloadOpenSubtitle}
                      hasFetchedOpenSubtitles={hasFetchedOpenSubtitles}
                      onFetchOpenSubtitles={fetchOpenSubtitles}
                    />
                  )}
                </div>

                <div 
                  className="popover-wrapper"
                  style={{ marginLeft: '50px' }}
                  onMouseEnter={() => {
                    if (bookmarksTimeoutRef.current) clearTimeout(bookmarksTimeoutRef.current);
                    setShowBookmarksPopover(true);
                  }}
                  onMouseLeave={() => {
                    bookmarksTimeoutRef.current = setTimeout(() => {
                      setShowBookmarksPopover(false);
                    }, 150);
                  }}
                >
                  <button 
                    className="control-btn-bookmark-list" 
                    onClick={() => setShowBookmarksPopover(prev => !prev)} 
                    title="Bookmarks"
                  >
                    <BookmarkIcon size={20} />
                  </button>

                  {showBookmarksPopover && (
                    <BookmarkPanel
                      bookmarks={bookmarks}
                      onJump={(time) => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = time;
                          setCurrentTime(time);
                        }
                      }}
                      onEdit={(bm) => {
                        setEditingBookmark(bm);
                        setShowAddDialog(true);
                        setShowBookmarksPopover(false);
                      }}
                      onDelete={handleDeleteBookmark}
                      onAdd={() => {
                        if (videoRef.current) {
                          setEditingBookmark(undefined);
                          setMarkingStartTime(Math.round(videoRef.current.currentTime));
                          setShowBookmarksPopover(false);
                        }
                      }}
                      onClose={() => setShowBookmarksPopover(false)}
                    />
                  )}
                </div>

              </div>

              <div className="bottom-controls-right-group">
                {markingStartTime !== null && (
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        const startTime = markingStartTime;
                        const endTime = Math.round(videoRef.current.currentTime);
                        setMarkingStartTime(null);
                        setEditingBookmark({
                          id: '',
                          time: startTime,
                          endTime: endTime,
                          title: '',
                          label: '',
                          category: 'Nudity',
                          description: '',
                          createdAt: '',
                          updatedAt: ''
                        });
                        setShowAddDialog(true);
                      }
                    }}
                    className="marking-hud-button-controls marking-hud-button-desktop"
                    style={{
                      background: '#e50914',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '20px',
                      padding: '6px 14px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(229, 9, 20, 0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontFamily: 'Outfit, sans-serif',
                      animation: 'pulseMarking 1.5s infinite alternate',
                      height: '36px',
                      marginRight: '15px'
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#fff',
                      animation: 'flashDot 1s infinite'
                    }} />
                    <span>Marking... tap to end ({formatTime(markingStartTime)} - {formatTime(currentTime)})</span>
                  </button>
                )}
                
                {/* Speed Button & Popover */}
                <div 
                  style={{ position: 'relative', marginRight: '50px' }}
                  onMouseEnter={() => setShowSpeedMenu(true)}
                  onMouseLeave={() => setShowSpeedMenu(false)}
                >
                  <button 
                    className="control-btn-speed" 
                    onClick={() => setShowSpeedMenu(prev => !prev)} 
                    title="Playback Speed"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px',
                      opacity: 0.8,
                      transition: 'opacity 0.2s',
                      outline: 'none',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                  >
                    {playbackRate}x
                  </button>
                  {showSpeedMenu && (
                    <SpeedPopover
                      playbackRate={playbackRate}
                      setPlaybackRate={setPlaybackRate}
                      videoRef={videoRef}
                      onClose={() => setShowSpeedMenu(false)}
                    />
                  )}
                </div>

                <button 
                  className="control-btn-settings" 
                  onClick={() => setShowSettingsPanel(prev => !prev)} 
                  title="Player Settings"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px',
                    opacity: 0.8,
                    transition: 'opacity 0.2s',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                >
                  <Settings size={22} />
                </button>

                {(showFullscreen || hoveredSetting === 'showFullscreen') && (
                  <button 
                    className={`control-btn-fullscreen ${getHighlightClass('showFullscreen')}`} 
                    onClick={toggleFullscreen} 
                    title="Fullscreen"
                    style={{
                      opacity: showFullscreenMode === 'enable' ? 1 : 0.5,
                      pointerEvents: showFullscreenMode === 'enable' ? 'auto' : 'none'
                    }}
                  >
                    {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Centered UI Settings Modal */}
      {showSettingsPanel && (
        <div 
          className="settings-modal-overlay animate-overlay-fade-in" 
          onClick={() => {
            setShowSettingsPanel(false);
            setIsSettingsExpanded(false);
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'none',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            zIndex: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '0'
          }}
        >
          <div 
            className="settings-modal-card animate-slide-in-right" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(18, 18, 18, 0.96)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRight: 'none',
              borderRadius: '16px 0 0 16px',
              padding: '1.25rem 1rem',
              width: isSettingsExpanded ? '280px' : '154px',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              fontFamily: 'sans-serif',
              transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>UI Settings</h3>
              <button 
                onClick={() => {
                  setShowSettingsPanel(false);
                  setIsSettingsExpanded(false);
                }}
                style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s ease' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
              >
                <X size={18} />
              </button>
            </div>
            
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: isSettingsExpanded ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
                gap: '0.6rem',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              {!isSettingsExpanded ? (
                <>
                  {(settingsOrder || [
                    'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                    'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                  ]).slice(0, 5).map((key) => renderSettingsButton(key))}
                  
                  {/* Esports Overlay Toggle */}
                  <button
                    onClick={() => {
                      const nextVal = !vctOverlayEnabled;
                      setVctOverlayEnabled(nextVal);
                      localStorage.setItem('vct_overlay_enabled', nextVal ? 'true' : 'false');
                      window.dispatchEvent(new Event('storage'));
                    }}
                    title="Toggle Esports Live Overlay"
                    className="settings-icon-toggle"
                    style={{
                      background: vctOverlayEnabled ? 'rgba(46, 204, 113, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${vctOverlayEnabled ? 'rgba(46, 204, 113, 0.5)' : 'rgba(255, 255, 255, 0.1)'}`,
                      color: vctOverlayEnabled ? '#2ecc71' : 'rgba(255, 255, 255, 0.8)',
                      borderRadius: '12px',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Activity size={22} />
                  </button>

                  {/* 7th item is the uncollapse button */}
                  <button
                    onClick={() => setIsSettingsExpanded(true)}
                    title="Show More Settings"
                    className="settings-icon-toggle"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: '12px',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'background 0.2s, border-color 0.2s',
                      height: '54px',
                      width: '54px'
                    }}
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              ) : (
                <>
                  {(settingsOrder || [
                    'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                    'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                  ]).map((key) => renderSettingsButton(key))}

                  {/* Collapse button inside the 4x4 grid */}
                  <button
                    onClick={() => setIsSettingsExpanded(false)}
                    title="Show Less Settings"
                    className="settings-icon-toggle"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: '12px',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'background 0.2s, border-color 0.2s',
                      height: '54px',
                      width: '54px'
                    }}
                  >
                    <ChevronLeft size={22} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Add Bookmark Dialog Overlay */}
      {showAddDialog && (
        <BookmarkModal
          initialTime={Math.round(videoRef.current?.currentTime || 0)}
          initialEndTime={Math.round((videoRef.current?.currentTime || 0) + 90)}
          initialBookmark={editingBookmark}
          videoElement={videoRef.current}
          videoTitle={video.title || video.fileName || "Video"}
          onSave={(bm) => {
            handleSaveBookmark(bm as Bookmark);
            setShowAddDialog(false);
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}



      {markingStartTime !== null && (
        <button
          onClick={() => {
            if (videoRef.current) {
              const startTime = markingStartTime;
              const endTime = Math.round(videoRef.current.currentTime);
              setMarkingStartTime(null);
              setEditingBookmark({
                id: '',
                time: startTime,
                endTime: endTime,
                title: '',
                label: '',
                category: 'Nudity',
                description: '',
                createdAt: '',
                updatedAt: ''
              });
              setShowAddDialog(true);
            }
          }}
          className="marking-hud-button-mobile"
          style={{
            position: 'absolute',
            bottom: controlsVisible ? '120px' : '45px',
            right: '1.5rem',
            background: '#e50914',
            color: '#ffffff',
            border: 'none',
            borderRadius: '24px',
            padding: '10px 20px',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(229, 9, 20, 0.4)',
            zIndex: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: 'Outfit, sans-serif',
            animation: 'pulseMarking 1.5s infinite alternate',
            transition: 'bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#fff',
            animation: 'flashDot 1s infinite'
          }} />
          <span>Marking... tap to end ({formatTime(markingStartTime)} - {formatTime(currentTime)})</span>
        </button>
      )}

      <input 
        type="file" 
        ref={customAudioInputRef} 
        style={{ display: 'none' }} 
        accept="audio/*" 
        onChange={handleCustomAudioUpload}
      />
      <input 
        type="file" 
        ref={customSubInputRef} 
        style={{ display: 'none' }} 
        accept=".srt,.vtt" 
        onChange={handleCustomSubUpload}
      />

      {/* Flashing HUD for Keyboard Actions */}
      {flashHud && (
        <div className="flash-hud-overlay">
          <div className="flash-hud-icon-wrapper animate-flash-hud">
            {flashHud === 'play' && <Play size={40} fill="white" strokeWidth={1.2} style={{ marginLeft: '4px' }} />}
            {flashHud === 'pause' && <Pause size={40} fill="white" strokeWidth={1.2} />}
            {flashHud === 'rewind' && (
              <div className="seek-hud-container">
                <RotateCcw size={40} strokeWidth={1.2} />
                <span className="seek-hud-text" style={{ fontSize: '9px', top: '55%' }}>10</span>
              </div>
            )}
            {flashHud === 'forward' && (
              <div className="seek-hud-container">
                <RotateCw size={40} strokeWidth={1.2} />
                <span className="seek-hud-text" style={{ fontSize: '9px', top: '55%' }}>10</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Track Selection Switch Toast Overlay */}
      {switchToast.visible && (
        <div 
          className="switch-toast-overlay animate-switch-toast"
          style={{ animationDuration: `${toastDuration}s` }}
        >
          <div className="switch-toast-content">
            {switchToast.text}
          </div>
        </div>
      )}

      {/* Volume Toast Overlay */}
      <div className={`volume-toast-overlay ${volumeToast.visible ? 'visible' : ''}`}>
        <div className="volume-toast-content-vertical">
          <div className="volume-toast-bar-vertical">
            {volumeToast.boost > 100 ? (
              <div 
                className="volume-toast-bar-fill-vertical" 
                style={{ height: `${volumeToast.boost - 100}%`, background: '#ff7a00', backgroundColor: '#ff7a00' }}
              >
                <div className="volume-toast-bar-cap-vertical" style={{ background: '#ffffff', backgroundColor: '#ffffff' }} />
              </div>
            ) : (
              <div className="volume-toast-bar-fill-vertical" style={{ height: `${volumeToast.volume * 100}%` }}>
                {volumeToast.volume > 0 && <div className="volume-toast-bar-cap-vertical" />}
              </div>
            )}
          </div>
          <span className="volume-toast-text-vertical">
            {volumeToast.isMuted ? 'MUTE' : (volumeToast.boost > 100 ? volumeToast.boost : Math.round(volumeToast.volume * 100))}
          </span>
        </div>
      </div>

      {/* Show UI Overlays Workaround Button */}
      {hideUIOverlays && (
        <button
          onClick={() => {
            updatePlayerSetting('hideUIOverlays', false);
            triggerSwitchToast("Overlays Enabled");
          }}
          title="Show UI Overlays (Workaround)"
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 140,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            opacity: 0.3,
            transition: 'opacity 0.2s, background 0.2s, transform 0.1s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.8)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
        >
          <Eye size={18} />
        </button>
      )}

      {playbackError && (
        <div className="playback-error-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="playback-error-box glass-panel animate-fade-in">
            <AlertCircle size={48} className="error-icon" />
            <h3>Playback Failed</h3>
            <p className="error-desc">{playbackError}</p>
            <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '0.5rem', padding: '0.6rem 1.8rem', fontWeight: 600 }}>
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Styles */}
      <style>{`
        @media (max-width: 768px) {
          .marking-hud-button-desktop {
            display: none !important;
          }
          .marking-hud-button-mobile {
            display: flex !important;
          }
        }
        @media (min-width: 769px) {
          .marking-hud-button-desktop {
            display: flex !important;
          }
          .marking-hud-button-mobile {
            display: none !important;
          }
        }

        /* Skip Button Premium */
        @keyframes skipProgressPremium {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes skipFadePremium {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          5% { opacity: 1; transform: translateY(0) scale(1); }
          90% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(0) scale(1); pointer-events: none; }
        }
        @keyframes heartbeat {
          0% {
            box-shadow: 0 0 0 0 var(--heartbeat-color, var(--destructive));
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 0 6px transparent;
            transform: scale(1.03);
          }
          100% {
            box-shadow: 0 0 0 0 transparent;
            transform: scale(1);
          }
        }
        .skip-btn-premium {
          position: absolute;
          right: 40px;
          bottom: 140px;
          z-index: 90;
          padding: 14px 28px;
          border-radius: 4px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          gap: 12px;
          overflow: hidden;
          transition: background 0.2s, color 0.2s;
        }
        .animate-heartbeat {
          animation: skipFadePremium 7s cubic-bezier(0.4, 0, 0.2, 1) forwards, heartbeat 2s infinite ease-in-out;
        }
        .skip-btn-premium:hover {
          background: white;
          color: black;
          animation-play-state: paused, paused;
        }
        .skip-btn-premium:hover .skip-progress-bar {
          animation-play-state: paused;
        }
        .skip-progress-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: #e50914;
          animation: skipProgressPremium 7s linear forwards;
        }

        .player-container {
          position: fixed;
          inset: 0;
          z-index: 500;
          background-color: #000000;
          overflow: hidden;
          user-select: none;
        }
        .show-cursor {
          cursor: default;
        }
        .hide-cursor {
          cursor: none;
        }
        .main-video-element {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        /* Overlays */
        .player-overlay {
          position: absolute;
          left: 0;
          right: 0;
          z-index: 20;
          transition: opacity 0.15s ease, transform 0.15s ease;
          pointer-events: auto;
        }
        .top-overlay-clean {
          top: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
          padding: 2.5rem 3.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          box-sizing: border-box;
        }
        .top-title-clean {
          font-size: 1.3rem;
          font-weight: 500;
          color: white;
          margin: 0;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
          max-width: 100%;
        }
        /* Timeline Bookmarks & Dots */
        .timeline-bookmark-dot {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background-color: #ffffff;
          border: 1px solid #000000;
          z-index: 25;
          cursor: pointer;
          pointer-events: auto;
          transition: transform 0.15s ease, background-color 0.15s ease;
        }
        .timeline-bookmark-dot:hover {
          transform: translate(-50%, -50%) scale(1.5);
          z-index: 30;
        }
        .timeline-bookmark-dot:not(.intro-dot):not(.outro-dot):hover {
          background-color: #e50914 !important;
        }
        .timeline-bookmark-dot.intro-dot {
          background-color: #3b82f6;
        }
        .timeline-bookmark-dot.outro-dot {
          background-color: #10b981;
        }
        .timeline-bookmark-tooltip {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%) translateY(5px);
          background: rgba(18, 18, 18, 0.95);
          color: #ffffff;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s ease, transform 0.15s ease;
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
          font-family: sans-serif;
        }
        .timeline-bookmark-tooltip .tooltip-label {
          font-weight: 600;
        }
        .timeline-bookmark-tooltip .tooltip-time {
          color: rgba(255, 255, 255, 0.6);
        }
        .timeline-bookmark-dot:hover .timeline-bookmark-tooltip,
        .timeline-bookmark-range:hover .timeline-bookmark-tooltip {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
          z-index: 99;
        }
        .highlight-active-blue {
          outline: 3px solid #3b82f6 !important;
          outline-offset: 4px !important;
          border-radius: 6px !important;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.8) !important;
          background: rgba(59, 130, 246, 0.15) !important;
          transition: all 0.2s ease !important;
        }
        .highlight-active-orange {
          outline: 3px solid #f59e0b !important;
          outline-offset: 4px !important;
          border-radius: 6px !important;
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.8) !important;
          background: rgba(245, 158, 11, 0.15) !important;
          transition: all 0.2s ease !important;
        }
        .highlight-active-red {
          outline: 3px solid #ef4444 !important;
          outline-offset: 4px !important;
          border-radius: 6px !important;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.8) !important;
          background: rgba(239, 68, 68, 0.15) !important;
          transition: all 0.2s ease !important;
        }

        /* Right settings drawer panel */
        .settings-icon-toggle {
          width: 54px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.6);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          outline: none;
        }
        .settings-icon-toggle:hover:not(:disabled):not(.disabled) {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }
        .settings-icon-toggle.active, .settings-icon-toggle.active-blue {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
        }
        .settings-icon-toggle.active:hover, .settings-icon-toggle.active-blue:hover {
          background: #2563eb;
          border-color: #2563eb;
          transform: translateY(-2px);
        }
        .settings-icon-toggle.active-orange {
          background: #f59e0b;
          border-color: #f59e0b;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(245, 158, 11, 0.4);
        }
        .settings-icon-toggle.active-orange:hover {
          background: #d97706;
          border-color: #d97706;
          transform: translateY(-2px);
        }
        .settings-icon-toggle.active-red {
          background: #ef4444;
          border-color: #ef4444;
          color: #ffffff;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
        }
        .settings-icon-toggle.active-red:hover {
          background: #dc2626;
          border-color: #dc2626;
          transform: translateY(-2px);
        }
        .settings-icon-toggle:disabled, .settings-icon-toggle.disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .custom-toggle-switch {
          position: relative;
          width: 40px;
          height: 22px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 11px;
          cursor: pointer;
          transition: background-color 0.2s ease;
          flex-shrink: 0;
        }
        .custom-toggle-switch.active {
          background: #3b82f6;
        }
        .custom-toggle-switch.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .custom-toggle-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          background: #ffffff;
          border-radius: 50%;
          transition: transform 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        .custom-toggle-switch.active .custom-toggle-knob {
          transform: translateX(18px);
        }
        .drawer-add-btn {
          background: #e50914;
          border: none;
          color: #ffffff;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .drawer-add-btn:hover {
          background: #b80710;
        }
        .no-bookmarks-text {
          color: rgba(255, 255, 255, 0.4);
          font-size: 0.85rem;
          font-style: italic;
          margin: 0;
        }
        .bookmarks-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 350px;
          overflow-y: auto;
        }
        .drawer-bookmark-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-left: 2px solid transparent;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer;
        }
        .drawer-bookmark-item:hover {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.06) 100%);
          border-left-color: rgba(139, 92, 246, 0.6);
          border-color: rgba(255, 255, 255, 0.08);
          transform: translateX(2px);
          box-shadow: -2px 0 8px rgba(139, 92, 246, 0.15);
        }
        .bookmark-item-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          min-width: 0;
        }
        .bookmark-item-badge {
          font-size: 0.6rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          white-space: nowrap;
        }
        .bookmark-item-badge.badge-intro {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(99, 102, 241, 0.2) 100%);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.25);
        }
        .bookmark-item-badge.badge-outro {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(52, 211, 153, 0.2) 100%);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .bookmark-item-label {
          color: #ffffff;
          font-size: 0.82rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          font-weight: 500;
        }
        .bookmark-item-time {
          color: rgba(255, 255, 255, 0.45);
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-variant-numeric: tabular-nums;
        }
        .bookmark-delete-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          padding: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s ease;
        }
        .bookmark-delete-btn:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.12);
        }



        /* Animations */
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .seeking-blocked {
          pointer-events: none !important;
        }

        /* Odometer Clock Styles */
        .odo-clock-container {
          display: inline-flex;
          align-items: center;
          font-family: monospace;
          line-height: 1;
        }
        .odo-digit-container {
          display: inline-block;
          height: 1.1em;
          line-height: 1.1em;
          overflow: hidden;
          position: relative;
          width: 0.65em;
          text-align: center;
          mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
        }
        .odo-digit-strip {
          display: flex;
          flex-direction: column;
          transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .odo-digit-strip span {
          height: 1.1em;
          display: inline-block;
        }
        .odo-separator {
          display: inline-block;
          height: 1.1em;
          line-height: 1.1em;
          margin: 0 1px;
        }

        .top-title-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
          flex: 1;
          min-width: 0;
          margin: 0 1.5rem;
          max-width: calc(100% - 120px);
        }
        .playback-mode-badge-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .playback-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          position: relative;
        }
        .badge-advanced {
          background-color: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .badge-advanced .badge-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }
        .badge-native {
          cursor: help;
          background-color: rgba(249, 115, 22, 0.15);
          color: #f97316;
          border: 1px solid rgba(249, 115, 22, 0.3);
        }
        .badge-native .badge-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: #f97316;
          box-shadow: 0 0 8px #f97316;
        }
        .badge-native .tooltip-text {
          visibility: hidden;
          width: 240px;
          background-color: rgba(20, 20, 20, 0.95);
          color: #fff;
          text-align: center;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 8px 12px;
          position: absolute;
          z-index: 1000;
          top: 130%;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 0.3s;
          font-size: 0.75rem;
          line-height: 1.3;
          pointer-events: none;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          text-transform: none;
          font-weight: normal;
          letter-spacing: normal;
        }
        .badge-native:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
        }
        .native-badge-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .btn-enable-advanced {
          background: transparent;
          border: 1px dashed rgba(255, 255, 255, 0.4);
          font-size: 0.7rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 4px;
          color: #fff;
          transition: all 0.2s;
          cursor: pointer;
        }
        .btn-enable-advanced:hover {
          border-style: solid;
          border-color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }
        .cast-btn, .close-btn {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease, opacity 0.15s ease;
          flex-shrink: 0;
        }
        .cast-btn:hover, .close-btn:hover {
          transform: scale(1.15);
          opacity: 0.8;
        }
        .floating-rating-prompt {
          position: absolute;
          top: 80px;
          right: 20px;
          background: rgba(10, 10, 10, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          padding: 0.9rem 1.1rem;
          z-index: 200;
          box-shadow: 0 10px 25px rgba(0,0,0,0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          width: 250px;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          color: #ffffff;
        }
        .rating-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.82rem;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
        }
        .rating-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
        }
        .rating-close:hover {
          color: #ffffff;
        }
        .rating-stars {
          display: flex;
          gap: 0.35rem;
          justify-content: center;
          margin-top: 0.25rem;
        }
        .star-btn {
          background: none;
          border: none;
          font-size: 1.8rem;
          color: rgba(255, 255, 255, 0.15);
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: transform 0.15s, color 0.15s, text-shadow 0.15s;
        }
        .star-btn:hover, .star-btn.active {
          color: #f1c40f;
          text-shadow: 0 0 8px rgba(241, 196, 15, 0.6);
          transform: scale(1.18);
        }
        .rating-thanks {
          font-size: 0.75rem;
          color: #2ecc71;
          text-align: center;
          font-weight: 600;
        }
        .player-lock-indicator {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ffffff;
          padding: 0.55rem;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          z-index: 200;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .player-lock-indicator:hover {
          background: rgba(229, 9, 20, 0.95);
          border-color: rgba(229, 9, 20, 0.95);
          transform: scale(1.1);
        }

        .bottom-overlay {
          bottom: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
          padding: 2.5rem 3.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .player-overlay.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .player-overlay.hidden {
          opacity: 0;
          pointer-events: none;
        }
        .player-overlay.hidden.top-overlay-clean {
          transform: translateY(-12px);
        }
        .player-overlay.hidden.bottom-overlay {
          transform: translateY(12px);
        }

        /* Center HUD clean style buttons */
        .center-controls-hud {
          position: absolute;
          inset: 0;
          z-index: 15;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: clamp(4rem, 15vw, 12rem);
          pointer-events: none;
          transition: opacity 0.15s ease;
        }
        .center-controls-hud.hidden {
          opacity: 0;
        }
        .center-controls-hud.visible {
          opacity: 1;
        }
        .hud-btn-clean {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease, filter 0.15s ease;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          opacity: 0.75;
        }
        .hud-btn-clean:hover {
          transform: scale(1.18);
          opacity: 1;
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.4));
        }
        .seek-hud-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .seek-hud-text {
          position: absolute;
          font-size: 13px;
          font-weight: 500;
          color: white;
          top: 55%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        /* Timeline / seekbar */
        .seekbar-row {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 1.5rem;
        }
        .time-display-clean {
          font-size: 0.95rem;
          color: #ffffff;
          font-weight: 500;
          white-space: nowrap;
        }

        .scrub-container-premium {
          position: relative;
          width: 100%;
          height: 8px;
          display: flex;
          align-items: center;
        }
        .scrub-track-bg {
          position: absolute;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          z-index: 1;
        }
        .scrub-track-buffered {
          position: absolute;
          left: 0;
          height: 4px;
          background: rgba(255, 255, 255, 0.35);
          border-radius: 2px;
          z-index: 2;
          transition: width 0.15s ease;
        }
        .scrub-track-progress {
          position: absolute;
          left: 0;
          height: 4px;
          background: #e50914;
          border-radius: 2px 0 0 2px;
          z-index: 3;
        }
        .scrub-bar-premium {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          margin: 0;
          cursor: pointer;
          z-index: 6;
          outline: none;
        }
        .scrub-bar-premium::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #e50914;
          cursor: pointer;
          transform: scale(0);
          opacity: 0;
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
          box-shadow: 0 0 10px rgba(229, 9, 20, 0.8);
          z-index: 10;
        }
        .scrub-container-premium:hover .scrub-bar-premium::-webkit-slider-thumb,
        .scrub-bar-premium:active::-webkit-slider-thumb {
          transform: scale(1.4);
          opacity: 1;
        }
        .scrub-bar-premium::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 50%;
          background: #e50914;
          cursor: pointer;
          transform: scale(0);
          opacity: 0;
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
          box-shadow: 0 0 10px rgba(229, 9, 20, 0.8);
          z-index: 10;
        }
        .scrub-container-premium:hover .scrub-bar-premium::-moz-range-thumb,
        .scrub-bar-premium:active::-moz-range-thumb {
          transform: scale(1.4);
          opacity: 1;
        }
        .scrub-container-premium:hover .scrub-track-bg,
        .scrub-container-premium:hover .scrub-track-buffered,
        .scrub-container-premium:hover .scrub-track-progress,
        .scrub-container-premium:hover .scrub-track-progress,
        .scrub-container-premium:hover .timeline-bookmark-range {
          height: 6px !important;
        }

        .scrub-hover-tooltip {
          position: absolute;
          bottom: 24px;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: none;
          z-index: 50;
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .scrub-hover-tooltip.visible {
          opacity: 1;
        }
        .scrub-hover-preview-box {
          width: 140px;
          height: 80px;
          background: #000;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0,0,0,0.8);
        }
        .scrub-hover-preview-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .scrub-hover-time {
          background: rgba(15,15,15,0.95);
          color: #ffffff;
          padding: 3px 7px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          border: 1px solid rgba(255,255,255,0.12);
        }

        /* Keyboard only mode to hide only control buttons (play, rewind, forward, etc.) */
        .keyboard-only .center-controls-hud,
        .keyboard-only .bottom-controls-bar,
        .keyboard-only .cast-btn,
        .keyboard-only .close-btn {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Bottom Row controls */
        .bottom-controls-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 0.8rem;
          width: 100%;
        }
        .bottom-controls-left-spacer {
          display: flex;
          align-items: center;
          flex: 1;
        }
        .bottom-controls-center-group {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
        }
        .bottom-controls-right-group {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex: 1;
        }
        .audio-sub-trigger-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          padding: 0.45rem 1.4rem;
          color: white;
          font-size: 0.85rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .audio-sub-trigger-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
          transform: scale(1.03);
        }
        .control-btn-pip, .control-btn-fullscreen, .control-btn-bookmark-list {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.8);
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s, transform 0.2s;
        }
        .control-btn-pip:hover, .control-btn-fullscreen:hover, .control-btn-bookmark-list:hover {
          color: white;
          transform: scale(1.15);
        }

        /* Popovers styling */
        .popover-wrapper {
          position: relative;
        }
        .audio-sub-popover-center {
          position: absolute;
          bottom: 50px;
          left: 50%;
          transform: translateX(-50%);
          max-width: 95vw;
          background: var(--card-bg);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.1rem;
          box-shadow: var(--shadow-xl);
          z-index: 100;
          transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .audio-sub-popover-center::before {
          content: '';
          position: absolute;
          bottom: -25px;
          left: 0;
          right: 0;
          height: 25px;
          background: transparent;
          pointer-events: auto;
        }
        .popover-cols {
          display: grid;
          gap: 1.25rem;
          transition: grid-template-columns 0.3s ease;
        }
        @media (max-width: 1024px) {
          .popover-transcript-col,
          .popover-style-col {
            display: none !important;
          }
          .popover-cols {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (min-width: 1025px) {
          .control-btn-settings {
            display: none !important;
          }
        }
        .popover-transcript-col {
          border-left: 1px solid var(--border-subtle);
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
          max-height: 200px;
        }
        .popover-style-col {
          border-left: 1px solid var(--border-subtle);
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
        }
        .style-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 0.35rem;
          margin-bottom: 0.25rem;
        }
        .style-header-row h4 {
          margin: 0 !important;
          border-bottom: none !important;
          padding-bottom: 0 !important;
          color: var(--text-primary) !important;
        }
        .style-reset-btn-header {
          background: var(--surface);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          cursor: pointer;
          transition: all 0.15s ease;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .style-reset-btn-header:hover {
          background: var(--card-hover-bg);
          color: var(--text-primary);
          border-color: var(--border-focus);
        }
        .style-customizer {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        .style-font-size-row {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 0.85rem;
        }
        .style-row {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .style-label {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.45);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }
        
        /* Font Size Control - Premium Button Group */
        .size-btn-group {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          overflow: hidden;
          padding: 2px;
          align-self: flex-start;
        }
        .size-action-btn {
          background: transparent;
          border: none;
          color: #ffffff;
          width: 28px;
          height: 24px;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }
        .size-action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .size-action-btn:active {
          background: rgba(255, 255, 255, 0.15);
        }
        .size-value-display {
          font-size: 0.8rem;
          font-weight: 600;
          color: #ffffff;
          padding: 0 0.6rem;
          min-width: 38px;
          text-align: center;
        }
        
        /* Font Family Select Premium override for popover style col */
        .popover-style-col .custom-select-trigger {
          font-size: 0.95rem;
          padding: 0.55rem 0.9rem;
          background: rgba(0, 0, 0, 0.35);
        }
        .style-row .custom-select-container {
          width: 100% !important;
        }
        
        /* Subtitle Color Selector - 1 line Text & Background */
        .style-colors-row {
          display: grid;
          grid-template-columns: 1.2fr 2fr;
          gap: 1rem;
        }
        .color-picker-item {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .picker-wrapper {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .color-picker-input-premium {
          -webkit-appearance: none;
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.2);
          width: 30px;
          height: 30px;
          border-radius: 50%;
          cursor: pointer;
          background: none;
          padding: 0;
          transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .color-picker-input-premium:hover {
          transform: scale(1.15);
          border-color: rgba(255,255,255,0.45);
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.5), 0 4px 15px rgba(0,0,0,0.6);
        }
        .color-picker-input-premium:disabled {
          opacity: 0.3;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .color-picker-input-premium::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        .color-picker-input-premium::-webkit-color-swatch {
          border: none;
          border-radius: 50%;
        }
        .bg-clear-btn {
          flex: 1;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.55);
          padding: 0 0.75rem;
          height: 30px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .bg-clear-btn:hover {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.4);
          color: #ef4444;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
        }
        .bg-clear-btn.active {
          background: rgba(59, 130, 246, 0.16) !important;
          border-color: rgba(59, 130, 246, 0.45) !important;
          color: #3b82f6 !important;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
        }
        
        /* Font weight & style buttons row */
        .toggles-row-premium {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.4rem;
        }
        .style-toggle-btn-premium {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.8);
          padding: 0.45rem;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .style-toggle-btn-premium:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .style-toggle-btn-premium.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #ffffff;
        }
        .style-reset-btn-premium {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.4);
          padding: 0.45rem 0.75rem;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .style-reset-btn-premium:hover {
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.04);
        }
        .transcript-search-box {
          margin-bottom: 0.5rem;
        }
        .transcript-search-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          padding: 0.35rem 0.6rem;
          color: white;
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .transcript-search-input:focus {
          border-color: #e50914;
        }
        .transcript-cues-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }
        .transcript-cues-list::-webkit-scrollbar {
          width: 4px;
        }
        .transcript-cues-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }
        .transcript-cue-item {
          display: flex;
          gap: 0.5rem;
          padding: 0.4rem 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          font-size: 0.85rem;
          color: #aaaaaa;
          align-items: flex-start;
          text-align: left;
        }
        .transcript-cue-item:hover {
          background: rgba(255, 255, 255, 0.06);
          color: white;
        }
        .transcript-cue-item.active {
          background: rgba(229, 9, 20, 0.12);
          border-left: 2px solid #e50914;
          color: white;
          font-weight: 500;
        }
        .cue-time {
          color: #e50914;
          font-size: 0.75rem;
          font-family: monospace;
          font-weight: 600;
          white-space: nowrap;
          margin-top: 1px;
        }
        .cue-text {
          flex: 1;
          line-height: 1.3;
          word-break: break-word;
        }
        .popover-col {
          display: flex;
          flex-direction: column;
        }
        .popover-col h4 {
          margin: 0 0 0.6rem 0;
          font-size: 0.95rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 0.35rem;
          color: #ffffff;
          font-weight: 600;
        }
        .popover-options {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          max-height: 140px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .popover-options::-webkit-scrollbar {
          display: none; /* Safari and Chrome */
        }
        .popover-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.55rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.7);
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }
        .popover-option:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
        }
        .popover-option.active {
          background: rgba(229, 9, 20, 0.08);
          border-color: rgba(229, 9, 20, 0.2);
          color: #ffffff;
          font-weight: 500;
        }
        .popover-option input {
          display: none;
        }
        .check-icon {
          color: #e50914;
        }
        .add-custom-btn {
          color: #e50914 !important;
          font-weight: 600 !important;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          margin-top: 0.35rem;
          padding-top: 0.6rem !important;
          border-radius: 0 !important;
          justify-content: center !important;
        }
        .add-custom-btn:hover {
          background: transparent !important;
          color: #ffffff !important;
          text-decoration: underline;
        }

        /* Animations */
        .animate-fade-in {
          animation: fadeInSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes fadeInSlideUp {
          from {
            opacity: 0;
            transform: translate(-50%, 12px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-metadata-slide-in {
          animation: metadataSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes metadataSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-overlay-fade-in {
          animation: overlayFadeIn 0.2s ease forwards;
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes overlayScrimFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-pure {
          animation: fadeInPure 0.2s ease forwards;
        }
        @keyframes fadeInPure {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes bookmarkOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bookmarkDialogSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .dragon-fire-spinner {
          display: block;
          filter: drop-shadow(0 0 10px rgba(255, 69, 0, 0.75));
        }
        .dragon-group {
          animation: spinDragon 1.5s linear infinite;
        }
        .flare-group {
          animation: pulseFlare 0.5s ease-in-out infinite alternate;
        }
        @keyframes spinDragon {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseFlare {
          0% { transform: scale(0.85); opacity: 0.85; }
          100% { transform: scale(1.15); opacity: 1; }
        }
        .buffering-spinner-overlay {
          position: absolute;
          inset: 0;
          z-index: 18;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.25);
        }

        /* Non-blocking Toast notification */
        .non-blocking-toast {
          position: absolute;
          top: 2.2rem;
          right: 3.5rem;
          z-index: 650;
          background: rgba(15,15,15,0.92);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 6px;
          padding: 0.5rem 1.1rem;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #ffffff;
          box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }
        .fly-loader-spin {
          color: #e50914;
          animation: spin 1s linear infinite;
        }
        
        .auto-probing-indicator {
          position: absolute;
          top: 2.2rem;
          right: 3.5rem;
          z-index: 30;
          background: rgba(0,0,0,0.7);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          padding: 0.4rem 0.9rem;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #cccccc;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Flashing HUD styles */
        .flash-hud-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 100;
        }
        .flash-hud-icon-wrapper {
          background: transparent;
          border: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
          width: 84px;
          height: 84px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: none;
        }
        .animate-flash-hud {
          animation: flashHudAnim 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes flashHudAnim {
          0% {
            opacity: 0;
            transform: scale(0.6);
          }
          25% {
            opacity: 1;
            transform: scale(1.1);
          }
          75% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(0.85);
          }
        }

        /* Switch Toast CSS Styles */
        .switch-toast-overlay {
          position: absolute;
          top: 40px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 600;
          pointer-events: none;
        }
        .switch-toast-content {
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
          padding: 0.6rem 1.6rem;
          border-radius: 20px;
          font-size: 0.95rem;
          font-weight: 600;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
        }
        .animate-switch-toast {
          animation: switchToastAnim 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes switchToastAnim {
          0% {
            opacity: 0;
            transform: translate(-50%, -10px) scale(0.95);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
          85% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -10px) scale(0.95);
          }
        }

        @media (max-width: 768px) {
          .top-overlay-clean, .bottom-overlay {
            padding: 1.2rem 1.8rem;
          }
          .audio-sub-popover-center {
            width: 280px;
          }
          .audio-sub-popover-center.has-transcript {
            width: 90vw;
          }
          .audio-sub-popover-center.has-transcript .popover-cols {
            grid-template-columns: 1fr;
            max-height: 350px;
            overflow-y: auto;
          }
          .popover-cols {
            grid-template-columns: 1fr;
          }
          .popover-transcript-col {
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding-left: 0;
            padding-top: 1rem;
            margin-top: 0.5rem;
            max-height: 200px;
          }
          /* Touch-safety thumb size scaling */
          .scrub-container-premium:hover .scrub-bar-premium::-webkit-slider-thumb,
          .scrub-bar-premium:active::-webkit-slider-thumb {
            transform: scale(1.4) !important;
            opacity: 1 !important;
          }
          .scrub-container-premium:hover .scrub-bar-premium::-moz-range-thumb,
          .scrub-bar-premium:active::-moz-range-thumb {
            transform: scale(1.4) !important;
            opacity: 1 !important;
          }
        }

        @media (max-width: 600px) {
          .audio-sub-trigger-btn span {
            display: none !important;
          }
          .audio-sub-trigger-btn {
            padding: 0.55rem !important;
            border-radius: 50% !important;
          }
          .hud-btn-clean svg {
            width: 44px !important;
            height: 44px !important;
          }
          .play-pause-hud-clean svg {
            width: 54px !important;
            height: 54px !important;
          }
          .seek-hud-text {
            font-size: 10px !important;
          }
          .top-title-clean {
            font-size: 1.05rem !important;
            max-width: 70%;
          }
          .volume-toast-overlay {
            top: 25px !important;
            left: 25px !important;
            bottom: auto !important;
          }
        }

        /* Volume Toast HUD (Vertical Metro Style) */
        .volume-toast-overlay {
          position: absolute;
          top: 40px;
          left: 40px;
          z-index: 600;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform: translateY(-10px);
        }
        .volume-toast-overlay.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .volume-toast-content-vertical {
          background: #141414;
          width: 50px;
          height: 180px;
          border-radius: 2px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 18px 0 12px 0;
          box-sizing: border-box;
        }
        .volume-toast-bar-vertical {
          width: 12px;
          height: 120px;
          background: rgba(255, 255, 255, 0.15);
          position: relative;
          margin: 0 auto;
        }
        .volume-toast-bar-fill-vertical {
          width: 100%;
          background: #0078d4; /* Metro Blue */
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          transition: height 0.1s ease;
        }
        .volume-toast-bar-cap-vertical {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: #ffffff; /* White handle cap */
        }
        .volume-toast-text-vertical {
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 700;
          text-align: center;
          color: rgba(255, 255, 255, 0.95);
        }
        .control-btn-volume:hover {
          color: white !important;
        }

        /* Horizontal Volume Slider on Hover */
        /* Redesigned Premium Volume Pill-Container */
        .volume-control-group-premium {
          display: flex;
          align-items: center;
          background: transparent !important;
          border: none !important;
          border-radius: 8px;
          padding: 2px;
          height: 38px;
          box-sizing: border-box;
          gap: 0px;
          margin-left: 0.5rem;
          transition: gap 0.25s cubic-bezier(0.16, 1, 0.3, 1), padding 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .volume-control-group-premium:hover {
          gap: 12px;
          padding-right: 12px;
        }
        .control-btn-volume {
          width: 32px;
          height: 32px;
          background: transparent !important;
          border: 1px solid transparent !important;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.25s ease, border-color 0.25s ease;
          color: rgba(255, 255, 255, 0.8) !important;
          outline: none;
          padding: 0 !important;
          flex-shrink: 0;
        }
        .volume-control-group-premium:hover .control-btn-volume {
          background: rgba(255, 255, 255, 0.12) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
        }
        .volume-control-group-premium:hover .control-btn-volume:hover {
          background: rgba(255, 255, 255, 0.18) !important;
          color: #ffffff !important;
          border-color: rgba(255, 255, 255, 0.25) !important;
        }
        .volume-slider-container-premium {
          width: 0;
          min-width: 0;
          overflow: hidden;
          opacity: 0;
          display: flex;
          align-items: center;
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
          flex-shrink: 0;
        }
        .volume-control-group-premium:hover .volume-slider-container-premium {
          width: 130px;
          opacity: 1;
        }
        .volume-slider-premium {
          width: 130px;
          height: 3px;
          -webkit-appearance: none;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .volume-slider-premium::-webkit-slider-runnable-track {
          height: 3px;
        }
        .volume-slider-premium::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 9999px !important;
          background: #ffffff !important;
          margin-top: -4.5px; /* centers thumb on 3px track */
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s;
          border: none !important;
        }
        .volume-slider-premium:hover::-webkit-slider-thumb {
          transform: scale(1.2);
          background-color: #ffffff !important;
        }
        .volume-slider-premium::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: none !important;
          border-radius: 9999px !important;
          background: #ffffff !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s;
        }
        .volume-slider-premium:hover::-moz-range-thumb {
          transform: scale(1.2);
          background-color: #ffffff !important;
        }
        .volume-percent-text-premium {
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 500;
          width: 0;
          min-width: 0;
          overflow: hidden;
          opacity: 0;
          text-align: right;
          font-family: 'Outfit', sans-serif;
          user-select: none;
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
          flex-shrink: 0;
        }
        .volume-control-group-premium:hover .volume-percent-text-premium {
          width: 24px;
          opacity: 1;
        }
        .bookmarks-popover-list::-webkit-scrollbar {
          display: none !important;
        }
        .bookmarks-popover-list {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }

        /* Disable animations overrides */
        .no-animations * {
          transition: none !important;
          animation: none !important;
        }
        .no-animations .animate-flash-hud {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
        .no-animations .volume-toast-overlay {
          transition: none !important;
          transform: none !important;
        }
        .no-animations .control-btn-volume:hover {
          transform: none !important;
        }
        .no-animations .hud-btn-clean:hover {
          transform: none !important;
        }

        .playback-error-overlay {
          position: absolute;
          inset: 0;
          z-index: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.9);
          padding: 2rem;
        }
        .playback-error-box {
          width: 100%;
          max-width: 420px;
          background: #181818;
          border: 1px solid rgba(229, 9, 20, 0.4);
          border-radius: 12px;
          padding: 2.5rem 2rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
        }
        .playback-error-box .error-icon {
          color: #e50914;
        }
        .playback-error-box h3 {
          margin: 0;
          font-size: 1.4rem;
          font-weight: 700;
          color: white;
        }
        .error-desc {
          font-size: 0.95rem;
          color: #cccccc;
          margin: 0;
          line-height: 1.5;
        }
        @keyframes pulseMarking {
          from { transform: scale(1); }
          to { transform: scale(1.03); }
        }
        @keyframes flashDot {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
        .marking-hud-button:hover {
          background: #f40b17 !important;
        }
      `}</style>

      {/* Render EsportsLiveOverlay here so it shows in Fullscreen */}
      <EsportsLiveOverlay />

      {radialMenuState.visible && (() => {
        // Build items dynamically based on settings
        const config = radialMenuConfig || {
          console: true, audioSubs: true, fullscreen: true, unlock: true, bookmark: true, mute: true, speed: true, pip: false, loop: false
        };

        const rItems = [];
        if (config.console) {
          rItems.push({
            id: 'stats', label: 'Console', icon: <Terminal size={24} />, onClick: () => setShowConsoleOverlay(prev => !prev), disabled: false
          });
        }
        if (config.audioSubs) {
          rItems.push({
            id: 'audio', label: 'Audio/Subs', icon: <MessageSquare size={24} />, onClick: () => setShowAudioSubMenu(true), disabled: isLocked
          });
        }
        if (config.fullscreen) {
          rItems.push({
            id: 'fullscreen', label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen', icon: isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />, onClick: toggleFullscreen, disabled: isLocked
          });
        }
        if (config.bookmark) {
          rItems.push({
            id: 'bookmark', label: 'Bookmark', icon: <BookmarkIcon size={24} />, onClick: () => handleBookmarkAdd(), disabled: isLocked
          });
        }
        if (config.mute) {
          rItems.push({
            id: 'mute', label: isMuted ? 'Unmute' : 'Mute', icon: isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />, onClick: () => setIsMuted(prev => !prev), disabled: isLocked
          });
        }
        if (config.speed) {
          rItems.push({
            id: 'speed', label: `${playbackRate}x Speed`, icon: <FastForward size={24} />, onClick: () => {
              const speeds = [1.0, 1.25, 1.5, 1.75, 2.0];
              const currentIdx = speeds.indexOf(playbackRate);
              const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
              if (videoRef.current) {
                videoRef.current.playbackRate = nextSpeed;
                setPlaybackRate(nextSpeed);
              }
            }, disabled: isLocked
          });
        }
        if (config.pip && document.pictureInPictureEnabled) {
          rItems.push({
            id: 'pip', label: 'PiP', icon: <Maximize size={24} />, onClick: () => {
              if (document.pictureInPictureElement) document.exitPictureInPicture();
              else if (videoRef.current) videoRef.current.requestPictureInPicture();
            }, disabled: isLocked
          });
        }
        if (config.loop) {
          rItems.push({
            id: 'loop', label: (videoRef.current && videoRef.current.loop) ? 'Unloop' : 'Loop', icon: <RotateCcw size={24} />, onClick: () => {
              if (videoRef.current) videoRef.current.loop = !videoRef.current.loop;
            }, disabled: isLocked
          });
        }
        if (config.unlock && isLocked) {
          rItems.push({
            id: 'unlock', label: 'Unlock UI', icon: <Unlock size={24} />, onClick: () => setIsLocked(false), disabled: false
          });
        }

        return (
          <RadialMenu
            x={radialMenuState.x}
            y={radialMenuState.y}
            onClose={() => setRadialMenuState({ visible: false, x: 0, y: 0 })}
            items={rItems}
            centerItem={{
              icon: isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />,
              onClick: togglePlay,
              disabled: isLocked
            }}
          />
        );
      })()}

      {showConsoleOverlay && (
        <ConsoleOverlay onClose={() => setShowConsoleOverlay(false)} />
      )}
    </div>
  );
};
