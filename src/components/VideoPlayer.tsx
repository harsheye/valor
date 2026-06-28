import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, RotateCcw, RotateCw, Cast, X, 
  MessageSquare, Maximize, Minimize, Loader, MonitorPlay,
  Volume2, Volume1, VolumeX, AlertCircle, Lock
} from 'lucide-react';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack } from '../types/media';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from './SubtitleOverlay';
import { AudioSubPopover } from './AudioSubPopover';
import { AudioSyncEngine } from '../utils/audioSync';
import { parseSubtitles, cleanSubtitleText } from '../utils/subtitleParser';
import { parseMkv, parseMp4, extractMkvSubtitles } from '../utils/containerParser';
import { ffmpegService } from '../services/ffmpeg';
import { HttpByteSource, CachedByteSource, FileByteSource } from '../utils/remoteByteSource';
import { logger } from '../utils/logger';

interface VideoPlayerProps {
  video: VideoItem;
  onBack: () => void;
  onUpdateVideo: (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting?: boolean) => void;
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
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  video, 
  onBack, 
  onUpdateVideo, 
  hideUIOverlays = false,
  hideVideoName = false,
  toastDuration = 0.5,
  disableAnimations = false,
  pauseOnFocusChange = false,
  showPlayButton = true,
  showTimeDisplay = true,
  showPlayBar = true,
  showVolumeControl = true,
  showFullscreen = true,
  subSettings,
  onUpdateSubSettings,
  historySaveInterval = 5,
  saveVolume = true,
  ratingThreshold = 3
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const totalTimeWatchedRef = useRef<number>((video as any).totalTimeWatched || 0);
  const sessionStartRef = useRef<number | null>(null);
  const mountTimeRef = useRef<number>(Date.now());
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [userRating, setUserRating] = useState<number | null>((video as any).rating || null);
  const ratingPromptedRef = useRef<boolean>(!!(video as any).rating);

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

  const [volumeToast, setVolumeToast] = useState<{ volume: number; visible: boolean; isMuted: boolean }>({ volume: 1, visible: false, isMuted: false });
  const volumeToastTimeoutRef = useRef<any>(null);

