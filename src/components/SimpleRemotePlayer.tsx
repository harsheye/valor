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
import { LoadingSpinner } from './LoadingSpinner';
import {
  PlayerTopBar,
  PlayerBottomBar,
  PauseDetailsOverlay,
  SkipIntroButton
} from './player';
import type { MediaDetails } from './player/PauseDetailsOverlay';
import { getSavedCredentials, saveCredentials, clearCredentials } from '../services/remote/mediaAuthStore';
import { saveMediaTimestamp } from '../utils/mediaTimestampStorage';
import { parseSubtitles, cleanSubtitleText } from '../utils/subtitleParser';
import { trimSubtitleName } from '../utils/embedSubtitleStorage';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { Play, Pause } from 'lucide-react';

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
}

export const SimpleRemotePlayer: React.FC<SimpleRemotePlayerProps> = ({
  video,
  onBack,
  onUpdateVideo,
  subSettings: propSubSettings,
  onUpdateSubSettings: propOnUpdateSubSettings,
  saveVolume = true,
  historySaveInterval = 5,
  uiHideTimeout = 2.5,
  customLoaderUrl,
  customLoaderType = 'default',
  spinnerPreset = 'fire-circle',
  onSwitchMode
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const customSubInputRef = useRef<HTMLInputElement | null>(null);
  const customAudioInputRef = useRef<HTMLInputElement | null>(null);

  // Playback & Timing State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
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

  // Proxied Video URL (bypasses CORS & provides sliding cache)
  const getProxiedUrl = useCallback((rawUrl: string): string => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/api/proxy-media')) return rawUrl;
    const creds = (video as any).auth || getSavedCredentials(rawUrl);
    let proxyUrl = `/api/proxy-media?url=${encodeURIComponent(rawUrl)}&sessionId=${sessionIdRef.current}`;
    if (duration > 0) {
      proxyUrl += `&duration=${duration}`;
    }
    if (creds?.username) {
      proxyUrl += `&user=${encodeURIComponent(creds.username)}`;
      if (creds?.password) proxyUrl += `&pass=${encodeURIComponent(creds.password)}`;
    }
    return proxyUrl;
  }, [video, duration]);

  // Controls auto-hide timer
  const controlsTimeoutRef = useRef<any>(null);
  const resetControlsTimeout = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !isLocked && !showAudioSubMenu && !showBookmarksPopover && !showBookmarkModal) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, uiHideTimeout * 1000);
    }
  }, [isPlaying, isLocked, showAudioSubMenu, showBookmarksPopover, showBookmarkModal, uiHideTimeout]);

  // Handle Pause Screen Timer (Show after 10s of continuous pause)
  useEffect(() => {
    if (!isPlaying) {
      setShowPauseMetadataOverlay(false);
      pauseOverlayTimerRef.current = setTimeout(() => {
        setShowPauseMetadataOverlay(true);
        setControlsVisible(false);
      }, 10000);
    } else {
      if (pauseOverlayTimerRef.current) clearTimeout(pauseOverlayTimerRef.current);
      setShowPauseMetadataOverlay(false);
      resetControlsTimeout();
    }
    return () => {
      if (pauseOverlayTimerRef.current) clearTimeout(pauseOverlayTimerRef.current);
    };
  }, [isPlaying, resetControlsTimeout]);

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
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    resetControlsTimeout();
  }, [duration, resetControlsTimeout]);

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
  }, [saveVolume]);

  const toggleMute = useCallback(() => {
    updateVolume(volume, !isMuted);
  }, [volume, isMuted, updateVolume]);

  // Speed
  const handleSpeedChange = useCallback((speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackRate(speed);
    triggerToast(`Speed: ${speed}x`);
  }, [triggerToast]);

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
        cursor: controlsVisible ? 'default' : 'none',
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
        src={getProxiedUrl(video.url)}
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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => {
          setIsBuffering(false);
          // Check for 401 auth required
          fetch(getProxiedUrl(video.url), { method: 'HEAD' }).then(res => {
            if (res.status === 401) {
              setAuthModalState({
                isOpen: true,
                initialUsername: '',
                errorMessage: null,
                isLoading: false
              });
            } else {
              triggerToast("Playback error occurred.");
            }
          }).catch(() => triggerToast("Network or stream error."));
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

      {/* Buffering Indicator */}
      {isBuffering && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 60 }}>
          <LoadingSpinner customLoaderUrl={customLoaderUrl} customLoaderType={customLoaderType} preset={spinnerPreset as any} />
        </div>
      )}

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
        visible={showPauseMetadataOverlay && !isPlaying}
        mediaDetails={mediaDetails}
        videoTitle={video.title}
        duration={duration}
      />

      {/* Floating Skip Intro / Outro Button */}
      <SkipIntroButton
        bookmark={activeSkipBookmark || null}
        onSkip={handleSeek}
      />

      {/* Top Header Overlay Bar */}
      {controlsVisible && !isLocked && (
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
        />
      )}

      {/* Bottom Controls Bar */}
      {controlsVisible && !isLocked && (
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
            auth: creds
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

      {/* Toast Notification Notification Pill */}
      {toastMsg && (
        <div style={{
          position: 'absolute',
          top: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--card-bg, rgba(18, 18, 28, 0.95))',
          color: 'var(--text-primary, #ffffff)',
          padding: '8px 20px',
          borderRadius: '30px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.18))',
          boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.6))',
          fontSize: '13px',
          fontWeight: 600,
          zIndex: 4000,
          pointerEvents: 'none',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
};
