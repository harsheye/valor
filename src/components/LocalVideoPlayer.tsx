import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, RotateCw, Cast, X, ArrowLeft, 
  MessageSquare, MessageSquareText, CircleGauge, Maximize, Minimize, MonitorPlay,
  Volume2, Volume1, VolumeX, AlertCircle, Lock, Unlock,
  Layers, Type, Clock, Sliders, SkipForward, Ban, FastForward, Zap, Coffee, ChevronRight, ChevronLeft, Eye, Settings, Bookmark as BookmarkIcon, Activity, Terminal, Sparkles, Sun
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
import { sidecarService } from '../services/remote/sidecarService';
import { HttpByteSource, CachedByteSource } from '../services/remote/remoteByteSource';
import { FileByteSource } from '../services/local/localByteSource';
import { extractLocalAudioSegment, extractLocalSubtitleSegment } from '../services/local/ffmpegLocal';
import { extractRemoteAudioSegment, extractRemoteSubtitleSegment, extractHlsAudioSegment } from '../services/remote/ffmpegRemote';
import { FFmpegManager } from '../services/ffmpeg/FFmpegManager';
import { DemuxManager } from '../services/ffmpeg/DemuxManager';
import { PlaybackController } from '../services/playback/PlaybackController';
import { logger } from '../utils/logger';
import { saveMediaTimestamp, getMediaTimestamp } from '../utils/mediaTimestampStorage';
import { isWasmSupported } from '../utils/wasmCheck';
import { remoteProbeCache, inFlightRemoteProbes } from '../utils/remoteProbeCache';
import { findPreferredStream, getSavedMediaPreferences, getPreferredAudioStreamIndex, getLanguageDisplayLabel } from '../utils/languageMatcher';
import { getEffectiveCacheConfig, subscribeNetworkChanges, getNetworkProfile, detectMediaProfile, type CacheSettings, type NetworkProfile, type MediaProfile } from '../services/cache/cachePolicy';

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
import { classifyVideoTitle, getRegexedTitleWithYear } from '../utils/libraryClassifier';
import { syncTraktHistory, syncTraktRating, resolveTraktMetadata } from '../services/traktAuth';
import { LoadingSpinner, BufferingOverlay } from './LoadingSpinner';
import { isMobileDevice, useAutoLandscape } from '../utils/screenOrientation';
import { PlayerIsland, usePlayerIsland, type IslandAudioTrack, type IslandSubtitleTrack, AmbianceLighting, ToneMappingSvgDefs, isHdrOrX265Video, getToneMappingCssFilter, type ToneMappingMode } from './player';
import { RadialMenu } from './RadialMenu';
import { VlcContextMenu } from './player/VlcContextMenu';
import { ConsoleOverlay } from './ConsoleOverlay';
import { SpeedPopover } from './SpeedPopover';
import { EsportsLiveOverlay } from './EsportsLiveOverlay';
import { trimSubtitleName, saveEmbedSubtitles, getEmbedSubtitlesSync, getEmbedSubtitlesAsync } from '../utils/embedSubtitleStorage';

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
  focusOnClick?: boolean;
  focusOnClickNoPause?: boolean;
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
  overlayPosition?: 'middle-left' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
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
  cacheSettings?: CacheSettings;
  onUpdateCacheSettings?: (settings: Partial<CacheSettings>) => void;
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
      <span className="odo-hours-group" style={{ color: 'var(--player-accent, #e50914)', display: 'inline-flex' }}>
        <OdometerDigit val={hh[0]} />
        <OdometerDigit val={hh[1]} />
      </span>
      <span className="odo-separator" style={{ color: 'var(--text-secondary, rgba(255, 255, 255, 0.6))' }}>:</span>
      <span className="odo-minutes-group" style={{ color: 'var(--text-primary, #ffffff)', display: 'inline-flex' }}>
        <OdometerDigit val={mm[0]} />
        <OdometerDigit val={mm[1]} />
      </span>
      <span className="odo-separator" style={{ color: 'var(--text-secondary, rgba(255, 255, 255, 0.6))' }}>:</span>
      <span className="odo-seconds-group" style={{ color: 'var(--text-primary, #ffffff)', display: 'inline-flex' }}>
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
  runtime?: string;
  platform?: string;
  platformBg?: string;
  platformTextColor?: string;
}

export function detectMediaPlatform(itemData: any, isTV: boolean): {
  platform: string;
  platformBg: string;
  platformTextColor: string;
} {
  if (!itemData) {
    return { platform: isTV ? 'SERIES' : 'FILM', platformBg: '#e50914', platformTextColor: '#ffffff' };
  }

  // 1. Check TV broadcast/streaming network first
  if (isTV && itemData.networks && itemData.networks.length > 0) {
    const netName = (itemData.networks[0].name || '').trim();
    const netLower = netName.toLowerCase();
    if (netLower.includes('netflix')) return { platform: 'NETFLIX', platformBg: '#e50914', platformTextColor: '#ffffff' };
    if (netLower.includes('apple')) return { platform: 'APPLE TV+', platformBg: '#000000', platformTextColor: '#ffffff' };
    if (netLower.includes('amazon') || netLower.includes('prime')) return { platform: 'PRIME VIDEO', platformBg: '#00a8e1', platformTextColor: '#ffffff' };
    if (netLower.includes('disney')) return { platform: 'DISNEY+', platformBg: '#113ccf', platformTextColor: '#ffffff' };
    if (netLower.includes('hbo') || netLower.includes('max')) return { platform: 'MAX', platformBg: '#002be7', platformTextColor: '#ffffff' };
    if (netLower.includes('paramount')) return { platform: 'PARAMOUNT+', platformBg: '#0064ff', platformTextColor: '#ffffff' };
    if (netLower.includes('hulu')) return { platform: 'HULU', platformBg: '#1ce783', platformTextColor: '#0b0c0f' };
    if (netLower.includes('peacock')) return { platform: 'PEACOCK', platformBg: '#000000', platformTextColor: '#ffffff' };
    if (netLower.includes('jio')) return { platform: 'JIOCINEMA', platformBg: '#99004d', platformTextColor: '#ffffff' };
    if (netLower.includes('zee')) return { platform: 'ZEE5', platformBg: '#8230c6', platformTextColor: '#ffffff' };
    if (netLower.includes('sony')) return { platform: 'SONYLIV', platformBg: '#0072d2', platformTextColor: '#ffffff' };
    if (netLower.includes('bbc')) return { platform: 'BBC', platformBg: '#000000', platformTextColor: '#ffffff' };
    return { platform: netName.toUpperCase(), platformBg: '#222222', platformTextColor: '#ffffff' };
  }

  // 2. Check Watch Providers (Flatrate streaming first, then rent/buy)
  const wpResults = itemData['watch/providers']?.results || {};
  const countryList = ['US', 'IN', 'GB', 'CA', 'AU', ...Object.keys(wpResults)];
  let foundProvider: string | null = null;

  for (const c of countryList) {
    const provObj = wpResults[c];
    if (!provObj) continue;
    if (provObj.flatrate && provObj.flatrate.length > 0) {
      foundProvider = provObj.flatrate[0].provider_name;
      break;
    }
  }

  // If no flatrate, check buy/rent providers
  if (!foundProvider) {
    for (const c of ['US', 'IN', 'GB']) {
      const provObj = wpResults[c];
      if (!provObj) continue;
      if (provObj.buy && provObj.buy.length > 0) {
        foundProvider = provObj.buy[0].provider_name;
        break;
      }
      if (provObj.rent && provObj.rent.length > 0) {
        foundProvider = provObj.rent[0].provider_name;
        break;
      }
    }
  }

  if (foundProvider) {
    const pLower = foundProvider.toLowerCase();
    if (pLower.includes('netflix')) return { platform: 'NETFLIX', platformBg: '#e50914', platformTextColor: '#ffffff' };
    if (pLower.includes('apple')) return { platform: 'APPLE TV+', platformBg: '#000000', platformTextColor: '#ffffff' };
    if (pLower.includes('amazon') || pLower.includes('prime')) return { platform: 'PRIME VIDEO', platformBg: '#00a8e1', platformTextColor: '#ffffff' };
    if (pLower.includes('disney')) return { platform: 'DISNEY+', platformBg: '#113ccf', platformTextColor: '#ffffff' };
    if (pLower.includes('hbo') || pLower.includes('max')) return { platform: 'MAX', platformBg: '#002be7', platformTextColor: '#ffffff' };
    if (pLower.includes('paramount')) return { platform: 'PARAMOUNT+', platformBg: '#0064ff', platformTextColor: '#ffffff' };
    if (pLower.includes('hulu')) return { platform: 'HULU', platformBg: '#1ce783', platformTextColor: '#0b0c0f' };
    if (pLower.includes('peacock')) return { platform: 'PEACOCK', platformBg: '#000000', platformTextColor: '#ffffff' };
    if (pLower.includes('jio')) return { platform: 'JIOCINEMA', platformBg: '#99004d', platformTextColor: '#ffffff' };
    if (pLower.includes('zee')) return { platform: 'ZEE5', platformBg: '#8230c6', platformTextColor: '#ffffff' };
    if (pLower.includes('sony')) return { platform: 'SONYLIV', platformBg: '#0072d2', platformTextColor: '#ffffff' };
    if (pLower.includes('google')) return { platform: 'GOOGLE PLAY', platformBg: '#00875a', platformTextColor: '#ffffff' };
    if (pLower.includes('youtube')) return { platform: 'YOUTUBE', platformBg: '#ff0000', platformTextColor: '#ffffff' };
    return { platform: foundProvider.toUpperCase(), platformBg: '#333333', platformTextColor: '#ffffff' };
  }

  // 3. Fallback to production company
  if (itemData.production_companies && itemData.production_companies.length > 0) {
    const compName = (itemData.production_companies[0].name || '').trim();
    const cLower = compName.toLowerCase();
    if (cLower.includes('warner')) return { platform: 'WARNER BROS', platformBg: '#004db3', platformTextColor: '#ffffff' };
    if (cLower.includes('universal')) return { platform: 'UNIVERSAL', platformBg: '#000000', platformTextColor: '#ffffff' };
    if (cLower.includes('paramount')) return { platform: 'PARAMOUNT', platformBg: '#0064ff', platformTextColor: '#ffffff' };
    if (cLower.includes('sony') || cLower.includes('columbia')) return { platform: 'SONY PICTURES', platformBg: '#000000', platformTextColor: '#ffffff' };
    if (cLower.includes('disney') || cLower.includes('marvel')) return { platform: 'DISNEY', platformBg: '#113ccf', platformTextColor: '#ffffff' };
    if (cLower.includes('a24')) return { platform: 'A24', platformBg: '#ffffff', platformTextColor: '#000000' };
    if (cLower.includes('lionsgate')) return { platform: 'LIONSGATE', platformBg: '#c29b38', platformTextColor: '#000000' };
    if (compName.length <= 18) {
      return { platform: compName.toUpperCase(), platformBg: '#222222', platformTextColor: '#ffffff' };
    }
  }

  return { platform: isTV ? 'SERIES' : 'FILM', platformBg: '#e50914', platformTextColor: '#ffffff' };
}

export const isBrowserPlayableAudioCodec = (codec?: string): boolean => {
  if (!codec) return true;
  const c = codec.toLowerCase().trim();
  if (/ac-?3|eac-?3|ec-?3|dts|truehd|mlp|atmos|dca/i.test(c)) {
    return false;
  }
  return true;
};