  const triggerVolumeToast = (vol: number, muted: boolean) => {
    if (volumeToastTimeoutRef.current) clearTimeout(volumeToastTimeoutRef.current);
    setVolumeToast({ volume: vol, visible: true, isMuted: muted });
    volumeToastTimeoutRef.current = setTimeout(() => {
      setVolumeToast(prev => ({ ...prev, visible: false }));
    }, 1500);
  };
  const [showControls, setShowControls] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [systemTime, setSystemTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setSystemTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tracks Selection State
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<CustomAudioTrack | null>(null);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(null);
  const [extractingStreamIndex, setExtractingStreamIndex] = useState<number | null>(null);
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);
  const [isKeyInitiated, setIsKeyInitiated] = useState(false);
  const [activeAudioStartOffset, setActiveAudioStartOffset] = useState(0);
  const [activeSubtitleStartOffset, setActiveSubtitleStartOffset] = useState(0);
  const [activeAudioStreamIndex, setActiveAudioStreamIndex] = useState<number | null>(null);
  const [activeSubStreamIndex, setActiveSubStreamIndex] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);



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
  const containerRef = useRef<HTMLDivElement>(null);
  const syncEngineRef = useRef<AudioSyncEngine | null>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const audioSubTimeoutRef = useRef<any>(null);
  const customAudioInputRef = useRef<HTMLInputElement>(null);
  const customSubInputRef = useRef<HTMLInputElement>(null);

  const cachedSourceRef = useRef<CachedByteSource | null>(null);
  const audioAbortControllerRef = useRef<AbortController | null>(null);
  const subAbortControllerRef = useRef<AbortController | null>(null);
  const currentAudioOptionIndexRef = useRef<number>(-1);
  const currentSubOptionIndexRef = useRef<number>(-1);
  const lastHeartbeatTimeRef = useRef<number>(0);
  const audioDebounceTimeoutRef = useRef<any>(null);
  const subDebounceTimeoutRef = useRef<any>(null);
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    hasAutoSelectedRef.current = false;
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
      const byteSource = video.file
        ? new FileByteSource(video.file)
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
  }, [video.url, video.isRemote, video.file, video.type]);

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
      const subDuration = isMkv ? (isRemote ? 300 : 600) : (isRemote ? 60 : 300);

      if (activeAudioStreamIndex !== null && selectedAudioTrack && selectedAudioTrack.streamIndex === activeAudioStreamIndex && selectedAudioTrack.url) {
        if (currentTime - activeAudioStartOffset > audioDuration - 5) {
          logger.player(`Playback crossed audio chunk boundary. Loading next chunk at ${currentTime}s.`);
          const activeStream = audioStreams.find(s => s.index === activeAudioStreamIndex);
          loadAudioChunk(currentTime, activeAudioStreamIndex, activeStream?.codec || 'mp3');
        }
      }

      if (activeSubStreamIndex !== null && (isRemote || isMkv) && selectedSubTrack && selectedSubTrack.streamIndex === activeSubStreamIndex && (selectedSubTrack.url || selectedSubTrack.cues.length > 0)) {
        if (currentTime - activeSubtitleStartOffset > subDuration - 10) {
          logger.player(`Playback crossed subtitle chunk boundary. Loading next subtitles at ${currentTime}s.`);
          loadSubtitleChunk(currentTime, activeSubStreamIndex);
        }
      }
    }
  }, [currentTime, isPlaying, activeAudioStreamIndex, activeSubStreamIndex, video.seekMap, activeAudioStartOffset, activeSubtitleStartOffset, video.isRemote, video.containerType, video.format, selectedAudioTrack, selectedSubTrack]);

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
  const probingVideoIdRef = useRef<string | null>(null);

  // Safeguarded arrays
  const audioTracks = video.audioTracks || [];
  const subtitleTracks = video.subtitleTracks || [];
  const streams = video.streams || [];
  const audioStreams = streams.filter(s => s.type === 'audio');
  const subtitleStreams = streams.filter(s => 
    s.type === 'subtitle' && 
    !/dvd_subtitle|dvdsub|pgs|hdmv_pgs|xsub/i.test(s.codec || '')
  );

  // Clear hover timeouts and reset FFmpeg on unmount or when changing videos
  useEffect(() => {
    return () => {
      if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
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

  // Synchronize Audio Engine
  useEffect(() => {
    if (selectedAudioTrack && selectedAudioTrack.url && videoRef.current && audioRef.current) {
      logger.player(`Initializing sync engine for track: ${selectedAudioTrack.name} with offset: ${activeAudioStartOffset}`);
      const engine = new AudioSyncEngine(videoRef.current, audioRef.current, activeAudioStartOffset);
      syncEngineRef.current = engine;

      // Sync initial volume
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;

      return () => {
        engine.destroy();
        syncEngineRef.current = null;
      };
    } else {
      if (videoRef.current) {
        videoRef.current.muted = isMuted;
        videoRef.current.volume = volume;
      }
    }
  }, [selectedAudioTrack, activeAudioStartOffset]);

  useEffect(() => {
    if (saveVolume) {
      localStorage.setItem('valor_volume', volume.toString());
    } else {
      localStorage.removeItem('valor_volume');
    }
    if (videoRef.current) {
      videoRef.current.volume = (selectedAudioTrack && selectedAudioTrack.url) ? 0 : volume;
    }
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, saveVolume, selectedAudioTrack]);

  useEffect(() => {
    if (saveVolume) {
      localStorage.setItem('valor_muted', isMuted ? 'true' : 'false');
    } else {
      localStorage.removeItem('valor_muted');
    }
    if (videoRef.current) {
      videoRef.current.muted = (selectedAudioTrack && selectedAudioTrack.url) ? true : isMuted;
    }
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted, saveVolume, selectedAudioTrack]);

  // RequestAnimationFrame tick loop for micro-fine time updates (essential for subtitles)
  useEffect(() => {
    let frameId: number;

    const tick = () => {
      if (videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);

        // Heartbeat ping to prevent auto-shutdown when browser throttles background timers
        const now = Date.now();
        if (now - lastHeartbeatTimeRef.current > 4000) {
          lastHeartbeatTimeRef.current = now;
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
      if (isPlaying && !showAudioSubMenu) {
        setShowControls(false);
      }
    }, 3000);
  };

  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, showAudioSubMenu]);

  // Helper to resolve byte range for a target time duration using the seekMap (or linear interpolation fallback)
  const getByteRangeForTimeRange = (time: number, targetDuration: number): { startOffset: number; endOffset: number; offsetTime: number } => {
    const seekMap = video.seekMap || [];
    if (seekMap.length === 0) {
      // Linear interpolation fallback if no seekMap is available
      const totalDurSeconds = duration || 1;
      const fileSize = video.file ? video.file.size : 100 * 1024 * 1024; // default to 100MB if remote URL and size unknown
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
  const loadAudioChunk = async (time: number, streamIndex: number, codec: string) => {
    // Seek optimization: abort any active remote fetches
    if (audioAbortControllerRef.current) {
      audioAbortControllerRef.current.abort();
    }
    audioAbortControllerRef.current = new AbortController();
    const signal = audioAbortControllerRef.current.signal;

    setExtractingStreamIndex(streamIndex);

    try {
      if (!ffmpegService.isReady()) {
        await ffmpegService.load(video.id);
      }

      let audioUrl = '';
      let offsetTime = time;

      const cachedSource = cachedSourceRef.current || (
        video.file
          ? new CachedByteSource(new FileByteSource(video.file), 4 * 1024 * 1024, 16)
          : new CachedByteSource(new HttpByteSource(video.url), 4 * 1024 * 1024, 16)
      );

      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const segIdx = segments.findIndex((s: any) => s.startTime <= time && time < s.startTime + s.duration);
        const segment = segIdx !== -1 ? segments[segIdx] : segments[0];
        
        if (segment) {
          offsetTime = segment.startTime;
          logger.remote(`HLS segment time: ${offsetTime}, url: ${segment.uri}`);
          
          setActiveAudioStartOffset(offsetTime);
          if (syncEngineRef.current) {
            syncEngineRef.current.setSyncEnabled(false);
          }

          const result = await ffmpegService.extractHlsAudioSegment(video.id, segment.uri, {
            index: streamIndex,
            codec: codec || 'aac'
          }, signal);
          audioUrl = result.url;
        }
      } else if (!video.isRemote && video.file) {
        // LOCAL FILE FLOW: Extract chunk directly from mounted file
        const audioDuration = 30;
        offsetTime = Math.max(0, time - 5);
        logger.player(`Local file seek/load audio chunk starting at ${offsetTime}s`);
        
        setActiveAudioStartOffset(offsetTime);
        if (syncEngineRef.current) {
          syncEngineRef.current.setSyncEnabled(false);
        }

        const result = await ffmpegService.extractLocalAudioSegment(
          video.id,
          video.file,
          offsetTime,
          audioDuration,
          { index: streamIndex, codec },
          signal
        );
        audioUrl = result.url;
      } else {
        const isRemote = video.isRemote;
        const audioDuration = isRemote ? 30 : 120;
        const { startOffset, endOffset, offsetTime: resolvedOffsetTime } = getByteRangeForTimeRange(time, audioDuration);
        offsetTime = resolvedOffsetTime;

        logger.remote(`Range: ${startOffset}-${endOffset}, time: ${offsetTime}`);
        
        setActiveAudioStartOffset(offsetTime);
        if (syncEngineRef.current) {
          syncEngineRef.current.setSyncEnabled(false);
        }

        const result = await ffmpegService.extractRemoteAudioSegment(
          video.id,
          cachedSource,
          startOffset,
          endOffset,
          { index: streamIndex, codec },
          signal
        );
        audioUrl = result.url;
      }

      if (audioUrl) {
        const newTrack: CustomAudioTrack = {
          id: `remote-aud-${streamIndex}-${offsetTime}`,
          name: `Remote Audio (${offsetTime.toFixed(0)}s)`,
          url: audioUrl,
          isExtracted: true,
          streamIndex,
          codec: 'mp3'
        };
        setSelectedAudioTrack(newTrack);
        if (syncEngineRef.current) {
          syncEngineRef.current.setAudioStartOffset(offsetTime);
          syncEngineRef.current.setSyncEnabled(true);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.remote('Load aborted');
        return;
      }
      logger.error('Failed to extract remote audio segment:', err);
    } finally {
      setExtractingStreamIndex(null);
      setIsKeyInitiated(false);
    }
  };

  const loadSubtitleChunk = async (time: number, streamIndex: number) => {
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
        video.file
          ? new CachedByteSource(new FileByteSource(video.file), 4 * 1024 * 1024, 16)
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
        const subStreamIdx = subtitleStreams.findIndex(s => s.index === streamIndex);
        const targetTrack = mkvSubTracks[subStreamIdx !== -1 ? subStreamIdx : 0];
        
        if (targetTrack) {
          const trackNumber = targetTrack.number;
          const scale = mkvInfo.timecodeScale || 1000000;
          
          const isRemote = video.isRemote;
          const subDuration = isRemote ? 300 : 600; // 5 mins / 10 mins
          const sMap = mkvInfo.seekMap || [];

          offsetTime = time;
          setActiveSubtitleStartOffset(offsetTime);

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
            signal
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

      if (!ffmpegService.isReady()) {
        await ffmpegService.load(video.id);
      }

      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const segIdx = segments.findIndex((s: any) => s.startTime <= time && time < s.startTime + s.duration);
        const segment = segIdx !== -1 ? segments[segIdx] : segments[0];
        
        if (segment) {
          offsetTime = segment.startTime;
          setActiveSubtitleStartOffset(offsetTime);
          const res = await fetch(segment.uri);
          const text = await res.text();
          cues = parseSubtitles(text, 'segment.vtt');
          format = 'vtt';
        }
      } else if (!video.isRemote && video.file) {
        // LOCAL FILE FLOW: Extract full subtitle track at once
        const subStream = subtitleStreams.find(s => s.index === streamIndex);
        const codec = subStream?.codec || 'srt';
        logger.player(`Local file: extracting entire subtitle track index ${streamIndex} (${codec})`);
        
        offsetTime = 0; // complete track loaded from 0s
        setActiveSubtitleStartOffset(offsetTime);

        const subtitleText = await ffmpegService.extractLocalSubtitleTrack(
          video.id,
          video.file,
          { index: streamIndex, codec }
        );
        const isAss = /ass|ssa/i.test(codec);
        const isVtt = /webvtt/i.test(codec);
        const formatExt = isAss ? 'ass' : (isVtt ? 'vtt' : 'srt');
        
        cues = parseSubtitles(subtitleText, `subtitles.${formatExt}`);
        format = formatExt === 'vtt' ? 'vtt' : (formatExt === 'ass' ? 'ass' : 'srt');
      } else {
        const isRemote = video.isRemote;
        const subDuration = isRemote ? 60 : 300;
        const { startOffset, endOffset, offsetTime: resolvedOffsetTime } = getByteRangeForTimeRange(time, subDuration);
        offsetTime = resolvedOffsetTime;

        setActiveSubtitleStartOffset(offsetTime);

        const subStream = subtitleStreams.find(s => s.index === streamIndex);
        const codec = subStream?.codec || 'srt';
        
        const subtitleText = await ffmpegService.extractRemoteSubtitleSegment(
          video.id,
          cachedSource,
          startOffset,
          endOffset,
          { index: streamIndex, codec },
          signal
        );
        
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
    } finally {
      setExtractingStreamIndex(null);
      setIsKeyInitiated(false);
    }
  };

  const handleVideoError = () => {
    if (!videoRef.current) return;
    const err = videoRef.current.error;
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

    // Immediately save seeked position to parent state so seek states don't drift or restore old positions
    onUpdateVideo({
      ...video,
      currentTime: newTime
    });

    // Chunk-based dynamic loading on seek
    if (activeAudioStreamIndex !== null && !audioDebounceTimeoutRef.current) {
      let needLoad = false;
      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const oldSegIdx = segments.findIndex((s: any) => s.startTime <= activeAudioStartOffset && activeAudioStartOffset < s.startTime + s.duration);
        const newSegIdx = segments.findIndex((s: any) => s.startTime <= newTime && newTime < s.startTime + s.duration);
        if (oldSegIdx !== newSegIdx) {
          needLoad = true;
        }
      } else {
        const isRemote = video.isRemote;
        const audioDuration = isRemote ? 30 : 120;
        if (newTime < activeAudioStartOffset || newTime > activeAudioStartOffset + audioDuration - 2) {
          needLoad = true;
        }
      }

      if (needLoad) {
        logger.player(`Seek detected to ${newTime}s outside current chunk range. Fetching new audio chunk.`);
        const activeStream = audioStreams.find(s => s.index === activeAudioStreamIndex);
        await loadAudioChunk(newTime, activeAudioStreamIndex, activeStream?.codec || 'mp3');
      }
    }

    if (activeSubStreamIndex !== null && video.isRemote && !subDebounceTimeoutRef.current) {
      let needLoad = false;
      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const oldSegIdx = segments.findIndex((s: any) => s.startTime <= activeSubtitleStartOffset && activeSubtitleStartOffset < s.startTime + s.duration);
        const newSegIdx = segments.findIndex((s: any) => s.startTime <= newTime && newTime < s.startTime + s.duration);
        if (oldSegIdx !== newSegIdx) {
          needLoad = true;
        }
      } else {
        const isRemote = video.isRemote;
        const subDuration = isRemote ? 60 : 300;
        if (newTime < activeSubtitleStartOffset || newTime > activeSubtitleStartOffset + subDuration - 5) {
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
      await loadAudioChunk(currentTime, streamIndex, codec);
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
    if (videoRef.current) {
      onUpdateVideo({
        ...video,
        currentTime: videoRef.current.currentTime
      }, true);
    }
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
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
    resetControlsTimeout();
  };

  const handleRewind = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
    setCurrentTime(videoRef.current.currentTime);
    resetControlsTimeout();
  };

  const handleForward = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
    setCurrentTime(videoRef.current.currentTime);
    resetControlsTimeout();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const seekTime = parseFloat(e.target.value);
    videoRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
    resetControlsTimeout();
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = seekTime;
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
    const list: any[] = [{ type: 'original', name: 'Original', track: null }];
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
    if (track === null) {
      setActiveAudioStreamIndex(null);
      syncAudioRef(null, null);
    } else if (track.streamIndex !== undefined) {
      setActiveAudioStreamIndex(track.streamIndex);
      syncAudioRef(null, track.streamIndex);
    } else {
      setActiveAudioStreamIndex(null);
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
          await loadAudioChunk(videoRef.current ? videoRef.current.currentTime : currentTime, nextOpt.streamIndex, nextOpt.codec);
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
    // Ignore key events if the user is typing in a text field
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
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
      lockControls: 'w'
    };
    const parsed = saved ? JSON.parse(saved) : {};
    const keybinds = {
      ...defaultKeybinds,
      ...(parsed.keybinds || {})
    };

    const pressedKey = e.key.toLowerCase();
    const lockControlsKey = (keybinds.lockControls || 'w').toLowerCase();
    
    if (pressedKey === lockControlsKey) {
      e.preventDefault();
      setIsLocked(prev => {
        const next = !prev;
        triggerSwitchToast(next ? `Controls Locked (${lockControlsKey.toUpperCase()})` : `Controls Unlocked (${lockControlsKey.toUpperCase()})`);
        return next;
      });
      return;
    }

    if (isLocked) {
      e.preventDefault();
      return;
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
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        triggerHudFlash('rewind');
      }
    } else if (pressedKey === forwardKey) {
      e.preventDefault();
      if (videoRef.current) {
        videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10);
        triggerHudFlash('forward');
      }
    } else if (pressedKey === nextSubKey) {
      e.preventDefault();
      cycleSubtitles();
    } else if (pressedKey === nextAudioKey) {
      e.preventDefault();
      cycleAudio();
    } else if (pressedKey === 'arrowup') {
      e.preventDefault();
      setIsMuted(false);
      setVolume(prev => {
        const nextVol = Math.min(1.0, prev + 0.05);
        triggerVolumeToast(nextVol, false);
        return nextVol;
      });
    } else if (pressedKey === 'arrowdown') {
      e.preventDefault();
      setIsMuted(false);
      setVolume(prev => {
        const nextVol = Math.max(0.0, prev - 0.05);
        triggerVolumeToast(nextVol, false);
        return nextVol;
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleKeyDownRef.current?.(e);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Reset seek state when video url changes
  useEffect(() => {
    hasSeekedRef.current = false;
  }, [video.url]);

  // Autoplay (autostart) on load
  useEffect(() => {
    if (videoRef.current) {
      // Seek / resume is handled strictly and reliably in onLoadedMetadata.
      // We only run autoplay playback trigger here.
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => logger.player('Autoplay blocked:', err));
    }
  }, [video.url]);

  // Pause on Window Blur or Tab switch if enabled (Fullscreen only)
  useEffect(() => {
    if (!pauseOnFocusChange) return;

    const handleFocusLoss = () => {
      const isCurrentFullscreen = !!document.fullscreenElement || isFullscreen;
      if (!isCurrentFullscreen) return;
      if (videoRef.current && !videoRef.current.paused) {
        logger.player('Focus lost, pausing video playback');
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleVisibilityChange = () => {
      const isCurrentFullscreen = !!document.fullscreenElement || isFullscreen;
      if (!isCurrentFullscreen) return;
      if (document.visibilityState === 'hidden' && videoRef.current && !videoRef.current.paused) {
        logger.player('Tab hidden, pausing video playback');
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener('blur', handleFocusLoss);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleFocusLoss);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pauseOnFocusChange, isFullscreen]);

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
      if (!timeToFinish && currentDuration > 0 && videoRef.current && (videoRef.current.currentTime / currentDuration) >= 0.95) {
        const firstPlay = (video as any).firstPlayTimestamp || mountTimeRef.current;
        timeToFinish = (exitTime - firstPlay) / 1000;
      }

      onUpdateVideoRef.current((prev: any) => ({
        ...prev,
        currentTime: videoRef.current ? videoRef.current.currentTime : prev.currentTime,
        totalTimeWatched: Math.round(totalTimeWatchedRef.current),
        sessions: updatedSessions,
        timeToFinish: timeToFinish ? Math.round(timeToFinish) : prev.timeToFinish,
        firstPlayTimestamp: prev.firstPlayTimestamp || mountTimeRef.current
      }), true);
    };
  }, []);

  // Periodically save current playback position to parent state
  useEffect(() => {
    const intervalMs = (historySaveInterval || 5) * 1000;
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
        if (!timeToFinish && currentDuration > 0 && (videoRef.current.currentTime / currentDuration) >= 0.95) {
          const firstPlay = (video as any).firstPlayTimestamp || mountTimeRef.current;
          timeToFinish = (exitTime - firstPlay) / 1000;
        }

        onUpdateVideoRef.current((prev: any) => ({
          ...prev,
          currentTime: videoRef.current ? videoRef.current.currentTime : prev.currentTime,
          totalTimeWatched: Math.round(totalTimeWatchedRef.current),
          sessions: updatedSessions,
          timeToFinish: timeToFinish ? Math.round(timeToFinish) : prev.timeToFinish,
          firstPlayTimestamp: prev.firstPlayTimestamp || mountTimeRef.current
        }));
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

        // Auto-select audio stream
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

        // Fallback: If no audio track is selected, but the first audio stream is not browser-native (e.g. ac3, eac3, dts, truehd), we must select and transcode it!
        if (!selectedAudioTrack && audioStreams.length > 0) {
          const firstAudio = audioStreams[0];
          const isNative = /aac|mp3|mpeg|opus|flac|vorbis/i.test(firstAudio.codec);
          if (!isNative) {
            logger.player(`Primary audio track has non-native codec (${firstAudio.codec}). Auto-selecting it for transcoding.`);
            handleSelectEmbeddedAudio(firstAudio.index, firstAudio.codec, firstAudio.language);
          }
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



  const controlsVisible = showControls && !isLocked;

  return (
    <div 
      ref={containerRef} 
      className={`player-container ${controlsVisible && !hideUIOverlays ? 'show-cursor' : 'hide-cursor'} ${hideUIOverlays ? 'keyboard-only' : ''} ${disableAnimations ? 'no-animations' : ''}`}
      onMouseMove={() => {
        if (!isLocked) handleMouseMove();
      }}
    >
      {/* Actual HTML5 Video Element */}
      <video
        ref={videoRef}
        src={video.url}
        controls={false}
        crossOrigin={video.playbackMode === 'advanced' ? 'anonymous' : undefined}
        className="main-video-element"
        onLoadedMetadata={() => {
          if (videoRef.current) {
            const videoDuration = videoRef.current.duration;
            setDuration(videoDuration);
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
          if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onSeeked={handleVideoSeeked}
        onSeeking={() => setIsBuffering(true)}
        onError={handleVideoError}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        playsInline
      />

      {/* Hidden Secondary Audio Tag for sync tracks */}
      {selectedAudioTrack && (
        <audio 
          ref={audioRef} 
          src={selectedAudioTrack.url}
          style={{ display: 'none' }}
        />
      )}

      {/* Subtitles Overlay */}
      {selectedSubTrack && (
        <SubtitleOverlay 
          cues={selectedSubTrack.cues} 
          currentTime={currentTime} 
          settings={subSettings} 
          controlsVisible={controlsVisible}
        />
      )}

      {/* Lock Indicator Button */}
      {isLocked && (
        <button 
          className="player-lock-indicator"
          onClick={(e) => {
            e.stopPropagation();
            setIsLocked(false);
            triggerSwitchToast(`Controls Unlocked (${getLockShortcutKey()})`);
          }}
          title={`Unlock Controls (Shortcut: ${getLockShortcutKey()})`}
        >
          <Lock size={20} />
        </button>
      )}

      {/* Buffering ring loader */}
      {isBuffering && (
        <div className="buffering-spinner-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="netflix-buffer-ring"></div>
        </div>
      )}

      {/* Top Header Overlay */}
      {!hideUIOverlays && (
        <div 
          className={`player-overlay top-overlay-clean ${controlsVisible ? 'visible' : 'hidden'}`} 
          onClick={(e) => e.stopPropagation()}
        >
          {/* Chromecast trigger (acting as native browser cast prompt) */}
          <button className="cast-btn" onClick={handleCast} title="Chromecast">
            <Cast size={24} />
          </button>
          
          {/* Centered video title & Playback mode badge */}
          {(!hideVideoName || video.isRemote) && (
            <div className="top-title-container">
              {!hideVideoName && video.playbackMode !== 'native' && (
                <h2 className="top-title-clean" style={{ marginBottom: '0.2rem' }}>{video.title}</h2>
              )}
              <div style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.9)',
                fontFamily: 'monospace',
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '2px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.06)',
                marginTop: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {(() => {
                  const timeStr = systemTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const parts = timeStr.split(':');
                  const hour = parts[0];
                  const minuteAndSuffix = parts.slice(1).join(':');
                  return (
                    <span>
                      <span style={{ color: '#e50914' }}>{hour}</span>
                      <span style={{ color: '#ffffff' }}>:{minuteAndSuffix}</span>
                    </span>
                  );
                })()}
              </div>
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
      {!hideUIOverlays && showPlayButton && (
        <div 
          className={`center-controls-hud ${controlsVisible ? 'visible' : 'hidden'}`} 
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
          <button className="hud-btn-clean" onClick={(e) => { e.stopPropagation(); handleRewind(); }} title="Rewind 10s">
            <div className="seek-hud-container">
              <RotateCcw size={64} strokeWidth={1.2} />
              <span className="seek-hud-text">10</span>
            </div>
          </button>
          
          <button className="hud-btn-clean play-pause-hud-clean" onClick={(e) => { e.stopPropagation(); togglePlay(); }} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={72} strokeWidth={1.2} /> : <Play size={72} strokeWidth={1.2} style={{ marginLeft: '6px' }} />}
          </button>
          
          <button className="hud-btn-clean" onClick={(e) => { e.stopPropagation(); handleForward(); }} title="Forward 10s">
            <div className="seek-hud-container">
              <RotateCw size={64} strokeWidth={1.2} />
              <span className="seek-hud-text">10</span>
            </div>
          </button>
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

      {/* Bottom Controls Overlay */}
      {!hideUIOverlays && (showPlayBar || showTimeDisplay || showVolumeControl || showFullscreen || video.isRemote) && (
        <div 
          className={`player-overlay bottom-overlay ${controlsVisible ? 'visible' : 'hidden'}`} 
          onClick={(e) => e.stopPropagation()}
        >
          
          {/* Seekbar timeline row */}
          {(showPlayBar || showTimeDisplay) && (
            <div className="seekbar-row">
              {showPlayBar && (
                <div className="scrub-container-premium">
                  <div className="scrub-track-bg"></div>
                  <div className="scrub-track-buffered" style={{ width: `${bufferedPercent}%` }}></div>
                  <div className="scrub-track-progress" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}></div>
                  
                  {/* Hover / Scrub Preview Tooltip (Always rendered to keep preview video loaded and warm) */}
                  <div 
                    className={`scrub-hover-tooltip ${(hoverTime || isScrubbing) ? 'visible' : ''}`} 
                    style={{ left: `${isScrubbing ? (currentTime / (duration || 1)) * 100 : hoverPercent}%` }}
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
                        {isScrubbing ? formatTime(currentTime) : hoverTime}
                      </div>
                    )}
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    onMouseMove={handleProgressMouseMove}
                    onMouseLeave={handleProgressMouseLeave}
                    onMouseDown={() => setIsScrubbing(true)}
                    onMouseUp={() => setIsScrubbing(false)}
                    onTouchStart={() => setIsScrubbing(true)}
                    onTouchEnd={() => setIsScrubbing(false)}
                    className="scrub-bar-premium"
                  />
                </div>
              )}
              {showTimeDisplay && (
                <div className="time-display-clean">
                  {formatTime(duration - currentTime)}
                </div>
              )}
            </div>
          )}

          {/* Bottom controls bar: PiP on left, Audio & Subtitles in center, Fullscreen on right */}
          {!hideUIOverlays && (
            <div className="bottom-controls-bar">
              <div className="bottom-controls-left-spacer">
                <button className="control-btn-pip" onClick={togglePiP} title="Picture in Picture">
                  <MonitorPlay size={22} />
                </button>
                {showVolumeControl && (
                  <div className="volume-control-group-premium">
                    <button 
                      className="control-btn-volume" 
                      onClick={() => {
                        setIsMuted(prev => {
                          const nextMuted = !prev;
                          triggerVolumeToast(volume, nextMuted);
                          return nextMuted;
                        });
                      }}
                      onWheel={(e) => {
                        e.preventDefault();
                        setIsMuted(false);
                        setVolume(prev => {
                          const delta = e.deltaY < 0 ? 0.05 : -0.05;
                          const nextVol = Math.max(0.0, Math.min(1.0, prev + delta));
                          triggerVolumeToast(nextVol, false);
                          return nextVol;
                        });
                      }}
                      title={isMuted ? "Unmute" : "Mute"}
                      style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.8)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s, transform 0.2s' }}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={22} /> : volume < 0.5 ? <Volume1 size={22} /> : <Volume2 size={22} />}
                    </button>
                    <div className="volume-slider-container-premium">
                      <input 
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                          const nextVol = parseFloat(e.target.value);
                          setVolume(nextVol);
                          setIsMuted(nextVol === 0);
                          triggerVolumeToast(nextVol, nextVol === 0);
                        }}
                        className="volume-slider-premium"
                        style={{
                          background: `linear-gradient(to right, #e50914 0%, #e50914 ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.25) ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.25) 100%)`
                        }}
                      />
                    </div>
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
                    />
                  )}
                </div>
              </div>

              <div className="bottom-controls-right-group">
                {showFullscreen && (
                  <button className="control-btn-fullscreen" onClick={toggleFullscreen} title="Fullscreen">
                    {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Key-initiated loading overlay (shown over everything, including popovers) */}
      {isKeyInitiated && extractingStreamIndex !== null && (
        <div className="non-blocking-toast animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <Loader className="fly-loader-spin" size={14} />
          <span>Loading track...</span>
        </div>
      )}

      {/* Auto-probing Stream indicator */}
      {isAutoProbing && (
        <div className="auto-probing-indicator" onClick={(e) => e.stopPropagation()}>
          <Loader className="fly-loader-spin" size={14} />
          <span>Analyzing file tracks...</span>
        </div>
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
            <div className="volume-toast-bar-fill-vertical" style={{ height: `${volumeToast.volume * 100}%` }}>
              {volumeToast.volume > 0 && <div className="volume-toast-bar-cap-vertical" />}
            </div>
          </div>
          <span className="volume-toast-text-vertical">
            {volumeToast.isMuted ? 'MUTE' : Math.round(volumeToast.volume * 100)}
          </span>
        </div>
      </div>

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
        .player-container {
          position: fixed;
          inset: 0;
          z-index: 500;
          background-color: #000000;
          display: flex;
          align-items: center;
          justify-content: center;
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
          inset: 0 10%;
          z-index: 15;
          display: flex;
          align-items: center;
          justify-content: space-between;
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
          border-radius: 2px;
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
          transform: scale(0.65);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 10px rgba(229, 9, 20, 0.8);
          z-index: 10;
        }
        .scrub-container-premium:hover .scrub-bar-premium::-webkit-slider-thumb,
        .scrub-bar-premium:active::-webkit-slider-thumb {
          transform: scale(1.4);
        }
        .scrub-bar-premium::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 50%;
          background: #e50914;
          cursor: pointer;
          transform: scale(0.65);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 10px rgba(229, 9, 20, 0.8);
          z-index: 10;
        }
        .scrub-container-premium:hover .scrub-bar-premium::-moz-range-thumb,
        .scrub-bar-premium:active::-moz-range-thumb {
          transform: scale(1.4);
        }
        .scrub-container-premium:hover .scrub-track-bg,
        .scrub-container-premium:hover .scrub-track-buffered,
        .scrub-container-premium:hover .scrub-track-progress {
          height: 6px;
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
        .control-btn-pip, .control-btn-fullscreen {
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
        .control-btn-pip:hover, .control-btn-fullscreen:hover {
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
          width: 460px;
          max-width: 95vw;
          background: rgba(18, 18, 18, 0.88);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 1.1rem;
          box-shadow: 0 15px 40px rgba(0,0,0,0.7);
          z-index: 100;
          transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .audio-sub-popover-center.has-transcript {
          width: 960px;
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
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
        }
        .audio-sub-popover-center.has-transcript .popover-cols {
          grid-template-columns: 1fr 1fr 1.3fr 1.1fr;
        }
        .popover-transcript-col {
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
          max-height: 200px;
        }
        .popover-style-col {
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
        }
        .style-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 0.35rem;
          margin-bottom: 0.25rem;
        }
        .style-header-row h4 {
          margin: 0 !important;
          border-bottom: none !important;
          padding-bottom: 0 !important;
        }
        .style-reset-btn-header {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          cursor: pointer;
          transition: all 0.15s ease;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .style-reset-btn-header:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
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
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE 10+ */
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

        .netflix-buffer-ring {
          width: 58px;
          height: 58px;
          border: 4px solid rgba(229, 9, 20, 0.15);
          border-top-color: #e50914;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .buffering-spinner-overlay {
          position: absolute;
          inset: 0;
          z-index: 18;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.2);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          width: 84px;
          height: 84px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
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
          .scrub-bar-premium::-webkit-slider-thumb {
            transform: scale(1.1) !important;
          }
          .scrub-bar-premium::-moz-range-thumb {
            transform: scale(1.1) !important;
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
          transform: scale(1.18);
        }

        /* Horizontal Volume Slider on Hover */
        .volume-control-group-premium {
          display: flex;
          align-items: center;
          margin-left: 0.5rem;
        }
        .volume-slider-container-premium {
          width: 0;
          overflow: hidden;
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), margin-left 0.25s ease;
          display: flex;
          align-items: center;
        }
        .volume-control-group-premium:hover .volume-slider-container-premium {
          width: 90px;
          margin-left: 10px;
        }
        .volume-slider-premium {
          width: 90px;
          height: 4px;
          -webkit-appearance: none;
          background: rgba(255, 255, 255, 0.25);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .volume-slider-premium::-webkit-slider-runnable-track {
          height: 4px;
        }
        .volume-slider-premium::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ffffff;
          margin-top: -4px; /* centers thumb */
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s;
          border: none;
        }
        .volume-slider-premium:hover::-webkit-slider-thumb {
          transform: scale(1.2);
          background-color: #ffffff;
        }
        .volume-slider-premium::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: none;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s;
        }
        .volume-slider-premium:hover::-moz-range-thumb {
          transform: scale(1.2);
          background-color: #ffffff;
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
      `}</style>
    </div>
  );
};
