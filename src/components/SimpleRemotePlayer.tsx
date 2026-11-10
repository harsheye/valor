import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack, Bookmark } from '../types/media';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from './SubtitleOverlay';
import { AudioSubPopover } from './AudioSubPopover';
import { BookmarkPanel } from './BookmarkPanel';
import { BookmarkModal } from './BookmarkModal';
import { MediaAuthModal } from './MediaAuthModal';
import { MediaIdentifyModal } from './MediaIdentifyModal';
import { RadialMenu } from './RadialMenu';
import { ConsoleOverlay } from './ConsoleOverlay';
import { LoadingSpinner, BufferingOverlay } from './LoadingSpinner';

import {
  PlayerTopBar,
  PlayerBottomBar,
  PauseDetailsOverlay,
  SkipIntroButton,
  PlayerIsland,
  usePlayerIsland
} from './player';
import { useAutoLandscape } from '../utils/screenOrientation';
import type { MediaDetails } from './player/PauseDetailsOverlay';
import { getSavedCredentials, saveCredentials, clearCredentials } from '../services/remote/mediaAuthStore';
import { saveMediaTimestamp } from '../utils/mediaTimestampStorage';
import { parseSubtitles, cleanSubtitleText } from '../utils/subtitleParser';
import { trimSubtitleName } from '../utils/embedSubtitleStorage';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { resolveRemoteMediaName } from '../utils/corsCheck';
import { Play, Pause } from 'lucide-react';
import { sidecarService } from '../services/remote/sidecarService';
import { featureFlagService } from '../services/featureFlags';
import { LocalServicePage } from '../pages/LocalServicePage';
import { isGenericTitle } from './RemoteServerPlayer';
import Hls from 'hls.js';

export interface SimpleRemotePlayerProps {
  video: VideoItem;
  videos?: VideoItem[];
  onBack: () => void;
  onUpdateVideo: (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting?: boolean, targetVideoId?: string, forceSave?: boolean) => void;
  subSettings?: SubtitleSettings;
  onUpdateSubSettings?: (settings: Partial<SubtitleSettings>) => void;
  saveVolume?: boolean;
  historySaveInterval?: number;
  uiHideTimeout?: number;
  customLoaderUrl?: string;
  customLoaderType?: 'default' | 'image' | 'video' | 'gif';
  spinnerPreset?: string;
  onSwitchMode?: (mode: 'simple' | 'server') => void;
  isEmbed?: boolean;
  showSubtitleControl?: boolean;
  showBookmarksControl?: boolean;
  showAudioControl?: boolean;
  audioOnly?: boolean;
  subFileOnly?: boolean;
  allowSubUpload?: boolean;
  showCloseButton?: boolean;
}

