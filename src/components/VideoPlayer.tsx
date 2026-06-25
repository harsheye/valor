import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, RotateCcw, RotateCw, Cast, X, 
  MessageSquare, Maximize, Minimize, Loader, Check, MonitorPlay,
  Volume2, Volume1, VolumeX, AlertCircle
} from 'lucide-react';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack } from '../types/media';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from './SubtitleOverlay';
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
  showFullscreen = true
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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

  const [, setVolumeToast] = useState<{ volume: number; visible: boolean; isMuted: boolean }>({ volume: 1, visible: false, isMuted: false });
  const volumeToastTimeoutRef = useRef<any>(null);

  const triggerVolumeToast = (vol: number, muted: boolean) => {
    if (volumeToastTimeoutRef.current) clearTimeout(volumeToastTimeoutRef.current);
    setVolumeToast({ volume: vol, visible: true, isMuted: muted });
    volumeToastTimeoutRef.current = setTimeout(() => {
      setVolumeToast(prev => ({ ...prev, visible: false }));
    }, 1500);
  };
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Tracks Selection State
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<CustomAudioTrack | null>(null);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(null);
  const [, setExtractingStreamIndex] = useState<number | null>(null);
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);
  const [activeAudioStartOffset, setActiveAudioStartOffset] = useState(0);
  const [activeSubtitleStartOffset, setActiveSubtitleStartOffset] = useState(0);
  const [activeAudioStreamIndex, setActiveAudioStreamIndex] = useState<number | null>(null);
  const [activeSubStreamIndex, setActiveSubStreamIndex] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [subSearchQuery, setSubSearchQuery] = useState('');

  useEffect(() => {
    setSubSearchQuery('');
  }, [selectedSubTrack?.id]);

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

  // Default Subtitle Settings (kept for compatibility with SubtitleOverlay)
  const [subSettings] = useState<SubtitleSettings>({
    fontSize: 'medium',
    color: 'white',
    backdrop: 'shadow',
    fontFamily: 'sans-serif',
    fontStyle: 'normal'
  });

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
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (video.isRemote) {
      const byteSource = new HttpByteSource(video.url);
      cachedSourceRef.current = new CachedByteSource(byteSource, 4 * 1024 * 1024, 16); // 4MB chunks, cache size 16 (64MB)
    } else if (video.type === 'local' && video.file) {
      const byteSource = new FileByteSource(video.file);
      cachedSourceRef.current = new CachedByteSource(byteSource, 4 * 1024 * 1024, 16); // 4MB chunks, cache size 16 (64MB)
    } else {
      cachedSourceRef.current = null;
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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
      const audioDuration = isRemote ? 30 : 120;
      
      const containerType = (video.containerType || '').toLowerCase();
      const isMkv = containerType.includes('mkv') || containerType.includes('matroska') || (video.format || '').toLowerCase().includes('mkv') || (video.format || '').toLowerCase().includes('matroska');
      const subDuration = isMkv ? (isRemote ? 300 : 600) : (isRemote ? 60 : 300);

      if (activeAudioStreamIndex !== null) {
        if (currentTime - activeAudioStartOffset > audioDuration - 5) {
          logger.player(`Playback crossed audio chunk boundary. Loading next chunk at ${currentTime}s.`);
          const activeStream = audioStreams.find(s => s.index === activeAudioStreamIndex);
          loadAudioChunk(currentTime, activeAudioStreamIndex, activeStream?.codec || 'mp3');
        }
      }

      if (activeSubStreamIndex !== null && (isRemote || isMkv)) {
        if (currentTime - activeSubtitleStartOffset > subDuration - 10) {
          logger.player(`Playback crossed subtitle chunk boundary. Loading next subtitles at ${currentTime}s.`);
          loadSubtitleChunk(currentTime, activeSubStreamIndex);
        }
      }
    }
  }, [currentTime, isPlaying, activeAudioStreamIndex, activeSubStreamIndex, video.seekMap, activeAudioStartOffset, activeSubtitleStartOffset, video.isRemote, video.containerType, video.format]);

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
          onUpdateVideo(updatedVideo);
        } catch (err) {
          logger.error('Auto probe streams failed:', err);
          probingVideoIdRef.current = null; // allow retry
        } finally {
          setIsAutoProbing(false);
        }
      }
    };
    autoProbe();
  }, [video.id, video.type, video.file, onUpdateVideo]);

  // Synchronize Audio Engine
  useEffect(() => {
    if (selectedAudioTrack && videoRef.current && audioRef.current) {
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
    localStorage.setItem('valor_volume', volume.toString());
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('valor_muted', isMuted ? 'true' : 'false');
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // RequestAnimationFrame tick loop for micro-fine time updates (essential for subtitles)
  useEffect(() => {
    let frameId: number;

    const tick = () => {
      if (videoRef.current && !videoRef.current.paused) {
        setCurrentTime(videoRef.current.currentTime);
        
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

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
          });
          audioUrl = result.url;
        }
      } else if (!video.isRemote && video.file) {
        // LOCAL FILE FLOW: Extract chunk directly from mounted file
        const audioDuration = 120;
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
          { index: streamIndex, codec }
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
    }
  };

  const loadSubtitleChunk = async (time: number, streamIndex: number) => {
    // Seek optimization: abort any active remote fetches
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

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
    if (activeAudioStreamIndex !== null) {
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

    if (activeSubStreamIndex !== null && video.isRemote) {
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
  const handleSelectEmbeddedAudio = async (streamIndex: number, codec: string, _language?: string) => {
    setActiveAudioStreamIndex(streamIndex);
    await loadAudioChunk(currentTime, streamIndex, codec);
  };

  const handleSelectEmbeddedSubtitle = async (streamIndex: number, _codec: string, _language?: string) => {
    setActiveSubStreamIndex(streamIndex);
    await loadSubtitleChunk(currentTime, streamIndex);
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

  const cycleSubtitles = () => {
    const options = getSubOptions();
    if (options.length === 0) return;

    let currentIndex = 0;
    if (selectedSubTrack) {
      if (selectedSubTrack.streamIndex !== undefined) {
        currentIndex = options.findIndex(opt => opt.type === 'embedded' && opt.streamIndex === selectedSubTrack.streamIndex);
      } else {
        currentIndex = options.findIndex(opt => opt.type === 'custom' && opt.track?.id === selectedSubTrack.id);
      }
    }
    if (currentIndex === -1) currentIndex = 0;

    const nextIndex = (currentIndex + 1) % options.length;
    const nextOpt = options[nextIndex];

    if (nextOpt.type === 'off') {
      setSelectedSubTrack(null);
      setActiveSubStreamIndex(null);
    } else if (nextOpt.type === 'embedded') {
      handleSelectEmbeddedSubtitle(nextOpt.streamIndex, nextOpt.codec, nextOpt.language);
    } else if (nextOpt.type === 'custom') {
      setSelectedSubTrack(nextOpt.track);
      setActiveSubStreamIndex(null);
    }

    triggerSwitchToast(nextOpt.name);
  };

  const cycleAudio = () => {
    const options = getAudioOptions();
    if (options.length === 0) return;

    let currentIndex = 0;
    if (selectedAudioTrack) {
      if (selectedAudioTrack.streamIndex !== undefined) {
        currentIndex = options.findIndex(opt => opt.type === 'embedded' && opt.streamIndex === selectedAudioTrack.streamIndex);
      } else {
        currentIndex = options.findIndex(opt => opt.type === 'custom' && opt.track?.id === selectedAudioTrack.id);
      }
    }
    if (currentIndex === -1) currentIndex = 0;

    const nextIndex = (currentIndex + 1) % options.length;
    const nextOpt = options[nextIndex];

    if (nextOpt.type === 'original') {
      setSelectedAudioTrack(null);
      setActiveAudioStreamIndex(null);
    } else if (nextOpt.type === 'embedded') {
      handleSelectEmbeddedAudio(nextOpt.streamIndex, nextOpt.codec, nextOpt.language);
    } else if (nextOpt.type === 'custom') {
      setSelectedAudioTrack(nextOpt.track);
      setActiveAudioStreamIndex(null);
    }

    triggerSwitchToast(nextOpt.name);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        nextAudio: 'v'
      };
      const parsed = saved ? JSON.parse(saved) : {};
      const keybinds = {
        ...defaultKeybinds,
        ...(parsed.keybinds || {})
      };

      const pressedKey = e.key.toLowerCase();
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
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExit, triggerHudFlash, subtitleStreams, subtitleTracks, audioStreams, audioTracks, selectedSubTrack, selectedAudioTrack, isMuted]);

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

  // Pause on Window Blur or Tab switch if enabled
  useEffect(() => {
    if (!pauseOnFocusChange) return;

    const handleFocusLoss = () => {
      if (videoRef.current && !videoRef.current.paused) {
        logger.player('Focus lost, pausing video playback');
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleVisibilityChange = () => {
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
  }, [pauseOnFocusChange]);

  // Periodically save current playback position to parent state
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        onUpdateVideo({
          ...video,
          currentTime: videoRef.current.currentTime
        });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [video, onUpdateVideo]);

  // Auto-select preferred default audio/subtitle streams
  useEffect(() => {
    if (streams.length > 0) {
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
      setSelectedAudioTrack(newTrack);
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
      setSelectedSubTrack(newTrack);
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



  return (
    <div 
      ref={containerRef} 
      className={`player-container ${showControls && !hideUIOverlays ? 'show-cursor' : 'hide-cursor'} ${hideUIOverlays ? 'keyboard-only' : ''} ${disableAnimations ? 'no-animations' : ''}`}
      onMouseMove={handleMouseMove}
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
          controlsVisible={showControls}
        />
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
          className={`player-overlay top-overlay-clean ${showControls ? 'visible' : 'hidden'}`} 
          onClick={(e) => e.stopPropagation()}
        >
          {/* Chromecast trigger (acting as pip/dummy cast) */}
          <button className="cast-btn" onClick={togglePiP} title="Chromecast">
            <Cast size={24} />
          </button>
          
          {/* Centered video title & Playback mode badge */}
          {(!hideVideoName || video.isRemote) && (
            <div className="top-title-container">
              {!hideVideoName && video.playbackMode !== 'native' && (
                <h2 className="top-title-clean">{video.title}</h2>
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
      {!hideUIOverlays && showPlayButton && (
        <div 
          className={`center-controls-hud ${showControls ? 'visible' : 'hidden'}`} 
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

      {/* Bottom Controls Overlay */}
      {!hideUIOverlays && (showPlayBar || showTimeDisplay || showVolumeControl || showFullscreen || video.isRemote) && (
        <div 
          className={`player-overlay bottom-overlay ${showControls ? 'visible' : 'hidden'}`} 
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
                    <div 
                      className={`audio-sub-popover-center animate-fade-in ${selectedSubTrack ? 'has-transcript' : ''}`}
                      onMouseEnter={() => {
                        if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
                      }}
                    >
                      <div className="popover-cols">
                        {/* Audio Column */}
                        <div className="popover-col">
                          <h4>Audio</h4>
                          <div className="popover-options">
                            {/* Default Original Audio if streams are available, or default selector */}
                            <label className="popover-option" onClick={() => { setSelectedAudioTrack(null); setActiveAudioStreamIndex(null); setShowAudioSubMenu(false); }}>
                              <input type="radio" name="audio-lang" checked={selectedAudioTrack === null} readOnly />
                              <span>Original</span>
                              {selectedAudioTrack === null && <Check size={14} className="check-icon" />}
                            </label>

                            {/* Scanned/Probed Embedded Tracks */}
                            {audioStreams.map((s) => {
                              const active = selectedAudioTrack?.streamIndex === s.index;
                              const label = getLangLabel(s.language, `Track #${s.index}`);
                              return (
                                <label key={`embed-aud-${s.index}`} className="popover-option" onClick={() => { handleSelectEmbeddedAudio(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
                                  <input type="radio" name="audio-lang" checked={active} readOnly />
                                  <span>{label}</span>
                                  {active && <Check size={14} className="check-icon" />}
                                </label>
                              );
                            })}

                            {/* Custom Uploaded Tracks */}
                            {audioTracks.map((track) => {
                              const active = selectedAudioTrack?.id === track.id;
                              return (
                                <label key={track.id} className="popover-option" onClick={() => { setSelectedAudioTrack(track); setShowAudioSubMenu(false); }}>
                                  <input type="radio" name="audio-lang" checked={active} readOnly />
                                  <span>{track.name}</span>
                                  {active && <Check size={14} className="check-icon" />}
                                </label>
                              );
                            })}

                            {/* Custom Add Trigger */}
                            <label className="popover-option add-custom-btn" onClick={() => { customAudioInputRef.current?.click(); setShowAudioSubMenu(false); }}>
                              <span>+ Add Custom File</span>
                            </label>
                          </div>
                        </div>

                        {/* Subtitles Column */}
                        <div className="popover-col">
                          <h4>Subtitles</h4>
                          <div className="popover-options">
                            {/* Off */}
                            <label className="popover-option" onClick={() => { setSelectedSubTrack(null); setActiveSubStreamIndex(null); setShowAudioSubMenu(false); }}>
                              <input type="radio" name="sub-lang" checked={selectedSubTrack === null} readOnly />
                              <span>Off</span>
                              {selectedSubTrack === null && <Check size={14} className="check-icon" />}
                            </label>

                            {/* Scanned/Probed Embedded Tracks */}
                            {subtitleStreams.map((s) => {
                              const active = selectedSubTrack?.streamIndex === s.index;
                              const label = getLangLabel(s.language, `Track #${s.index}`);
                              return (
                                <label key={`embed-sub-${s.index}`} className="popover-option" onClick={() => { handleSelectEmbeddedSubtitle(s.index, s.codec, s.language); setShowAudioSubMenu(false); }}>
                                  <input type="radio" name="sub-lang" checked={active} readOnly />
                                  <span>{label}</span>
                                  {active && <Check size={14} className="check-icon" />}
                                </label>
                              );
                            })}

                            {/* Custom Uploaded Tracks */}
                            {subtitleTracks.map((track) => {
                              const active = selectedSubTrack?.id === track.id;
                              return (
                                <label key={track.id} className="popover-option" onClick={() => { setSelectedSubTrack(track); setShowAudioSubMenu(false); }}>
                                  <input type="radio" name="sub-lang" checked={active} readOnly />
                                  <span>{track.name}</span>
                                  {active && <Check size={14} className="check-icon" />}
                                </label>
                              );
                            })}

                            {/* Custom Add Trigger */}
                            <label className="popover-option add-custom-btn" onClick={() => { customSubInputRef.current?.click(); setShowAudioSubMenu(false); }}>
                              <span>+ Add Custom File</span>
                            </label>
                          </div>
                        </div>

                        {/* Subtitle Cue Transcript Column */}
                        {selectedSubTrack && (
                          <div className="popover-col popover-transcript-col">
                            <h4>Subtitle View</h4>
                            <div className="transcript-search-box">
                              <input 
                                type="text" 
                                placeholder="Search subtitles..." 
                                value={subSearchQuery}
                                onChange={(e) => setSubSearchQuery(e.target.value)}
                                className="transcript-search-input"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="transcript-cues-list">
                              {(selectedSubTrack.cues || []).map((cue, originalIdx) => {
                                const isMatched = cleanSubtitleText(cue.text).toLowerCase().includes(subSearchQuery.toLowerCase());
                                if (!isMatched) return null;
                                
                                const isActive = currentTime >= cue.startTime && currentTime <= cue.endTime;
                                return (
                                  <div 
                                    key={cue.id || originalIdx} 
                                    id={`cue-item-${originalIdx}`}
                                    className={`transcript-cue-item ${isActive ? 'active' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (videoRef.current) {
                                        videoRef.current.currentTime = cue.startTime;
                                        setCurrentTime(cue.startTime);
                                      }
                                    }}
                                  >
                                    <span className="cue-time">{formatTime(cue.startTime)}</span>
                                    <span className="cue-text">{cleanSubtitleText(cue.text)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
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
          width: 780px;
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
          grid-template-columns: 1fr 1fr 1.3fr;
        }
        .popover-transcript-col {
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          padding-left: 1.25rem;
          display: flex;
          flex-direction: column;
          max-height: 200px;
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
          padding: 0.6rem 0.8rem;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1.05rem;
          color: #cccccc;
          transition: all 0.15s ease;
        }
        .popover-option:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
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
          z-index: 30;
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
            bottom: 90px !important;
            left: 20px !important;
          }
        }

        /* Volume Toast HUD */
        .volume-toast-overlay {
          position: absolute;
          bottom: 120px;
          left: 40px;
          z-index: 600;
          opacity: 0;
          transform: translateX(-20px);
          transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
        }
        .volume-toast-overlay.visible {
          opacity: 1;
          transform: translateX(0);
        }
        .volume-toast-content {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(18, 18, 18, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(229, 9, 20, 0.3);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
          padding: 0.6rem 1.2rem;
          border-radius: 8px;
          color: white;
        }
        .volume-toast-icon {
          font-size: 1.1rem;
          display: flex;
          align-items: center;
        }
        .volume-toast-bar-container {
          width: 100px;
          height: 6px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .volume-toast-bar-fill {
          height: 100%;
          background: #e50914; /* Netflix Red */
          box-shadow: 0 0 8px rgba(229, 9, 20, 0.8);
          border-radius: 3px;
          transition: width 0.1s ease;
        }
        .volume-toast-text {
          font-size: 0.85rem;
          font-weight: 700;
          min-width: 38px;
          text-align: right;
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
