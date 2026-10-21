import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Play, Pause, RotateCcw, RotateCw, X, 
  Maximize, Minimize, MonitorPlay,
  Volume2, Volume1, VolumeX, AlertCircle, Lock, Unlock,
  Sliders, SkipForward, Ban, FastForward, Zap, Coffee, Eye, Settings, Bookmark as BookmarkIcon, Terminal
} from 'lucide-react';
import { Button } from './ui/button';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack, Bookmark } from '../types/media';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from './SubtitleOverlay';
import { AudioSubPopover } from './AudioSubPopover';
import { BookmarkPanel } from './BookmarkPanel';
import { BookmarkModal } from './BookmarkModal';
import { parseSubtitles, cleanSubtitleText } from '../utils/subtitleParser';
import { logger } from '../utils/logger';
import { MediaAuthModal } from './MediaAuthModal';
import { MediaIdentifyModal } from './MediaIdentifyModal';
import { getSavedCredentials, saveCredentials, clearCredentials } from '../services/remote/mediaAuthStore';
import { saveMediaTimestamp, getMediaTimestamp } from '../utils/mediaTimestampStorage';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { LoadingSpinner, BufferingOverlay } from './LoadingSpinner';
import { RadialMenu } from './RadialMenu';
import { ConsoleOverlay } from './ConsoleOverlay';
import { SpeedPopover } from './SpeedPopover';

const getAudioBoostMultiplier = (boostPercent: number): number => {
  if (boostPercent <= 100) return 1.0;
  if (boostPercent <= 150) {
    return 1.0 + (boostPercent - 100) * 0.04;
  }
  if (boostPercent <= 200) {
    return 3.0 + (boostPercent - 150) * 0.02;
  }
  return 4.0;
};

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
  onReassociate?: (videoId: string) => Promise<void>;
  isEmbed?: boolean;
  onSwitchMode?: (mode: 'simple' | 'server') => void;
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
        <span>0</span><span>1</span><span>2</span><span>3</span><span>4</span>
        <span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>
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
  hasTmdbData?: boolean;
}