export const normalizeKey = (k?: string | null): string => {
  if (!k) return '';
  const trimmed = k.trim();
  if (k === ' ' || trimmed === '' || trimmed.toLowerCase() === 'space' || trimmed.toLowerCase() === 'spacebar') return ' ';
  const lower = trimmed.toLowerCase();
  if (lower === 'esc') return 'escape';
  if (lower === 'left' || lower === 'arrowleft' || lower === '←') return 'arrowleft';
  if (lower === 'right' || lower === 'arrowright' || lower === '→') return 'arrowright';
  if (lower === 'up' || lower === 'arrowup' || lower === '↑') return 'arrowup';
  if (lower === 'down' || lower === 'arrowdown' || lower === '↓') return 'arrowdown';
  if (lower === 'del') return 'delete';
  return lower;
};

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
  focusOnClick = true,
  focusOnClickNoPause = true,
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
  overlayPosition = 'middle-left',
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
  onReassociate,
  cacheSettings,
  onUpdateCacheSettings
}) => {
  const island = usePlayerIsland();
  const isFile = (obj: any): obj is File => obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
  const video = useMemo(() => ({
    ...rawVideo,
    file: isFile(rawVideo.file) ? rawVideo.file : undefined
  }), [rawVideo]);

  const rawMediaProfile = useMemo(() => detectMediaProfile(video), [video]);
  const [probedMediaProfile, setProbedMediaProfile] = useState<MediaProfile | null>(null);
  const activeMediaProfile = probedMediaProfile || rawMediaProfile;

  const [liveNetworkProfile, setLiveNetworkProfile] = useState<NetworkProfile>(() => getNetworkProfile());

  useEffect(() => {
    return subscribeNetworkChanges((prof) => {
      setLiveNetworkProfile(prof);
    });
  }, []);

  const effectiveCacheConfig = useMemo(() => {
    return getEffectiveCacheConfig(cacheSettings, liveNetworkProfile, activeMediaProfile);
  }, [cacheSettings, liveNetworkProfile, activeMediaProfile]);

  const isUndetectedLocalMedia = useMemo(() => {
    if (video.type === 'online_movie' || video.type === 'online_tv' || video.type === 'online_anime') {
      return false;
    }
    return classifyVideoTitle(video.title).type === 'unknown';
  }, [video.title, video.type]);

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

  // Lock browser window scrollbar when player is mounted
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
    };
  }, []);

  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const [showPauseMetadataOverlay, setShowPauseMetadataOverlay] = useState(false);
  const showPauseMetadataOverlayRef = useRef(false);
  showPauseMetadataOverlayRef.current = showPauseMetadataOverlay;
  const pauseOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mediaDetails, setMediaDetails] = useState<MediaDetails | null>(() => {
    const rawTitle = video.title || (video as any).fileName || '';
    const seriesInfo = classifyVideoTitle(rawTitle);
    const isTV = seriesInfo.type === 'series';
    const initialTitle = (isTV && seriesInfo.seriesTitle) 
      ? seriesInfo.seriesTitle 
      : (seriesInfo.cleanTitle || seriesInfo.displayTitle || rawTitle || 'Unknown Title');
    return {
      title: initialTitle,
      overview: '',
      imageUrl: '',
      releaseDate: seriesInfo.year ? String(seriesInfo.year) : undefined,
      platform: isTV ? 'SERIES' : 'FILM',
      platformBg: '#e50914',
      platformTextColor: '#ffffff',
      episodeTitle: isTV ? seriesInfo.episodeTitle : undefined,
      season: isTV ? seriesInfo.season : undefined,
      episode: isTV ? seriesInfo.episode : undefined,
    };
  });

  useEffect(() => {
    const rawTitle = video.title || (video as any).fileName || '';
    const seriesInfo = classifyVideoTitle(rawTitle);
    const isTV = seriesInfo.type === 'series';
    const initialTitle = (isTV && seriesInfo.seriesTitle) 
      ? seriesInfo.seriesTitle 
      : (seriesInfo.cleanTitle || seriesInfo.displayTitle || rawTitle || 'Unknown Title');
    
    setMediaDetails(prev => ({
      title: prev?.title || initialTitle,
      overview: prev?.overview || '',
      imageUrl: prev?.imageUrl || '',
      logoUrl: prev?.logoUrl,
      rating: prev?.rating,
      releaseDate: prev?.releaseDate || (seriesInfo.year ? String(seriesInfo.year) : undefined),
      runtime: prev?.runtime,
      platform: prev?.platform || (isTV ? 'SERIES' : 'FILM'),
      platformBg: prev?.platformBg || '#e50914',
      platformTextColor: prev?.platformTextColor || '#ffffff',
      episodeTitle: isTV ? (prev?.episodeTitle || seriesInfo.episodeTitle) : undefined,
      season: isTV ? (prev?.season ?? seriesInfo.season) : undefined,
      episode: isTV ? (prev?.episode ?? seriesInfo.episode) : undefined,
    }));
  }, [video.id, video.title, (video as any).fileName]);

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

  const fetchOpenSubtitles = useCallback(async (customQuery?: string) => {
    let resolvedApiKey = openSubtitlesApiKey;
    if (!resolvedApiKey) {
      try {
        const saved = localStorage.getItem('valor_settings');
        if (saved) {
          resolvedApiKey = JSON.parse(saved).openSubtitlesApiKey || '';
        }
      } catch {}
    }

    if (!resolvedApiKey) {
      logger.player('[OpenSubtitles] No API key provided in props or settings.');
      triggerSwitchToast("OpenSubtitles API key required. Click the key icon to enter one.");
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

      let searchUrl = '';
      const trimmedQuery = (customQuery || '').trim();

      if (trimmedQuery) {
        searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(trimmedQuery)}&languages=${defaultSubCode}`;
        logger.player(`[OpenSubtitles] Querying Custom Query: "${trimmedQuery}" in language: ${defaultSubCode}`);
      } else {
        const seriesInfo = classifyVideoTitle(video.title);
        if (seriesInfo.type === 'series' && seriesInfo.seriesTitle) {
          searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(seriesInfo.seriesTitle)}&season_number=${seriesInfo.season || 1}&episode_number=${seriesInfo.episode || 1}&languages=${defaultSubCode}`;
          logger.player(`[OpenSubtitles] Querying TV Subtitles: "${seriesInfo.seriesTitle}" S${seriesInfo.season}E${seriesInfo.episode} in language: ${defaultSubCode}`);
        } else {
          const cleanName = video.title.replace(/\.[^/.]+$/, "");
          searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(cleanName)}&languages=${defaultSubCode}`;
          logger.player(`[OpenSubtitles] Querying Movie Subtitles: "${cleanName}" in language: ${defaultSubCode}`);
        }
      }
      
      const headers = {
        'Api-Key': resolvedApiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Valor v1.0'
      };

      let res: Response;
      try {
        res = await fetch(searchUrl, { headers });
      } catch (directErr) {
        logger.warn('[OpenSubtitles] Direct fetch failed, falling back to proxy...', directErr);
        res = await fetch(`/api/proxy?url=${encodeURIComponent(searchUrl)}`, { headers });
      }

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
        items.sort((a: any, b: any) => {
          if (a.language === defaultSubCode && b.language !== defaultSubCode) return -1;
          if (a.language !== defaultSubCode && b.language === defaultSubCode) return 1;
          return a.language.localeCompare(b.language);
        });
        
        setOpenSubtitles(items);
        logger.player(`[OpenSubtitles] Found ${items.length} subtitles.`);
        if (items.length > 0) {
          triggerSwitchToast(`Found ${items.length} OpenSubtitles`);
        } else {
          triggerSwitchToast("No subtitles found. Try custom search.");
        }
      } else {
        logger.player(`[OpenSubtitles] Search failed: HTTP ${res.status}`);
        triggerSwitchToast(`OpenSubtitles search failed (${res.status})`);
      }
    } catch (err: any) {
      logger.player(`[OpenSubtitles] Search error: ${err}`);
      triggerSwitchToast(`Search error: ${err?.message || err}`);
    } finally {
      setIsOpenSubLoading(false);
    }
  }, [openSubtitlesApiKey, video.title, video.url]);

  const downloadOpenSubtitle = useCallback(async (fileId: number, fileName: string, language: string) => {
    let resolvedApiKey = openSubtitlesApiKey;
    if (!resolvedApiKey) {
      try {
        const saved = localStorage.getItem('valor_settings');
        if (saved) {
          resolvedApiKey = JSON.parse(saved).openSubtitlesApiKey || '';
        }
      } catch {}
    }

    if (!resolvedApiKey) {
      triggerSwitchToast("OpenSubtitles API Key is required.");
      return;
    }

    triggerSwitchToast("Downloading subtitle...");
    try {
      const headers = {
        'Api-Key': resolvedApiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Valor v1.0'
      };

      let res: Response;
      try {
        res = await fetch('https://api.opensubtitles.com/api/v1/download', {
          method: 'POST',
          headers,
          body: JSON.stringify({ file_id: fileId })
        });
      } catch (postErr) {
        res = await fetch(`/api/proxy?url=${encodeURIComponent('https://api.opensubtitles.com/api/v1/download')}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ file_id: fileId })
        });
      }

      if (res.ok) {
        const data = await res.json();
        const downloadLink = data.link;
        if (!downloadLink) {
          throw new Error("No download link in response.");
        }
        
        let fileRes: Response;
        try {
          fileRes = await fetch(downloadLink);
        } catch (cdnErr) {
          fileRes = await fetch(`/api/proxy?url=${encodeURIComponent(downloadLink)}`);
        }

        if (fileRes.ok) {
          const text = await fileRes.text();
          const cues = parseSubtitles(text, fileName);
          const newTrack: CustomSubtitleTrack = {
            id: `opensub-${fileId}`,
            name: trimSubtitleName(fileName, language),
            url: '',
            cues: cues,
            isExtracted: false,
            language: language.toLowerCase()
          };
          
          const updatedTracks = [...(video.subtitleTracks || []), newTrack];
          onUpdateVideo((prev: any) => ({
            ...prev,
            subtitleTracks: updatedTracks
          }));
          saveEmbedSubtitles(video, updatedTracks);
          userExplicitlyTurnedOffSubRef.current = false;
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
  }, [openSubtitlesApiKey, onUpdateVideo, video]);

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
    focusOnClick: boolean;
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
    pauseOnFocusChange: !!pauseOnFocusChange,
    focusOnClick: focusOnClick !== false && focusOnClickNoPause !== false
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
      pauseOnFocusChange: pauseOnFocusChange !== undefined ? !!pauseOnFocusChange : prev.pauseOnFocusChange,
      focusOnClick: focusOnClick !== undefined ? (focusOnClick !== false && focusOnClickNoPause !== false) : prev.focusOnClick
    }));
  }, [propHideUIOverlays, propHideVideoName, propShowPlayButton, propShowTimeDisplay, propShowPlayBar, propShowVolumeControl, propShowFullscreen, allowUiSkipping, blockSeekingCompletely, autoSkipIntroOutro, autoSkipSexScenes, propLockModeActive, disableAnimations, pauseOnFocusChange, focusOnClick, focusOnClickNoPause]);

  const updatePlayerSetting = (key: keyof typeof playerSettings, value: any) => {
    if (key === 'pauseOnFocusChange') {
      pauseOnFocusChangeRef.current = !!value;
      if (playbackControllerRef.current) {
        playbackControllerRef.current.pauseOnFocusChange = !!value;
      }
    }
    if (key === 'focusOnClick') {
      focusOnClickRef.current = !!value;
    }
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
    if (key === 'blockSeekingCompletely' || key === 'disableAnimations') {
      const val = (playerSettings as any)[key];
      return val ? 'highlight-active-red' : 'highlight-active-blue';
    }

    // Positive options
    if (key === 'allowUiSkipping' || key === 'autoSkipIntroOutro' || key === 'lockModeActive' || key === 'pauseOnFocusChange') {
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
    island.notify({
      type: 'bookmark',
      time: Math.floor(newBookmark.time),
      count: updatedBookmarks.length
    });

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
  const [currentTime, setCurrentTime] = useState(() => {
    if (video.currentTime && video.currentTime > 0) return video.currentTime;
    return getMediaTimestamp(video);
  });
  const latestTimeRef = useRef<number>(currentTime);
  const lastStorageSaveTimeRef = useRef<number>(0);
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

      logger.player(`Scrobbling watch history to Trakt.tv...`);
      const syncRes = await syncTraktHistory({ ...video, tmdbId: video.tmdbId || tmdbIdRef.current }, token);
      if (syncRes.ok) {
        logger.player('Successfully scrobbled to Trakt.tv watch history!');
        triggerSwitchToast(syncRes.message);
        if (syncRes.tmdbId) {
          tmdbIdRef.current = syncRes.tmdbId;
        }
        onUpdateVideoRef.current((prev: any) => ({
          ...prev,
          hasScrobbledTrakt: true,
          ...(syncRes.tmdbId ? { tmdbId: syncRes.tmdbId } : {})
        }), false, video.id);

        if (userRating && userRating > 0) {
          syncTraktRating({ ...video, tmdbId: syncRes.tmdbId || video.tmdbId || tmdbIdRef.current }, userRating, token).catch(() => {});
        }
      } else {
        logger.player(`Trakt.tv scrobble failed: ${syncRes.message}`);
        triggerSwitchToast(syncRes.message);
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

      const metadata = await resolveTraktMetadata({ ...video, tmdbId: video.tmdbId || tmdbIdRef.current });
      const body: any = {};
      if (metadata.isTV) {
        body.shows = [{ title: metadata.showTitle, ids: metadata.showIds || (metadata.tmdbId ? { tmdb: metadata.tmdbId } : undefined) }];
      } else {
        body.movies = [{ title: metadata.movieTitle, ids: metadata.movieIds || (metadata.tmdbId ? { tmdb: metadata.tmdbId } : undefined) }];
      }

      const endpoint = isAdd ? 'favorites' : 'favorites/remove';
      logger.player(`Syncing Trakt.tv favorites (${isAdd ? 'add' : 'remove'})...`);

      const res = await fetch(`https://api.trakt.tv/sync/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'trakt-api-key': 'V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88',
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
            searchUrl = `https://api.tmdb.org/3/search/tv?query=${encodeURIComponent(seriesInfo.seriesTitle)}&include_adult=false`;
          } else {
            const queryTitle = seriesInfo.cleanTitle || seriesInfo.displayTitle || video.title;
            const yearParam = seriesInfo.year ? `&year=${seriesInfo.year}` : '';
            searchUrl = `https://api.tmdb.org/3/search/movie?query=${encodeURIComponent(queryTitle)}${yearParam}&include_adult=false`;
          }

          logger.player(`[Bookmarks Sync] Querying TMDB search: "${searchUrl}"`);
          let searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
          });

          if (searchRes.ok) {
            let searchData = await searchRes.json();
            // Fallback retry without year if 0 results
            if ((!searchData.results || searchData.results.length === 0) && !isTV && seriesInfo.year) {
              const fallbackUrl = `https://api.tmdb.org/3/search/movie?query=${encodeURIComponent(seriesInfo.cleanTitle || seriesInfo.displayTitle || video.title)}&include_adult=false`;
              const fallbackRes = await fetch(fallbackUrl, {
                headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
              });
              if (fallbackRes.ok) {
                searchData = await fallbackRes.json();
              }
            }

            if (searchData.results && searchData.results.length > 0) {
              const matchedItem = searchData.results[0];
              resolvedTmdbId = matchedItem.id;
              tmdbIdRef.current = resolvedTmdbId;

              // Save tmdbId in the video metadata
              onUpdateVideo((prev: any) => ({
                ...prev,
                tmdbId: resolvedTmdbId
              }));
            }
          }
        } catch (err) {
          logger.player(`[Bookmarks Sync] TMDB search error: ${err}`);
        }
      }

      // Resolve full metadata details for paused overlay card
      if (resolvedTmdbId && getOverlayDataFromTmdb) {
        try {
          const tmdbToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";
          const detailsUrl = `https://api.tmdb.org/3/${isTV ? 'tv' : 'movie'}/${resolvedTmdbId}?append_to_response=watch/providers,credits`;
          const detailsRes = await fetch(detailsUrl, {
            headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
          });
          const itemData = detailsRes.ok ? await detailsRes.json() : null;

          const mediaImg = itemData?.poster_path ? `https://image.tmdb.org/t/p/w500${itemData.poster_path}` : (itemData?.backdrop_path ? `https://image.tmdb.org/t/p/w500${itemData.backdrop_path}` : '');
          
          let formattedRuntime: string | undefined;
          if (itemData?.runtime) {
            const hrs = Math.floor(itemData.runtime / 60);
            const mins = itemData.runtime % 60;
            formattedRuntime = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          }

          const platformInfo = detectMediaPlatform(itemData, isTV);

          const details: MediaDetails = {
            title: itemData?.name || itemData?.title || seriesInfo.cleanTitle || seriesInfo.displayTitle || 'Unknown Title',
            overview: itemData?.overview || '',
            imageUrl: mediaImg,
            releaseDate: itemData?.release_date ? itemData.release_date.split('-')[0] : (itemData?.first_air_date ? itemData.first_air_date.split('-')[0] : (seriesInfo.year ? String(seriesInfo.year) : '')),
            rating: itemData?.vote_average || undefined,
            runtime: formattedRuntime,
            platform: platformInfo.platform,
            platformBg: platformInfo.platformBg,
            platformTextColor: platformInfo.platformTextColor
          };

          // Fetch show/movie logos from TMDB images endpoint
          try {
            const imagesUrl = `https://api.tmdb.org/3/${isTV ? 'tv' : 'movie'}/${resolvedTmdbId}/images`;
            const imagesRes = await fetch(imagesUrl, {
              headers: { 'Authorization': `Bearer ${tmdbToken}`, 'accept': 'application/json' }
            });
            if (imagesRes.ok) {
              const imagesData = await imagesRes.json();
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
              const epUrl = `https://api.tmdb.org/3/tv/${resolvedTmdbId}/season/${season}/episode/${episode}`;
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
        } catch (err) {
          logger.player(`[Bookmarks Sync] TMDB metadata fetch error: ${err}`);
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
                startTime: msToSec(item.start_ms),
                label: 'Intro',
                category: 'Intro',
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
                startTime: msToSec(item.start_ms),
                label: 'Preview / Recap',
                category: 'Preview',
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
                startTime: msToSec(item.start_ms),
                label: 'Credits / Outro',
                category: 'Outro',
                isIntro: false,
                isOutro: true,
                skipEnabled: true,
                createdBy: 'theintrodb'
              });
            });
          }

          if (tidbBms.length > 0) {
            hadTidbDataRef.current = true;
            // Save every timestamp found in IntroDB into our database!
            try {
              fetch('/api/timestamps/save-introdb', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tmdbId: resolvedTmdbId,
                  season: isTV ? season : null,
                  episode: isTV ? episode : null,
                  videoId: video.id,
                  mediaName: video.title || '',
                  introDbData,
                  userId: userId || 'theintrodb'
                })
              }).then(() => {
                logger.player('[TheIntroDB] Successfully cached ' + tidbBms.length + ' timestamp(s) into our server database.');
              }).catch(err => {
                logger.player('[TheIntroDB Cache Warning] Failed saving to our DB: ' + err);
              });
            } catch (saveErr) {}
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

  const [uiScale, setUiScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('valor_player_ui_scale');
      return saved ? Math.min(1.8, Math.max(0.6, parseFloat(saved))) : 1.0;
    } catch {
      return 1.0;
    }
  });

  const triggerUiScaleToast = useCallback((scale: number) => {}, []);

  const triggerVolumeToast = (vol: number, muted: boolean, boost: number = audioBoost) => {
    island.notify({
      type: 'volume',
      value: vol,
      muted: muted || vol === 0,
      boost
    });
  };
  const [showControls, setShowControls] = useState(true);
  const [showConsoleOverlay, setShowConsoleOverlay] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [radialMenuState, setRadialMenuState] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [vlcContextMenuState, setVlcContextMenuState] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const vlcContextMenuClosedTimestampRef = useRef<number>(0);
  const prevVlcVisibleRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevVlcVisibleRef.current && !vlcContextMenuState.visible) {
      vlcContextMenuClosedTimestampRef.current = Date.now();
    }
    prevVlcVisibleRef.current = vlcContextMenuState.visible;
  }, [vlcContextMenuState.visible]);
  const [timelineOnlyMode, setTimelineOnlyMode] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>('default');
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const isScrubbingRef = useRef(false);
  isScrubbingRef.current = isScrubbing;
  const scrubTimeRef = useRef<number | null>(null);
  scrubTimeRef.current = scrubTime;
  const debouncedSeekTimeoutRef = useRef<any>(null);
  const seekTargetRef = useRef<number | null>(null);
  const seekTargetTimerRef = useRef<any>(null);

  // Consecutive Skip Accumulator State (2-second window)
  const [consecutiveSkipInfo, setConsecutiveSkipInfo] = useState<{
    direction: 'forward' | 'rewind';
    totalSeconds: number;
    count: number;
  } | null>(null);
  const consecutiveSkipTimerRef = useRef<any>(null);
  const consecutiveSkipAccumulatorRef = useRef<{
    direction: 'forward' | 'rewind';
    totalSeconds: number;
    count: number;
    lastTime: number;
  }>({ direction: 'forward', totalSeconds: 0, count: 0, lastTime: 0 });

  const getEffectiveTime = () => {
    if (seekTargetRef.current !== null) {
      return seekTargetRef.current;
    }
    return videoRef.current ? videoRef.current.currentTime : currentTime;
  };

  const [systemTime, setSystemTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setSystemTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Global mouseup/touchend listener to safely complete scrubbing immediately without snap-back
  useEffect(() => {
    if (!isScrubbing) return;

    const handleScrubEnd = () => {
      const targetTime = scrubTimeRef.current;
      setIsScrubbing(false);
      setScrubTime(null);

      if (debouncedSeekTimeoutRef.current) {
        clearTimeout(debouncedSeekTimeoutRef.current);
        debouncedSeekTimeoutRef.current = null;
      }

      if (targetTime !== null && targetTime !== undefined && videoRef.current) {
        seekTargetRef.current = targetTime;
        setCurrentTime(targetTime);
        if (playbackControllerRef.current) {
          playbackControllerRef.current.seek(targetTime).catch(console.error);
        } else {
          videoRef.current.currentTime = targetTime;
        }
        onUpdateVideoRef.current((prev: any) => ({
          ...prev,
          currentTime: targetTime
        }), false, video.id);

        if (seekTargetTimerRef.current) clearTimeout(seekTargetTimerRef.current);
        seekTargetTimerRef.current = setTimeout(() => {
          seekTargetRef.current = null;
        }, 1000);
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
  const userExplicitlyTurnedOffSubRef = useRef(false);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(() => {
    if (video.subtitleTracks && video.subtitleTracks.length > 0) {
      const tracksWithCues = video.subtitleTracks.filter(t => t.cues && t.cues.length > 0);
      if (tracksWithCues.length > 0) {
        return tracksWithCues[tracksWithCues.length - 1];
      }
      return video.subtitleTracks[video.subtitleTracks.length - 1];
    }
    return null;
  });
  const [extractingStreamIndex, setExtractingStreamIndex] = useState<number | null>(null);
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isKeyInitiated, setIsKeyInitiated] = useState(false);
  if (false as boolean) {
    console.log(extractingStreamIndex, isKeyInitiated);
  }
  const [activeAudioStartOffset, setActiveAudioStartOffset] = useState(0);
  const [activeSubtitleStartOffset, setActiveSubtitleStartOffset] = useState(0);
  const [activeAudioStreamIndex, setActiveAudioStreamIndex] = useState<number | null>(() => {
    const prefs = getSavedMediaPreferences();
    const streams = video.streams || [];
    const audioStreams = streams.filter((s: any) => s.type === 'audio');
    if (audioStreams.length === 0) return null;
    const isNonNative = audioStreams.some((s: any) => !isBrowserPlayableAudioCodec(s.codec));
    if (audioStreams.length >= 2 || isNonNative) {
      return getPreferredAudioStreamIndex(streams, prefs.defaultAudio);
    }
    return null;
  });
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
  const [playPauseFeedback, setPlayPauseFeedback] = useState<{ action: 'play' | 'pause'; id: number } | null>(null);
  const playPauseFeedbackTimeoutRef = useRef<any>(null);

  const triggerPlayPauseFeedback = (action: 'play' | 'pause') => {
    if (playPauseFeedbackTimeoutRef.current) clearTimeout(playPauseFeedbackTimeoutRef.current);
    setPlayPauseFeedback({ action, id: Date.now() });
    playPauseFeedbackTimeoutRef.current = setTimeout(() => {
      setPlayPauseFeedback(null);
    }, 550);
  };

  // Ambiance Lighting Controls & Persistence
  const [isAmbianceEnabled, setIsAmbianceEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('valor_ambiance_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [ambianceBlur, setAmbianceBlur] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('valor_ambiance_blur');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 16 && val <= 140) return val;
      }
    } catch {}
    return 54;
  });
  const [ambianceOpacity, setAmbianceOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('valor_ambiance_opacity');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0.1 && val <= 1.0) return val;
      }
    } catch {}
    return 0.7;
  });

  const handleToggleAmbiance = useCallback(() => {
    setIsAmbianceEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('valor_ambiance_enabled', String(next)); } catch {}
      triggerSwitchToast(next ? 'Ambiance Lighting Enabled' : 'Ambiance Lighting Disabled');
      return next;
    });
  }, []);

  const handleSetAmbianceBlur = useCallback((blurPx: number) => {
    setAmbianceBlur(blurPx);
    try { localStorage.setItem('valor_ambiance_blur', String(blurPx)); } catch {}
    triggerSwitchToast(`Ambiance Blur: ${blurPx}px`);
  }, []);

  const handleSetAmbianceOpacity = useCallback((opacity: number) => {
    setAmbianceOpacity(opacity);
    try { localStorage.setItem('valor_ambiance_opacity', String(opacity)); } catch {}
    triggerSwitchToast(`Ambiance Opacity: ${Math.round(opacity * 100)}%`);
  }, []);

  // Switch Toast Notification
  const [switchToast, setSwitchToast] = useState<{ text: string; visible: boolean; duration?: number }>({ text: '', visible: false });
  const switchToastTimeoutRef = useRef<any>(null);

  const triggerSwitchToast = useCallback((text: string, customDuration?: number) => {
    if (switchToastTimeoutRef.current) clearTimeout(switchToastTimeoutRef.current);
    const dur = customDuration || toastDuration;
    setSwitchToast({ text, visible: true, duration: dur });
    switchToastTimeoutRef.current = setTimeout(() => {
      setSwitchToast(prev => ({ ...prev, visible: false }));
    }, dur * 1000);
  }, [toastDuration]);

  // HDR Tone Mapping State & Persistence
  const [toneMappingMode, setToneMappingMode] = useState<ToneMappingMode>(() => {
    try {
      const saved = localStorage.getItem('valor_tone_mapping_mode');
      if (saved && ['off', 'aces', 'vibrant', 'reinhard'].includes(saved)) {
        return saved as ToneMappingMode;
      }
    } catch {}
    return isHdrOrX265Video(video) ? 'aces' : 'off';
  });

  const handleSetToneMapping = useCallback((mode: ToneMappingMode) => {
    setToneMappingMode(mode);
    try { localStorage.setItem('valor_tone_mapping_mode', mode); } catch {}
    triggerSwitchToast(`HDR Tone Mapping: ${mode === 'off' ? 'OFF' : mode.toUpperCase()}`);
  }, [triggerSwitchToast]);

  const cycleToneMapping = useCallback(() => {
    setToneMappingMode(prev => {
      const next: ToneMappingMode = prev === 'off' ? 'aces' : prev === 'aces' ? 'vibrant' : prev === 'vibrant' ? 'reinhard' : 'off';
      try { localStorage.setItem('valor_tone_mapping_mode', next); } catch {}
      triggerSwitchToast(`HDR Tone Mapping: ${next.toUpperCase()}`);
      return next;
    });
  }, [triggerSwitchToast]);


  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackControllerRef = useRef<PlaybackController | null>(null);
  const prevDestroyPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const containerRef = useRef<HTMLDivElement>(null);
  useAutoLandscape(true, containerRef);

  // Native wheel event handling: intercept Ctrl + Scroll for UI Scaling & prevent background page scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY;
        setUiScale(prev => {
          const step = 0.05;
          const next = delta < 0 
            ? Math.min(1.8, Math.round((prev + step) * 100) / 100)
            : Math.max(0.6, Math.round((prev - step) * 100) / 100);
          try {
            localStorage.setItem('valor_player_ui_scale', next.toString());
          } catch {}
          triggerUiScaleToast(next);
          return next;
        });
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target.closest('.player-settings-panel') || 
        target.closest('.bookmarks-popover') || 
        target.closest('.audio-sub-popover') || 
        target.closest('.audio-sub-popover-center') || 
        target.closest('.speed-popover-container') ||
        target.closest('.vlc-context-menu')
      ) {
        return;
      }
      e.preventDefault();
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [triggerUiScaleToast]);
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
  const audioDebounceTimeoutRef = useRef<any>(null);
  const subDebounceTimeoutRef = useRef<any>(null);
  const hasAutoSelectedRef = useRef(false);
  const activeAudioStartOffsetRef = useRef(0);
  const activeSubtitleStartOffsetRef = useRef(0);

  useEffect(() => {
    hasAutoSelectedRef.current = false;
    const storedTime = getMediaTimestamp(video);
    const resolvedTime = (video.currentTime && video.currentTime > 0) ? video.currentTime : storedTime;
    const startFromTime = (video.resumeTime && video.resumeTime > 5 && !resolvedTime) ? 0 : resolvedTime;
    activeAudioStartOffsetRef.current = Math.floor(startFromTime / 10) * 10;
    activeSubtitleStartOffsetRef.current = startFromTime;
    setCurrentTime(startFromTime);
    latestTimeRef.current = startFromTime;
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
      cachedSourceRef.current = new CachedByteSource(byteSource, effectiveCacheConfig.chunkSizeBytes, effectiveCacheConfig.cacheLimit, effectiveCacheConfig.lookbehindChunks, effectiveCacheConfig.lookaheadChunks);
    } else if (video.type === 'local') {
      const byteSource = activeFile
        ? new FileByteSource(activeFile instanceof File ? activeFile : new File([activeFile], (activeFile as any)?.name || 'video.mp4'))
        : new HttpByteSource(video.url);
      cachedSourceRef.current = new CachedByteSource(byteSource, effectiveCacheConfig.chunkSizeBytes, effectiveCacheConfig.cacheLimit, effectiveCacheConfig.lookbehindChunks, effectiveCacheConfig.lookaheadChunks);
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
  }, [video.url, video.isRemote, video.file, video.type, activeFile, effectiveCacheConfig.chunkSizeBytes, effectiveCacheConfig.cacheLimit]);

  // Dynamically adapt active cache chunk limits and buffer retention when network / hardware condition changes
  useEffect(() => {
    if (cachedSourceRef.current) {
      cachedSourceRef.current.updateLimits(
        effectiveCacheConfig.chunkSizeBytes,
        effectiveCacheConfig.cacheLimit,
        effectiveCacheConfig.lookbehindChunks,
        effectiveCacheConfig.lookaheadChunks
      );
    }
    if (playbackControllerRef.current) {
      playbackControllerRef.current.setCacheRetention(
        effectiveCacheConfig.keepBehindSeconds,
        effectiveCacheConfig.keepAheadSeconds
      );
    }
  }, [effectiveCacheConfig]);

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

  const getLangLabel = (lang?: string, fallback: string = '', title?: string) => {
    return getLanguageDisplayLabel(lang, fallback, title);
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

  // Restore cached subtitles from browser storage (localStorage & IndexedDB) if empty or cues missing
  useEffect(() => {
    if (!video) return;
    const hasCues = video.subtitleTracks && video.subtitleTracks.length > 0 && video.subtitleTracks.some(t => t.cues && t.cues.length > 0);
    if (hasCues) return;

    const syncSubs = getEmbedSubtitlesSync(video);
    if (syncSubs && syncSubs.length > 0 && syncSubs.some(t => t.cues && t.cues.length > 0)) {
      onUpdateVideo((prev: any) => ({
        ...prev,
        subtitleTracks: syncSubs
      }));
      return;
    }

    getEmbedSubtitlesAsync(video).then((asyncSubs) => {
      if (asyncSubs && asyncSubs.length > 0 && asyncSubs.some(t => t.cues && t.cues.length > 0)) {
        onUpdateVideo((prev: any) => {
          const currentHasCues = prev?.subtitleTracks && prev.subtitleTracks.some((t: any) => t.cues && t.cues.length > 0);
          if (!currentHasCues) {
            return { ...prev, subtitleTracks: asyncSubs };
          }
          return prev;
        });
      }
    });
  }, [video?.url, video?.id, video?.localFilePath]);

  // Auto-select subtitle track if downloaded or available and not currently selected
  useEffect(() => {
    if (userExplicitlyTurnedOffSubRef.current) return;
    if (selectedSubTrack) {
      if ((!selectedSubTrack.cues || selectedSubTrack.cues.length === 0) && subtitleTracks.length > 0) {
        const matching = subtitleTracks.find(t => t.id === selectedSubTrack.id && t.cues && t.cues.length > 0);
        if (matching) {
          setSelectedSubTrack(matching);
        }
      }
      return;
    }

    if (subtitleTracks && subtitleTracks.length > 0) {
      const tracksWithCues = subtitleTracks.filter(t => t.cues && t.cues.length > 0);
      const targetTrack = tracksWithCues.length > 0 ? tracksWithCues[tracksWithCues.length - 1] : subtitleTracks[subtitleTracks.length - 1];
      handleSelectSubTrack(targetTrack);
    }
  }, [subtitleTracks, selectedSubTrack]);

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
      if (video.type === 'local' && !video.streams && probingVideoIdRef.current !== video.id) {
        if (video.file) {
          if (!isWasmSupported()) {
            logger.player('WebAssembly is not supported in this browser. Skipping FFmpeg probe and using native stream.');
            return;
          }
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
        } else if (video.url || (video as any).localFilePath) {
          const targetUrl = (video as any).localFilePath || video.url;
          if ((video as any).streams && (video as any).streams.length > 0) return;
          if (probingVideoIdRef.current === video.id) return;
          probingVideoIdRef.current = video.id;

          const cached = remoteProbeCache.get(targetUrl);
          if (cached) {
            onUpdateVideoRef.current({
              ...video,
              duration: cached.duration ? String(cached.duration) : video.duration,
              streams: cached.allStreams || []
            });
            return;
          }

          if (inFlightRemoteProbes.has(targetUrl)) {
            await inFlightRemoteProbes.get(targetUrl);
            const resolvedCached = remoteProbeCache.get(targetUrl);
            if (resolvedCached) {
              onUpdateVideoRef.current({
                ...video,
                duration: resolvedCached.duration ? String(resolvedCached.duration) : video.duration,
                streams: resolvedCached.allStreams || []
              });
            }
            return;
          }

          setIsAutoProbing(true);
          try {
            const apiBase = sidecarService.getRemoteApiBase();
            const res = await fetch(`${apiBase}/api/remote/probe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: targetUrl })
            });
            if (res.ok) {
              const probeData = await res.json();
              const allStreams: any[] = [];
              if (probeData.videoStreams) probeData.videoStreams.forEach((v: any) => allStreams.push({ ...v, type: 'video' }));
              if (probeData.audioStreams) probeData.audioStreams.forEach((a: any) => allStreams.push({ ...a, type: 'audio' }));
              if (probeData.subtitleStreams) probeData.subtitleStreams.forEach((s: any) => allStreams.push({ ...s, type: 'subtitle' }));
              // Identify media characteristics and container type for sliding windows
              const detected = detectMediaProfile({ ...video, ...probeData });
              setProbedMediaProfile(detected);
              if (detected.is4K) {
                logger.player(`[LocalVideoPlayer] 4K UHD stream identified (${detected.label}). Automatically sliding buffer windows.`);
              }

              remoteProbeCache.set(targetUrl, {
                ...probeData,
                allStreams
              });
              onUpdateVideoRef.current({
                ...video,
                duration: probeData.duration ? String(probeData.duration) : video.duration,
                streams: allStreams
              });
            }
          } catch (probeErr) {
            logger.error('Remote probe fallback for local stream failed:', probeErr);
            probingVideoIdRef.current = null;
          } finally {
            setIsAutoProbing(false);
          }
        }
      }
    };
    autoProbe();
  }, [video.id, video.type, video.file, video.url]);

  // Synchronize Audio Volume / Muted State to video element and PlaybackController
  useEffect(() => {
    if (saveVolume) {
      localStorage.setItem('valor_volume', volume.toString());
      localStorage.setItem('valor_muted', isMuted ? 'true' : 'false');
    } else {
      localStorage.removeItem('valor_volume');
      localStorage.removeItem('valor_muted');
    }

    const hasAlternateAudio = activeAudioStreamIndex !== null || selectedAudioTrack !== null;

    if (videoRef.current) {
      videoRef.current.volume = volume;
      if (!playbackControllerRef.current || activeAudioStreamIndex === null) {
        videoRef.current.muted = isMuted;
      }
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

  const resetPauseOverlayTimer = useCallback(() => {
    if (pauseOverlayTimerRef.current) {
      clearTimeout(pauseOverlayTimerRef.current);
      pauseOverlayTimerRef.current = null;
    }
    if (!isPlaying) {
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
      pauseOverlayTimerRef.current = setTimeout(() => {
        showPauseMetadataOverlayRef.current = true;
        setShowPauseMetadataOverlay(true);
        setShowControls(false);
      }, 10000);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
      pauseOverlayTimerRef.current = setTimeout(() => {
        showPauseMetadataOverlayRef.current = true;
        setShowPauseMetadataOverlay(true);
        setShowControls(false);
      }, 10000);
    } else {
      if (pauseOverlayTimerRef.current) {
        clearTimeout(pauseOverlayTimerRef.current);
        pauseOverlayTimerRef.current = null;
      }
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
    }

    return () => {
      if (pauseOverlayTimerRef.current) {
        clearTimeout(pauseOverlayTimerRef.current);
        pauseOverlayTimerRef.current = null;
      }
    };
  }, [isPlaying]);

  // Controls Auto-Hide
  const resetControlsTimeout = () => {
    if (showPauseMetadataOverlayRef.current) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    const hideDelay = (uiHideTimeout || 1.5) * 1000;
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showAudioSubMenu && !showSettingsPanel && !showBookmarksPopover && !showAddDialog) {
        setShowControls(false);
      }
    }, hideDelay);
  };

  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (showPauseMetadataOverlayRef.current) {
      return;
    }
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
  }, [isPlaying, uiHideTimeout, showAudioSubMenu, showSettingsPanel, showBookmarksPopover, showAddDialog]);

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
          ? new CachedByteSource(new FileByteSource(activeFile instanceof File ? activeFile : new File([activeFile], (activeFile as any)?.name || 'video.mp4')), effectiveCacheConfig.chunkSizeBytes, effectiveCacheConfig.cacheLimit)
          : new CachedByteSource(new HttpByteSource(video.url), effectiveCacheConfig.chunkSizeBytes, effectiveCacheConfig.cacheLimit, effectiveCacheConfig.lookbehindChunks, effectiveCacheConfig.lookaheadChunks)
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
      saveMediaTimestamp(video, newTime, durationRef.current || videoRef.current.duration, video.title);
      onUpdateVideo({
        ...video,
        currentTime: newTime
      });
    }

    if (playbackControllerRef.current?.isNudgingVideo) return;

    if (seekTargetRef.current !== null && Math.abs(seekTargetRef.current - newTime) < 0.5) {
      seekTargetRef.current = null;
    }

    // Sync PlaybackController playhead on seek (avoiding re-entrant seek loop)
    if (playbackControllerRef.current && !playbackControllerRef.current.session.isTransitioningState) {
      const ctrlTime = playbackControllerRef.current.getCurrentTime();
      if (Math.abs(ctrlTime - newTime) > 0.4) {
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
  const handleSelectEmbeddedAudio = async (streamIndex: number, codec: string, language?: string, skipLoad = false, title?: string, skipNotification = false) => {
    if (!isWasmSupported()) {
      triggerSwitchToast('WebAssembly unavailable on this browser. Client stream demuxing disabled.');
      return;
    }
    // Guard: if this stream is already active, don't restart the engine
    if (activeAudioStreamIndex === streamIndex && selectedAudioTrack?.streamIndex === streamIndex && selectedAudioTrack?.url) {
      return;
    }
    if (audioDebounceTimeoutRef.current) {
      clearTimeout(audioDebounceTimeoutRef.current);
      audioDebounceTimeoutRef.current = null;
    }
    setActiveAudioStreamIndex(streamIndex);
    if (playbackControllerRef.current) {
      playbackControllerRef.current.switchAudioTrack(streamIndex);
    }
    const label = getLangLabel(language, `Track #${streamIndex}`, title);
    setSelectedAudioTrack({
      id: `remote-aud-${streamIndex}`,
      name: `Audio (${label})`,
      url: '',
      isExtracted: true,
      streamIndex,
      codec
    });
    if (playbackControllerRef.current) {
      playbackControllerRef.current.setVolume(volume, isMuted);
      playbackControllerRef.current.setAudioBoost(audioBoost);
    }
    if (!skipNotification && !showAudioSubMenu && !vlcContextMenuState.visible) {
      const str = audioStreams.find(s => s.index === streamIndex);
      island.notify({
        type: 'audio',
        language: language || str?.language,
        channels: (str as any)?.channels ? String((str as any).channels) : undefined,
        codec: codec || str?.codec,
        index: streamIndex,
        title: label || str?.title
      });
    }
    syncAudioRef(null, streamIndex);
    if (!skipLoad) {
      await loadAudioChunk(currentTime, streamIndex, codec, false);
    }
  };

  const handleSelectEmbeddedSubtitle = async (streamIndex: number, codec: string, language?: string, skipLoad = false, skipNotification = false) => {
    if (!isWasmSupported()) {
      triggerSwitchToast('WebAssembly unavailable on this browser. Embedded subtitle extraction disabled.');
      return;
    }
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
    if (!skipNotification && !showAudioSubMenu && !vlcContextMenuState.visible) {
      const str = subtitleStreams.find(s => s.index === streamIndex);
      island.notify({
        type: 'subtitle',
        language: language || str?.language || 'und',
        index: streamIndex,
        title: label || str?.title
      });
    }
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
    if (video.type === 'local' && !video.file && video.playbackMode !== 'advanced') {
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
      triggerPlayPauseFeedback('pause');
    } else {
      if (playbackControllerRef.current) {
        playbackControllerRef.current.play().catch(console.error);
      } else {
        videoRef.current.play().catch(console.error);
      }
      setIsPlaying(true);
      triggerPlayPauseFeedback('play');
    }
    resetControlsTimeout();
  };

  const handleRewind = (seconds = 10) => {
    if (uiConfig.blockSeekingCompletely) return;
    const now = Date.now();
    const acc = consecutiveSkipAccumulatorRef.current;
    
    // Consecutive skipping window (1.8s)
    if (acc.direction === 'rewind' && now - acc.lastTime <= 1800 && acc.count > 0) {
      acc.totalSeconds += seconds;
      acc.count += 1;
    } else {
      acc.direction = 'rewind';
      acc.totalSeconds = seconds;
      acc.count = 1;
    }
    acc.lastTime = now;

    const baseTime = getEffectiveTime();
    const targetTime = Math.max(0, baseTime - seconds);
    seekTargetRef.current = targetTime;
    setCurrentTime(targetTime);

    if (playbackControllerRef.current) {
      playbackControllerRef.current.seek(targetTime).catch(console.error);
    } else if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }

    if (showPauseMetadataOverlayRef.current) {
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
    }

    setConsecutiveSkipInfo({ direction: 'rewind', totalSeconds: acc.totalSeconds, count: acc.count });

    if (consecutiveSkipTimerRef.current) {
      clearTimeout(consecutiveSkipTimerRef.current);
    }
    // Each skip resets the timer! Resets smoothly after user stops skipping (1.8s window)
    consecutiveSkipTimerRef.current = setTimeout(() => {
      consecutiveSkipAccumulatorRef.current = { direction: 'rewind', totalSeconds: 0, count: 0, lastTime: 0 };
      setConsecutiveSkipInfo(null);
      seekTargetRef.current = null;
    }, 1800);

    resetPauseOverlayTimer();
  };

  const handleForward = (seconds = 10) => {
    if (uiConfig.blockSeekingCompletely) return;
    const now = Date.now();
    const acc = consecutiveSkipAccumulatorRef.current;
    
    // Consecutive skipping window (1.8s)
    if (acc.direction === 'forward' && now - acc.lastTime <= 1800 && acc.count > 0) {
      acc.totalSeconds += seconds;
      acc.count += 1;
    } else {
      acc.direction = 'forward';
      acc.totalSeconds = seconds;
      acc.count = 1;
    }
    acc.lastTime = now;

    const baseTime = getEffectiveTime();
    const maxDuration = duration || (videoRef.current?.duration) || 0;
    const targetTime = maxDuration > 0 ? Math.min(maxDuration, baseTime + seconds) : baseTime + seconds;
    seekTargetRef.current = targetTime;
    setCurrentTime(targetTime);

    if (playbackControllerRef.current) {
      playbackControllerRef.current.seek(targetTime).catch(console.error);
    } else if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }

    if (showPauseMetadataOverlayRef.current) {
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
    }

    setConsecutiveSkipInfo({ direction: 'forward', totalSeconds: acc.totalSeconds, count: acc.count });

    if (consecutiveSkipTimerRef.current) {
      clearTimeout(consecutiveSkipTimerRef.current);
    }
    // Each skip resets the timer! Resets smoothly after user stops skipping (1.8s window)
    consecutiveSkipTimerRef.current = setTimeout(() => {
      consecutiveSkipAccumulatorRef.current = { direction: 'forward', totalSeconds: 0, count: 0, lastTime: 0 };
      setConsecutiveSkipInfo(null);
      seekTargetRef.current = null;
    }, 1800);

    resetPauseOverlayTimer();
  };

  const handlePlayerDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (isLocked || showPlayBarMode === 'disable' || uiConfig.blockSeekingCompletely) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest(
      '.bookmarks-popover, .bookmark-mobile-panel, .bookmark-mobile-backdrop, .bookmark-dialog-box, .bookmark-dialog-overlay, ' +
      '.audio-sub-popover, .asp-pop, .asp-sheet, .asp-sheet-backdrop, ' +
      '.ui-settings-slideout-drawer, .ui-settings-drawer-card, .ui-settings-drawer-backdrop, .ui-settings-unified-handle, ' +
      '.popover-wrapper, .vlc-context-menu, .marking-hud-button-controls, button, input, select, textarea, [role="dialog"], [role="menu"]'
    )) {
      return;
    }
    if (showPauseMetadataOverlayRef.current) {
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
      resetControlsTimeout();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // Ignore double clicks in the bottom 20% to avoid interfering with controls
    if (clickY > height * 0.8) return;

    if (clickX < width * 0.24) {
      handleRewind();
    } else if (clickX > width * 0.76) {
      handleForward();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (uiConfig.blockSeekingCompletely) return;
    resetPauseOverlayTimer();
    const seekTime = parseFloat(e.target.value);
    if (isScrubbingRef.current) {
      setScrubTime(seekTime);
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = seekTime;
      }
    } else {
      seekTargetRef.current = seekTime;
      setCurrentTime(seekTime);
      if (playbackControllerRef.current) {
        playbackControllerRef.current.seek(seekTime).catch(console.error);
      } else if (videoRef.current) {
        videoRef.current.currentTime = seekTime;
      }
      resetControlsTimeout();
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = seekTime;
      }
      if (seekTargetTimerRef.current) clearTimeout(seekTargetTimerRef.current);
      seekTargetTimerRef.current = setTimeout(() => {
        seekTargetRef.current = null;
      }, 1000);
    }
  };

  const toggleFullscreen = async () => {
    resetControlsTimeout();
    const doc: any = document;
    const isCurrentlyFs = !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement ||
      (videoRef.current && (videoRef.current as any).webkitDisplayingFullscreen) ||
      isPseudoFullscreen
    );

    if (isCurrentlyFs) {
      if (isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
      }
      try {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.webkitCancelFullScreen) {
          await doc.webkitCancelFullScreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      } catch (err) {
        logger.player('Exit fullscreen error: ' + err);
      }

      if (videoRef.current && typeof (videoRef.current as any).webkitExitFullscreen === 'function') {
        try {
          (videoRef.current as any).webkitExitFullscreen();
        } catch (e) {}
      }

      setIsFullscreen(false);
    } else {
      let enteredNative = false;
      const container: any = containerRef.current;
      const videoEl: any = videoRef.current;

      // 1. Try Element.requestFullscreen (with vendor prefixes) on the container
      if (container) {
        try {
          if (container.requestFullscreen) {
            await container.requestFullscreen();
            enteredNative = true;
          } else if (container.webkitRequestFullscreen) {
            await container.webkitRequestFullscreen();
            enteredNative = true;
          } else if (container.webkitRequestFullScreen) {
            await container.webkitRequestFullScreen();
            enteredNative = true;
          } else if (container.mozRequestFullScreen) {
            await container.mozRequestFullScreen();
            enteredNative = true;
          } else if (container.msRequestFullscreen) {
            await container.msRequestFullscreen();
            enteredNative = true;
          }
        } catch (err) {
          logger.player('Container requestFullscreen failed / restricted, attempting fallbacks: ' + err);
        }
      }

      // 2. If container fullscreen failed (common on iOS Safari), try native video element fullscreen
      if (!enteredNative && videoEl) {
        try {
          if (typeof videoEl.webkitEnterFullscreen === 'function') {
            videoEl.webkitEnterFullscreen();
            enteredNative = true;
          } else if (typeof videoEl.webkitRequestFullscreen === 'function') {
            await videoEl.webkitRequestFullscreen();
            enteredNative = true;
          }
        } catch (err) {
          logger.player('Video webkitEnterFullscreen failed: ' + err);
        }
      }

      // 3. Fallback to CSS pseudo-fullscreen
      if (!enteredNative) {
        setIsPseudoFullscreen(true);
      }

      setIsFullscreen(true);
    }
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

  const handleCast = async () => {
    if (!videoRef.current) return;
    const videoEl = videoRef.current as any;
    
    // 1. Google Cast Web SDK
    const cast = (window as any).cast;
    const chrome = (window as any).chrome;
    if (cast && cast.framework && chrome && chrome.cast) {
      try {
        const castContext = cast.framework.CastContext.getInstance();
        let session = castContext.getCurrentSession();
        if (!session) {
          await castContext.requestSession();
          session = castContext.getCurrentSession();
        }
        if (session) {
          const mediaUrl = video.url || videoEl.src || '';
          const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, 'video/mp4');
          mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
          mediaInfo.metadata.title = video.title || video.fileName || 'Video';
          const request = new chrome.cast.media.LoadRequest(mediaInfo);
          request.currentTime = videoEl.currentTime || 0;
          request.autoplay = !videoEl.paused;
          await session.loadMedia(request);
          triggerSwitchToast('Casting to TV / Chromecast');
          return;
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && err !== 'cancel') {
          console.warn('Google Cast request error:', err);
        }
      }
    }

    // 2. HTML5 Remote Playback Web API (Chrome/Edge Native Cast to Device)
    if (videoEl.remote && typeof videoEl.remote.prompt === 'function') {
      try {
        await videoEl.remote.prompt();
        triggerSwitchToast('Connecting to Device...');
        return;
      } catch (err: any) {
        if (err?.name !== 'NotFoundError' && err?.name !== 'AbortError') {
          console.warn('Remote playback prompt error:', err);
        }
      }
    }

    // 3. Apple AirPlay target picker
    if (typeof videoEl.webkitShowPlaybackTargetPicker === 'function') {
      videoEl.webkitShowPlaybackTargetPicker();
      return;
    }

    // 4. W3C Presentation API
    if (typeof (window as any).PresentationRequest === 'function') {
      try {
        const presReq = new (window as any).PresentationRequest([video.url || window.location.href]);
        await presReq.start();
        triggerSwitchToast('Presentation Started');
        return;
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('Presentation API error:', err);
        }
      }
    }

    triggerSwitchToast('Cast device picker opening...');
    togglePiP();
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc: any = document;
      const isNativeFs = !!(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement ||
        (videoRef.current && (videoRef.current as any).webkitDisplayingFullscreen)
      );
      const fs = isNativeFs || isPseudoFullscreen;
      setIsFullscreen(fs);
    };

    const docEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    docEvents.forEach(evt => document.addEventListener(evt, handleFullscreenChange));

    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.addEventListener('webkitbeginfullscreen', handleFullscreenChange);
      videoEl.addEventListener('webkitendfullscreen', handleFullscreenChange);
    }

    return () => {
      docEvents.forEach(evt => document.removeEventListener(evt, handleFullscreenChange));
      if (videoEl) {
        videoEl.removeEventListener('webkitbeginfullscreen', handleFullscreenChange);
        videoEl.removeEventListener('webkitendfullscreen', handleFullscreenChange);
      }
    };
  }, [isPseudoFullscreen]);

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
    
    if (!showAudioSubMenu && !vlcContextMenuState.visible) {
      if (track === null) {
        island.notify({ type: 'audio', language: 'und', index: 0, title: 'Default Audio' });
      } else if (track.streamIndex !== undefined) {
        const s = audioStreams.find(str => str.index === track.streamIndex);
        island.notify({
          type: 'audio',
          language: track.language || s?.language,
          channels: (s as any)?.channels ? String((s as any).channels) : undefined,
          codec: track.codec || s?.codec,
          index: track.streamIndex,
          title: track.name || s?.title
        });
      } else {
        island.notify({ type: 'audio', title: track.name, language: track.language });
      }
    }

    if (targetIdx !== -1) {
      playbackControllerRef.current?.switchAudioTrack(targetIdx);
    } else {
      playbackControllerRef.current?.switchAudioTrack(null);
      if (videoRef.current) {
        videoRef.current.muted = isMuted;
        videoRef.current.volume = volume;
      }
    }
    if (playbackControllerRef.current) {
      playbackControllerRef.current.setVolume(volume, isMuted);
      playbackControllerRef.current.setAudioBoost(audioBoost);
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
    if (track === null) {
      userExplicitlyTurnedOffSubRef.current = true;
      if (!showAudioSubMenu && !vlcContextMenuState.visible) {
        island.notify({ type: 'subtitle', language: null });
      }
    } else {
      userExplicitlyTurnedOffSubRef.current = false;
      if (!showAudioSubMenu && !vlcContextMenuState.visible) {
        if (track.streamIndex !== undefined) {
          const s = subtitleStreams.find(str => str.index === track.streamIndex);
          island.notify({
            type: 'subtitle',
            language: track.language ?? s?.language ?? null,
            index: track.streamIndex,
            title: track.name || s?.title
          });
        } else {
          island.notify({ type: 'subtitle', language: track.language ?? null, title: track.name });
        }
      }
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
      island.notify({ type: 'subtitle', language: null });
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
      island.notify({ type: 'subtitle', language: (nextOpt.track as any)?.language ?? null, title: nextOpt.name });
    }
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
      island.notify({ type: 'audio', language: 'und', index: 0, title: 'Default Audio' });
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
      island.notify({ type: 'audio', title: nextOpt.name, language: (nextOpt.track as any)?.language });
    }
  };

  const handleTakeSnapshot = useCallback(() => {
    if (videoRef.current) {
      try {
        const v = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || v.clientWidth;
        canvas.height = v.videoHeight || v.clientHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          const videoTitle = video.title || 'video';
          const sanitizedTitle = videoTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          link.download = `${sanitizedTitle}_snapshot_${Math.floor(v.currentTime)}s.png`;
          link.href = dataUrl;
          link.click();
          triggerSwitchToast('Snapshot Saved!');
        }
      } catch (err) {
        console.error('Failed to capture snapshot:', err);
        triggerSwitchToast('Snapshot capture blocked by security policy');
      }
    }
  }, [video.title, triggerSwitchToast]);

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
    if (
      (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type !== 'range') ||
      document.activeElement?.tagName === 'TEXTAREA'
    ) {
      return;
    }

    // Ignore browser/system shortcuts
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    // Dismiss paused metadata overlay and show UI on any keyboard activation
    if (showPauseMetadataOverlayRef.current) {
      showPauseMetadataOverlayRef.current = false;
      setShowPauseMetadataOverlay(false);
      resetControlsTimeout();
    }

    // Load keybind settings with userId support
    const settingsKey = userId && userId !== 'local' ? `valor_settings_${userId}` : 'valor_settings';
    const saved = localStorage.getItem(settingsKey) || localStorage.getItem('valor_settings');
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

    const normPressed = normalizeKey(e.key);
    const normCode = normalizeKey(e.code);
    const matchesKey = (targetKey: string) => {
      if (!targetKey) return false;
      const normTarget = normalizeKey(targetKey);
      if (!normTarget) return false;
      return normPressed === normTarget || (normCode !== '' && normCode === normTarget);
    };

    const lockControlsKey = keybinds.lockControls || 'w';
    const openSettingsKey = keybinds.openSettings || 'delete';
    const addBookmarkKey = keybinds.addBookmark || 't';
    const toggleMuteKey = keybinds.toggleMute || 'm';
    const audioBoostKey = keybinds.audioBoost || 'n';
    const frameStepKey = keybinds.frameStep || 'e';
    const screenshotKey = keybinds.screenshot || 's';

    if (matchesKey(openSettingsKey)) {
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

    if (matchesKey(addBookmarkKey)) {
      e.preventDefault();
      if (isUndetectedLocalMedia) {
        return;
      }
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
    
    if (matchesKey(lockControlsKey)) {
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
      const isBoostKey = matchesKey(audioBoostKey);
      const isScreenshotKey = matchesKey(screenshotKey);
      const isSkipKey = pressedKey === 'c';
      if (!isVolumeKey && !isBoostKey && !isScreenshotKey && !isSkipKey) {
        e.preventDefault();
        e.stopPropagation();
        triggerSwitchToast("Controls are Locked");
        return;
      }
    }
    const playPauseKey = keybinds.playPause || ' ';
    const rewindKey = keybinds.rewind || 'arrowleft';
    const forwardKey = keybinds.forward || 'arrowright';
    const fullscreenKey = keybinds.fullscreen || 'f';
    const exitKey = keybinds.exit || 'escape';
    const nextSubKey = keybinds.nextSubtitle || 'b';
    const nextAudioKey = keybinds.nextAudio || 'v';

    if (matchesKey(fullscreenKey)) {
      e.preventDefault();
      if (showFullscreenMode === 'disable') {
        triggerSwitchToast('Fullscreen hotkey is disabled');
        return;
      }
      toggleFullscreen();
    } else if (matchesKey(exitKey)) {
      e.preventDefault();
      if (isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
        setIsFullscreen(false);
        return;
      }
      const doc: any = document;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc)
          .then(() => handleExit())
          .catch(() => handleExit());
      } else {
        handleExit();
      }
    } else if (matchesKey(playPauseKey)) {
      e.preventDefault();
      if (showPlayButtonMode === 'disable') {
        triggerSwitchToast('Playback hotkeys are disabled');
        return;
      }
      togglePlay();
    } else if (matchesKey(rewindKey)) {
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
      }
    } else if (matchesKey(forwardKey)) {
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
    } else if (matchesKey(nextSubKey)) {
      e.preventDefault();
      cycleSubtitles();
    } else if (matchesKey(nextAudioKey)) {
      e.preventDefault();
      cycleAudio();
    } else if (matchesKey(toggleMuteKey)) {
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
    } else if (matchesKey(audioBoostKey)) {
      e.preventDefault();
      let nextBoost = 100;
      if (audioBoost === 100) nextBoost = 150;
      else if (audioBoost === 150) nextBoost = 200;
      else nextBoost = 100;
      handleSetAudioBoost(nextBoost);
    } else if (matchesKey(frameStepKey)) {
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
    } else if (matchesKey(screenshotKey)) {
      e.preventDefault();
      handleTakeSnapshot();
    } else if (pressedKey === 'g') {
      e.preventDefault();
      setTimelineOnlyMode(prev => {
        const next = !prev;
        triggerSwitchToast(next ? 'Timeline Only (VLC Mode)' : 'Standard Controls');
        return next;
      });
    } else if (pressedKey === 'a') {
      e.preventDefault();
      handleToggleAmbiance();
    } else if (pressedKey === 'h') {
      e.preventDefault();
      cycleToneMapping();
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
        target.closest('.audio-sub-popover-center') ||
        target.closest('.vlc-context-menu') ||
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
        const settingsKey = userId && userId !== 'local' ? `valor_settings_${userId}` : 'valor_settings';
        const saved = localStorage.getItem(settingsKey) || localStorage.getItem('valor_settings');
        const parsed = saved ? JSON.parse(saved) : {};
        const keybinds = parsed.keybinds || {};
        const isBound = Object.values(keybinds).some(v => normalizeKey(v as string) === pressedKey);
        
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
    if (!isWasmSupported()) {
      logger.player('WebAssembly is not supported in this browser. Running in pure Native Browser Playback mode.');
      if (videoRef.current) {
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => logger.player('Autoplay blocked:', err));
      }
      return;
    }

    let active = true;
    let controller: PlaybackController | null = null;

    const init = async () => {
      // Wait for any previous controller to finish destroying completely
      await prevDestroyPromiseRef.current;
      if (!active) return;

      // Don't initialize playback for local videos without a valid file —
      // the blob URL is dead after page reload. The lock overlay handles reassociation.
      if (video.type === 'local' && !activeFile && video.playbackMode !== 'advanced') return;

      if (videoRef.current) {
        const fileOrSource = activeFile
          ? (activeFile instanceof File ? activeFile : new File([activeFile], (activeFile as any)?.name || 'video.mp4'))
          : new HttpByteSource(video.url);

        const ffmpegMgr = new FFmpegManager(video.id);
        const demuxMgr = new DemuxManager(ffmpegMgr, fileOrSource);
        controller = new PlaybackController(ffmpegMgr, demuxMgr, video.seekMap);
        controller.setCacheRetention(effectiveCacheConfig.keepBehindSeconds, effectiveCacheConfig.keepAheadSeconds);
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
          const audioTracks = (video.streams || []).filter((s: any) => s.type === 'audio');
          const isNonNativeAudio = audioTracks.some((s: any) => !isBrowserPlayableAudioCodec(s.codec));
          const targetAudioIndex = (audioTracks.length >= 2 || isNonNativeAudio)
            ? (activeAudioStreamIndex ?? audioTracks[0]?.index ?? null)
            : activeAudioStreamIndex;
          const initialResume = (video.currentTime && video.currentTime > 0)
            ? video.currentTime
            : (getMediaTimestamp(video) || (videoRef.current ? videoRef.current.currentTime : 0));
          await controller.initialize(videoRef.current, targetAudioIndex, initialResume);
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
  const pauseOnFocusChangeRef = useRef(playerSettings.pauseOnFocusChange);
  pauseOnFocusChangeRef.current = playerSettings.pauseOnFocusChange;

  useEffect(() => {
    if (playbackControllerRef.current) {
      playbackControllerRef.current.pauseOnFocusChange = playerSettings.pauseOnFocusChange;
    }
  }, [playerSettings.pauseOnFocusChange]);

  // Pause/Resume on Window Focus / Visibility changes if enabled
  useEffect(() => {
    const handleFocusLoss = () => {
      if (!pauseOnFocusChangeRef.current || isLocked) return;
      const isCurrentlyPlaying = isPlayingRef.current || (videoRef.current && !videoRef.current.paused) || (playbackControllerRef.current?.state?.isPlaying ?? false);
      if (isCurrentlyPlaying) {
        logger.player('Focus lost, auto-pausing video playback');
        if (playbackControllerRef.current) {
          playbackControllerRef.current.pause();
        }
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        setIsPlaying(false);
        isPlayingRef.current = false;
        wasPausedByFocusLossRef.current = true;
      }
    };

    const handleFocusGain = () => {
      if (!pauseOnFocusChangeRef.current || isLocked) return;
      if (wasPausedByFocusLossRef.current) {
        logger.player('Focus regained, auto-resuming video playback');
        const p = playbackControllerRef.current 
          ? playbackControllerRef.current.play() 
          : videoRef.current?.play();
        p?.then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        }).catch(err => logger.player('Autoplay play error on focus gain:', err));
        wasPausedByFocusLossRef.current = false;
      }
    };

    const handleVisibilityChange = () => {
      if (!pauseOnFocusChangeRef.current || isLocked) return;
      if (document.visibilityState === 'hidden') {
        const isCurrentlyPlaying = isPlayingRef.current || (videoRef.current && !videoRef.current.paused) || (playbackControllerRef.current?.state?.isPlaying ?? false);
        if (isCurrentlyPlaying) {
          logger.player('Tab hidden, auto-pausing video playback');
          if (playbackControllerRef.current) {
            playbackControllerRef.current.pause();
          }
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
          wasPausedByFocusLossRef.current = true;
        }
      } else if (document.visibilityState === 'visible') {
        handleFocusGain();
        window.dispatchEvent(new Event('resize'));
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

  // Tab active and window focus state tracking for Focus-On-Click
  const focusOnClickEffective = focusOnClick !== false && focusOnClickNoPause !== false && playerSettings.focusOnClick !== false;
  const focusOnClickRef = useRef(focusOnClickEffective);
  focusOnClickRef.current = focusOnClickEffective;

  // Track if tab or window was inactive
  const wasTabInactiveRef = useRef<boolean>(
    typeof document !== 'undefined' ? (!document.hasFocus() || document.visibilityState === 'hidden') : false
  );
  const isActivatingInteractionRef = useRef<boolean>(false);

  useEffect(() => {
    const handleWinBlur = () => {
      wasTabInactiveRef.current = true;
    };
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') {
        wasTabInactiveRef.current = true;
      }
    };
    const handleCapturePointerDown = () => {
      const isUnfocused = !document.hasFocus() || document.visibilityState === 'hidden';
      if (isUnfocused || wasTabInactiveRef.current) {
        isActivatingInteractionRef.current = true;
      }
    };

    window.addEventListener('blur', handleWinBlur);
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('pointerdown', handleCapturePointerDown, true);
    window.addEventListener('mousedown', handleCapturePointerDown, true);

    return () => {
      window.removeEventListener('blur', handleWinBlur);
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('pointerdown', handleCapturePointerDown, true);
      window.removeEventListener('mousedown', handleCapturePointerDown, true);
    };
  }, []);

  const isFocusClick = useCallback(() => {
    if (!focusOnClickRef.current) return false;
    const isInactive = !document.hasFocus() || document.visibilityState === 'hidden';
    const isFocus = isInactive || wasTabInactiveRef.current || isActivatingInteractionRef.current;
    if (isFocus) {
      logger.player(`Focus click detected (inactive=${isInactive}, wasTabInactive=${wasTabInactiveRef.current}, activating=${isActivatingInteractionRef.current}) — preserving media playback state`);
      wasTabInactiveRef.current = false;
      isActivatingInteractionRef.current = false;
      return true;
    }
    return false;
  }, []);

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
          if (videoRef.current && duration > 0 && !ratingPromptedRef.current && !isUndetectedLocalMedia) {
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

        saveMediaTimestamp(video, latestTimeRef.current, durationRef.current || (videoRef.current ? videoRef.current.duration : 0), video.title);
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

  // Persist media playback timestamp on browser reload or unload
  useEffect(() => {
    const handleUnload = () => {
      const time = latestTimeRef.current || (videoRef.current ? videoRef.current.currentTime : 0);
      const dur = durationRef.current || (videoRef.current ? videoRef.current.duration : 0);
      if (time > 0) {
        saveMediaTimestamp(video, time, dur, video.title);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      handleUnload();
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [video]);

  // Auto-select preferred default audio/subtitle streams
  useEffect(() => {
    if (streams.length > 0 && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      try {
        const saved = localStorage.getItem('valor_settings');
        const settings = saved ? JSON.parse(saved) : { defaultAudio: 'ENG', defaultSub: 'ENG' };
        const targetAudio = settings.defaultAudio || 'ENG';
        const targetSub = settings.defaultSub || 'ENG';

        // Auto-select audio stream if media has 2+ audio tracks OR if the audio track is non-native (e.g. AC3/EAC3/DTS)
        const isSingleTrackNonNative = audioStreams.length === 1 && !isBrowserPlayableAudioCodec(audioStreams[0]?.codec);
        if (audioStreams.length >= 2 || isSingleTrackNonNative) {
          let audioSelected = false;
          if (targetAudio !== 'Original' && !selectedAudioTrack) {
            const stream = findPreferredStream(audioStreams, targetAudio, 'audio');
            if (stream) {
              audioSelected = true;
              logger.player(`Auto-selecting audio track: ${stream.language || stream.title}`);
              handleSelectEmbeddedAudio(stream.index, stream.codec, stream.language, false, stream.title, true);
            }
          }

          // Always auto-select the first audio track when available if no preferred track matched
          if (!audioSelected && !selectedAudioTrack && audioStreams.length > 0) {
            const firstAudio = audioStreams[0];
            logger.player(`Auto-selecting first audio track: ${firstAudio.language || firstAudio.title || 'unknown'} (${firstAudio.codec})`);
            handleSelectEmbeddedAudio(firstAudio.index, firstAudio.codec, firstAudio.language, false, firstAudio.title, true);
          }
        } else if (audioStreams.length === 1 && isBrowserPlayableAudioCodec(audioStreams[0]?.codec) && !selectedAudioTrack) {
          // Single natively playable track (e.g. AAC/MP3): use HTML5 native audio
          setActiveAudioStreamIndex(null);
          setSelectedAudioTrack(null);
          if (playbackControllerRef.current) {
            playbackControllerRef.current.switchAudioTrack(null);
          }
          if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.volume = volume;
          }
          logger.player(`Media has 1 native audio track (${audioStreams[0]?.codec}). Using native HTML5 audio.`);
        }
        // Auto-select subtitle stream
        if (targetSub !== 'Off' && !selectedSubTrack) {
          const stream = findPreferredStream(subtitleStreams, targetSub, 'subtitle');
          if (stream) {
            logger.player(`Auto-selecting subtitle track: ${stream.language || stream.title}`);
            handleSelectEmbeddedSubtitle(stream.index, stream.codec, stream.language, false, true);
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
        name: trimSubtitleName(file.name.replace(/\.[^/.]+$/, ''), 'custom'),
        url: '',
        cues: cues,
        isExtracted: false,
        language: 'custom'
      };

      const updatedTracks = [...subtitleTracks, newTrack];
      const updatedVideo = {
        ...video,
        subtitleTracks: updatedTracks
      };
      onUpdateVideo(updatedVideo);
      saveEmbedSubtitles(video, updatedTracks);
      userExplicitlyTurnedOffSubRef.current = false;
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
            onClick={() => {
              const nextVal = !playerSettings.pauseOnFocusChange;
              updatePlayerSetting('pauseOnFocusChange', nextVal);
              triggerSwitchToast(nextVal ? "Auto-pause on focus loss enabled" : "Auto-pause on focus loss disabled");
            }}
            onMouseEnter={() => setHoveredSetting('pauseOnFocusChange')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={playerSettings.pauseOnFocusChange ? "Auto-Pause on Focus Loss: Enabled" : "Auto-Pause on Focus Loss: Disabled"}
            className={`settings-icon-toggle ${playerSettings.pauseOnFocusChange ? 'active-blue' : 'active-red'}`}
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
      case 'ambianceLighting':
        return (
          <button
            key="ambianceLighting"
            onClick={handleToggleAmbiance}
            onMouseEnter={() => setHoveredSetting('ambianceLighting')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={`Ambiance Glow: ${isAmbianceEnabled ? 'Enabled' : 'Disabled'}`}
            className={`settings-icon-toggle ${isAmbianceEnabled ? 'active-blue' : ''}`}
            style={{
              background: isAmbianceEnabled ? 'rgba(59, 130, 246, 0.22)' : 'var(--border-subtle, rgba(255, 255, 255, 0.05))',
              border: `1px solid ${isAmbianceEnabled ? 'rgba(59, 130, 246, 0.65)' : 'var(--border-color, rgba(255, 255, 255, 0.1))'}`,
              color: isAmbianceEnabled ? '#60a5fa' : 'var(--text-secondary, rgba(255, 255, 255, 0.8))',
              borderRadius: '12px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: '54px',
              width: '54px'
            }}
          >
            <Sparkles size={22} />
          </button>
        );
      case 'hdrToneMapping':
        return (
          <button
            key="hdrToneMapping"
            onClick={cycleToneMapping}
            onMouseEnter={() => setHoveredSetting('hdrToneMapping')}
            onMouseLeave={() => setHoveredSetting(null)}
            title={`HDR Tone Mapping: ${toneMappingMode.toUpperCase()} (Click to cycle)`}
            className={`settings-icon-toggle ${toneMappingMode !== 'off' ? 'active-yellow' : ''}`}
            style={{
              position: 'relative',
              background: toneMappingMode !== 'off' ? 'rgba(245, 158, 11, 0.22)' : 'var(--border-subtle, rgba(255, 255, 255, 0.05))',
              border: `1px solid ${toneMappingMode !== 'off' ? 'rgba(245, 158, 11, 0.65)' : 'var(--border-color, rgba(255, 255, 255, 0.1))'}`,
              color: toneMappingMode !== 'off' ? '#fbbf24' : 'var(--text-secondary, rgba(255, 255, 255, 0.8))',
              borderRadius: '12px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              height: '54px',
              width: '54px'
            }}
          >
            <Sun size={22} />
            {toneMappingMode !== 'off' && (
              <span style={{
                position: 'absolute',
                top: '3px',
                right: '3px',
                fontSize: '8px',
                fontWeight: 800,
                background: '#f59e0b',
                color: '#000',
                borderRadius: '3px',
                padding: '0 3px',
                lineHeight: '11px'
              }}>
                {toneMappingMode === 'aces' ? 'ACES' : toneMappingMode === 'vibrant' ? 'VIB' : 'REIN'}
              </span>
            )}
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

  const isFileAccessBlocked = video.type === 'local' && (!activeFile || hasFileAccessError) && video.playbackMode !== 'advanced';
  const controlsVisible = (showControls && !isLocked && !showPauseMetadataOverlay) || isFileAccessBlocked;
  const effectiveDuration = duration || parseDurationToSeconds(video.duration) || 0;
  const displayTime = (isScrubbing && scrubTime !== null) 
    ? scrubTime 
    : (seekTargetRef.current !== null ? seekTargetRef.current : currentTime);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    if (showSettingsPanel || showAddDialog || showBookmarksPopover || showAudioSubMenu || showConsoleOverlay) return;
    
    const target = e.target as HTMLElement;
    if (
      target.closest('.player-settings-panel') || 
      target.closest('.bookmarks-popover') || 
      target.closest('.audio-sub-popover') || 
      target.closest('.audio-sub-popover-center') || 
      target.closest('.speed-popover-container') ||
      target.closest('.vlc-context-menu')
    ) return;

    e.preventDefault();
    if (showVolumeControlMode === 'disable') {
      return;
    }

    if (e.deltaY < 0) {
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
    } else if (e.deltaY > 0) {
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

  return (
    <div 
      ref={containerRef} 
      className={`player-container ${isFileAccessBlocked ? 'has-file-access-blocked show-cursor' : ((controlsVisible || showPauseMetadataOverlay) ? 'show-cursor' : 'hide-cursor')} ${hideUIOverlays ? 'keyboard-only' : ''} ${disableAnimations ? 'no-animations' : ''} ${hoveredSetting === 'lockModeActive' || hoveredSetting === 'pauseOnFocusChange' || hoveredSetting === 'disableAnimations' ? 'highlight-active' : ''} ${isPseudoFullscreen ? 'pseudo-fullscreen' : ''}`}
      style={{
        '--player-ui-scale': uiScale
      } as React.CSSProperties}
      onMouseMove={(e) => {
        if (!isLocked) handleMouseMove(e);
      }}
      onMouseLeave={() => {
        if (!isScrubbing && !showPauseMetadataOverlay) setShowControls(false);
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && target.closest(
          '.bookmarks-popover, .bookmark-mobile-panel, .bookmark-mobile-backdrop, .bookmark-dialog-box, .bookmark-dialog-overlay, ' +
          '.audio-sub-popover, .asp-pop, .asp-sheet, .asp-sheet-backdrop, ' +
          '.ui-settings-slideout-drawer, .ui-settings-drawer-card, .ui-settings-drawer-backdrop, .ui-settings-unified-handle, ' +
          '.popover-wrapper, .vlc-context-menu, .marking-hud-button-controls, button, input, select, textarea, [role="dialog"], [role="menu"]'
        )) {
          return;
        }

        if (vlcContextMenuState.visible || (Date.now() - vlcContextMenuClosedTimestampRef.current < 350)) {
          if (vlcContextMenuState.visible) {
            setVlcContextMenuState({ visible: false, x: 0, y: 0 });
          }
          return;
        }

        if (isFocusClick()) {
          resetControlsTimeout();
          return;
        }

        if (showPauseMetadataOverlayRef.current) {
          if (isFocusClick()) {
            resetControlsTimeout();
            return;
          }
          showPauseMetadataOverlayRef.current = false;
          setShowPauseMetadataOverlay(false);
          togglePlay();
          resetControlsTimeout();
        }
      }}
      onWheel={handleWheel}
      onDoubleClick={handlePlayerDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!hideUIOverlays) {
          setVlcContextMenuState({ visible: true, x: e.clientX, y: e.clientY });
        }
      }}
    >
      <PlayerIsland
        audioTracks={audioStreams.map(s => ({
          index: s.index,
          label: s.title || getLangLabel(s.language, `Track #${s.index}`),
          language: s.language,
          channels: (s as any).channels ? String((s as any).channels) : undefined,
          codec: s.codec
        }))}
        subtitleTracks={subtitleStreams.map(s => ({
          index: s.index,
          label: s.title || getLangLabel(s.language, `Track #${s.index}`),
          language: s.language
        }))}
        selectedAudioIndex={activeAudioStreamIndex ?? undefined}
        selectedSubtitleIndex={activeSubStreamIndex ?? -1}
        onSelectAudio={(index) => {
          const st = audioStreams.find(s => s.index === index);
          if (st) handleSelectEmbeddedAudio(st.index, st.codec, st.language, false, st.title);
        }}
        onSelectSubtitle={(index) => {
          if (index === -1) {
            handleSelectSubTrack(null);
          } else {
            const st = subtitleStreams.find(s => s.index === index);
            if (st) handleSelectEmbeddedSubtitle(st.index, st.codec, st.language);
          }
        }}
      />



      {isFileAccessBlocked && (
        <div 
          className="file-access-blocked-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 600,
            color: 'var(--text-primary, #ffffff)',
            fontFamily: "'Inter', sans-serif",
            cursor: 'default',
            pointerEvents: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
        >
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--dropdown-border, rgba(255, 255, 255, 0.12))',
            padding: '2.5rem',
            borderRadius: '16px',
            textAlign: 'center',
            maxWidth: '480px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
            cursor: 'default'
          }}>
            <Lock size={48} color="#ff7a00" />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Restore Access to File</h2>
            <p style={{ 
              fontSize: '0.92rem', 
              color: 'rgba(255, 255, 255, 0.75)', 
              margin: 0, 
              lineHeight: 1.6,
              wordBreak: 'break-word',
              maxWidth: '420px'
            }}>
              To resume watching <strong style={{ color: '#ffffff', display: 'inline' }}>{video.title}</strong>, please restore permission to access the local file.
            </p>
            <button 
              className="btn btn-primary"
              style={{
                background: '#ff7a00',
                border: 'none',
                color: 'var(--text-primary, #ffffff)',
                fontWeight: 700,
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(255, 122, 0, 0.4)',
                marginTop: '0.5rem',
                transition: 'transform 0.15s ease, background 0.15s'
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
                color: 'rgba(255, 255, 255, 0.55)',
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
        onDoubleClick={handlePlayerDoubleClick}
        onClick={(e) => {
          e.stopPropagation();

          const target = e.target as HTMLElement | null;
          if (target && target.closest(
            '.bookmarks-popover, .bookmark-mobile-panel, .bookmark-mobile-backdrop, .bookmark-dialog-box, .bookmark-dialog-overlay, ' +
            '.audio-sub-popover, .asp-pop, .asp-sheet, .asp-sheet-backdrop, ' +
            '.ui-settings-slideout-drawer, .ui-settings-drawer-card, .ui-settings-drawer-backdrop, .ui-settings-unified-handle, ' +
            '.popover-wrapper, .vlc-context-menu, .marking-hud-button-controls, button, input, select, textarea, [role="dialog"], [role="menu"]'
          )) {
            return;
          }

          // If VLC context menu is visible or was just closed within 350ms, do NOT toggle play/pause!
          if (vlcContextMenuState.visible || (Date.now() - vlcContextMenuClosedTimestampRef.current < 350)) {
            if (vlcContextMenuState.visible) {
              setVlcContextMenuState({ visible: false, x: 0, y: 0 });
            }
            resetControlsTimeout();
            return;
          }

          if (isFocusClick()) {
            resetControlsTimeout();
            return;
          }

          if (showPauseMetadataOverlayRef.current) {
            showPauseMetadataOverlayRef.current = false;
            setShowPauseMetadataOverlay(false);
            togglePlay();
            resetControlsTimeout();
            return;
          }

          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          const width = rect.width;
          const height = rect.height;

          resetControlsTimeout();

          // Ignore clicks in bottom 20% to avoid interfering with controls
          if (clickY > height * 0.8) return;

          // In backward (left <= 24%) and forward (right >= 76%) areas, single click should NOT pause the video!
          if (clickX <= width * 0.24 || clickX >= width * 0.76) {
            return;
          }

          // Only middle 52% area toggles play/pause
          togglePlay();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setVlcContextMenuState({ visible: true, x: e.clientX, y: e.clientY });
        }}
      >
        <AmbianceLighting
          videoRef={videoRef}
          isEnabled={isAmbianceEnabled}
          blur={ambianceBlur}
          opacity={ambianceOpacity}
        />
        <ToneMappingSvgDefs />
        <video
          ref={videoRef}
          onContextMenu={(e) => e.preventDefault()}
          src={video.url}
          controls={false}
          crossOrigin={video.playbackMode === 'advanced' ? 'anonymous' : undefined}
          className="main-video-element"
          style={{
            position: 'relative',
            zIndex: 1,
            filter: toneMappingMode !== 'off' ? getToneMappingCssFilter(toneMappingMode) : undefined,
            objectFit: aspectRatio === 'cover' ? 'cover' : (aspectRatio === '16:9' || aspectRatio === '4:3' ? 'fill' : 'contain'),
            aspectRatio: aspectRatio === '16:9' ? '16/9' : (aspectRatio === '4:3' ? '4/3' : undefined)
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              const videoDuration = videoRef.current.duration;
              setDuration(videoDuration);

              // 1. Check site storage for exact saved timestamp
              const storedTime = getMediaTimestamp(video, videoDuration);
              const targetResume = (video.currentTime && video.currentTime > 0) ? video.currentTime : storedTime;

              const directResumeTime = video.resumeTime || 0;
              if (directResumeTime > 5 && videoDuration - directResumeTime > 10 && !targetResume) {
                setResumePromptTime(directResumeTime);
                videoRef.current.currentTime = 0;
                hasSeekedRef.current = true;
                return;
              }

              if (targetResume > 0 && !hasSeekedRef.current) {
                const remainingTime = videoDuration - targetResume;
                if (remainingTime > 3) {
                  logger.player(`Resume site storage location met: seeking to ${targetResume}s`);
                  videoRef.current.currentTime = targetResume;
                  setCurrentTime(targetResume);
                  latestTimeRef.current = targetResume;
                  if (playbackControllerRef.current) {
                    void playbackControllerRef.current.seek(targetResume);
                  }
                } else {
                  logger.player(`Resume location too close to end (currentTime: ${targetResume}s, remaining: ${remainingTime}s). Starting from 0.`);
                  videoRef.current.currentTime = 0;
                  if (playbackControllerRef.current) {
                    void playbackControllerRef.current.seek(0);
                  }
                }
                hasSeekedRef.current = true;
              }
            }
          }}
          onTimeUpdate={() => {
            if (videoRef.current) {
              const time = videoRef.current.currentTime;
              const shouldUpdate = !video.currentTime || hasSeekedRef.current || time > 0;
              if (shouldUpdate && !isScrubbingRef.current && !debouncedSeekTimeoutRef.current && seekTargetRef.current === null) {
                setCurrentTime(time);
                latestTimeRef.current = time;

                const now = Date.now();
                if (now - lastStorageSaveTimeRef.current > 1500 && time > 0) {
                  lastStorageSaveTimeRef.current = now;
                  saveMediaTimestamp(video, time, durationRef.current || videoRef.current.duration, video.title);
                }
              }
            }
          }}
          onPlay={() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
          }}
          onPause={() => {
            // If focus loss auto-pause is disabled and this pause was triggered by browser 
            // background tab throttling, ignore it — don't update UI state.
            if (!pauseOnFocusChangeRef.current && document.visibilityState === 'hidden') {
              return;
            }
            if (pauseOnFocusChangeRef.current && (document.visibilityState === 'hidden' || !document.hasFocus())) {
              wasPausedByFocusLossRef.current = true;
            }
            setIsPlaying(false);
            isPlayingRef.current = false;
            const timeToSave = latestTimeRef.current;
            saveMediaTimestamp(video, timeToSave, durationRef.current || videoRef.current?.duration, video.title);
            onUpdateVideoRef.current((prev: any) => ({
              ...prev,
              currentTime: timeToSave,
              totalTimeWatched: Math.round(totalTimeWatchedRef.current)
            }), false, video.id);
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onSeeked={handleVideoSeeked}
          onSeeking={() => setIsBuffering(true)}
          onError={handleVideoError}
          onEnded={() => {
            saveMediaTimestamp(video, 0, durationRef.current || duration, video.title, true);
            scrobbleToTrakt();
            if (!ratingPromptedRef.current && !isUndetectedLocalMedia) {
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

      {/* Side Skip Indicator (Left: Rewind / Right: Forward) */}
      {consecutiveSkipInfo && (
        <div 
          className={`player-side-skip player-side-skip-${consecutiveSkipInfo.direction}`}
        >
          <div 
            key={`${consecutiveSkipInfo.direction}-${consecutiveSkipInfo.count}`}
            className="player-side-skip-badge"
          >
            <div className="player-side-skip-icon-wrap">
              {consecutiveSkipInfo.direction === 'rewind' ? (
                <RotateCcw size={30} strokeWidth={2.4} className="player-side-skip-icon anim-spin-rewind" />
              ) : (
                <RotateCw size={30} strokeWidth={2.4} className="player-side-skip-icon anim-spin-forward" />
              )}
            </div>
            <span className="player-side-skip-text">
              {consecutiveSkipInfo.direction === 'rewind' ? `-${consecutiveSkipInfo.totalSeconds}s` : `+${consecutiveSkipInfo.totalSeconds}s`}
            </span>
          </div>
        </div>
      )}

      {/* Paused Metadata Overlay Card (Appears after 10s of continuous pause in Netflix style) */}
      {showPauseMetadataOverlay && !isPlaying && mediaDetails && getOverlayDataFromTmdb !== false && !hideUIOverlays && !isLocked && !showAudioSubMenu && (
        <>
          {/* Dark gradient scrim — adapts direction based on overlay position */}
          {overlayShowBackground && (
            <div 
              className="animate-netflix-scrim"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                background: (overlayPosition === 'middle-left' || overlayPosition.includes('left'))
                  ? 'linear-gradient(to right, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.74) 28%, rgba(0,0,0,0.32) 58%, transparent 78%)'
                  : 'linear-gradient(to left, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.74) 28%, rgba(0,0,0,0.32) 58%, transparent 78%)',
                zIndex: 45,
                pointerEvents: 'none'
              }}
            />
          )}
          <div 
            className={`paused-metadata-overlay ${overlayPosition === 'middle-left' ? 'animate-netflix-slide-in' : 'animate-metadata-slide-in'}`}
            style={{
              position: 'absolute',
              ...(overlayPosition === 'middle-left' && {
                top: '50%',
                transform: 'translateY(-50%)',
                left: videoLayout.left > 0 ? `${videoLayout.left + 54}px` : '4.5%',
              }),
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
              gap: '10px',
              maxWidth: videoLayout.width > 0 ? `${Math.min(videoLayout.width * 0.44, 520)}px` : '42%',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.95), 0 0 20px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'none',
              cursor: 'default',
              fontFamily: "'Inter', sans-serif",
              alignItems: overlayPosition.includes('right') ? 'flex-end' : 'flex-start',
              textAlign: overlayPosition.includes('right') ? 'right' : 'left'
            }}
          >
            {/* Real Platform Header Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ 
                background: mediaDetails.platformBg || '#e50914', 
                color: mediaDetails.platformTextColor || '#ffffff', 
                fontSize: '0.68rem', 
                fontWeight: 900, 
                letterSpacing: '1.5px', 
                padding: '2px 7px', 
                borderRadius: '3px',
                fontFamily: "'Outfit', 'Inter', sans-serif"
              }}>
                {mediaDetails.platform || (mediaDetails.episodeTitle || mediaDetails.season ? 'SERIES' : 'FILM')}
              </span>
              <span style={{ 
                color: 'rgba(255, 255, 255, 0.7)', 
                fontSize: '0.72rem', 
                fontWeight: 700, 
                letterSpacing: '2px', 
                textTransform: 'uppercase' 
              }}>
                {mediaDetails.episodeTitle || mediaDetails.season ? 'SERIES' : 'FILM'}
              </span>
            </div>

            {/* Title / Logo */}
            {mediaDetails.logoUrl ? (
              <img 
                src={mediaDetails.logoUrl} 
                alt={mediaDetails.title}
                crossOrigin="anonymous"
                onError={() => {
                  setMediaDetails(prev => prev ? { ...prev, logoUrl: undefined } : prev);
                }}
                style={{
                  maxHeight: '85px',
                  maxWidth: '350px',
                  width: 'auto',
                  objectFit: 'contain',
                  alignSelf: overlayPosition.includes('right') ? 'flex-end' : 'flex-start',
                  marginBottom: '4px',
                  filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.85))'
                }}
              />
            ) : (
              <h2 style={{ 
                margin: 0, 
                fontSize: 'clamp(2.2rem, 3.8vw, 3.2rem)', 
                fontWeight: 800, 
                color: 'var(--text-primary, #fff)',
                fontFamily: "'Outfit', 'Inter', sans-serif",
                letterSpacing: '-0.025em',
                lineHeight: '1.1',
                textShadow: '0 3px 14px rgba(0, 0, 0, 0.95)'
              }}>
                {mediaDetails.title}
              </h2>
            )}

            {/* Netflix Metadata Badges Row */}
            <div style={{ 
              display: 'flex', 
              flexWrap: 'wrap',
              alignItems: 'center', 
              gap: '10px',
              fontSize: '0.92rem', 
              color: 'rgba(255, 255, 255, 0.85)',
              fontWeight: 600,
              margin: '2px 0',
              fontFamily: "'Inter', sans-serif"
            }}>
              {overlayShowRating && (
                <span style={{ color: '#46d369', fontWeight: 800 }}>
                  {mediaDetails.rating ? `${Math.round(mediaDetails.rating * 10)}% Match` : '98% Match'}
                </span>
              )}
              {mediaDetails.releaseDate && (
                <span style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                  {new Date(mediaDetails.releaseDate).getFullYear()}
                </span>
              )}
              <span style={{ 
                border: '1px solid rgba(255, 255, 255, 0.45)', 
                padding: '1px 6px', 
                borderRadius: '3px', 
                fontSize: '0.72rem', 
                fontWeight: 700, 
                color: 'rgba(255, 255, 255, 0.9)',
                letterSpacing: '0.5px'
              }}>
                TV-MA
              </span>
              {mediaDetails.season ? (
                <span>Season {mediaDetails.season}</span>
              ) : (
                <span>{mediaDetails.runtime || formatRuntime(duration)}</span>
              )}
              <span style={{ 
                border: '1px solid rgba(255, 255, 255, 0.35)', 
                padding: '1px 5px', 
                borderRadius: '2px', 
                fontSize: '0.68rem', 
                fontWeight: 800, 
                color: 'rgba(255, 255, 255, 0.8)' 
              }}>
                HD
              </span>
              <span style={{ 
                border: '1px solid rgba(255, 255, 255, 0.35)', 
                padding: '1px 5px', 
                borderRadius: '2px', 
                fontSize: '0.68rem', 
                fontWeight: 800, 
                color: 'rgba(255, 255, 255, 0.8)' 
              }}>
                5.1
              </span>
            </div>

            {/* Episode Title (if series) */}
            {mediaDetails.episodeTitle && (
              <h3 style={{ 
                margin: '2px 0 0 0', 
                fontSize: '1.18rem', 
                fontWeight: 700, 
                color: 'var(--text-primary, #fff)',
                fontFamily: "'Inter', sans-serif",
                textShadow: '0 2px 8px rgba(0,0,0,0.9)'
              }}>
                {mediaDetails.season && mediaDetails.episode ? `S${mediaDetails.season}:E${mediaDetails.episode} ` : ''}
                "{mediaDetails.episodeTitle}"
              </h3>
            )}

            {/* Overview / Plot */}
            {overlayShowOverview && (mediaDetails.overview || mediaDetails.title) && (
              <p style={{ 
                margin: '2px 0 0 0', 
                fontSize: 'clamp(0.9rem, 1.05vw, 0.98rem)', 
                color: 'rgba(255, 255, 255, 0.85)', 
                lineHeight: '1.55',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '520px',
                fontFamily: "'Inter', sans-serif",
                textShadow: '0 1px 6px rgba(0,0,0,0.9)'
              }}>
                {mediaDetails.overview || mediaDetails.title}
              </p>
            )}

          </div>

          {/* Netflix-style Paused Tag at Bottom Right */}
          <div 
            className="animate-fade-in"
            style={{
              position: 'absolute',
              bottom: '36px',
              right: videoLayout.left > 0 ? `${videoLayout.left + 36}px` : '36px',
              zIndex: 55,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.65)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: '0.82rem',
              fontWeight: 800,
              letterSpacing: '1.5px',
              color: 'rgba(255, 255, 255, 0.9)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6)',
              pointerEvents: 'none'
            }}
          >
            <Pause size={13} fill="currentColor" />
            PAUSED
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
            setVlcContextMenuState({ visible: true, x: e.clientX, y: e.clientY });
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

      {/* Buffering fire ring loader */}
      <BufferingOverlay 
        isBuffering={isBuffering}
        customLoaderUrl={customLoaderUrl} 
        customLoaderType={customLoaderType} 
        preset={(spinnerPreset || 'fire-circle') as any} 
      />

      {/* Top Header Overlay */}
      {!isLocked && (!hideUIOverlays || hoveredSetting === 'showUIOverlays') && !timelineOnlyMode && (
        <div 
          className={`player-overlay top-overlay-clean ${controlsVisible ? 'visible' : 'hidden'} ${getHighlightClass('showUIOverlays')}`} 
          onClick={(e) => e.stopPropagation()}
          style={{
            opacity: controlsVisible ? (showUIOverlaysMode === 'enable' ? 1 : 0.5) : 0,
            pointerEvents: controlsVisible ? (showUIOverlaysMode === 'enable' ? 'auto' : 'none') : 'none'
          }}
        >
          {/* Back Button */}
          <button className="close-btn" onClick={handleExit} title="Back">
            <ArrowLeft size={24} />
          </button>

          <div style={{ flex: 1 }} />

          {/* Top Actions: PiP and Chromecast */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="cast-btn" onClick={togglePiP} title="Picture in Picture">
              <MonitorPlay size={24} />
            </button>
            <button className="cast-btn" onClick={handleCast} title="Cast to TV / Chromecast">
              <Cast size={24} />
            </button>
          </div>
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
                    try {
                      const savedSettings = localStorage.getItem('valor_settings');
                      if (savedSettings) {
                        const parsed = JSON.parse(savedSettings);
                        if (parsed.traktAccessToken) {
                          syncTraktRating({ ...video, tmdbId: video.tmdbId || tmdbIdRef.current }, star, parsed.traktAccessToken).then(res => {
                            if (res.ok) {
                              triggerSwitchToast(`Trakt Rating: Synced ${star * 2}/10`);
                            }
                          }).catch(() => {});
                        }
                      }
                    } catch {}
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
          className="skip-btn-premium animate-fade-in-pure"
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
          className={`player-overlay bottom-overlay ${controlsVisible ? 'visible' : 'hidden'} ${timelineOnlyMode ? 'timeline-only-mode' : ''} ${getHighlightClass('showUIOverlays')}`} 
          onClick={(e) => e.stopPropagation()}
          style={{
            opacity: controlsVisible ? (showUIOverlaysMode === 'enable' ? 1 : 0.5) : 0,
            pointerEvents: controlsVisible ? (showUIOverlaysMode === 'enable' ? 'auto' : 'none') : 'none'
          }}
        >
          
          {/* Seekbar timeline row */}
          {(showPlayBar || showTimeDisplay || hoveredSetting === 'showPlayBar' || hoveredSetting === 'showTimeDisplay') && (
            <div 
              className={`seekbar-row ${isVolumeHovered ? 'hide-for-volume' : ''}`}
              style={{
                opacity: isVolumeHovered ? 0 : 1,
                pointerEvents: isVolumeHovered ? 'none' : 'auto',
                transition: 'opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
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
                  <div className="scrub-track-progress" style={{ width: `${effectiveDuration > 0 ? Math.min(100, Math.max(0, (displayTime / effectiveDuration) * 100)) : 0}%` }}></div>

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
                            seekTargetRef.current = bm.time;
                            setCurrentTime(bm.time);
                            if (playbackControllerRef.current) {
                              playbackControllerRef.current.seek(bm.time).catch(console.error);
                            } else if (videoRef.current) {
                              videoRef.current.currentTime = bm.time;
                            }
                            if (seekTargetTimerRef.current) clearTimeout(seekTargetTimerRef.current);
                            seekTargetTimerRef.current = setTimeout(() => {
                              seekTargetRef.current = null;
                            }, 1000);
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
                     value={displayTime}
                    onChange={handleSeek}
                    onMouseMove={handleProgressMouseMove}
                    onMouseLeave={handleProgressMouseLeave}
                    onMouseDown={(e) => {
                      if (debouncedSeekTimeoutRef.current) {
                        clearTimeout(debouncedSeekTimeoutRef.current);
                      }
                      setIsScrubbing(true);
                      const target = e.currentTarget as HTMLInputElement;
                      const rect = target.getBoundingClientRect();
                      const clickFraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const clickTime = clickFraction * (effectiveDuration || 100);
                      setScrubTime(clickTime);
                    }}
                    onTouchStart={(e) => {
                      if (debouncedSeekTimeoutRef.current) {
                        clearTimeout(debouncedSeekTimeoutRef.current);
                      }
                      setIsScrubbing(true);
                      const target = e.currentTarget as HTMLInputElement;
                      const rect = target.getBoundingClientRect();
                      const touch = e.touches[0];
                      if (touch) {
                        const clickFraction = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                        const clickTime = clickFraction * (effectiveDuration || 100);
                        setScrubTime(clickTime);
                      }
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
                  {formatTime(Math.max(0, (duration || effectiveDuration) - displayTime))}
                </div>
              )}
            </div>
          )}

          {/* Bottom controls bar: PiP on left, Audio & Subtitles in center, Fullscreen on right */}
          {(!hideUIOverlays || hoveredSetting === 'showUIOverlays' || hoveredSetting === 'showVolumeControl' || hoveredSetting === 'showFullscreen') && !timelineOnlyMode && (
            <div className={`bottom-controls-bar ${getHighlightClass('showUIOverlays')}`}>
              <div className="bottom-controls-left-spacer">
                {/* Play / Pause Button */}
                <button 
                  className="control-btn-netflix control-btn-play-pause-bottom" 
                  onClick={() => {
                    if (isFocusClick()) return;
                    togglePlay();
                  }} 
                  title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                >
                  {isPlaying ? (
                    <Pause size={22} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={22} fill="currentColor" strokeWidth={0} style={{ marginLeft: '2px' }} />
                  )}
                </button>

                {/* Rewind 10s Button */}
                <button 
                  className="control-btn-netflix control-btn-rewind-bottom" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (uiConfig.blockSeekingCompletely) return; 
                    handleRewind(); 
                    resetControlsTimeout(); 
                  }}
                  title="Rewind 10s (Left Arrow)"
                >
                  <div className="seek-hud-container-bottom">
                    <RotateCcw size={22} strokeWidth={1.8} />
                    <span className="seek-hud-text-bottom">10</span>
                  </div>
                </button>

                {/* Forward 10s Button */}
                <button 
                  className="control-btn-netflix control-btn-forward-bottom" 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (uiConfig.blockSeekingCompletely) return; 
                    handleForward(); 
                    resetControlsTimeout(); 
                  }}
                  title="Forward 10s (Right Arrow)"
                >
                  <div className="seek-hud-container-bottom">
                    <RotateCw size={22} strokeWidth={1.8} />
                    <span className="seek-hud-text-bottom">10</span>
                  </div>
                </button>

                {(showVolumeControl || hoveredSetting === 'showVolumeControl') && (
                  <div 
                    className={`volume-control-group-premium ${isVolumeHovered ? 'volume-open ' : ''}${getHighlightClass('showVolumeControl')}`}
                    style={{
                      opacity: showVolumeControlMode === 'enable' ? 1 : 0.5,
                      pointerEvents: showVolumeControlMode === 'enable' ? 'auto' : 'none'
                    }}
                    onMouseEnter={() => setIsVolumeHovered(true)}
                    onMouseLeave={() => setIsVolumeHovered(false)}
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
                      {isMuted || volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
                    </button>
                    <div className="volume-slider-vertical-popover" onClick={(e) => e.stopPropagation()}>
                      <div className="volume-vertical-track-wrapper">
                        <input 
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const nextVol = parseFloat(e.target.value);
                            setVolume(nextVol);
                            setIsMuted(nextVol === 0);
                          }}
                          className="volume-slider-vertical"
                          style={{
                            '--volume-thumb-color': isMuted ? '#666666' : (audioBoost > 100 ? '#ff7a00' : '#e50914'),
                            background: `linear-gradient(to top, ${isMuted ? '#555555' : (audioBoost > 100 ? '#ff7a00' : '#e50914')} 0%, ${isMuted ? '#555555' : (audioBoost > 100 ? '#ff7a00' : '#e50914')} ${(isMuted ? 0 : volume) * 100}%, #111111 ${(isMuted ? 0 : volume) * 100}%, #111111 100%)`
                          } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!hideVideoName && (
                <div className="bottom-controls-center-group">
                  <span className="bottom-media-title-netflix" title={video.title || video.fileName || ''}>
                    {getRegexedTitleWithYear(video.title || video.fileName || '')}
                  </span>
                </div>
              )}

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
                    title={`Recording (${formatTime(markingStartTime)} - ${formatTime(currentTime)}) - Click to finish mark`}
                    aria-label="Recording scene - click to finish mark"
                  >
                    <div className="marking-rec-icon-wrapper">
                      <span className="marking-rec-outer-ring" />
                      <span className="marking-rec-inner-dot" />
                    </div>
                    <span className="marking-rec-text">REC ({formatTime(Math.abs(currentTime - markingStartTime))})</span>
                  </button>
                )}
                
                {/* Bookmarks */}
                {!isUndetectedLocalMedia && (
                  <div 
                    className="popover-wrapper"
                    onMouseEnter={() => {
                      if (isMobileDevice()) return;
                      if (bookmarksTimeoutRef.current) clearTimeout(bookmarksTimeoutRef.current);
                      setShowBookmarksPopover(true);
                    }}
                    onMouseLeave={() => {
                      if (isMobileDevice()) return;
                      bookmarksTimeoutRef.current = setTimeout(() => {
                        setShowBookmarksPopover(false);
                      }, 150);
                    }}
                  >
                    <button 
                      className="control-btn-netflix control-btn-bookmark-list" 
                      onClick={() => setShowBookmarksPopover(prev => !prev)} 
                      title="Bookmarks & Scenes"
                    >
                      <BookmarkIcon size={22} />
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
                )}

                {/* HDR / Tone Mapping */}
                <button
                  className={`control-btn-netflix control-btn-tonemap ${toneMappingMode !== 'off' ? 'active' : ''}`}
                  onClick={cycleToneMapping}
                  title={`HDR Tone Mapping: ${toneMappingMode.toUpperCase()} (Click to cycle ACES Filmic / Vibrant / Reinhard / Off)`}
                >
                  <Sparkles size={22} color={toneMappingMode !== 'off' ? '#fbbf24' : 'currentColor'} />
                  {toneMappingMode !== 'off' && (
                    <span className="netflix-speed-badge" style={{ background: '#f59e0b' }}>
                      {toneMappingMode === 'aces' ? 'ACES' : toneMappingMode === 'vibrant' ? 'VIB' : 'REIN'}
                    </span>
                  )}
                </button>

                {/* Netflix-style Audio & Subtitles Icon Button & Popover */}
                {!isUndetectedLocalMedia && (
                  <div 
                    className="popover-wrapper"
                    onMouseEnter={() => {
                      if (isMobileDevice()) return;
                      if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
                      setShowAudioSubMenu(true);
                    }}
                    onMouseLeave={() => {
                      if (isMobileDevice()) return;
                      audioSubTimeoutRef.current = setTimeout(() => {
                        setShowAudioSubMenu(false);
                      }, 150);
                    }}
                  >
                    <button 
                      className="control-btn-netflix control-btn-audio-sub"
                      onClick={() => setShowAudioSubMenu(prev => !prev)}
                      title="Audio & Subtitles"
                    >
                      <MessageSquareText size={22} />
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
                )}
                
                {/* Netflix-style Speed Icon Button & Popover */}
                <div 
                  className="popover-wrapper"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setShowSpeedMenu(true)}
                  onMouseLeave={() => setShowSpeedMenu(false)}
                >
                  <button 
                    className="control-btn-netflix control-btn-speed" 
                    onClick={() => setShowSpeedMenu(prev => !prev)} 
                    title={`Playback Speed (${playbackRate}x)`}
                  >
                    <CircleGauge size={22} />
                    {playbackRate !== 1 && (
                      <span className="netflix-speed-badge">{playbackRate}x</span>
                    )}
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
                  className="control-btn-netflix control-btn-settings" 
                  onClick={() => setShowSettingsPanel(prev => !prev)} 
                  title="Player Settings"
                >
                  <Settings size={22} />
                </button>

                {(showFullscreen || hoveredSetting === 'showFullscreen') && (
                  <button 
                    className={`control-btn-netflix control-btn-fullscreen ${getHighlightClass('showFullscreen')}`} 
                    onClick={toggleFullscreen} 
                    title={isFullscreen || isPseudoFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    style={{
                      opacity: showFullscreenMode === 'enable' ? 1 : 0.5,
                      pointerEvents: showFullscreenMode === 'enable' ? 'auto' : 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {isFullscreen || isPseudoFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* UI Settings Slideout Drawer with Unified Seamless Edge Handle */}
      {!hideUIOverlays && (
        <div 
          className={`ui-settings-slideout-drawer ${showSettingsPanel ? 'is-open' : 'is-closed'}`}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Backdrop when open: click anywhere outside to smoothly close */}
          <div 
            className="ui-settings-drawer-backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setShowSettingsPanel(false);
              setIsSettingsExpanded(false);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />

          <div 
            className="ui-settings-drawer-card" 
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: isSettingsExpanded ? '280px' : '154px',
            }}
          >
            {/* The single, unified handle that glides out and in with the drawer */}
            <button
              className="ui-settings-unified-handle"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowSettingsPanel(prev => !prev);
                if (showSettingsPanel) setIsSettingsExpanded(false);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              title={showSettingsPanel ? "Collapse UI Settings (Del)" : "Slide in UI Settings (Del)"}
              aria-label="Toggle UI Settings"
              style={{
                opacity: showSettingsPanel ? 1 : (showControls ? 0.95 : 0.4)
              }}
            >
              <div 
                className="ui-settings-chevron-wrapper"
                style={{
                  transform: showSettingsPanel ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <ChevronLeft size={18} />
              </div>
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #ffffff)' }}>UI Settings</h3>
              <button
                className="ui-settings-close-x-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsPanel(false);
                  setIsSettingsExpanded(false);
                }}
                title="Close UI Settings"
              >
                <X size={16} />
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
                    {renderSettingsButton('ambianceLighting')}
                    {renderSettingsButton('hdrToneMapping')}
                    {(settingsOrder || [
                      'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                      'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                    ]).slice(0, 3).map((key) => renderSettingsButton(key))}
                    
                    {/* 6th item is the show more (uncollapse) button */}
                    <button
                      onClick={() => setIsSettingsExpanded(true)}
                      title="Show More Settings"
                      className="settings-icon-toggle"
                      style={{
                        background: 'var(--border-subtle, rgba(255, 255, 255, 0.05))',
                        border: '1px solid var(--dropdown-border, rgba(255, 255, 255, 0.1))',
                        color: 'var(--text-secondary, rgba(255, 255, 255, 0.8))',
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
                    {renderSettingsButton('ambianceLighting')}
                    {renderSettingsButton('hdrToneMapping')}
                    {(settingsOrder || [
                      'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                      'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                    ]).map((key) => renderSettingsButton(key))}

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
                        background: vctOverlayEnabled ? 'rgba(46, 204, 113, 0.2)' : 'var(--border-subtle, rgba(255, 255, 255, 0.05))',
                        border: `1px solid ${vctOverlayEnabled ? 'rgba(46, 204, 113, 0.5)' : 'var(--border-color, rgba(255, 255, 255, 0.1))'}`,
                        color: vctOverlayEnabled ? '#2ecc71' : 'var(--text-secondary, rgba(255, 255, 255, 0.8))',
                        borderRadius: '12px',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        height: '54px',
                        width: '54px'
                      }}
                    >
                      <Activity size={22} />
                    </button>

                    {/* Collapse button inside the grid */}
                    <button
                      onClick={() => setIsSettingsExpanded(false)}
                      title="Show Less Settings"
                      className="settings-icon-toggle"
                      style={{
                        background: 'var(--border-subtle, rgba(255, 255, 255, 0.05))',
                        border: '1px solid var(--dropdown-border, rgba(255, 255, 255, 0.1))',
                        color: 'var(--text-secondary, rgba(255, 255, 255, 0.8))',
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
            background: 'var(--player-accent, #e50914)',
            color: 'var(--text-primary, #ffffff)',
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
          <div className="marking-rec-icon-wrapper" style={{ width: '16px', height: '16px' }}>
            <span className="marking-rec-outer-ring" />
            <span className="marking-rec-inner-dot" style={{ width: '7px', height: '7px' }} />
          </div>
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

      {/* Play / Resume & Pause Center Feedback Animation */}
      {playPauseFeedback && (
        <div className="play-pause-feedback-overlay">
          <div key={playPauseFeedback.id} className="play-pause-feedback-circle animate-play-pause-feedback">
            {playPauseFeedback.action === 'play' ? (
              <Play size={40} fill="white" strokeWidth={0} style={{ marginLeft: '4px' }} />
            ) : (
              <Pause size={40} fill="white" strokeWidth={0} />
            )}
          </div>
        </div>
      )}

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
            color: 'var(--text-primary, #fff)',
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
          background: rgba(0, 0, 0, 0.6);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          gap: 12px;
          overflow: hidden;
          transition: all 0.2s;
        }
        .skip-btn-premium:hover {
          background: white;
          color: black;
          border-color: white;
        }
        .skip-btn-premium:hover .skip-progress-bar {
          animation-play-state: paused;
        }
        .skip-progress-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: var(--player-accent, #e50914);
          animation: skipProgressPremium 7s linear forwards;
        }

        .player-container {
          position: fixed;
          inset: 0;
          z-index: 500;
          background-color: var(--player-bg, #000000);
          overflow: hidden;
          user-select: none;
        }
        .player-container.pseudo-fullscreen {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          border-radius: 0 !important;
          margin: 0 !important;
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
          transition: opacity 0.25s ease, transform 0.25s ease;
          pointer-events: auto;
        }
        .top-overlay-clean {
          top: 0;
          background: var(--player-overlay-gradient-top, linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%));
          padding: calc(1.5rem * var(--player-ui-scale, 1)) calc(1rem * var(--player-ui-scale, 1));
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          box-sizing: border-box;
        }
        .top-title-clean {
          font-size: 1.3rem;
          font-weight: 500;
          color: var(--text-primary, white);
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
          background-color: var(--player-accent, #e50914) !important;
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
          color: var(--text-secondary, rgba(255, 255, 255, 0.6));
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
          color: var(--text-secondary, rgba(255, 255, 255, 0.6));
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          outline: none;
        }
        .settings-icon-toggle:hover:not(:disabled):not(.disabled) {
          background: var(--surface-hover, rgba(255, 255, 255, 0.12));
          color: var(--text-primary, #ffffff);
          border-color: var(--border-color, rgba(255, 255, 255, 0.2));
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
          background: var(--player-accent, #e50914);
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
          color: var(--text-muted, rgba(255, 255, 255, 0.4));
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
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
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
          color: var(--text-muted, rgba(255, 255, 255, 0.45));
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



        /* UI Settings Slideout Drawer & Edge Handle Tab */
        .ui-settings-slideout-drawer {
          position: absolute;
          inset: 0;
          z-index: 150;
          pointer-events: none;
          overflow: hidden;
        }

        .ui-settings-drawer-backdrop {
          position: absolute;
          inset: 0;
          z-index: 140;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .ui-settings-slideout-drawer.is-open .ui-settings-drawer-backdrop {
          opacity: 1;
          pointer-events: auto;
        }

        /* Drawer Card */
        .ui-settings-drawer-card {
          position: absolute;
          right: 0;
          top: 50%;
          z-index: 155;
          pointer-events: auto;
          overflow: visible !important;
          background: var(--dropdown-bg, rgba(18, 18, 18, 0.96));
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--dropdown-border, rgba(255, 255, 255, 0.12));
          border-right: none !important;
          border-top-right-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          border-top-left-radius: 16px !important;
          border-bottom-left-radius: 16px !important;
          padding: 1.25rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          font-family: sans-serif;
          box-sizing: border-box !important;
          box-shadow: -10px 0 32px rgba(0, 0, 0, 0.65);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.32s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease;
          will-change: transform;
        }

        /* When closed: card translates completely offscreen to the right by 100% of its width;
           its attached handle lands precisely and seamlessly flush against the right screen bezel */
        .ui-settings-slideout-drawer.is-closed .ui-settings-drawer-card {
          transform: translateY(-50%) translateX(100%);
          box-shadow: none !important;
        }

        /* When open: smoothly glides fully into view */
        .ui-settings-slideout-drawer.is-open .ui-settings-drawer-card {
          transform: translateY(-50%) translateX(0);
        }

        /* Unified Handle: attached seamlessly to the left boundary of the card (right: 100%) */
        .ui-settings-unified-handle {
          position: absolute;
          right: 100%;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: auto;
          width: 28px;
          height: 64px;
          background: var(--dropdown-bg, rgba(18, 18, 18, 0.94));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--dropdown-border, rgba(255, 255, 255, 0.15));
          border-right: none !important;
          border-top-right-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
          border-top-left-radius: 12px !important;
          border-bottom-left-radius: 12px !important;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-primary, #ffffff);
          box-shadow: -4px 0 16px rgba(0, 0, 0, 0.45);
          outline: none;
          padding: 0;
          margin: 0;
          margin-right: -1px; /* 1px bleed guarantees zero subpixel gap on any display scaling */
          z-index: 160;
          box-sizing: border-box !important;
          transition: width 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease, box-shadow 0.25s ease, border-color 0.2s ease, opacity 0.25s ease !important;
        }

        /* Premium Inward Expansion on Hover when Closed (right edge stays 100% sealed to the screen border) */
        .ui-settings-slideout-drawer.is-closed .ui-settings-unified-handle:hover {
          width: 38px !important;
          background: rgba(28, 30, 44, 0.98) !important;
          border-color: rgba(255, 255, 255, 0.45) !important;
          box-shadow: -6px 0 24px rgba(0, 0, 0, 0.7), 0 0 16px rgba(229, 9, 20, 0.35) !important;
          color: #ffffff !important;
          opacity: 1 !important;
        }

        .ui-settings-slideout-drawer.is-closed .ui-settings-unified-handle:hover .ui-settings-chevron-wrapper {
          transform: translateX(-4px) !important;
        }

        /* Hover when open */
        .ui-settings-slideout-drawer.is-open .ui-settings-unified-handle:hover {
          background: rgba(28, 30, 44, 0.98) !important;
          border-color: rgba(255, 255, 255, 0.45) !important;
          box-shadow: -6px 0 24px rgba(0, 0, 0, 0.65), 0 0 16px rgba(229, 9, 20, 0.3) !important;
          color: #ffffff !important;
          opacity: 1 !important;
        }

        .ui-settings-slideout-drawer.is-open .ui-settings-unified-handle:hover .ui-settings-chevron-wrapper {
          transform: rotate(180deg) translateX(-3px) !important;
        }

        .ui-settings-chevron-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform;
        }

        .ui-settings-close-x-btn {
          background: none;
          border: none;
          color: var(--text-muted, rgba(255, 255, 255, 0.6));
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .ui-settings-close-x-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }

        .no-animations .ui-settings-drawer-container,
        .no-animations .ui-settings-edge-slide-btn,
        .no-animations .ui-settings-modal-collapse-btn,
        .no-animations .ui-settings-chevron-wrapper,
        .no-animations .ui-settings-collapse-chevron-wrapper,
        .no-animations .ui-settings-drawer-backdrop,
        .no-animations .ui-settings-drawer-card {
          transition: none !important;
          animation: none !important;
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
          color: var(--text-primary, white);
          cursor: pointer;
          padding: calc(6px * var(--player-ui-scale, 1));
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.18s ease, color 0.18s ease;
          flex-shrink: 0;
        }
        .cast-btn svg, .close-btn svg {
          width: calc(24px * var(--player-ui-scale, 1)) !important;
          height: calc(24px * var(--player-ui-scale, 1)) !important;
        }
        .cast-btn:hover, .close-btn:hover {
          transform: scale(1.22);
          opacity: 1;
        }
        .cast-btn:active, .close-btn:active {
          transform: scale(0.95);
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
          color: var(--text-muted, rgba(255, 255, 255, 0.4));
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
          background: var(--player-overlay-gradient-bottom, linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%));
          padding: calc(1rem * var(--player-ui-scale, 1)) calc(1rem * var(--player-ui-scale, 1)) calc(1.25rem * var(--player-ui-scale, 1)) calc(1rem * var(--player-ui-scale, 1));
          display: flex;
          flex-direction: column;
          gap: calc(0.25rem * var(--player-ui-scale, 1));
        }
        .bottom-overlay.timeline-only-mode {
          background: transparent !important;
          padding-bottom: calc(1rem * var(--player-ui-scale, 1)) !important;
          padding-top: calc(0.5rem * var(--player-ui-scale, 1)) !important;
        }
        .bottom-overlay.timeline-only-mode .bottom-controls-bar {
          display: none !important;
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
          transition: opacity 0.25s ease;
        }
        .center-controls-hud.hidden {
          opacity: 0;
          pointer-events: none !important;
        }
        .center-controls-hud.hidden * {
          pointer-events: none !important;
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
          gap: calc(1.5rem * var(--player-ui-scale, 1));
        }
        .time-display-clean {
          font-size: calc(0.95rem * var(--player-ui-scale, 1));
          color: #ffffff;
          font-weight: 500;
          white-space: nowrap;
        }

        .scrub-container-premium {
          position: relative;
          width: 100%;
          height: calc(8px * var(--player-ui-scale, 1));
          display: flex;
          align-items: center;
        }
        .scrub-track-bg {
          position: absolute;
          left: 0;
          right: 0;
          height: calc(4px * var(--player-ui-scale, 1));
          background: rgba(255, 255, 255, 0.2);
          border-radius: calc(2px * var(--player-ui-scale, 1));
          z-index: 1;
        }
        .scrub-track-buffered {
          position: absolute;
          left: 0;
          height: calc(4px * var(--player-ui-scale, 1));
          background: rgba(255, 255, 255, 0.35);
          border-radius: calc(2px * var(--player-ui-scale, 1));
          z-index: 2;
          transition: width 0.15s ease;
        }
        .scrub-track-progress {
          position: absolute;
          left: 0;
          height: calc(4px * var(--player-ui-scale, 1));
          background: var(--player-accent, #e50914);
          border-radius: calc(2px * var(--player-ui-scale, 1)) 0 0 calc(2px * var(--player-ui-scale, 1));
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
          width: calc(22px * var(--player-ui-scale, 1));
          height: calc(22px * var(--player-ui-scale, 1));
          border-radius: 50%;
          background: var(--player-accent, #e50914);
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
          width: calc(22px * var(--player-ui-scale, 1));
          height: calc(22px * var(--player-ui-scale, 1));
          border: none;
          border-radius: 50%;
          background: var(--player-accent, #e50914);
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
          height: calc(6px * var(--player-ui-scale, 1)) !important;
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
          transition: opacity 0.25s ease;
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
          margin-top: 0;
          width: 100%;
        }
        .bottom-controls-left-spacer {
          display: flex;
          align-items: center;
          gap: calc(4px * var(--player-ui-scale, 1));
          flex: 1;
        }
        .control-btn-play-pause-bottom,
        .control-btn-rewind-bottom,
        .control-btn-forward-bottom {
          padding: calc(6px * var(--player-ui-scale, 1)) calc(5px * var(--player-ui-scale, 1)) !important;
        }
        .bottom-controls-center-group {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1.5;
        }
        .bottom-controls-right-group {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: calc(clamp(0.65rem, 1.2vw, 1.1rem) * var(--player-ui-scale, 1));
          flex: 1;
        }
        .seek-hud-container-bottom {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: calc(24px * var(--player-ui-scale, 1));
          height: calc(24px * var(--player-ui-scale, 1));
        }
        .seek-hud-container-bottom svg {
          width: calc(22px * var(--player-ui-scale, 1)) !important;
          height: calc(22px * var(--player-ui-scale, 1)) !important;
        }
        .seek-hud-text-bottom {
          position: absolute;
          top: 52%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: calc(8px * var(--player-ui-scale, 1));
          font-weight: 800;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: currentColor;
          letter-spacing: -0.5px;
          line-height: 1;
          pointer-events: none;
        }
        .control-btn-netflix {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          padding: calc(6px * var(--player-ui-scale, 1));
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.18s ease, transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.18s ease;
          outline: none;
          position: relative;
        }
        .control-btn-netflix svg {
          width: calc(22px * var(--player-ui-scale, 1)) !important;
          height: calc(22px * var(--player-ui-scale, 1)) !important;
        }
        .control-btn-netflix:hover {
          color: #ffffff;
          transform: scale(1.22);
          opacity: 1;
        }
        .control-btn-netflix:active {
          transform: scale(0.95);
        }
        .netflix-speed-badge {
          position: absolute;
          bottom: 1px;
          right: 1px;
          font-size: calc(8.5px * var(--player-ui-scale, 1));
          font-weight: 800;
          color: #ffffff;
          background: rgba(229, 9, 20, 0.95);
          border-radius: 3px;
          padding: calc(1px * var(--player-ui-scale, 1)) calc(3px * var(--player-ui-scale, 1));
          line-height: 1;
        }
        .bottom-media-title-netflix {
          color: rgba(255, 255, 255, 0.85);
          font-size: calc(0.95rem * var(--player-ui-scale, 1));
          font-weight: 500;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 40vw;
          pointer-events: none;
          user-select: none;
        }
        @media (max-width: 820px) {
          .bottom-controls-center-group, .bottom-media-title-netflix {
            display: none !important;
          }
        }

        .control-btn-pip, .control-btn-fullscreen, .control-btn-bookmark-list {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          padding: calc(6px * var(--player-ui-scale, 1));
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.18s ease, transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .control-btn-pip svg, .control-btn-fullscreen svg, .control-btn-bookmark-list svg {
          width: calc(22px * var(--player-ui-scale, 1)) !important;
          height: calc(22px * var(--player-ui-scale, 1)) !important;
        }
        .control-btn-pip:hover, .control-btn-fullscreen:hover, .control-btn-bookmark-list:hover {
          color: #ffffff;
          transform: scale(1.22);
        }
        .control-btn-pip:active, .control-btn-fullscreen:active, .control-btn-bookmark-list:active {
          transform: scale(0.95);
        }

        /* Popovers styling */
        .popover-wrapper {
          position: relative;
        }
        .audio-sub-popover-center {
          position: absolute;
          bottom: 50px;
          right: -20px;
          max-width: calc(100vw - 24px);
          height: 330px;
          max-height: min(390px, calc(100vh - 100px));
          overflow: visible;
          background: var(--card-bg);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 0.85rem;
          box-shadow: var(--shadow-xl);
          z-index: 100;
          transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          transform: scale(var(--player-ui-scale, 1));
          transform-origin: bottom right;
        }
        .speed-popover-container, .bookmarks-popover {
          transform: scale(var(--player-ui-scale, 1));
          transform-origin: bottom right;
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
          gap: 0.85rem;
          height: 100%;
          min-height: 0;
          align-items: stretch;
          overflow: visible;
          box-sizing: border-box;
          transition: grid-template-columns 0.3s ease;
        }
        @media (max-width: 520px) {
          .popover-cols {
            display: flex !important;
            flex-direction: column !important;
          }
        }
        .control-btn-settings {
          display: none !important;
        }
        @media (min-width: 1025px) {
          .control-btn-tonemap {
            display: none !important;
          }
        }
        .popover-transcript-col {
          border-left: 1px solid var(--border-subtle);
          padding-left: 0.85rem;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .popover-style-col {
          border-left: 1px solid var(--border-subtle);
          padding-left: 0.85rem;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          overflow: hidden;
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
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          margin-top: 0.5rem;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }
        .style-customizer::-webkit-scrollbar {
          width: 4px;
        }
        .style-customizer::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
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
          color: var(--text-muted, rgba(255, 255, 255, 0.45));
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }
        
        /* Font Size Control - Premium Button Group */
        .size-btn-group {
          display: flex;
          align-items: center;
          background: var(--input-bg, rgba(0, 0, 0, 0.25));
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
          border-radius: 6px;
          overflow: hidden;
          padding: 2px;
          align-self: flex-start;
        }
        .size-action-btn {
          background: transparent;
          border: none;
          color: var(--text-primary, #ffffff);
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
          background: var(--surface-hover, rgba(255, 255, 255, 0.08));
        }
        .size-action-btn:active {
          background: var(--border-subtle, rgba(255, 255, 255, 0.15));
        }
        .size-value-display {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-primary, #ffffff);
          padding: 0 0.6rem;
          min-width: 38px;
          text-align: center;
        }
        
        /* Font Family Select Premium override for popover style col */
        .popover-style-col .custom-select-trigger {
          font-size: 0.8rem;
          padding: 0.35rem 0.65rem;
          background: var(--dropdown-bg, rgba(0, 0, 0, 0.35));
          border-radius: 6px;
        }
        .style-row .custom-select-container {
          width: 100% !important;
        }
        
        /* Subtitle Color Selector - 1 line Text & Background */
        .style-colors-row {
          display: grid;
          grid-template-columns: 1.2fr 2fr;
          gap: 0.75rem;
        }
        .color-picker-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .picker-wrapper {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .color-picker-input-premium {
          -webkit-appearance: none;
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.2);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          background: none;
          padding: 0;
          transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), border-color 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .color-picker-input-premium:hover {
          transform: scale(1.15);
          border-color: var(--text-muted, rgba(255, 255, 255, 0.45));
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
          background: var(--border-subtle, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
          border-radius: 6px;
          color: var(--text-secondary, rgba(255, 255, 255, 0.55));
          padding: 0 0.5rem;
          height: 24px;
          font-size: 0.72rem;
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
          color: var(--text-muted, rgba(255, 255, 255, 0.4));
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
          background: var(--input-bg, rgba(255, 255, 255, 0.06));
          border: 1px solid var(--dropdown-border, rgba(255, 255, 255, 0.12));
          border-radius: 6px;
          padding: 0.35rem 0.6rem;
          color: var(--text-primary, white);
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }
        .transcript-search-input:focus {
          border-color: var(--player-accent, #e50914);
        }
        .transcript-cues-list {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
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
          border-left: 2px solid var(--player-accent, #e50914);
          color: white;
          font-weight: 500;
        }
        .cue-time {
          color: var(--player-accent, #e50914);
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
          height: 100%;
          min-height: 0;
          overflow: hidden;
          box-sizing: border-box;
        }
        .popover-col h4 {
          margin: 0 0 0.4rem 0;
          font-size: 0.82rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 0.25rem;
          color: #ffffff;
          font-weight: 600;
          flex-shrink: 0;
        }
        .popover-options {
          flex: 1 1 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        }
        .popover-options::-webkit-scrollbar {
          width: 4px;
        }
        .popover-options::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }
        .popover-option {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.35rem 0.55rem;
          border-radius: 5px;
          cursor: pointer;
          font-size: 0.8rem;
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
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
          color: var(--player-accent, #e50914);
        }
        .add-custom-btn {
          color: var(--player-accent, #e50914) !important;
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
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
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
        @keyframes netflixSlideIn {
          from {
            opacity: 0;
            transform: translateY(-50%) translateX(-24px);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
        }
        .animate-netflix-slide-in {
          animation: netflixSlideIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes netflixScrimFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-netflix-scrim {
          animation: netflixScrimFadeIn 0.6s ease forwards;
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



        /* Non-blocking Toast notification */
        .non-blocking-toast {
          position: absolute;
          top: 2.2rem;
          right: 1.25rem;
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
          color: var(--player-accent, #e50914);
          animation: spin 1s linear infinite;
        }
        
        .auto-probing-indicator {
          position: absolute;
          top: 2.2rem;
          right: 1.25rem;
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

        /* Play / Resume & Pause Center Feedback Animation */
        .play-pause-feedback-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 120;
        }
        .play-pause-feedback-circle {
          width: 78px;
          height: 78px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.68);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1.5px solid rgba(255, 255, 255, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
          pointer-events: none;
        }
        .animate-play-pause-feedback {
          animation: playPauseFeedbackPop 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes playPauseFeedbackPop {
          0% {
            opacity: 0;
            transform: scale(0.65);
          }
          30% {
            opacity: 1;
            transform: scale(1.1);
          }
          55% {
            opacity: 1;
            transform: scale(1);
          }
          80% {
            opacity: 0.9;
            transform: scale(1.04);
          }
          100% {
            opacity: 0;
            transform: scale(1.22);
          }
        }



        /* Switch Toast CSS Styles */
        @media (max-width: 768px) {
          .top-overlay-clean, .bottom-overlay, .bottom-controls-bar {
            display: none !important;
          }
          .audio-sub-popover-center {
            right: 8px !important;
            left: auto !important;
            max-width: calc(100vw - 16px) !important;
            width: min(92vw, 440px) !important;
            max-height: min(420px, calc(100vh - 90px)) !important;
            bottom: 60px !important;
            transform-origin: bottom right;
            padding: 0.9rem !important;
          }
          .popover-cols {
            display: flex !important;
            flex-direction: column !important;
            gap: 0.9rem !important;
            overflow-y: auto !important;
            max-height: 100% !important;
          }
          .popover-transcript-col, .popover-style-col {
            border-left: none !important;
            border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
            padding-left: 0 !important;
            padding-top: 0.75rem !important;
            margin-top: 0.35rem !important;
            min-height: 140px !important;
          }
        }

        @media (max-width: 520px) {
          .audio-sub-popover-center {
            left: 50% !important;
            right: auto !important;
            transform: translateX(-50%) scale(var(--player-ui-scale, 1)) !important;
            transform-origin: bottom center !important;
            width: calc(100vw - 16px) !important;
            padding: 0.75rem !important;
            bottom: 55px !important;
          }
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
        }

        .player-container.has-file-access-blocked,
        .player-container.has-file-access-blocked * {
          cursor: default !important;
        }
        .cast-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: 50%;
          transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
          outline: none;
        }
        .cast-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.15);
          transform: scale(1.1);
        }
        .control-btn-volume:hover {
          color: white !important;
        }

        /* Netflix-style Vertical Volume Popover */
        .volume-control-group-premium {
          position: relative;
          display: flex;
          align-items: center;
          background: transparent !important;
          border: none !important;
          border-radius: 8px;
          padding: 2px;
          height: 38px;
          box-sizing: border-box;
          margin-left: 0.5rem;
        }
        .control-btn-volume {
          width: 38px;
          height: 38px;
          background: transparent !important;
          border: none !important;
          border-radius: 50% !important;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s ease, color 0.18s ease, transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          color: #ffffff !important;
          outline: none;
          padding: 0 !important;
          flex-shrink: 0;
        }
        .control-btn-volume:hover {
          transform: scale(1.12);
          color: #ffffff !important;
          background: rgba(255, 255, 255, 0.15) !important;
        }
        .control-btn-volume:active {
          transform: scale(0.95);
        }
        .control-btn-volume svg {
          width: calc(20px * var(--player-ui-scale, 1)) !important;
          height: calc(20px * var(--player-ui-scale, 1)) !important;
        }
        .volume-slider-vertical-popover {
          position: absolute;
          bottom: 48px;
          left: 50%;
          transform: translateX(-50%) translateY(6px);
          width: 32px;
          height: 148px;
          background: #282828;
          border-radius: 6px;
          padding: 10px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.18s ease, transform 0.18s ease;
          z-index: 500;
          box-sizing: border-box;
        }
        .volume-slider-vertical-popover::after {
          content: '';
          position: absolute;
          bottom: -22px;
          left: -12px;
          right: -12px;
          height: 26px;
          background: transparent;
        }
        .volume-control-group-premium:hover .volume-slider-vertical-popover,
        .volume-control-group-premium.volume-open .volume-slider-vertical-popover {
          opacity: 1;
          pointer-events: auto;
          transform: translateX(-50%) translateY(0);
        }
        .volume-vertical-track-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
        }
        .volume-slider-vertical {
          -webkit-appearance: none;
          appearance: none;
          writing-mode: vertical-lr;
          direction: rtl;
          width: 8px;
          height: 128px;
          border-radius: 4px;
          outline: none;
          cursor: pointer;
          padding: 0;
          margin: 0;
        }
        .volume-slider-vertical::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--volume-thumb-color, #e50914);
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.6);
          cursor: pointer;
          border: none;
          transition: transform 0.12s ease;
        }
        .volume-slider-vertical:hover::-webkit-slider-thumb {
          transform: scale(1.15);
        }
        .volume-slider-vertical::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--volume-thumb-color, #e50914);
          border: none;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.6);
          cursor: pointer;
          transition: transform 0.12s ease;
        }
        .volume-slider-vertical:hover::-moz-range-thumb {
          transform: scale(1.15);
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
          color: var(--player-accent, #e50914);
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
        .marking-hud-button-controls {
          background: #e50914;
          color: #ffffff;
          border: none;
          border-radius: 50%;
          width: calc(34px * var(--player-ui-scale, 1));
          height: calc(34px * var(--player-ui-scale, 1));
          min-width: calc(34px * var(--player-ui-scale, 1));
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 12px rgba(229, 9, 20, 0.65);
          animation: pulseMarking 1.5s infinite alternate;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          white-space: nowrap;
          outline: none;
          margin-right: calc(6px * var(--player-ui-scale, 1));
          box-sizing: border-box;
        }
        .marking-rec-icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: calc(18px * var(--player-ui-scale, 1));
          height: calc(18px * var(--player-ui-scale, 1));
          flex-shrink: 0;
        }
        .marking-rec-outer-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 2px solid #ffffff;
          opacity: 0.85;
          animation: recRingPulse 1.4s cubic-bezier(0.24, 0, 0.38, 1) infinite;
        }
        .marking-rec-inner-dot {
          width: calc(8px * var(--player-ui-scale, 1));
          height: calc(8px * var(--player-ui-scale, 1));
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 0 6px #ffffff;
        }
        @keyframes recRingPulse {
          0% { transform: scale(0.85); opacity: 0.9; }
          50% { transform: scale(1.18); opacity: 0.35; }
          100% { transform: scale(0.85); opacity: 0.9; }
        }
        .marking-rec-dot {
          display: inline-block;
          width: calc(10px * var(--player-ui-scale, 1));
          height: calc(10px * var(--player-ui-scale, 1));
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 0 8px #ffffff;
          animation: flashDot 1s infinite;
          flex-shrink: 0;
        }
        .marking-rec-text {
          max-width: 0;
          opacity: 0;
          margin-left: 0;
          font-size: calc(0.82rem * var(--player-ui-scale, 1));
          font-weight: 700;
          letter-spacing: 0.02em;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          color: #ffffff;
        }
        .marking-hud-button-controls:hover {
          width: auto;
          min-width: 0;
          border-radius: 20px;
          padding: 0 calc(12px * var(--player-ui-scale, 1));
          background: #f40b17;
        }
        .marking-hud-button-controls:hover .marking-rec-text {
          max-width: 140px;
          opacity: 1;
          margin-left: calc(8px * var(--player-ui-scale, 1));
        }

        /* Side Skip Indicator (Left: Rewind / Right: Forward) */
        .player-side-skip {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 28%;
          min-width: 160px;
          max-width: 340px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 55;
        }
        .player-side-skip-left {
          left: 0;
        }
        .player-side-skip-right {
          right: 0;
        }
        .player-side-skip-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px 26px;
          border-radius: 9999px;
          background: rgba(15, 17, 23, 0.78);
          border: 1px solid rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), 0 0 20px rgba(229, 9, 20, 0.2);
          color: #ffffff;
          animation: sideSkipPopFade 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          user-select: none;
        }
        .player-side-skip-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .player-side-skip-icon {
          color: #ffffff;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
        }
        .player-side-skip-text {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #ffffff;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
        }

        @keyframes sideSkipPopFade {
          0% {
            transform: scale(0.7);
            opacity: 0;
          }
          20% {
            transform: scale(1.08);
            opacity: 1;
          }
          30% {
            transform: scale(1.0);
            opacity: 1;
          }
          75% {
            transform: scale(1.0);
            opacity: 1;
          }
          100% {
            transform: scale(0.92);
            opacity: 0;
          }
        }

        .anim-spin-rewind {
          animation: skipIconPulseRewind 0.4s ease-out;
        }
        .anim-spin-forward {
          animation: skipIconPulseForward 0.4s ease-out;
        }

        @keyframes skipIconPulseRewind {
          0% { transform: rotate(0deg) scale(0.85); }
          50% { transform: rotate(-25deg) scale(1.15); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes skipIconPulseForward {
          0% { transform: rotate(0deg) scale(0.85); }
          50% { transform: rotate(25deg) scale(1.15); }
          100% { transform: rotate(0deg) scale(1); }
        }
      `}</style>

      {/* Render EsportsLiveOverlay here so it shows in Fullscreen */}
      <EsportsLiveOverlay />


      {vlcContextMenuState.visible && (
        <VlcContextMenu
          x={vlcContextMenuState.x}
          y={vlcContextMenuState.y}
          onClose={() => {
            vlcContextMenuClosedTimestampRef.current = Date.now();
            setVlcContextMenuState({ visible: false, x: 0, y: 0 });
          }}
          isPlaying={isPlaying}
          onPlayPause={togglePlay}
          onStop={() => {
            if (videoRef.current) {
              videoRef.current.pause();
              videoRef.current.currentTime = 0;
              setCurrentTime(0);
            }
          }}
          onPrevious={handleRewind}
          onNext={handleForward}
          onJumpForward={handleForward}
          onJumpBackward={handleRewind}
          playbackRate={playbackRate}
          onSetPlaybackRate={setPlaybackRate}
          audioStreams={audioStreams}
          audioTracks={audioTracks}
          selectedAudioTrack={selectedAudioTrack}
          onSelectAudioStream={handleSelectEmbeddedAudio}
          onSelectAudioTrack={setSelectedAudioTrack}
          volume={volume}
          isMuted={isMuted}
          onIncreaseVolume={() => {
            setIsMuted(false);
            setVolume(prev => {
              const nextVol = Math.min(1.0, prev + 0.05);
              triggerVolumeToast(nextVol, false, 100);
              return nextVol;
            });
          }}
          onDecreaseVolume={() => {
            setIsMuted(false);
            setVolume(prev => {
              const nextVol = Math.max(0.0, prev - 0.05);
              triggerVolumeToast(nextVol, false, 100);
              return nextVol;
            });
          }}
          onToggleMute={() => {
            setIsMuted(prev => {
              const nextMuted = !prev;
              triggerVolumeToast(volume, nextMuted);
              return nextMuted;
            });
          }}
          isFullscreen={isFullscreen || isPseudoFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onTakeSnapshot={handleTakeSnapshot}
          subtitleStreams={subtitleStreams}
          subtitleTracks={subtitleTracks}
          selectedSubTrack={selectedSubTrack}
          onSelectSubStream={handleSelectEmbeddedSubtitle}
          onSelectSubTrack={setSelectedSubTrack}
          onAddSubtitleFile={() => customSubInputRef.current?.click()}
          onOpenSubtitleSettings={() => {
            onUpdateSubSettings({ ...subSettings, showStyleColumn: true });
            setShowAudioSubMenu(true);
          }}
          onOpenSubtitleTranscript={() => {
            onUpdateSubSettings({ ...subSettings, showViewColumn: true });
            setShowAudioSubMenu(true);
          }}
          isTimelineOnly={timelineOnlyMode}
          onToggleTimelineOnly={() => {
            setTimelineOnlyMode(prev => {
              const next = !prev;
              triggerSwitchToast(next ? 'Timeline Only (VLC Mode)' : 'Standard Controls');
              return next;
            });
          }}
          aspectRatio={aspectRatio}
          onSetAspectRatio={(ratio) => {
            setAspectRatio(ratio);
            triggerSwitchToast(`Aspect Ratio: ${ratio === 'default' ? 'Default Fit' : ratio.toUpperCase()}`);
          }}
          toneMappingMode={toneMappingMode}
          onSetToneMappingMode={(mode) => handleSetToneMapping(mode as ToneMappingMode)}
          isAmbianceEnabled={isAmbianceEnabled}
          onToggleAmbiance={handleToggleAmbiance}
          ambianceBlur={ambianceBlur}
          onSetAmbianceBlur={handleSetAmbianceBlur}
          ambianceOpacity={ambianceOpacity}
          onSetAmbianceOpacity={handleSetAmbianceOpacity}
          onOpenSettings={() => setShowSettingsPanel(true)}
          onOpenAudioSubMenu={() => setShowAudioSubMenu(true)}
          bookmarks={bookmarks}
          onSeekToBookmark={(t) => {
            if (videoRef.current) videoRef.current.currentTime = t;
            setCurrentTime(t);
          }}
          onAddBookmark={() => {
            if (videoRef.current) {
              setEditingBookmark({
                id: '',
                time: Math.round(videoRef.current.currentTime),
                title: '',
                label: '',
                category: 'Default',
                description: '',
                createdAt: '',
                updatedAt: ''
              });
              setShowAddDialog(true);
            }
          }}
        />
      )}

      {showConsoleOverlay && (
        <ConsoleOverlay onClose={() => setShowConsoleOverlay(false)} />
      )}
    </div>
  );
};
