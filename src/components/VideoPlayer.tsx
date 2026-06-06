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
import { parseSubtitles } from '../utils/subtitleParser';
import { ffmpegService } from '../services/ffmpeg';
import { HttpByteSource, CachedByteSource } from '../utils/remoteByteSource';

interface VideoPlayerProps {
  video: VideoItem;
  onBack: () => void;
  onUpdateVideo: (updatedVideo: VideoItem) => void;
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverTime, setHoverTime] = useState<string | null>(null);
  const [hoverPercent, setHoverPercent] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Tracks Selection State
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<CustomAudioTrack | null>(null);
  const [selectedSubTrack, setSelectedSubTrack] = useState<CustomSubtitleTrack | null>(null);
  const [extractingStreamIndex, setExtractingStreamIndex] = useState<number | null>(null);
  const [showAudioSubMenu, setShowAudioSubMenu] = useState(false);
  const [activeAudioStartOffset, setActiveAudioStartOffset] = useState(0);
  const [activeRemoteAudioStreamIndex, setActiveRemoteAudioStreamIndex] = useState<number | null>(null);
  const [activeRemoteSubStreamIndex, setActiveRemoteSubStreamIndex] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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
    } else {
      cachedSourceRef.current = null;
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [video.url, video.isRemote]);

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
    if (video.isRemote && video.seekMap && video.seekMap.length > 0 && cachedSourceRef.current) {
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
  }, [currentTime, video.isRemote, video.url, video.seekMap]);

  const getLangLabel = (lang?: string, fallback: string = '') => {
    if (!lang) return fallback;
    const clean = lang.toLowerCase().trim();
    if (clean === 'eng' || clean === 'en') return 'ENG';
    if (clean === 'jpn' || clean === 'ja') return 'JAP';
    if (clean === 'chi' || clean === 'zho' || clean === 'zh') return 'CHN';
    return clean.toUpperCase();
  };

  // Auto probing and on-the-fly extraction states
  const [isAutoProbing, setIsAutoProbing] = useState(false);
  const [flyExtractProgress, setFlyExtractProgress] = useState(0);
  const probingVideoIdRef = useRef<string | null>(null);

  // Safeguarded arrays
  const audioTracks = video.audioTracks || [];
  const subtitleTracks = video.subtitleTracks || [];
  const streams = video.streams || [];
  const audioStreams = streams.filter(s => s.type === 'audio');
  const subtitleStreams = streams.filter(s => s.type === 'subtitle');

  // Clear hover timeouts on unmount
  useEffect(() => {
    return () => {
      if (audioSubTimeoutRef.current) clearTimeout(audioSubTimeoutRef.current);
    };
  }, []);

  // Auto-probe local file streams on startup if not already scanned
  useEffect(() => {
    const autoProbe = async () => {
      if (video.type === 'local' && video.file && !video.streams && probingVideoIdRef.current !== video.id) {
        probingVideoIdRef.current = video.id;
        setIsAutoProbing(true);
        try {
          if (!ffmpegService.isReady()) {
            await ffmpegService.load();
          }
          const result = await ffmpegService.probeFile(video.file);
          const updatedVideo = {
            ...video,
            duration: result.duration,
            format: result.format,
            streams: result.streams,
          };
          onUpdateVideo(updatedVideo);
        } catch (err) {
          console.error('Auto probe streams failed:', err);
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
      console.log(`[Player] Initializing sync engine for track: ${selectedAudioTrack.name} with offset: ${activeAudioStartOffset}`);
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

  // Remote audio/subtitle segment chunk loading on demand
  const loadRemoteAudioChunk = async (time: number, streamIndex: number, codec: string) => {
    // Seek optimization: abort any active remote fetches
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setExtractingStreamIndex(streamIndex);
    setFlyExtractProgress(0);
    
    const wasPlaying = isPlaying;
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
    }

    try {
      if (!ffmpegService.isReady()) {
        await ffmpegService.load();
      }

      let audioUrl = '';
      let offsetTime = time;

      const cachedSource = cachedSourceRef.current || new CachedByteSource(new HttpByteSource(video.url), 4 * 1024 * 1024, 16);

      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const segIdx = segments.findIndex((s: any) => s.startTime <= time && time < s.startTime + s.duration);
        const segment = segIdx !== -1 ? segments[segIdx] : segments[0];
        
        if (segment) {
          offsetTime = segment.startTime;
          console.log(`[Remote Audio] HLS segment time: ${offsetTime}, url: ${segment.uri}`);
          const transcode = codec !== 'aac' && codec !== 'mp3';
          const result = await ffmpegService.extractHlsAudioSegment(segment.uri, streamIndex, transcode);
          audioUrl = result.url;
        }
      } else {
        const seekMap = video.seekMap || [];
        const entry = seekMap.reduce((prev: any, curr: any) => {
          if (curr.time <= time) {
            return curr;
          }
          return prev;
        }, seekMap[0] || { time: 0, offset: 0 });

        offsetTime = entry.time;
        const startOffset = entry.offset;
        
        const size = 8 * 1024 * 1024; // 8MB chunk for transcode
        const endOffset = startOffset + size;

        console.log(`[Remote Audio] Range: ${startOffset}-${endOffset}, time: ${offsetTime}`);
        
        const transcode = codec !== 'aac' && codec !== 'mp3';
        const result = await ffmpegService.extractRemoteAudioSegment(cachedSource, startOffset, endOffset, streamIndex, transcode, signal);
        audioUrl = result.url;
      }

      if (audioUrl) {
        setActiveAudioStartOffset(offsetTime);
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
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[Remote Audio] Load aborted');
        return;
      }
      console.error('Failed to extract remote audio segment:', err);
    } finally {
      setExtractingStreamIndex(null);
      if (wasPlaying && videoRef.current) {
        videoRef.current.play().catch(console.error);
      }
    }
  };

  const loadRemoteSubtitleChunk = async (time: number, streamIndex: number) => {
    // Seek optimization: abort any active remote fetches
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setExtractingStreamIndex(streamIndex);
    
    try {
      if (!ffmpegService.isReady()) {
        await ffmpegService.load();
      }

      let cues: any[] = [];
      let format: 'srt' | 'vtt' = 'srt';

      const cachedSource = cachedSourceRef.current || new CachedByteSource(new HttpByteSource(video.url), 4 * 1024 * 1024, 16);

      if (video.containerType === 'hls' && video.hlsPlaylist) {
        const segments = video.hlsPlaylist.segments || [];
        const segIdx = segments.findIndex((s: any) => s.startTime <= time && time < s.startTime + s.duration);
        const segment = segIdx !== -1 ? segments[segIdx] : segments[0];
        
        if (segment) {
          const res = await fetch(segment.uri);
          const text = await res.text();
          cues = parseSubtitles(text, 'segment.vtt');
          format = 'vtt';
        }
      } else {
        const seekMap = video.seekMap || [];
        const entry = seekMap.reduce((prev: any, curr: any) => {
          if (curr.time <= time) {
            return curr;
          }
          return prev;
        }, seekMap[0] || { time: 0, offset: 0 });

        const startOffset = entry.offset;
        const size = await cachedSource.getSize();
        const endOffset = Math.min(startOffset + 2 * 1024 * 1024, size - 1);

        const subtitleText = await ffmpegService.extractRemoteSubtitleSegment(cachedSource, startOffset, endOffset, streamIndex, signal);
        
        cues = parseSubtitles(subtitleText, 'subtitles.srt');
        format = 'srt';
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
        console.log('[Remote Subtitles] Load aborted');
        return;
      }
      console.error('Failed to extract remote subtitles:', err);
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
    
    console.error('[VideoPlayer] Playback error code:', err?.code, 'message:', message);
    setPlaybackError(message);
  };

  const handleVideoSeeked = async () => {
    setIsBuffering(false);
    if (!videoRef.current) return;
    const newTime = videoRef.current.currentTime;

    if (video.isRemote) {
      if (activeRemoteAudioStreamIndex !== null) {
        let needLoad = false;
        if (video.containerType === 'hls' && video.hlsPlaylist) {
          const segments = video.hlsPlaylist.segments || [];
          const oldSegIdx = segments.findIndex((s: any) => s.startTime <= activeAudioStartOffset && activeAudioStartOffset < s.startTime + s.duration);
          const newSegIdx = segments.findIndex((s: any) => s.startTime <= newTime && newTime < s.startTime + s.duration);
          if (oldSegIdx !== newSegIdx) {
            needLoad = true;
          }
        } else {
          const seekMap = video.seekMap || [];
          const oldEntry = seekMap.reduce((prev: any, curr: any) => curr.time <= activeAudioStartOffset ? curr : prev, seekMap[0]);
          const newEntry = seekMap.reduce((prev: any, curr: any) => curr.time <= newTime ? curr : prev, seekMap[0]);
          if (oldEntry?.offset !== newEntry?.offset) {
            needLoad = true;
          }
        }

        if (needLoad) {
          console.log(`[VideoPlayer] Seek detected to ${newTime}s outside current chunk range. Fetching new audio chunk.`);
          const activeStream = audioStreams.find(s => s.index === activeRemoteAudioStreamIndex);
          await loadRemoteAudioChunk(newTime, activeRemoteAudioStreamIndex, activeStream?.codec || 'mp3');
        }
      }

      if (activeRemoteSubStreamIndex !== null) {
        let needLoad = false;
        if (video.containerType === 'hls' && video.hlsPlaylist) {
          const segments = video.hlsPlaylist.segments || [];
          const oldSegIdx = segments.findIndex((s: any) => s.startTime <= activeAudioStartOffset && activeAudioStartOffset < s.startTime + s.duration);
          const newSegIdx = segments.findIndex((s: any) => s.startTime <= newTime && newTime < s.startTime + s.duration);
          if (oldSegIdx !== newSegIdx) {
            needLoad = true;
          }
        } else {
          if (Math.abs(newTime - activeAudioStartOffset) > 120) {
            needLoad = true;
          }
        }

        if (needLoad) {
          console.log(`[VideoPlayer] Seek detected to ${newTime}s outside current subtitle range. Fetching new subtitles.`);
          await loadRemoteSubtitleChunk(newTime, activeRemoteSubStreamIndex);
        }
      }
    }
  };

  // On-the-fly extraction handlers for embedded streams selected in-player
  const handleSelectEmbeddedAudio = async (streamIndex: number, codec: string, language?: string) => {
    if (video.isRemote) {
      setActiveRemoteAudioStreamIndex(streamIndex);
      await loadRemoteAudioChunk(currentTime, streamIndex, codec);
      return;
    }

    if (!video.file) return;

    // Check if it's already extracted
    const existing = audioTracks.find(t => t.streamIndex === streamIndex);
    if (existing) {
      setSelectedAudioTrack(existing);
      return;
    }

    // Otherwise, transcode/extract on the fly (non-blocking)
    setExtractingStreamIndex(streamIndex);
    setFlyExtractProgress(0);

    const wasPlaying = isPlaying;
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
    }

    try {
      if (!ffmpegService.isReady()) {
        await ffmpegService.load();
      }

      const result = await ffmpegService.extractAudio(
        video.file,
        streamIndex,
        codec !== 'aac' && codec !== 'mp3',
        (p: number) => setFlyExtractProgress(p)
      );

      const newTrack: CustomAudioTrack = {
        id: `extracted-aud-${Date.now()}`,
        name: `Audio (${language?.toUpperCase() || 'Track'}) - MP3`,
        url: result.url,
        isExtracted: true,
        streamIndex,
        language,
        codec: 'mp3'
      };

      const updatedVideo = {
        ...video,
        audioTracks: [...audioTracks, newTrack]
      };

      onUpdateVideo(updatedVideo);
      setSelectedAudioTrack(newTrack);
    } catch (err) {
      console.error(err);
      alert('Failed to extract audio track: ' + err);
    } finally {
      setExtractingStreamIndex(null);
      setFlyExtractProgress(0);
      if (wasPlaying && videoRef.current) {
        videoRef.current.play().catch(console.error);
      }
    }
  };

  const handleSelectEmbeddedSubtitle = async (streamIndex: number, _codec: string, language?: string) => {
    if (video.isRemote) {
      setActiveRemoteSubStreamIndex(streamIndex);
      await loadRemoteSubtitleChunk(currentTime, streamIndex);
      return;
    }

    if (!video.file) return;

    // Check if it's already extracted
    const existing = subtitleTracks.find(t => t.streamIndex === streamIndex);
    if (existing) {
      setSelectedSubTrack(existing);
      return;
    }

    // Otherwise, extract on the fly (non-blocking)
    setExtractingStreamIndex(streamIndex);
    setFlyExtractProgress(0);

    const wasPlaying = isPlaying;
    if (videoRef.current && isPlaying) {
      videoRef.current.pause();
    }

    try {
      if (!ffmpegService.isReady()) {
        await ffmpegService.load();
      }

      const result = await ffmpegService.extractSubtitle(video.file, streamIndex);
      
      const textRes = await fetch(result.url);
      const text = await textRes.text();
      const cues = parseSubtitles(text, result.filename);

      const newTrack: CustomSubtitleTrack = {
        id: `extracted-sub-${Date.now()}`,
        name: `Subtitles (${language?.toUpperCase() || 'Track'})`,
        url: result.url,
        cues,
        isExtracted: true,
        streamIndex,
        language,
        format: result.format,
      };

      const updatedVideo = {
        ...video,
        subtitleTracks: [...subtitleTracks, newTrack]
      };

      onUpdateVideo(updatedVideo);
      setSelectedSubTrack(newTrack);
    } catch (err) {
      console.error(err);
      alert('Failed to extract subtitle track: ' + err);
    } finally {
      setExtractingStreamIndex(null);
      setFlyExtractProgress(0);
      if (wasPlaying && videoRef.current) {
        videoRef.current.play().catch(console.error);
      }
    }
  };

  const handleExit = () => {
    if (videoRef.current) {
      onUpdateVideo({
        ...video,
        currentTime: videoRef.current.currentTime
      });
    }
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
      const label = getLangLabel(s.language, `Stream #${s.index}`);
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
      const label = getLangLabel(s.language, `Stream #${s.index}`);
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
      setActiveRemoteSubStreamIndex(null);
    } else if (nextOpt.type === 'embedded') {
      handleSelectEmbeddedSubtitle(nextOpt.streamIndex, nextOpt.codec, nextOpt.language);
    } else if (nextOpt.type === 'custom') {
      setSelectedSubTrack(nextOpt.track);
      setActiveRemoteSubStreamIndex(null);
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
      setActiveRemoteAudioStreamIndex(null);
    } else if (nextOpt.type === 'embedded') {
      handleSelectEmbeddedAudio(nextOpt.streamIndex, nextOpt.codec, nextOpt.language);
    } else if (nextOpt.type === 'custom') {
      setSelectedAudioTrack(nextOpt.track);
      setActiveRemoteAudioStreamIndex(null);
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
      if (video.currentTime && !hasSeekedRef.current) {
        const videoDuration = videoRef.current.duration;
        if (videoDuration) {
          const remainingTime = videoDuration - video.currentTime;
          if (video.currentTime > 60 && remainingTime > 120) {
            console.log(`[Player] Resuming playback from: ${video.currentTime}s`);
            videoRef.current.currentTime = video.currentTime;
          } else {
            console.log(`[Player] Professional resume limits not met. Starting from beginning.`);
            videoRef.current.currentTime = 0;
          }
          hasSeekedRef.current = true;
        } else {
          videoRef.current.currentTime = video.currentTime;
        }
      }
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.log('[Player] Autoplay blocked:', err));
    }
  }, [video.url]);

  // Pause on Window Blur or Tab switch if enabled
  useEffect(() => {
    if (!pauseOnFocusChange) return;

    const handleFocusLoss = () => {
      if (videoRef.current && !videoRef.current.paused) {
        console.log('[Player] Focus lost, pausing video playback');
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && videoRef.current && !videoRef.current.paused) {
        console.log('[Player] Tab hidden, pausing video playback');
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
          const stream = streams.find(s => s.type === 'audio' && (
            targetAudio === 'ENG' ? (s.language?.toLowerCase() === 'eng' || s.language?.toLowerCase() === 'en') :
            targetAudio === 'JAP' ? (s.language?.toLowerCase() === 'jpn' || s.language?.toLowerCase() === 'ja') :
            targetAudio === 'CHN' ? (s.language?.toLowerCase() === 'chi' || s.language?.toLowerCase() === 'zho' || s.language?.toLowerCase() === 'zh') :
            s.language?.toUpperCase() === targetAudio
          ));
          if (stream) {
            console.log(`[Player] Auto-selecting audio stream: ${stream.language}`);
            handleSelectEmbeddedAudio(stream.index, stream.codec, stream.language);
          }
        }

        // Auto-select subtitle stream
        if (targetSub !== 'Off' && !selectedSubTrack) {
          const stream = streams.find(s => s.type === 'subtitle' && (
            targetSub === 'ENG' ? (s.language?.toLowerCase() === 'eng' || s.language?.toLowerCase() === 'en') :
            targetSub === 'JAP' ? (s.language?.toLowerCase() === 'jpn' || s.language?.toLowerCase() === 'ja') :
            targetSub === 'CHN' ? (s.language?.toLowerCase() === 'chi' || s.language?.toLowerCase() === 'zho' || s.language?.toLowerCase() === 'zh') :
            s.language?.toUpperCase() === targetSub
          ));
          if (stream) {
            console.log(`[Player] Auto-selecting subtitle stream: ${stream.language}`);
            handleSelectEmbeddedSubtitle(stream.index, stream.codec, stream.language);
          }
        }
      } catch (err) {
        console.error('[Player] Failed auto-selecting defaults:', err);
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
              if (video.currentTime > 60 && remainingTime > 120) {
                console.log(`[Player] Professional resume limits met: seeking to ${video.currentTime}s`);
                videoRef.current.currentTime = video.currentTime;
              } else {
                console.log(`[Player] Professional resume limits not met (currentTime: ${video.currentTime}s, remaining: ${remainingTime}s). Starting from 0.`);
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
          {!hideVideoName && (
            <div className="top-title-container">
              <h2 className="top-title-clean">{video.title}</h2>
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
          <button className="close-btn" onClick={onBack} title="Close">
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
                      className="audio-sub-popover-center animate-fade-in"
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
                            <label className="popover-option" onClick={() => { setSelectedAudioTrack(null); setActiveRemoteAudioStreamIndex(null); setShowAudioSubMenu(false); }}>
                              <input type="radio" name="audio-lang" checked={selectedAudioTrack === null} readOnly />
                              <span>Original</span>
                              {selectedAudioTrack === null && <Check size={14} className="check-icon" />}
                            </label>

                            {/* Scanned/Probed Embedded Streams */}
                            {audioStreams.map((s) => {
                              const active = selectedAudioTrack?.streamIndex === s.index;
                              const label = getLangLabel(s.language, `Stream #${s.index}`);
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
                            <label className="popover-option" onClick={() => { setSelectedSubTrack(null); setActiveRemoteSubStreamIndex(null); setShowAudioSubMenu(false); }}>
                              <input type="radio" name="sub-lang" checked={selectedSubTrack === null} readOnly />
                              <span>Off</span>
                              {selectedSubTrack === null && <Check size={14} className="check-icon" />}
                            </label>

                            {/* Scanned/Probed Embedded Streams */}
                            {subtitleStreams.map((s) => {
                              const active = selectedSubTrack?.streamIndex === s.index;
                              const label = getLangLabel(s.language, `Stream #${s.index}`);
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

      {/* Non-blocking Stream Extraction Notification Toast */}
      {extractingStreamIndex !== null && (
        <div className="non-blocking-toast animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <Loader className="fly-loader-spin" size={14} />
          <span>Extracting track... {flyExtractProgress > 0 ? `${flyExtractProgress}%` : ''}</span>
        </div>
      )}

      {/* Auto-probing Stream indicator */}
      {isAutoProbing && (
        <div className="auto-probing-indicator" onClick={(e) => e.stopPropagation()}>
          <Loader className="fly-loader-spin" size={14} />
          <span>Analyzing file streams...</span>
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
        <div className="volume-toast-content">
          <span className="volume-toast-icon">
            {volumeToast.isMuted || volumeToast.volume === 0 ? '🔇' : volumeToast.volume < 0.4 ? '🔈' : volumeToast.volume < 0.8 ? '🔉' : '🔊'}
          </span>
          <div className="volume-toast-bar-container">
            <div className="volume-toast-bar-fill" style={{ width: `${volumeToast.isMuted ? 0 : volumeToast.volume * 100}%` }}></div>
          </div>
          <span className="volume-toast-text">
            {volumeToast.isMuted ? 'Muted' : `${Math.round(volumeToast.volume * 100)}%`}
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
        }
        .top-title-clean {
          font-size: 1.3rem;
          font-weight: 500;
          color: white;
          margin: 0;
          text-align: center;
        }
        .top-title-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.4rem;
        }
        .playback-mode-badge-container {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
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
          gap: 8px;
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
          background: rgba(18, 18, 18, 0.88);
          backdrop-filter: blur(25px);
          -webkit-backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 1.1rem;
          box-shadow: 0 15px 40px rgba(0,0,0,0.7);
          z-index: 100;
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
          .popover-cols {
            grid-template-columns: 1fr;
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
          width: 75px;
          margin-left: 8px;
        }
        .volume-slider-premium {
          width: 75px;
          height: 4px;
          -webkit-appearance: none;
          background: rgba(255, 255, 255, 0.25);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .volume-slider-premium:hover {
          background: rgba(255, 255, 255, 0.45);
        }
        .volume-slider-premium::-webkit-slider-runnable-track {
          height: 4px;
        }
        .volume-slider-premium::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #e50914; /* Netflix Red */
          margin-top: -3px; /* centers thumb */
          box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
          transition: transform 0.1s ease;
        }
        .volume-slider-premium:hover::-webkit-slider-thumb {
          transform: scale(1.25);
        }
        .volume-slider-premium::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border: none;
          border-radius: 50%;
          background: #e50914;
          box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
          transition: transform 0.1s ease;
        }
        .volume-slider-premium:hover::-moz-range-thumb {
          transform: scale(1.25);
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