export const RemoteServerPlayer: React.FC<VideoPlayerProps> = ({
  video: rawVideo,
  videos,
  onBack,
  onUpdateVideo,
  customLoaderUrl,
  customLoaderType = 'default',
  spinnerPreset = 'fire-circle',
  userId = 'local',
  profileName = 'Local Profile',
  isEmbed = false,
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
  onSwitchMode
}) => {
  const video = rawVideo;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showCenterPlayHint, setShowCenterPlayHint] = useState(false);
  const hasSeekedInitialRef = useRef(false);
  const [currentTime, setCurrentTime] = useState<number>(() => video.currentTime || 0);
  const latestTimeRef = useRef<number>(currentTime);
  latestTimeRef.current = currentTime;

  const [duration, setDuration] = useState<number>(() => {
    if (typeof video.duration === 'number') return video.duration;
    if (typeof video.duration === 'string') {
      const parts = video.duration.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return 0;
  });

  const [bufferedRanges, setBufferedRanges] = useState<{ start: number; end: number }[]>([]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isLocked, setIsLocked] = useState(propLockModeActive);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Volume & Audio Boost
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
  const [audioBoost, setAudioBoost] = useState<number>(100);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volumeToast, setVolumeToast] = useState<{ volume: number; boost: number; visible: boolean; isMuted: boolean }>({
    volume: 1, boost: 100, visible: false, isMuted: false
  });

  // Tracks & Streams
  const streams = useMemo(() => video.streams || [], [video.streams]);
  const audioStreams = useMemo(() => streams.filter(s => s.type === 'audio'), [streams]);
  const subtitleStreams = useMemo(() => streams.filter(s => s.type === 'subtitle'), [streams]);

  const [activeAudioStreamIndex, setActiveAudioStreamIndex] = useState<number | null>(null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<CustomAudioTrack | null>(null);
  const [activeSubStreamIndex, setActiveSubStreamIndex] = useState<number | null>(null);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(null);

  // Popovers & UI Dialogs
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);
  const [showSpeedPopover, setShowSpeedPopover] = useState(false);
  const [showBookmarksPopover, setShowBookmarksPopover] = useState(false);
  const [showAddBookmarkDialog, setShowAddBookmarkDialog] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => video.bookmarks || []);
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);

  const activeSkipBookmark = useMemo(() => {
    return bookmarks.find(b => {
      if (!b.endTime || b.endTime <= b.time) return false;
      return currentTime >= b.time && currentTime < b.endTime;
    });
  }, [bookmarks, currentTime]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Elements & Audio Context
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const altAudioRef = useRef<HTMLAudioElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const customAudioInputRef = useRef<HTMLInputElement | null>(null);
  const customSubInputRef = useRef<HTMLInputElement | null>(null);
  const audioSubTimeoutRef = useRef<any>(null);

  const getLangLabel = (lang?: string, fallback: string = '') => {
    if (!lang) return fallback;
    const clean = lang.toLowerCase().trim();
    if (clean === 'eng' || clean === 'en') return 'ENG';
    if (clean === 'jpn' || clean === 'ja') return 'JAP';
    if (clean === 'chi' || clean === 'zho' || clean === 'zh') return 'CHN';
    return clean.toUpperCase();
  };

  // Auth modal state
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

  const [clockDate, setClockDate] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClockDate(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Scrubbing & Hover
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<string>('0:00');
  const [hoverPercent, setHoverPercent] = useState<number>(0);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 10));

  // Proxy URL Builder
  const getProxiedVideoUrl = useCallback((rawUrl: string): string => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/api/proxy-media')) return rawUrl;
    const creds = (video as any).auth || getSavedCredentials(rawUrl);
    let proxyUrl = `/api/proxy-media?url=${encodeURIComponent(rawUrl)}&sessionId=${sessionIdRef.current}`;
    if (video.duration) {
      proxyUrl += `&duration=${encodeURIComponent(video.duration.toString())}`;
    }
    if (creds?.username) {
      proxyUrl += `&user=${encodeURIComponent(creds.username)}`;
      if (creds.password) proxyUrl += `&pass=${encodeURIComponent(creds.password)}`;
    }
    return proxyUrl;
  }, [video]);

  // Toast trigger
  const triggerSwitchToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, toastDuration * 1000 + 1500);
  };

  const triggerVolumeToast = (vol: number, muted: boolean, boost: number = audioBoost) => {
    setVolumeToast({ volume: vol, boost, visible: true, isMuted: muted });
    setTimeout(() => {
      setVolumeToast(prev => ({ ...prev, visible: false }));
    }, 1200);
  };

  // Web Audio Context for Volume Boost (> 100%)
  const initAudioBoost = useCallback(() => {
    if (!videoRef.current || audioBoost <= 100) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtxClass();
        const gain = ctx.createGain();
        const source = ctx.createMediaElementSource(videoRef.current);
        source.connect(gain);
        gain.connect(ctx.destination);
        audioCtxRef.current = ctx;
        gainNodeRef.current = gain;
        sourceNodeRef.current = source;
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch (e) {
      // MediaElementSource already connected or cross-origin restriction
    }
  }, []);

  // Update volume & gain node
  const updateVolumeAndBoost = useCallback((vol: number, muted: boolean, boost: number) => {
    setVolume(vol);
    setIsMuted(muted);
    setAudioBoost(boost);

    if (saveVolume) {
      localStorage.setItem('valor_volume', vol.toString());
      localStorage.setItem('valor_muted', muted ? 'true' : 'false');
    }

    const boostMult = getAudioBoostMultiplier(boost);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = muted ? 0 : (boost > 100 ? 1.0 * boostMult : vol);
    }

    if (videoRef.current) {
      // If alternate audio is active, mute the video element's audio
      const hasAltAudio = activeAudioStreamIndex !== null && activeAudioStreamIndex !== (audioStreams[0]?.index ?? 0);
      videoRef.current.volume = muted ? 0 : (boost > 100 ? 1.0 : vol);
      videoRef.current.muted = hasAltAudio ? true : muted;
    }

    if (altAudioRef.current) {
      altAudioRef.current.volume = muted ? 0 : (boost > 100 ? 1.0 : vol);
      altAudioRef.current.muted = muted;
    }
  }, [saveVolume, activeAudioStreamIndex, audioStreams]);

  // Master Play / Pause
  const handlePlay = async () => {
    if (!videoRef.current) return;
    try {
      if (audioBoost > 100) {
        initAudioBoost();
      }
      await videoRef.current.play();
      if (altAudioRef.current && altAudioRef.current.paused) {
        altAudioRef.current.currentTime = videoRef.current.currentTime;
        await altAudioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
      setShowCenterPlayHint(false);
    } catch (err: any) {
      console.warn('[RemoteServerPlayer] Play interrupted or blocked:', err);
      setShowCenterPlayHint(true);
    }
  };

  const handlePause = () => {
    if (videoRef.current) videoRef.current.pause();
    if (altAudioRef.current) altAudioRef.current.pause();
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      handlePlay();
    } else {
      handlePause();
    }
  };

  // Instant native seek
  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(time, duration || Infinity));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    if (altAudioRef.current) {
      altAudioRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  // Handle Fullscreen
  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Handle Subtitle Selection (One-Shot WebVTT Load)
  const handleSelectEmbeddedSubtitle = async (streamIndex: number, codec: string, language?: string) => {
    const label = (language || `Track #${streamIndex}`).toUpperCase();
    setActiveSubStreamIndex(streamIndex);
    setSelectedSubTrack({
      id: `remote-sub-${streamIndex}`,
      name: `Subtitles (${label})`,
      url: '',
      isExtracted: true,
      language,
      streamIndex,
      format: 'vtt',
      cues: []
    });
    triggerSwitchToast(`Subtitles: ${label}`);

    const creds = (video as any).auth || getSavedCredentials(video.url);
    let vttUrl = `/api/remote/subtitle-packet?url=${encodeURIComponent(video.url)}&streamIndex=${streamIndex}`;
    if (creds?.username) {
      vttUrl += `&user=${encodeURIComponent(creds.username)}`;
      if (creds.password) vttUrl += `&pass=${encodeURIComponent(creds.password)}`;
    }

    try {
      const res = await fetch(vttUrl);
      if (res.ok) {
        const vttText = await res.text();
        const cues = parseSubtitles(vttText, 'subtitles.vtt');
        setSelectedSubTrack(prev => {
          if (prev && prev.streamIndex === streamIndex) {
            return { ...prev, url: vttUrl, cues };
          }
          return prev;
        });
        logger.player(`[RemoteServerPlayer] Loaded ${cues.length} subtitle cues for track ${streamIndex}`);
      }
    } catch (err) {
      logger.warn('[RemoteServerPlayer] Failed to load subtitle packet:', err);
    }
  };

  // Handle Audio Track Selection
  const handleSelectAudioTrack = async (streamIndex: number, codec: string, language?: string): Promise<void> => {
    const label = (language || `Track #${streamIndex}`).toUpperCase();
    setActiveAudioStreamIndex(streamIndex);
    setSelectedAudioTrack({
      id: `remote-aud-${streamIndex}`,
      name: `Audio (${label})`,
      url: '',
      isExtracted: true,
      language,
      streamIndex,
      codec
    });
    triggerSwitchToast(`Audio: ${label}`);

    const defaultAudio = audioStreams[0];
    const isDefaultTrack = !defaultAudio || streamIndex === defaultAudio.index;

    if (isDefaultTrack) {
      // Use native video element audio for 100% zero-latency sync
      if (videoRef.current) {
        videoRef.current.muted = isMuted;
      }
      if (altAudioRef.current) {
        altAudioRef.current.pause();
        altAudioRef.current.src = '';
      }
    } else {
      // Stream alternate audio track via backend audio stream
      if (videoRef.current) {
        videoRef.current.muted = true;
      }
      if (altAudioRef.current) {
        const creds = (video as any).auth || getSavedCredentials(video.url);
        let audioUrl = `/api/remote/audio-stream?url=${encodeURIComponent(video.url)}&streamIndex=${streamIndex}&sessionId=${sessionIdRef.current}`;
        if (creds?.username) {
          audioUrl += `&user=${encodeURIComponent(creds.username)}`;
          if (creds.password) audioUrl += `&pass=${encodeURIComponent(creds.password)}`;
        }
        altAudioRef.current.src = audioUrl;
        altAudioRef.current.currentTime = videoRef.current ? videoRef.current.currentTime : currentTime;
        if (isPlaying) {
          altAudioRef.current.play().catch(() => {});
        }
      }
    }
  };

  // Auto-Probing & Credentials Check
  const runRemoteProbe = useCallback(async (targetUrl: string, authOverride?: { username: string; password?: string }) => {
    if (!targetUrl) return;
    try {
      const creds = authOverride || (video as any).auth || getSavedCredentials(targetUrl);
      const res = await fetch('/api/remote/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          auth: creds ? { username: creds.username, password: creds.password } : undefined
        })
      });

      if (res.status === 401) {
        setAuthModalState({
          isOpen: true,
          initialUsername: creds?.username || '',
          errorMessage: 'Authentication required. Please enter username and password.',
          isLoading: false
        });
        return;
      }

      if (res.ok) {
        const probeData = await res.json();
        const allStreams: any[] = [];
        if (probeData.videoStreams) probeData.videoStreams.forEach((v: any) => allStreams.push({ ...v, type: 'video' }));
        if (probeData.audioStreams) probeData.audioStreams.forEach((a: any) => allStreams.push({ ...a, type: 'audio' }));
        if (probeData.subtitleStreams) probeData.subtitleStreams.forEach((s: any) => allStreams.push({ ...s, type: 'subtitle' }));

        if (probeData.duration && !duration) {
          setDuration(probeData.duration);
        }

        onUpdateVideo({
          ...video,
          streams: allStreams,
          duration: probeData.duration ? String(probeData.duration) : video.duration
        });

        // Auto-select first audio
        if (probeData.audioStreams && probeData.audioStreams.length > 0 && activeAudioStreamIndex === null) {
          const firstAudio = probeData.audioStreams[0];
          setActiveAudioStreamIndex(firstAudio.index);
        }

        // Auto-select subtitles if user has preferred language
        if (probeData.subtitleStreams && probeData.subtitleStreams.length > 0 && activeSubStreamIndex === null) {
          const engSub = probeData.subtitleStreams.find((s: any) => s.language?.toLowerCase() === 'eng' || s.language?.toLowerCase() === 'en');
          if (engSub) {
            handleSelectEmbeddedSubtitle(engSub.index, engSub.codec, engSub.language);
          }
        }
      }
    } catch (err) {
      console.warn('[RemoteServerPlayer] Probe error:', err);
    }
  }, [video, duration, onUpdateVideo, activeAudioStreamIndex, activeSubStreamIndex]);

  useEffect(() => {
    runRemoteProbe(video.url);
  }, [video.url]);

  // Video Time Update & Forward Buffer Monitoring
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);
    latestTimeRef.current = cur;

    // Track native forward buffered ranges
    const buf = videoRef.current.buffered;
    const ranges = [];
    for (let i = 0; i < buf.length; i++) {
      ranges.push({ start: buf.start(i), end: buf.end(i) });
    }
    setBufferedRanges(ranges);

    // Sync alternate audio if drifting > 80ms
    if (altAudioRef.current && !altAudioRef.current.paused) {
      const drift = Math.abs(altAudioRef.current.currentTime - cur);
      if (drift > 0.08) {
        altAudioRef.current.currentTime = cur;
      }
    }
  };

  // Keyboard navigation & controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (isLocked) {
        if (e.key.toLowerCase() === 'l') setIsLocked(false);
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          handleSeek(currentTime + (e.shiftKey ? 30 : 10));
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          handleSeek(currentTime - (e.shiftKey ? 30 : 10));
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateVolumeAndBoost(Math.min(1, volume + 0.05), false, audioBoost);
          triggerVolumeToast(Math.min(1, volume + 0.05), false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateVolumeAndBoost(Math.max(0, volume - 0.05), false, audioBoost);
          triggerVolumeToast(Math.max(0, volume - 0.05), false);
          break;
        case 'm':
          e.preventDefault();
          updateVolumeAndBoost(volume, !isMuted, audioBoost);
          triggerVolumeToast(volume, !isMuted);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            onBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, currentTime, volume, isMuted, audioBoost, duration]);

  // Auto-hide controls timer
  const resetControlsTimeout = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
      }
    }, uiHideTimeout * 1000);
  };

  // Auto-save history every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (latestTimeRef.current > 0) {
        onUpdateVideo({
          ...video,
          currentTime: latestTimeRef.current,
          duration: duration ? String(duration) : video.duration
        }, false);
        saveMediaTimestamp(video, latestTimeRef.current, duration, video.title);
      }
    }, historySaveInterval * 1000);
    return () => clearInterval(interval);
  }, [historySaveInterval, video, duration, onUpdateVideo]);

  // Format time helpers
  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      ref={playerContainerRef}
      className={`local-player-container ${isLocked ? 'is-locked' : ''}`}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
      style={{ background: '#000', width: '100%', height: '100%', position: 'relative', overflow: 'hidden', userSelect: 'none' }}
    >
      {/* 1. Main Video Element */}
      <video
        ref={videoRef}
        src={getProxiedVideoUrl(video.url)}
        className="main-video-element"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => { setIsBuffering(false); setIsPlaying(true); }}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (videoRef.current && videoRef.current.duration) {
            setDuration(videoRef.current.duration);
          }
          if (video.currentTime && videoRef.current) {
            videoRef.current.currentTime = video.currentTime;
          }
        }}
        onError={() => {
          setPlaybackError('Network error streaming media from server.');
        }}
      />

      {/* 2. Alternate Audio Stream Element (used only if non-default audio track is chosen) */}
      <audio ref={altAudioRef} style={{ display: 'none' }} />

      {/* 3. Subtitles Overlay */}
      {selectedSubTrack && (
        <SubtitleOverlay 
          cues={selectedSubTrack.cues} 
          currentTime={currentTime} 
          settings={subSettings} 
          controlsVisible={controlsVisible}
          menuVisible={showAudioSubMenu}
        />
      )}

      {/* 4. Buffering Indicator */}
      {isBuffering && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 1000 }}>
          <LoadingSpinner preset={spinnerPreset as any} customLoaderUrl={customLoaderUrl} customLoaderType={customLoaderType} />
        </div>
      )}

      
      {/* Center Play / Resume Button when autoplay blocked or paused on load */}
      {showCenterPlayHint && !isPlaying && (
        <div
          onClick={handlePlay}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 150,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(10px)',
            padding: '24px 36px',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            transition: 'transform 0.15s ease'
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.04)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)')}
        >
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)'
          }}>
            <Play size={32} color="#ffffff" style={{ marginLeft: '4px' }} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
            {currentTime > 5 ? `Resume at ${formatTime(currentTime)}` : 'Click to Play'}
          </span>
        </div>
      )}

      {/* 5. Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.9)', color: '#fff', padding: '8px 18px',
          borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.2)',
          fontSize: '14px', fontWeight: 600, zIndex: 3000, pointerEvents: 'none'
        }}>
          {toastMessage}
        </div>
      )}

      {/* 6. Volume Toast */}
      {volumeToast.visible && (
        <div style={{
          position: 'absolute', top: '70px', right: '30px',
          background: 'rgba(15, 23, 42, 0.9)', color: '#fff', padding: '10px 16px',
          borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.2)',
          display: 'flex', alignItems: 'center', gap: '8px', zIndex: 3000, pointerEvents: 'none'
        }}>
          {volumeToast.isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span style={{ fontSize: '14px', fontWeight: 700 }}>
            {volumeToast.isMuted ? 'MUTED' : `${Math.round(volumeToast.volume * 100)}%`}
          </span>
          {volumeToast.boost > 100 && (
            <span style={{ color: '#ec4899', fontSize: '12px', fontWeight: 800 }}>
              +{volumeToast.boost - 100}% BOOST
            </span>
          )}
        </div>
      )}

      {/* 7. Controls Overlays */}
      <div 
        className={`player-ui-wrapper ${controlsVisible ? 'visible' : 'hidden'}`}
        style={{
          position: 'absolute', inset: 0, pointerEvents: controlsVisible ? 'auto' : 'none',
          opacity: controlsVisible ? 1 : 0, transition: 'opacity 0.25s ease',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
        }}
      >
        {/* Top Header */}
        <div style={{
          padding: '24px 32px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              onClick={onBack}
              style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={20} />
            </button>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0 }}>
                {video.title || 'Remote Video'}
              </h2>
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                {profileName} • Remote Streaming
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {onSwitchMode && (
              <button
                onClick={() => {
                  if (videoRef.current) {
                    onUpdateVideo({
                      ...video,
                      currentTime: videoRef.current.currentTime,
                      duration: duration ? String(duration) : video.duration
                    }, false);
                  }
                  onSwitchMode('simple');
                }}
                style={{
                  background: 'rgba(6, 182, 212, 0.2)',
                  border: '1px solid rgba(6, 182, 212, 0.4)',
                  color: '#22d3ee',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(6, 182, 212, 0.35)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(6, 182, 212, 0.2)';
                  e.currentTarget.style.color = '#22d3ee';
                }}
                title="Switch to Simple HTML5 Player"
              >
                <Zap size={14} />
                Switch to Simple Media
              </button>
            )}
            <button
              onClick={() => setShowIdentifyModal(true)}
              style={{
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#93c5fd',
                padding: '7px 14px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.35)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                e.currentTarget.style.color = '#93c5fd';
              }}
              title="Search IMDB to fetch Intro & Outro skip markers"
            >
              <Search size={14} />
              Sync IntroDB
            </button>
            <OdometerClock date={clockDate} />
            <button 
              onClick={() => setIsLocked(prev => !prev)}
              style={{ background: 'rgba(255, 255, 255, 0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={isLocked ? "Unlock controls" : "Lock controls"}
            >
              {isLocked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>
        </div>

        {/* Center Play/Pause click receiver */}
        <div 
          style={{ flex: 1, cursor: 'pointer' }}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
        />

        {/* Bottom Playbar & Controls */}
        <div style={{
          padding: '24px 32px', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          {/* Progress Timeline / Scrubber */}
          <div 
            style={{ position: 'relative', width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '4px', cursor: 'pointer' }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              handleSeek(pos * duration);
            }}
          >
            {/* Native 120s Buffered Ranges */}
            {bufferedRanges.map((r, i) => {
              if (duration <= 0) return null;
              const leftPct = (r.start / duration) * 100;
              const widthPct = ((r.end - r.start) / duration) * 100;
              return (
                <div 
                  key={i} 
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${leftPct}%`, width: `${widthPct}%`,
                    background: 'rgba(255, 255, 255, 0.45)', borderRadius: '4px'
                  }} 
                />
              );
            })}

            {/* Playhead progress */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 0,
              width: `${progressPercent}%`, background: '#e50914', borderRadius: '4px'
            }} />
          </div>

          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <button 
                onClick={togglePlay}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button 
                onClick={() => handleSeek(currentTime - 10)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Rewind 10s"
              >
                <RotateCcw size={20} />
              </button>

              <button 
                onClick={() => handleSeek(currentTime + 10)}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Forward 10s"
              >
                <RotateCw size={20} />
              </button>

              {/* Volume Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  onClick={() => updateVolumeAndBoost(volume, !isMuted, audioBoost)}
                  style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => updateVolumeAndBoost(parseFloat(e.target.value), false, audioBoost)}
                  style={{ width: '80px', cursor: 'pointer' }}
                />
              </div>

              {/* Time display */}
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.8)' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              {/* Audio & Subtitles Popover Trigger */}
              <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => setShowAudioSubMenu(prev => !prev)}
                  style={{
                    background: (selectedSubTrack || showAudioSubMenu) ? 'rgba(229, 9, 20, 0.8)' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none', borderRadius: '6px', padding: '6px 12px', color: '#fff',
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <Sliders size={16} />
                  <span>Audio & Subtitles</span>
                </button>

                {showAudioSubMenu && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '12px', zIndex: 4000 }}>
                    <AudioSubPopover 
                      audioTracks={[]}
                      subtitleTracks={[]}
                      audioStreams={audioStreams as any}
                      subtitleStreams={subtitleStreams as any}
                      selectedAudioTrack={selectedAudioTrack}
                      selectedSubTrack={selectedSubTrack}
                      setSelectedAudioTrack={setSelectedAudioTrack}
                      setSelectedSubTrack={setSelectedSubTrack}
                      handleSelectEmbeddedAudio={handleSelectAudioTrack}
                      handleSelectEmbeddedSubtitle={handleSelectEmbeddedSubtitle}
                      customAudioInputRef={customAudioInputRef}
                      customSubInputRef={customSubInputRef}
                      currentTime={currentTime}
                      videoRef={videoRef}
                      setCurrentTime={handleSeek}
                      setShowAudioSubMenu={setShowAudioSubMenu}
                      audioSubTimeoutRef={audioSubTimeoutRef}
                      getLangLabel={getLangLabel}
                      formatTime={formatTime}
                      cleanSubtitleText={cleanSubtitleText}
                      setActiveAudioStreamIndex={setActiveAudioStreamIndex}
                      setActiveSubStreamIndex={setActiveSubStreamIndex}
                      audioBoost={audioBoost}
                      setAudioBoost={(boost) => updateVolumeAndBoost(volume, isMuted, boost)}
                      subSettings={subSettings}
                      onUpdateSubSettings={onUpdateSubSettings}
                    />
                  </div>
                )}
              </div>

              {/* Speed Popover Trigger */}
              <div style={{ position: 'relative' }}>
                <button 
                  onClick={() => setShowSpeedPopover(prev => !prev)}
                  style={{
                    background: playbackRate !== 1.0 ? 'rgba(229, 9, 20, 0.8)' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none', borderRadius: '6px', padding: '6px 10px', color: '#fff',
                    cursor: 'pointer', fontSize: '13px', fontWeight: 600
                  }}
                >
                  {playbackRate}x
                </button>
                {showSpeedPopover && (
                  <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '12px', zIndex: 4000 }}>
                    <SpeedPopover 
                      playbackRate={playbackRate}
                      setPlaybackRate={(r) => {
                        setPlaybackRate(r);
                        if (videoRef.current) videoRef.current.playbackRate = r;
                        if (altAudioRef.current) altAudioRef.current.playbackRate = r;
                        setShowSpeedPopover(false);
                      }}
                      videoRef={videoRef}
                      onClose={() => setShowSpeedPopover(false)}
                    />
                  </div>
                )}
              </div>

              {/* Fullscreen */}
              <button 
                onClick={toggleFullscreen}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                title="Fullscreen (F)"
              >
                <Maximize size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 8. Media Authentication Modal */}
      {authModalState.isOpen && (
        <MediaAuthModal 
          isOpen={authModalState.isOpen}
          url={video.url}
          initialUsername={authModalState.initialUsername}
          errorMessage={authModalState.errorMessage}
          isLoading={authModalState.isLoading}
          onCancel={() => setAuthModalState(prev => ({ ...prev, isOpen: false }))}
          onSubmit={async (creds: { username: string; password: string; remember: boolean }) => {
            setAuthModalState(prev => ({ ...prev, isLoading: true, errorMessage: null }));
            if (creds.remember) {
              saveCredentials(video.url, creds);
            } else {
              clearCredentials(video.url);
            }
            await runRemoteProbe(video.url, creds);
            setAuthModalState(prev => ({ ...prev, isOpen: false, isLoading: false }));
          }}
        />
      )}
      {/* Floating Skip Intro / Outro Button */}
      {activeSkipBookmark && (
        <button
          onClick={() => handleSeek(activeSkipBookmark.endTime!)}
          style={{
            position: 'absolute',
            bottom: '90px',
            right: '32px',
            zIndex: 3500,
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(10px)',
            color: '#ffffff',
            padding: '10px 20px',
            borderRadius: '30px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
          }}
        >
          <SkipForward size={16} color="#60a5fa" />
          Skip {activeSkipBookmark.label || 'Segment'}
        </button>
      )}

      {/* 9. Media Identify & TheIntroDB Modal */}
      {showIdentifyModal && (
        <MediaIdentifyModal
          isOpen={showIdentifyModal}
          videoTitle={video.title || ''}
          duration={duration}
          onClose={() => setShowIdentifyModal(false)}
          onApplyBookmarks={(newBms, mediaInfo) => {
            setBookmarks(prev => {
              const existingIds = new Set(prev.map(b => b.id));
              const filteredNew = newBms.filter(b => !existingIds.has(b.id));
              const updated = [...prev, ...filteredNew];
              onUpdateVideo({
                ...video,
                title: mediaInfo.title || video.title,
                tmdbId: mediaInfo.tmdbId,
                bookmarks: updated
              }, false);
              return updated;
            });
          }}
          onToast={msg => triggerSwitchToast(msg)}
        />
      )}
    </div>
  );
};