export const SimpleRemotePlayer: React.FC<SimpleRemotePlayerProps> = ({
  video,
  videos = [],
  onBack,
  onUpdateVideo,
  subSettings: propSubSettings,
  onUpdateSubSettings: propOnUpdateSubSettings,
  saveVolume = true,
  historySaveInterval = 5,
  uiHideTimeout: propUiHideTimeout,
  customLoaderUrl,
  customLoaderType = 'default',
  spinnerPreset = 'netflix',
  onSwitchMode,
  isEmbed = false,
  showSubtitleControl = true,
  showBookmarksControl = true,
  showAudioControl = true,
  audioOnly = false,
  subFileOnly = false,
  allowSubUpload = true,
  showCloseButton = false
}) => {
  const island = usePlayerIsland();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const [isHlsActive, setIsHlsActive] = useState(false);
  const remoteSessionIdRef = useRef<string | null>(null);
  const customSubInputRef = useRef<HTMLInputElement | null>(null);
  const customAudioInputRef = useRef<HTMLInputElement | null>(null);
  const uiHideTimeout = propUiHideTimeout ?? (isEmbed ? 5 : 2.5);

  useAutoLandscape(true, containerRef);



  // Playback & Timing State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isReloadingStream, setIsReloadingStream] = useState(false);
  const [hasStartedPlayback, setHasStartedPlayback] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(() => video.currentTime || 0);
  const [duration, setDuration] = useState<number>(() => {
    if (typeof video.duration === 'number') return video.duration;
    if (typeof video.duration === 'string') {
      const parts = video.duration.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return 0;
  });
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [bufferedRanges, setBufferedRanges] = useState<{ start: number; end: number }[]>([]);

  // Volume & Audio State
  const [volume, setVolume] = useState<number>(() => {
    if (saveVolume) {
      const saved = localStorage.getItem('valor_volume');
      return saved !== null ? parseFloat(saved) : 1.0;
    }
    return 1.0;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (saveVolume) {
      const saved = localStorage.getItem('valor_muted');
      return saved === 'true';
    }
    return false;
  });
  const [audioBoost, setAudioBoost] = useState<number>(1.0);

  // Subtitles & Audio Tracks State
  const [subSettings, setSubSettings] = useState<SubtitleSettings>(() => {
    return propSubSettings || {
      fontSize: 'medium',
      color: 'white',
      backdrop: 'shadow',
      fontFamily: 'sans-serif',
      fontStyle: 'normal'
    };
  });
  const [subtitleTracks, setSubtitleTracks] = useState<CustomSubtitleTrack[]>(() => video.subtitleTracks || []);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(() => {
    if (video.subtitleTracks && video.subtitleTracks.length > 0) {
      return video.subtitleTracks[0];
    }
    return null;
  });
  const [audioTracks, setAudioTracks] = useState<CustomAudioTrack[]>(() => video.audioTracks || []);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<CustomAudioTrack | null>(() => {
    if (video.audioTracks && video.audioTracks.length > 0) {
      return video.audioTracks[0];
    }
    return null;
  });
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);

  // OpenSubtitles integration
  const [openSubtitles, setOpenSubtitles] = useState<any[]>([]);
  const [isOpenSubLoading, setIsOpenSubLoading] = useState(false);
  const [hasFetchedOpenSubtitles, setHasFetchedOpenSubtitles] = useState(false);

  // Bookmarks State
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => video.bookmarks || []);
  const [showBookmarksPopover, setShowBookmarksPopover] = useState(false);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | undefined>(undefined);

  // Overlays & HUD State
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showConsoleOverlay, setShowConsoleOverlay] = useState(false);
  const [radialMenuState, setRadialMenuState] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showCenterRipple, setShowCenterRipple] = useState<'play' | 'pause' | null>(null);
  const [systemTime, setSystemTime] = useState<Date>(new Date());

  // Netflix-style Pause Screen Overlay State
  const [showPauseMetadataOverlay, setShowPauseMetadataOverlay] = useState(false);
  const pauseOverlayTimerRef = useRef<any>(null);
  const [mediaDetails, setMediaDetails] = useState<MediaDetails | null>(() => {
    const rawTitle = video.title || (video as any).fileName || '';
    const classified = classifyVideoTitle(rawTitle);
    const isTV = classified.type === 'series';
    return {
      title: isTV && classified.seriesTitle ? classified.seriesTitle : (classified.displayTitle || rawTitle || 'Media'),
      episodeTitle: isTV ? classified.episodeTitle : undefined,
      season: isTV ? classified.season : undefined,
      episode: isTV ? classified.episode : undefined,
      overview: (video as any).overview || '',
      imageUrl: (video as any).posterPath || (video as any).imageUrl || '',
      rating: (video as any).rating || 8.4
    };
  });

  // Identify / Sync Modal State
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);

  // Auth Modal State
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    initialUsername: string;
    errorMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    initialUsername: '',
    errorMessage: null,
    isLoading: false
  });

  // Time formatting helper
  const formatTime = useCallback((seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const triggerToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // System time ticker for digital Odometer clock
  useEffect(() => {
    const timer = setInterval(() => setSystemTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 10));
  const [isSidecarActive, setIsSidecarActive] = useState<boolean>(() => !isEmbed && sidecarService.isEnabled());
  const [showCompanionModal, setShowCompanionModal] = useState<boolean>(false);

  useEffect(() => {
    if (isEmbed) return;
    const unsub = sidecarService.subscribe((status) => {
      setIsSidecarActive(status.isAvailable);
    });
    return () => unsub();
  }, [isEmbed]);



  // Resolve media name from Content-Disposition header
  useEffect(() => {
    if (!video?.url) return;
    resolveRemoteMediaName(video.url).then((resolved) => {
      if (resolved && resolved.fileName) {
        const rawTitle = video.title || '';
        const shouldUpdate = video.fileName !== resolved.fileName || !rawTitle || isGenericTitle(rawTitle) || rawTitle.length > 50;
        if (shouldUpdate) {
          onUpdateVideo({
            ...video,
            fileName: resolved.fileName,
            title: !rawTitle ? (resolved.title || resolved.fileName) : rawTitle
          });
        }
      }
    });
  }, [video?.url]);

  // Proxied Video URL (bypasses CORS & provides sliding cache)
  const getProxiedUrl = useCallback((rawUrl: string): string => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://127.0.0.1:45454/api/proxy-media') || rawUrl.startsWith('/api/proxy-media')) return rawUrl;
    const apiBase = sidecarService.getRemoteApiBase();
    const creds = (video as any).auth || getSavedCredentials(rawUrl);
    let proxyUrl = `${apiBase}/api/proxy-media?url=${encodeURIComponent(rawUrl)}&sessionId=${sessionIdRef.current}`;
    if (duration > 0) {
      proxyUrl += `&duration=${duration}`;
    }
    if (creds?.username) {
      proxyUrl += `&user=${encodeURIComponent(creds.username)}`;
      if (creds?.password) proxyUrl += `&pass=${encodeURIComponent(creds.password)}`;
    }
    return proxyUrl;
  }, [video, duration, isSidecarActive]);

  // Controls auto-hide timer
  const controlsTimeoutRef = useRef<any>(null);
  const resetControlsTimeout = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isBuffering) return;
    if (isPlaying && !isLocked && !showAudioSubMenu && !showBookmarksPopover && !showBookmarkModal) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, uiHideTimeout * 1000);
    }
  }, [isPlaying, isLocked, showAudioSubMenu, showBookmarksPopover, showBookmarkModal, uiHideTimeout, isBuffering]);

  useEffect(() => {
    if (isBuffering) {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimeout();
    }
  }, [isBuffering, resetControlsTimeout]);

  // Handle Pause Screen Timer (Show after 30s of continuous pause / inactivity)
  useEffect(() => {
    if (!isPlaying && !isBuffering) {
      setShowPauseMetadataOverlay(false);
      pauseOverlayTimerRef.current = setTimeout(() => {
        setShowPauseMetadataOverlay(true);
        setControlsVisible(false);
      }, 30000);
    } else {
      if (pauseOverlayTimerRef.current) clearTimeout(pauseOverlayTimerRef.current);
      setShowPauseMetadataOverlay(false);
      resetControlsTimeout();
    }
    return () => {
      if (pauseOverlayTimerRef.current) clearTimeout(pauseOverlayTimerRef.current);
    };
  }, [isPlaying, isBuffering, resetControlsTimeout]);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (showPauseMetadataOverlay) {
      setShowPauseMetadataOverlay(false);
    }
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        setShowCenterRipple('play');
        setTimeout(() => setShowCenterRipple(null), 500);
      }).catch(err => {
        console.warn('[SimpleRemotePlayer] Play error:', err);
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowCenterRipple('pause');
      setTimeout(() => setShowCenterRipple(null), 500);
    }
    resetControlsTimeout();
  }, [showPauseMetadataOverlay, resetControlsTimeout]);

  // Seek
  const handleSeek = useCallback((targetTime: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(duration || 0, targetTime));
    const delta = Math.round(clamped - videoRef.current.currentTime);
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    if (delta !== 0) {
      island.notify({
        type: 'seek',
        delta,
        time: clamped,
        duration: duration || 0
      });
    }
    resetControlsTimeout();
  }, [duration, resetControlsTimeout, island]);

  const isMkvStream = useCallback((url: string, format?: string, containerType?: string) => {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.mkv') || clean.endsWith('.avi') || clean.endsWith('.ts') || clean.endsWith('.m2ts') ||
      (format || '').toLowerCase().includes('mkv') || (format || '').toLowerCase().includes('matroska') ||
      (containerType || '').toLowerCase().includes('mkv') || (containerType || '').toLowerCase().includes('matroska');
  }, []);

  const isDirectHls = useCallback((url: string, containerType?: string) => {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.m3u8') || containerType === 'hls';
  }, []);

  const loadHlsSource = useCallback((manifestUrl: string) => {
    if (!videoRef.current) return;
    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsInstanceRef.current = hls;
      setIsHlsActive(true);
      hls.loadSource(manifestUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[HLS Simple] Network error encountered, attempting reload...', data);
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[HLS Simple] Media error encountered, attempting recovery...', data);
              hls.recoverMediaError();
              break;
            default:
              console.error('[HLS Simple] Fatal error, destroying hls instance:', data);
              hls.destroy();
              setIsHlsActive(false);
              break;
          }
        }
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      setIsHlsActive(true);
      videoRef.current.src = manifestUrl;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const startHlsSession = useCallback(async (targetUrl: string): Promise<boolean> => {
    try {
      setIsBuffering(true);
      const creds = (video as any).auth || getSavedCredentials(targetUrl);
      const res = await fetch('/api/remote/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          auth: creds ? { username: creds.username, password: creds.password } : undefined
        })
      });

      if (!res.ok) {
        throw new Error(`Session creation failed with status ${res.status}`);
      }

      const sessionData = await res.json();
      if (sessionData.sessionId && sessionData.manifestUrl) {
        remoteSessionIdRef.current = sessionData.sessionId;
        if (sessionData.duration && !duration) {
          setDuration(sessionData.duration);
        }
        const allStreams: any[] = [];
        if (sessionData.videoStreams) sessionData.videoStreams.forEach((v: any) => allStreams.push({ ...v, type: 'video' }));
        if (sessionData.audioStreams) sessionData.audioStreams.forEach((a: any) => allStreams.push({ ...a, type: 'audio' }));
        if (sessionData.subtitleStreams) sessionData.subtitleStreams.forEach((s: any) => allStreams.push({ ...s, type: 'subtitle' }));

        onUpdateVideo({
          ...video,
          streams: allStreams,
          duration: sessionData.duration ? String(sessionData.duration) : video.duration
        });

        loadHlsSource(sessionData.manifestUrl);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[SimpleRemotePlayer] HLS session initialization failed:', err);
      setIsHlsActive(false);
      setIsBuffering(false);
      return false;
    }
  }, [video, duration, onUpdateVideo, loadHlsSource]);

  useEffect(() => {
    if (!video?.url) return;

    if (hlsInstanceRef.current) {
      hlsInstanceRef.current.destroy();
      hlsInstanceRef.current = null;
    }
    if (remoteSessionIdRef.current) {
      const sId = remoteSessionIdRef.current;
      remoteSessionIdRef.current = null;
      fetch(`/api/remote/session/${sId}`, { method: 'DELETE' }).catch(() => {});
    }

    const isHls = isDirectHls(video.url, video.containerType);

    if (isHls) {
      setIsHlsActive(true);
      const hlsUrl = getProxiedUrl(video.url);
      loadHlsSource(hlsUrl);
    } else {
      setIsHlsActive(false);
    }

    return () => {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
      if (remoteSessionIdRef.current) {
        const sId = remoteSessionIdRef.current;
        remoteSessionIdRef.current = null;
        fetch(`/api/remote/session/${sId}`, { method: 'DELETE' }).catch(() => {});
      }
    };
  }, [video?.url, video?.id, isDirectHls, loadHlsSource, getProxiedUrl]);

  // Volume
  const updateVolume = useCallback((newVol: number, muteState?: boolean) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(1, newVol));
    videoRef.current.volume = clamped;
    setVolume(clamped);
    if (muteState !== undefined) {
      videoRef.current.muted = muteState;
      setIsMuted(muteState);
      if (saveVolume) localStorage.setItem('valor_muted', String(muteState));
    } else if (clamped === 0) {
      videoRef.current.muted = true;
      setIsMuted(true);
      if (saveVolume) localStorage.setItem('valor_muted', 'true');
    } else {
      videoRef.current.muted = false;
      setIsMuted(false);
      if (saveVolume) localStorage.setItem('valor_muted', 'false');
    }
    if (saveVolume) localStorage.setItem('valor_volume', String(clamped));
    island.notify({
      type: 'volume',
      value: clamped,
      muted: muteState !== undefined ? muteState : (clamped === 0 || isMuted)
    });
  }, [saveVolume, isMuted, island]);

  const toggleMute = useCallback(() => {
    updateVolume(volume, !isMuted);
  }, [volume, isMuted, updateVolume]);

  // Speed
  const handleSpeedChange = useCallback((speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackRate(speed);
    island.notify({ type: 'speed', value: speed });
  }, [island]);

  // Fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {}
  }, []);

  // Sync buffered ranges
  const updateBufferedRanges = useCallback(() => {
    if (!videoRef.current) return;
    const b = videoRef.current.buffered;
    const ranges: { start: number; end: number }[] = [];
    for (let i = 0; i < b.length; i++) {
      ranges.push({ start: b.start(i), end: b.end(i) });
    }
    setBufferedRanges(ranges);
  }, []);

  // Periodic history & timestamp saving
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentTime > 0) {
        saveMediaTimestamp(video.id, currentTime, duration);
        onUpdateVideo((prev: any) => ({
          ...prev,
          currentTime,
          duration: duration || prev.duration
        }), false, video.id);
      }
    }, historySaveInterval * 1000);

    return () => clearInterval(interval);
  }, [currentTime, duration, historySaveInterval, onUpdateVideo, video.id]);

  // Floating skip intro bookmark detection
  const activeSkipBookmark = bookmarks.find(b => {
    if (!b.endTime || b.endTime <= b.time) return false;
    return currentTime >= b.time && currentTime < b.endTime;
  });

  // OpenSubtitles fetch
  const fetchOpenSubtitles = useCallback(async (customQuery?: string) => {
    setIsOpenSubLoading(true);
    setHasFetchedOpenSubtitles(true);
    try {
      let resolvedApiKey = '';
      try {
        const saved = localStorage.getItem('valor_settings');
        if (saved) resolvedApiKey = JSON.parse(saved).openSubtitlesApiKey || '';
      } catch {}

      if (!resolvedApiKey) {
        triggerToast("OpenSubtitles API key required. Enter one in Settings.");
        setIsOpenSubLoading(false);
        return;
      }

      const cleanQuery = (customQuery || video.title || '').trim().replace(/\.[^/.]+$/, "");
      const searchUrl = `https://api.opensubtitles.com/api/v1/subtitles?query=${encodeURIComponent(cleanQuery)}&languages=en`;
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(searchUrl)}`;

      const res = await fetch(proxyUrl, {
        headers: {
          'Api-Key': resolvedApiKey,
          'Accept': 'application/json',
          'User-Agent': 'Valor v1.0'
        }
      });

      if (res.ok) {
        const data = await res.json();
        const items = (data.data || []).map((item: any) => ({
          fileId: item.attributes?.files?.[0]?.file_id,
          fileName: item.attributes?.release || item.attributes?.feature_details?.movie_name || 'Subtitle',
          language: item.attributes?.language || 'en',
          downloadCount: item.attributes?.download_count || 0
        })).filter((x: any) => !!x.fileId);

        setOpenSubtitles(items);
        triggerToast(`Found ${items.length} OpenSubtitles`);
      } else {
        triggerToast(`OpenSubtitles search failed (${res.status})`);
      }
    } catch (err: any) {
      triggerToast(`Search error: ${err.message}`);
    } finally {
      setIsOpenSubLoading(false);
    }
  }, [video.title, triggerToast]);

  // OpenSubtitles download
  const downloadOpenSubtitle = useCallback(async (fileId: number, fileName: string, language: string) => {
    triggerToast("Downloading subtitle...");
    try {
      let resolvedApiKey = '';
      try {
        const saved = localStorage.getItem('valor_settings');
        if (saved) resolvedApiKey = JSON.parse(saved).openSubtitlesApiKey || '';
      } catch {}

      const postUrl = `/api/proxy?url=${encodeURIComponent('https://api.opensubtitles.com/api/v1/download')}`;
      const res = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Api-Key': resolvedApiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Valor v1.0'
        },
        body: JSON.stringify({ file_id: fileId })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.link) {
          const fileRes = await fetch(`/api/proxy?url=${encodeURIComponent(data.link)}`);
          if (fileRes.ok) {
            const text = await fileRes.text();
            const cues = parseSubtitles(text, fileName);
            const newTrack: CustomSubtitleTrack = {
              id: `opensub-${fileId}`,
              name: trimSubtitleName(fileName, language),
              url: '',
              cues,
              isExtracted: false,
              language: language.toLowerCase()
            };
            setSubtitleTracks(prev => [...prev, newTrack]);
            setSelectedSubTrack(newTrack);
            triggerToast(`Loaded subtitle: ${newTrack.name}`);
          }
        }
      }
    } catch (err: any) {
      triggerToast(`Download failed: ${err.message}`);
    }
  }, [triggerToast]);

  // Custom local subtitle upload handler
  const handleCustomSubFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        const cues = parseSubtitles(content, file.name);
        const newTrack: CustomSubtitleTrack = {
          id: `custom-sub-${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ""),
          url: '',
          cues,
          isExtracted: false
        };
        setSubtitleTracks(prev => [...prev, newTrack]);
        setSelectedSubTrack(newTrack);
        triggerToast(`Loaded: ${file.name}`);
      }
    };
    reader.readAsText(file);
  }, [triggerToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          handleSeek(currentTime - 10);
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          handleSeek(currentTime + 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateVolume(Math.min(1, volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateVolume(Math.max(0, volume - 0.05));
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'b':
          e.preventDefault();
          setShowBookmarkModal(true);
          break;
        case 'c':
          e.preventDefault();
          setShowAudioSubMenu(prev => !prev);
          break;
        case 'Escape':
          if (showBookmarkModal) setShowBookmarkModal(false);
          else if (showBookmarksPopover) setShowBookmarksPopover(false);
          else if (showAudioSubMenu) setShowAudioSubMenu(false);
          else if (showIdentifyModal) setShowIdentifyModal(false);
          else onBack();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, handleSeek, updateVolume, volume, toggleMute, toggleFullscreen, currentTime, showBookmarkModal, showBookmarksPopover, showAudioSubMenu, showIdentifyModal, onBack]);

  return (
    <div
      ref={containerRef}
      className="valor-video-player-container modern-player-theme"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: (controlsVisible || showPauseMetadataOverlay) ? 'default' : 'none',
        fontFamily: 'var(--font-sans)'
      }}
      onMouseMove={resetControlsTimeout}
      onClick={() => {
        if (showPauseMetadataOverlay) {
          setShowPauseMetadataOverlay(false);
          togglePlay();
          return;
        }
        resetControlsTimeout();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setRadialMenuState({ visible: true, x: e.clientX, y: e.clientY });
      }}
    >
      {/* Hidden File Inputs for custom upload */}
      <input
        type="file"
        ref={customSubInputRef}
        accept=".srt,.vtt,.ass,.ssa"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleCustomSubFile(file);
        }}
      />

      {/* Main HTML5 Video Element */}
      <video
        ref={videoRef}
        src={isHlsActive ? undefined : getProxiedUrl(video.url)}
        crossOrigin={video.playbackMode === 'advanced' ? 'anonymous' : undefined}
        playsInline
        autoPlay
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          backgroundColor: '#000000'
        }}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            updateBufferedRanges();
          }
        }}
        onDurationChange={() => {
          if (videoRef.current && videoRef.current.duration) {
            setDuration(videoRef.current.duration);
          }
        }}
        onPlay={() => {
          setIsPlaying(true);
          setHasStartedPlayback(true);
        }}
        onPause={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
        onWaiting={() => {
          if (videoRef.current?.paused || !isPlaying) return;
          setIsBuffering(true);
        }}
        onStalled={() => {
          if (videoRef.current?.paused || !isPlaying) return;
          setIsBuffering(true);
        }}
        onLoadStart={() => {
          if (hasStartedPlayback && (videoRef.current?.paused || !isPlaying)) return;
          setIsBuffering(true);
        }}
        onSeeking={() => {
          if (videoRef.current?.paused || !isPlaying) {
            setIsBuffering(false);
            return;
          }
          setIsBuffering(true);
        }}
        onSeeked={() => setIsBuffering(false)}
        onPlaying={() => {
          setIsBuffering(false);
          setHasStartedPlayback(true);
        }}
        onCanPlay={() => {
          setIsBuffering(false);
          setHasStartedPlayback(true);
          if (videoRef.current && videoRef.current.paused && isPlaying) {
            videoRef.current.play().catch(() => {});
          }
        }}
        onError={() => {
          setIsBuffering(false);
          if (!isHlsActive && video.isRemote && video.url) {
            console.warn('[SimpleRemotePlayer] Direct playback failed, falling back to backend HLS session');
            startHlsSession(video.url);
            return;
          }
          // Check for 401 auth required, 404 not found, or 403 forbidden
          fetch(getProxiedUrl(video.url), { method: 'HEAD' }).then(res => {
            if (res.status === 401) {
              setAuthModalState({
                isOpen: true,
                initialUsername: '',
                errorMessage: null,
                isLoading: false
              });
            } else if (res.status === 404) {
              triggerToast("Media not found (HTTP 404). Please verify URL.");
            } else if (res.status === 403) {
              triggerToast("Access forbidden (HTTP 403).");
            } else {
              triggerToast("Playback error occurred.");
            }
          }).catch(() => triggerToast("Network or stream error."));
        }}
      />

      <PlayerIsland
        audioTracks={audioTracks.map((a, i) => ({
          index: i,
          label: a.name,
          language: a.language
        }))}
        subtitleTracks={subtitleTracks.map((s, i) => ({
          index: i,
          label: s.name,
          language: s.language
        }))}
        selectedAudioIndex={selectedAudioTrack ? audioTracks.indexOf(selectedAudioTrack) : 0}
        selectedSubtitleIndex={selectedSubTrack ? subtitleTracks.indexOf(selectedSubTrack) : -1}
        onSelectAudio={(idx) => {
          if (audioTracks[idx]) setSelectedAudioTrack(audioTracks[idx]);
        }}
        onSelectSubtitle={(idx) => {
          if (idx === -1) {
            setSelectedSubTrack(null);
          } else if (subtitleTracks[idx]) {
            setSelectedSubTrack(subtitleTracks[idx]);
          }
        }}
      />

      {/* Subtitles Overlay */}
      {selectedSubTrack && selectedSubTrack.cues && (
        <SubtitleOverlay
          cues={selectedSubTrack.cues}
          currentTime={currentTime}
          settings={subSettings}
          controlsVisible={controlsVisible}
          menuVisible={showAudioSubMenu}
        />
      )}

      {/* Buffering fire ring loader */}
      <BufferingOverlay 
        isBuffering={isReloadingStream || (!hasStartedPlayback ? isBuffering : (!videoRef.current?.paused && isPlaying && isBuffering))}
        customLoaderUrl={customLoaderUrl} 
        customLoaderType={customLoaderType} 
        preset={(spinnerPreset || 'fire-circle') as any} 
      />

      {/* Center Play/Pause Ripple Feedback */}
      {showCenterRipple && (
        <div
          className="animate-ping"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 70,
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff'
          }}
        >
          {showCenterRipple === 'play' ? <Play size={40} fill="#ffffff" /> : <Pause size={40} fill="#ffffff" />}
        </div>
      )}

      {/* Netflix-style Paused Details Overlay */}
      <PauseDetailsOverlay
        visible={showPauseMetadataOverlay && !isPlaying && !isBuffering}
        mediaDetails={mediaDetails}
        videoTitle={video.title}
        duration={duration}
        isBuffering={isBuffering}
      />

      {/* Floating Skip Intro / Outro Button */}
      <SkipIntroButton
        bookmark={activeSkipBookmark || null}
        onSkip={handleSeek}
      />

      {/* Desktop Top Header Overlay Bar */}
      {!isLocked && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            opacity: controlsVisible ? 1 : 0,
            transform: controlsVisible ? 'translateY(0)' : 'translateY(-12px)',
            pointerEvents: controlsVisible ? 'auto' : 'none',
            transition: controlsVisible ? 'opacity 0.2s ease-out, transform 0.2s ease-out' : 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          <PlayerTopBar
            title={video.title || 'Simple Player'}
            episodeInfo={mediaDetails?.season && mediaDetails?.episode ? `S${mediaDetails.season} E${mediaDetails.episode}` : undefined}
            onBack={onBack}
            currentMode="simple"
            onSwitchMode={onSwitchMode}
            isLocked={isLocked}
            onToggleLock={() => setIsLocked(!isLocked)}
            showConsole={showConsoleOverlay}
            onToggleConsole={() => setShowConsoleOverlay(!showConsoleOverlay)}
            onClose={onBack}
            onOpenCompanion={() => setShowCompanionModal(true)}
            isEmbed={isEmbed}
            showCloseButton={showCloseButton}
          />
        </div>
      )}

      {/* Desktop Bottom Controls Bar */}
      {!isLocked && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            opacity: controlsVisible ? 1 : 0,
            transform: controlsVisible ? 'translateY(0)' : 'translateY(12px)',
            pointerEvents: controlsVisible ? 'auto' : 'none',
            transition: controlsVisible ? 'opacity 0.2s ease-out, transform 0.2s ease-out' : 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          <PlayerBottomBar
            currentTime={currentTime}
            duration={duration}
            bufferedRanges={bufferedRanges}
            bookmarks={bookmarks}
            onSeek={handleSeek}
            formatTime={formatTime}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onRewind10={() => handleSeek(currentTime - 10)}
            onForward10={() => handleSeek(currentTime + 10)}
            volume={volume}
            isMuted={isMuted}
            onChangeVolume={updateVolume}
            onToggleMute={toggleMute}
            playbackRate={playbackRate}
            onChangeSpeed={handleSpeedChange}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onTogglePiP={togglePiP}
            showAudioSubMenu={showAudioSubMenu}
            setShowAudioSubMenu={setShowAudioSubMenu}
            showSubtitleControl={showSubtitleControl}
            showAudioControl={showAudioControl}
            showBookmarksControl={showBookmarksControl}
            audioSubPopoverContent={
              <AudioSubPopover
                audioStreams={[]}
                audioTracks={audioTracks}
                selectedAudioTrack={selectedAudioTrack}
                setSelectedAudioTrack={setSelectedAudioTrack}
                setActiveAudioStreamIndex={() => {}}
                handleSelectEmbeddedAudio={async () => {}}
                customAudioInputRef={customAudioInputRef}
                subtitleStreams={[]}
                subtitleTracks={subtitleTracks}
                selectedSubTrack={selectedSubTrack}
                setSelectedSubTrack={setSelectedSubTrack}
                setActiveSubStreamIndex={() => {}}
                handleSelectEmbeddedSubtitle={async () => {}}
                customSubInputRef={customSubInputRef}
                currentTime={currentTime}
                videoRef={videoRef}
                setCurrentTime={handleSeek}
                setShowAudioSubMenu={setShowAudioSubMenu}
                audioSubTimeoutRef={{ current: null }}
                getLangLabel={(l) => l || 'Default'}
                formatTime={formatTime}
                cleanSubtitleText={cleanSubtitleText}
                subSettings={subSettings}
                onUpdateSubSettings={(s) => {
                  setSubSettings(prev => ({ ...prev, ...s }));
                  propOnUpdateSubSettings?.(s);
                }}
                audioBoost={audioBoost}
                setAudioBoost={setAudioBoost}
                openSubtitles={openSubtitles}
                isOpenSubLoading={isOpenSubLoading}
                onDownloadOpenSubtitle={downloadOpenSubtitle}
                hasFetchedOpenSubtitles={hasFetchedOpenSubtitles}
                onFetchOpenSubtitles={fetchOpenSubtitles}
                showAudioControl={showAudioControl !== false}
                showSubtitleControl={showSubtitleControl !== false}
                subFileOnly={subFileOnly === true}
                allowSubUpload={allowSubUpload !== false}
              />
            }
            showBookmarksPopover={showBookmarksPopover}
            setShowBookmarksPopover={setShowBookmarksPopover}
            bookmarkPanelContent={
              <BookmarkPanel
                bookmarks={bookmarks}
                onJump={handleSeek}
                onEdit={(bm) => {
                  setEditingBookmark(bm);
                  setShowBookmarkModal(true);
                  setShowBookmarksPopover(false);
                }}
                onDelete={(id) => {
                  const filtered = bookmarks.filter(b => b.id !== id);
                  setBookmarks(filtered);
                  onUpdateVideo({ ...video, bookmarks: filtered }, false);
                }}
                onAdd={() => {
                  setEditingBookmark(undefined);
                  setShowBookmarkModal(true);
                  setShowBookmarksPopover(false);
                }}
                onClose={() => setShowBookmarksPopover(false)}
              />
            }
            systemTime={systemTime}
          />
        </div>
      )}

      {/* Bookmark Modal */}
      {showBookmarkModal && (
        <BookmarkModal
          initialTime={currentTime}
          initialBookmark={editingBookmark}
          videoElement={videoRef.current}
          videoTitle={video.title}
          onSave={(bmData) => {
            let updated: Bookmark[];
            if (editingBookmark) {
              updated = bookmarks.map(b => b.id === editingBookmark.id ? ({ ...b, ...bmData } as Bookmark) : b);
            } else {
              const newBm: Bookmark = {
                id: `bm-${Date.now()}`,
                time: currentTime,
                label: bmData.title || bmData.label || 'Bookmark',
                title: bmData.title || bmData.label || 'Bookmark',
                category: bmData.category || 'Intro',
                endTime: bmData.endTime,
                ...bmData
              } as Bookmark;
              updated = [...bookmarks, newBm];
            }
            setBookmarks(updated);
            onUpdateVideo({ ...video, bookmarks: updated }, false);
            setShowBookmarkModal(false);
            setEditingBookmark(undefined);
            triggerToast("Bookmark saved");
          }}
          onClose={() => {
            setShowBookmarkModal(false);
            setEditingBookmark(undefined);
          }}
        />
      )}

      {/* Media Identify & TheIntroDB Modal */}
      {showIdentifyModal && (
        <MediaIdentifyModal
          isOpen={showIdentifyModal}
          videoTitle={video.title || ''}
          duration={duration}
          onClose={() => setShowIdentifyModal(false)}
          onApplyBookmarks={(newBms, mediaInfo) => {
            const existingIds = new Set(bookmarks.map(b => b.id));
            const filteredNew = newBms.filter(b => !existingIds.has(b.id));
            const updated = [...bookmarks, ...filteredNew];
            setBookmarks(updated);
            onUpdateVideo({
              ...video,
              title: mediaInfo.title || video.title,
              tmdbId: mediaInfo.tmdbId,
              bookmarks: updated
            }, false);
            triggerToast(`Loaded ${newBms.length} bookmarks`);
          }}
          onToast={triggerToast}
          videoId={video.id}
        />
      )}

      {/* Media Auth Modal (HTTP 401 basic auth) */}
      <MediaAuthModal
        isOpen={authModalState.isOpen}
        url={video.url}
        initialUsername={authModalState.initialUsername}
        errorMessage={authModalState.errorMessage}
        isLoading={authModalState.isLoading}
        onSubmit={async ({ username, password, remember }) => {
          setAuthModalState(prev => ({ ...prev, isLoading: true, errorMessage: null }));
          const creds = { username, password };
          if (remember !== false) {
            saveCredentials(video.url, creds);
          } else {
            clearCredentials(video.url);
          }
          sessionIdRef.current = Math.random().toString(36).substring(2, 10);
          onUpdateVideo({
            ...video,
            auth: creds,
            probingError: undefined
          });
          if (videoRef.current) {
            videoRef.current.src = getProxiedUrl(video.url);
            videoRef.current.load();
            videoRef.current.play().catch(() => {});
          }
          setAuthModalState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }}
        onCancel={() => {
          setAuthModalState(prev => ({ ...prev, isOpen: false }));
          onBack();
        }}
      />

      {/* Stream Stats Console Overlay */}
      {showConsoleOverlay && (
        <ConsoleOverlay onClose={() => setShowConsoleOverlay(false)} />
      )}

      {/* Radial Menu on Right Click */}
      {radialMenuState.visible && (
        <RadialMenu
          x={radialMenuState.x}
          y={radialMenuState.y}
          onClose={() => setRadialMenuState({ visible: false, x: 0, y: 0 })}
          items={[
            {
              id: 'audioSubs',
              label: 'Audio/Subs',
              onClick: () => setShowAudioSubMenu(true),
              disabled: isLocked
            },
            {
              id: 'bookmark',
              label: 'Bookmark',
              onClick: () => setShowBookmarkModal(true),
              disabled: isLocked
            },
            {
              id: 'fullscreen',
              label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
              onClick: toggleFullscreen,
              disabled: false
            },
            {
              id: 'speed',
              label: `${playbackRate}x Speed`,
              onClick: () => {
                const speeds = [1.0, 1.25, 1.5, 2.0];
                const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                handleSpeedChange(next);
              },
              disabled: isLocked
            }
          ]}
          centerItem={{
            icon: isPlaying ? <Pause size={24} fill="#ffffff" /> : <Play size={24} fill="#ffffff" />,
            onClick: togglePlay,
            disabled: false
          }}
        />
      )}

      {/* Companion Engine Setup & Diagnostics Modal */}
      {showCompanionModal && featureFlagService.isFeatureEnabled('localEngine') && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            overflowY: 'auto'
          }}
          onClick={() => setShowCompanionModal(false)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '20px',
              backgroundColor: '#0a0f1d',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <LocalServicePage onClose={() => setShowCompanionModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
};
