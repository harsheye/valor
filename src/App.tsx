import { useState, useEffect, useRef } from 'react';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack } from './types/media';
import { ffmpegService } from './services/ffmpeg';
import { VideoPlayer } from './components/VideoPlayer';
import { 
  Film, UploadCloud, Play, Settings, X,
  RefreshCw, History, Home,
  Clock, Sliders, Volume2, Maximize
} from 'lucide-react';
import { storeFileHandle, getFileHandle, removeFileHandle, verifyPermission } from './utils/indexedDB';
import { HttpByteSource, CachedByteSource, detectUrlCapabilities } from './utils/remoteByteSource';
import { probeContainer, parseMp4, parseMkv } from './utils/containerParser';
import { parseHlsManifest } from './utils/hlsParser';

function App() {
  const [videos, setVideos] = useState<VideoItem[]>(() => {
    try {
      const saved = localStorage.getItem('valor_videos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((v: any) => ({
            ...v,
            audioTracks: [],
            subtitleTracks: []
          }));
        }
      }
      return [];
    } catch (err) {
      console.error('Failed to parse saved videos:', err);
      return [];
    }
  });
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);
  const [lastPlayingVideo, setLastPlayingVideo] = useState<VideoItem | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'history'>('home');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  // Heartbeat to keep the server alive while the app is active
  useEffect(() => {
    const ping = () => {
      fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get('file');
    if (fileParam) {
      const localStreamUrl = `${window.location.origin}/local-video-stream?path=${encodeURIComponent(fileParam)}`;
      processRemoteUrl(localStreamUrl);
    }
  }, []);

  useEffect(() => {
    const lastId = localStorage.getItem('valor_last_playing_id');
    if (lastId) {
      const match = videos.find(v => v.id === lastId);
      if (match) {
        setLastPlayingVideo(match);
      }
    } else {
      setLastPlayingVideo(null);
    }
  }, [videos]);

  useEffect(() => {
    if (playingVideo) {
      localStorage.setItem('valor_last_playing_id', playingVideo.id);
    }
  }, [playingVideo]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    if (h > 0) return `${h}:${mStr}:${sStr}`;
    return `${m}:${sStr}`;
  };

  // Selector Form states
  const [isDragActive, setIsDragActive] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyVideoInputRef = useRef<HTMLInputElement>(null);
  const pendingLocalReassociateIdRef = useRef<string | null>(null);
  const isPickerOpenRef = useRef(false);

  const defaultSettings = {
    keybinds: {
      playPause: ' ',
      rewind: 'ArrowLeft',
      forward: 'ArrowRight',
      fullscreen: 'f',
      exit: 'Escape',
      nextSubtitle: 'b',
      nextAudio: 'v'
    },
    defaultAudio: 'ENG',
    defaultSub: 'ENG',
    historyLimit: 10 as number | 'Infinite',
    hideUIOverlays: false,
    hideVideoName: false,
    toastDuration: 0.5,
    disableAnimations: false,
    pauseOnFocusChange: false,
    showPlayButton: true,
    showTimeDisplay: true,
    showPlayBar: true,
    showVolumeControl: true,
    showFullscreen: true
  };

  const [showSettings, setShowSettings] = useState(false);
  const [listeningKeyFor, setListeningKeyFor] = useState<keyof typeof defaultSettings.keybinds | null>(null);
  const [settings, setSettings] = useState<typeof defaultSettings>(() => {
    try {
      const saved = localStorage.getItem('valor_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...defaultSettings,
          ...parsed,
          keybinds: {
            ...defaultSettings.keybinds,
            ...(parsed.keybinds || {})
          }
        };
      }
      return defaultSettings;
    } catch (err) {
      return defaultSettings;
    }
  });

  // Keybind rebinder event listener
  useEffect(() => {
    if (!listeningKeyFor) return;

    const handleKeyBind = (e: KeyboardEvent) => {
      e.preventDefault();
      const pressedKey = e.key;

      setSettings((prev: typeof defaultSettings) => {
        if (!listeningKeyFor) return prev;
        const updated = {
          ...prev,
          keybinds: {
            ...prev.keybinds,
            [listeningKeyFor]: pressedKey
          }
        };
        localStorage.setItem('valor_settings', JSON.stringify(updated));
        return updated;
      });
      setListeningKeyFor(null);
    };

    window.addEventListener('keydown', handleKeyBind);
    return () => window.removeEventListener('keydown', handleKeyBind);
  }, [listeningKeyFor]);

  const handleResetSettings = () => {
    setSettings(defaultSettings);
    localStorage.setItem('valor_settings', JSON.stringify(defaultSettings));
  };

  const handleDefaultLangChange = (field: keyof typeof defaultSettings, val: any) => {
    setSettings((prev: typeof defaultSettings) => {
      const updated = {
        ...prev,
        [field]: val
      };
      localStorage.setItem('valor_settings', JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const limit = settings.historyLimit;
    if (limit !== 'Infinite' && typeof limit === 'number' && videos.length > limit) {
      setVideos(prev => prev.slice(0, limit));
    }
  }, [videos, settings.historyLimit]);

  useEffect(() => {
    try {
      const limit = settings.historyLimit;
      let targetVideos = videos;
      if (limit !== 'Infinite' && typeof limit === 'number') {
        targetVideos = videos.slice(0, limit);
      }
      const serialized = targetVideos.map(v => ({
        id: v.id,
        title: v.title,
        url: v.type === 'url' ? v.url : '',
        type: v.type,
        fileName: v.file ? v.file.name : (v as any).fileName,
        duration: v.duration,
        format: v.format,
        streams: v.streams,
        audioTracks: (v.audioTracks || []).map(t => ({
          id: t.id,
          name: t.name,
          url: t.isExtracted ? '' : t.url,
          isExtracted: t.isExtracted,
          streamIndex: t.streamIndex,
          language: t.language,
          codec: t.codec
        })),
        subtitleTracks: (v.subtitleTracks || []).map(t => ({
          id: t.id,
          name: t.name,
          url: t.isExtracted ? '' : t.url,
          cues: [],
          isExtracted: t.isExtracted,
          streamIndex: t.streamIndex,
          language: t.language,
          format: t.format
        })),
        currentTime: v.currentTime || 0
      }));
      try {
        localStorage.setItem('valor_videos', JSON.stringify(serialized));
      } catch (err: any) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
          console.warn('LocalStorage quota exceeded. Evicting older video history...');
          let currentList = [...serialized];
          while (currentList.length > 1) {
            currentList.pop();
            try {
              localStorage.setItem('valor_videos', JSON.stringify(currentList));
              console.log('Successfully saved reduced video history list of size', currentList.length);
              break;
            } catch (retryErr) {
              // keep popping
            }
          }
        } else {
          console.error('Failed to save videos to localStorage:', err);
        }
      }
    } catch (err) {
      console.error('Failed to serialize videos for localStorage:', err);
    }
  }, [videos, settings.historyLimit]);




  const handleUpdateVideo = (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting = false) => {
    setVideos((prev) =>
      prev.map((v) => {
        const isTarget = typeof updatedVideoOrUpdater === 'function'
          ? (playingVideo && v.id === playingVideo.id)
          : v.id === updatedVideoOrUpdater.id;
        if (isTarget) {
          return typeof updatedVideoOrUpdater === 'function' ? (updatedVideoOrUpdater as Function)(v) : updatedVideoOrUpdater;
        }
        return v;
      })
    );
    if (!isExiting) {
      setPlayingVideo((prevPlaying) => {
        if (prevPlaying) {
          const isTarget = typeof updatedVideoOrUpdater === 'function'
            ? true
            : prevPlaying.id === updatedVideoOrUpdater.id;
          if (isTarget) {
            return typeof updatedVideoOrUpdater === 'function' ? (updatedVideoOrUpdater as Function)(prevPlaying) : updatedVideoOrUpdater;
          }
        }
        return prevPlaying;
      });
    }
  };

  // Local File Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.items && e.dataTransfer.items[0]) {
      const item = e.dataTransfer.items[0];
      if (item.kind === 'file') {
        try {
          if ('getAsFileSystemHandle' in item) {
            const handle = await (item as any).getAsFileSystemHandle();
            if (handle && handle.kind === 'file') {
              const file = await handle.getFile();
              const fingerprint = `local-${file.name}_${file.size}_${file.lastModified}`;
              await storeFileHandle(fingerprint, handle);
              await processLocalVideo(file, fingerprint);
              return;
            }
          }
        } catch (err) {
          console.error('Failed to get handle from drop:', err);
        }
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processLocalVideo(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processLocalVideo(file);
    }
  };

  const handleHistoryVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    isPickerOpenRef.current = false;
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const targetId = pendingLocalReassociateIdRef.current;
      if (!targetId) return;
      pendingLocalReassociateIdRef.current = null;
      await processLocalVideo(file, targetId);
    }
  };

  // Select local file (using showOpenFilePicker with IndexedDB storage if supported)
  const handleSelectLocalFile = async () => {
    if (isPickerOpenRef.current) return;
    try {
      if ('showOpenFilePicker' in window) {
        isPickerOpenRef.current = true;
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'Video Files',
            accept: {
              'video/mp4': ['.mp4', '.m4v'],
              'video/webm': ['.webm'],
              'video/x-matroska': ['.mkv'],
              'video/quicktime': ['.mov'],
              'video/x-msvideo': ['.avi']
            }
          }]
        });
        const file = await handle.getFile();
        const fingerprint = `local-${file.name}_${file.size}_${file.lastModified}`;
        await storeFileHandle(fingerprint, handle);
        await processLocalVideo(file, fingerprint, handle);
      } else {
        isPickerOpenRef.current = true;
        fileInputRef.current?.click();
        setTimeout(() => {
          isPickerOpenRef.current = false;
        }, 1000);
      }
    } catch (err) {
      console.error('File picker cancelled or failed:', err);
    } finally {
      if ('showOpenFilePicker' in window) {
        isPickerOpenRef.current = false;
      }
    }
  };

  // Import a local video file with deduplication, merging, and handle storage
  const processLocalVideo = async (file: File, customId?: string, fileHandle?: FileSystemFileHandle) => {
    isPickerOpenRef.current = false;
    const blobUrl = URL.createObjectURL(file);
    const title = file.name.replace(/\.[^/.]+$/, '');
    const fingerprint = `local-${file.name}_${file.size}_${file.lastModified}`;
    const targetId = fingerprint;

    let maxCurrentTime = 0;
    const mergedAudioTracks: CustomAudioTrack[] = [];
    const mergedSubtitleTracks: CustomSubtitleTrack[] = [];
    let mergedDuration: string | undefined = undefined;
    let mergedFormat: string | undefined = undefined;
    let mergedStreams: any[] | undefined = undefined;

    // Find all matching items in history (legacy or fingerprint style) using current state
    const matches = videos.filter(v => 
      v.id === targetId || 
      (customId && v.id === customId) ||
      (v.type === 'local' && (
        (v.fileName && v.fileName.toLowerCase() === file.name.toLowerCase()) ||
        (v.title && v.title.toLowerCase() === title.toLowerCase()) ||
        v.id === targetId
      ))
    );

    // Extract and merge metadata from matches
    matches.forEach(m => {
      if (m.currentTime && m.currentTime > maxCurrentTime) {
        maxCurrentTime = m.currentTime;
      }
      if (m.duration && !mergedDuration) {
        mergedDuration = m.duration;
      }
      if (m.format && !mergedFormat) {
        mergedFormat = m.format;
      }
      if (m.streams && !mergedStreams) {
        mergedStreams = m.streams;
      }
      
      // Merge audio tracks
      if (m.audioTracks) {
        m.audioTracks.forEach(t => {
          if (!mergedAudioTracks.some(existingT => existingT.id === t.id || existingT.name === t.name)) {
            mergedAudioTracks.push(t);
          }
        });
      }

      // Merge subtitle tracks
      if (m.subtitleTracks) {
        m.subtitleTracks.forEach(t => {
          if (!mergedSubtitleTracks.some(existingT => existingT.id === t.id || existingT.name === t.name)) {
            mergedSubtitleTracks.push(t);
          }
        });
      }

      // Clean up old File handles in IndexedDB asynchronously
      if (m.id !== targetId) {
        (async () => {
          try {
            const oldHandle = await getFileHandle(m.id);
            if (oldHandle) {
              await storeFileHandle(targetId, oldHandle);
            }
            await removeFileHandle(m.id);
          } catch (err) {
            console.error(`Failed to migrate file handle from ${m.id} to ${targetId}:`, err);
          }
        })();
      }
    });

    const newVideoItem: VideoItem = {
      id: targetId,
      title,
      url: blobUrl,
      type: 'local',
      file: file,
      fileName: file.name,
      currentTime: maxCurrentTime,
      duration: mergedDuration,
      format: mergedFormat,
      streams: mergedStreams,
      audioTracks: mergedAudioTracks,
      subtitleTracks: mergedSubtitleTracks
    };

    setVideos(prev => {
      const filtered = prev.filter(v => !matches.some(m => m.id === v.id));
      return [newVideoItem, ...filtered];
    });

    setPlayingVideo(newVideoItem);

    // Make sure the file handle is stored in IndexedDB if provided
    if (fileHandle) {
      try {
        await storeFileHandle(targetId, fileHandle);
      } catch (err) {
        console.error('Failed to store handle in IndexedDB:', err);
      }
    }
  };

  const handlePlayVideo = async (video: VideoItem) => {
    if (isPickerOpenRef.current) return;
    
    // Set picker open lock if we might open a file picker
    if (video.type === 'local' && !video.file) {
      isPickerOpenRef.current = true;
    }

    try {
      if (video.type === 'url') {
        setVideos(prev => {
          const filtered = prev.filter(v => v.id !== video.id);
          return [video, ...filtered];
        });
        setPlayingVideo(video);
      } else if (video.type === 'local') {
        if (video.file) {
          let readable = false;
          try {
            await video.file.slice(0, 1).arrayBuffer();
            readable = true;
          } catch (e) {
            console.warn('Local file object in state is no longer readable:', e);
          }

          if (readable) {
            if (video.url && video.url.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(video.url);
              } catch (e) {}
            }
            const newBlobUrl = URL.createObjectURL(video.file);
            const updatedVideo = {
              ...video,
              url: newBlobUrl
            };
            setVideos(prev => {
              const filtered = prev.filter(v => v.id !== video.id);
              return [updatedVideo, ...filtered];
            });
            setPlayingVideo(updatedVideo);
            return;
          }
        }

        // Try to load from IndexedDB
        try {
          const handle = await getFileHandle(video.id);
          if (handle) {
            const hasPermission = await verifyPermission(handle);
            if (hasPermission) {
              const file = await handle.getFile();
              let fileReadable = false;
              try {
                await file.slice(0, 1).arrayBuffer();
                fileReadable = true;
              } catch (e) {
                console.warn('File retrieved from IndexedDB handle is not readable:', e);
              }

              if (fileReadable) {
                const blobUrl = URL.createObjectURL(file);
                const updated = {
                  ...video,
                  url: blobUrl,
                  file: file
                };
                setVideos(prev => {
                  const filtered = prev.filter(v => v.id !== video.id);
                  return [updated, ...filtered];
                });
                setPlayingVideo(updated);
                isPickerOpenRef.current = false;
                return;
              }
            }
          }
        } catch (err) {
          console.error('IndexedDB file restoration failed:', err);
        }

        // Fallback to picker
        pendingLocalReassociateIdRef.current = video.id;

        if ('showOpenFilePicker' in window) {
          try {
            const [handle] = await (window as any).showOpenFilePicker({
              types: [{
                description: 'Video Files',
                accept: {
                  'video/mp4': ['.mp4', '.m4v'],
                  'video/webm': ['.webm'],
                  'video/x-matroska': ['.mkv'],
                  'video/quicktime': ['.mov'],
                  'video/x-msvideo': ['.avi']
                }
              }]
            });
            const file = await handle.getFile();
            await processLocalVideo(file, video.id, handle);
          } catch (err) {
            console.error('Re-association picker cancelled:', err);
          } finally {
            isPickerOpenRef.current = false;
          }
        } else {
          historyVideoInputRef.current?.click();
          setTimeout(() => {
            isPickerOpenRef.current = false;
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Playback re-association failed:', err);
      isPickerOpenRef.current = false;
    }
  };

  const handleRemoveVideo = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVideos(prev => prev.filter(v => v.id !== id));
    try {
      await removeFileHandle(id);
    } catch (err) {
      console.error('Failed to remove file handle from IndexedDB:', err);
    }
    if (playingVideo && playingVideo.id === id) {
      setPlayingVideo(null);
    }
  };

  const processRemoteUrl = async (url: string) => {
    setIsProcessing(true);
    setProcessingStep('Validating security protocols...');
    
    try {
      const urlId = `url-${Date.now()}`;
      // Tighten up URL security - enforce HTTP/HTTPS to prevent protocol-based injection/SSRF/file disclosure
      let parsed: URL;
      try {
        parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('Unsupported URL protocol. Only HTTP and HTTPS protocols are allowed.');
        }
      } catch (err: any) {
        alert(err.message || 'Invalid URL format. Please enter a valid HTTP or HTTPS address.');
        setIsProcessing(false);
        setProcessingStep('');
        return;
      }

      setProcessingStep('Checking connection capabilities...');
      const parserAvailable = await detectUrlCapabilities(url);
      
      if (!parserAvailable) {
        console.log('[App] Remote byte access blocked or failed. Engaging Native Playback Mode.');
        const title = url.substring(url.lastIndexOf('/') + 1) || 'Remote Stream';
        const nativeItem: VideoItem = {
          id: urlId,
          title,
          url,
          type: 'url',
          isRemote: true,
          containerType: 'unknown',
          audioTracks: [],
          subtitleTracks: [],
          playbackMode: 'native',
          probingError: 'The remote server blocks cross-origin byte access (CORS).'
        };
        setVideos(prev => {
          const filtered = prev.filter(v => v.url !== url);
          return [nativeItem, ...filtered];
        });
        setPlayingVideo(nativeItem);
        setIsProcessing(false);
        setProcessingStep('');
        return;
      }

      setProcessingStep('Initializing connection...');
      const byteSource = new HttpByteSource(url);
      const cachedSource = new CachedByteSource(byteSource);

      setProcessingStep('Probing stream format...');
      const container = await probeContainer(cachedSource);
      console.log('Probed remote container type:', container);

      let duration = 'Unknown';
      let format: string = container;
      let streams: any[] = [];
      let seekMap: any[] = [];
      let hlsPlaylist: any = null;
      let timecodeScale: number | undefined = undefined;

      if (container === 'hls') {
        setProcessingStep('Parsing HLS manifest...');
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch HLS manifest, status: ${res.status}`);
        }
        const manifestText = await res.text();
        hlsPlaylist = parseHlsManifest(manifestText, url);
        if (hlsPlaylist.segments.length > 0) {
          const totalDur = hlsPlaylist.segments.reduce((acc: number, s: any) => acc + s.duration, 0);
          duration = formatTime(totalDur);
        }
        format = 'hls';
      } else if (container === 'mp4') {
        setProcessingStep('Parsing MP4 structure...');
        const mp4Info = await parseMp4(cachedSource);
        duration = formatTime(mp4Info.duration);
        seekMap = mp4Info.tracks[0]?.seekMap?.timeToOffset || [];
        
        setProcessingStep('Analyzing video streams...');
        if (!ffmpegService.isReady()) {
          await ffmpegService.load(urlId);
        }
        const probeResult = await ffmpegService.probeRemoteHeader(url, '.mp4', cachedSource);
        streams = probeResult.streams;
      } else if (container === 'mkv') {
        setProcessingStep('Parsing MKV headers...');
        const mkvInfo = await parseMkv(cachedSource);
        duration = formatTime(mkvInfo.duration);
        seekMap = mkvInfo.seekMap || [];
        timecodeScale = mkvInfo.timecodeScale;
        
        setProcessingStep('Analyzing video streams...');
        if (!ffmpegService.isReady()) {
          await ffmpegService.load(urlId);
        }
        const probeResult = await ffmpegService.probeRemoteHeader(url, '.mkv', cachedSource);
        streams = probeResult.streams;
      } else {
        setProcessingStep('Probing headers...');
        try {
          if (!ffmpegService.isReady()) {
            await ffmpegService.load(urlId);
          }
          const ext = url.split('.').pop()?.split('?')[0] || 'mp4';
          const probeResult = await ffmpegService.probeRemoteHeader(url, `.${ext}`, cachedSource);
          streams = probeResult.streams;
          duration = probeResult.duration;
          format = probeResult.format;
        } catch (e) {
          console.warn('FFmpeg probe failed on unknown format, using raw URL', e);
        }
      }

      const audioTracks: CustomAudioTrack[] = [];
      const subtitleTracks: CustomSubtitleTrack[] = [];

      let title = url.substring(url.lastIndexOf('/') + 1) || 'Remote Stream';
      if (url.includes('path=')) {
        try {
          const u = new URL(url);
          const p = u.searchParams.get('path');
          if (p) {
            title = p.split(/[/\\]/).pop() || p;
          }
        } catch {}
      }
      const videoItem: VideoItem = {
        id: urlId,
        title,
        url,
        type: 'url',
        isRemote: true,
        containerType: container,
        seekMap,
        hlsPlaylist,
        duration: duration !== 'Unknown' ? duration : undefined,
        format,
        streams,
        audioTracks,
        subtitleTracks,
        currentTime: 0,
        timecodeScale,
        playbackMode: 'advanced'
      };

      setVideos(prev => {
        const filtered = prev.filter(v => v.url !== url);
        return [videoItem, ...filtered];
      });
      setPlayingVideo(videoItem);
    } catch (err: any) {
      console.warn('Failed to process remote URL under Advanced Mode, falling back to Native Mode:', err);
      
      let probingError = '';
      const errStr = String(err);
      if (errStr.includes('status: 403')) {
        probingError = 'The file server responded with a status of 403 (Forbidden). The file URL might not be supported by the source (e.g. blocks hotlinking or CORS range requests).';
      } else if (errStr.includes('status: 404')) {
        probingError = 'The file server responded with a status of 404 (Not Found). The file does not exist at this URL.';
      } else if (errStr.includes('status: 5')) {
        probingError = 'The file server returned a 5xx server error.';
      } else if (errStr.includes('Failed to fetch')) {
        probingError = 'The request was blocked by a network or CORS restriction from the file server.';
      } else {
        probingError = err?.message || errStr;
      }

      const title = url.substring(url.lastIndexOf('/') + 1) || 'Remote Stream';
      const fallbackItem: VideoItem = {
        id: `url-${Date.now()}`,
        title,
        url,
        type: 'url',
        isRemote: true,
        containerType: 'unknown',
        audioTracks: [],
        subtitleTracks: [],
        playbackMode: 'native',
        probingError: probingError || undefined
      };
      setVideos(prev => {
        const filtered = prev.filter(v => v.url !== url);
        return [fallbackItem, ...filtered];
      });
      setPlayingVideo(fallbackItem);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // URL Form submit handler
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl) return;
    const url = videoUrl;
    setVideoUrl('');
    await processRemoteUrl(url);
  };

  // If playing, render VideoPlayer fullscreen
  if (playingVideo) {
    return (
      <VideoPlayer 
        key={playingVideo.id}
        video={playingVideo} 
        onBack={() => {
          setPlayingVideo(null);
          // Clear query parameter when returning to library
          window.history.replaceState({}, document.title, window.location.pathname);
        }} 
        onUpdateVideo={handleUpdateVideo}
        hideUIOverlays={settings.hideUIOverlays}
        hideVideoName={settings.hideVideoName}
        toastDuration={settings.toastDuration}
        disableAnimations={settings.disableAnimations}
        pauseOnFocusChange={settings.pauseOnFocusChange}
        showPlayButton={settings.showPlayButton}
        showTimeDisplay={settings.showTimeDisplay}
        showPlayBar={settings.showPlayBar}
        showVolumeControl={settings.showVolumeControl}
        showFullscreen={settings.showFullscreen}
      />
    );
  }

  return (
    <div className={`app-layout ${settings.disableAnimations ? 'no-animations' : ''}`}>
      {/* Sidebar - Desktop and Tablet */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Dracarys</div>
        </div>
        
        <nav className="sidebar-menu">
          <button 
            className={`sidebar-menu-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
            title="Select Media"
          >
            <Home size={20} />
            <span className="sidebar-menu-text">Select Media</span>
          </button>
          <button 
            className={`sidebar-menu-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            title="History"
          >
            <History size={20} />
            <span className="sidebar-menu-text">History ({videos.length})</span>
          </button>
        </nav>

        <div className="sidebar-history-section">
          <div className="sidebar-history-title">
            <h3>Recent Playback</h3>
          </div>
          {videos.length === 0 ? (
            <div className="sidebar-empty-history">
              <Film size={24} className="text-muted" />
              <span>No history yet</span>
            </div>
          ) : (
            <div className="sidebar-history-list">
              {videos.map((video) => (
                <div key={`sidebar-${video.id}`} className="sidebar-history-item" onClick={() => handlePlayVideo(video)}>
                  <span className="sidebar-history-item-title" title={video.title}>{video.title}</span>
                  <button 
                    className="sidebar-history-remove-btn" 
                    onClick={(e) => handleRemoveVideo(video.id, e)}
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer - Settings */}
        <div className="sidebar-footer">
          <button className="sidebar-settings-btn" onClick={() => setShowSettings(true)} title="Preferences">
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-layout-wrapper">
        {/* Top Navbar */}
        <header className="glass-navbar">
          <div className="navbar-container">
            <div className="navbar-logo-mobile">
              Dracarys
            </div>

            <div className="navbar-right">
              {/* Status indicators and settings button moved to sidebar footer */}
            </div>
          </div>
        </header>

        {/* Main Content Pane */}
        <main className="main-content container animate-fade-in">
          {lastPlayingVideo && (
            <div className="resume-banner glass-panel animate-fade-in">
              <div className="resume-banner-left">
                <span className="resume-badge">CONTINUE WATCHING</span>
                <h3 className="resume-title">{lastPlayingVideo.title}</h3>
                <p className="resume-desc text-muted">Resume at {formatTime(lastPlayingVideo.currentTime || 0)}</p>
              </div>
              <button className="btn btn-primary resume-btn" onClick={() => handlePlayVideo(lastPlayingVideo)}>
                <Play size={14} fill="white" />
                <span>Resume</span>
              </button>
            </div>
          )}

          <div className="workspace-container">
            {activeTab === 'home' && (
              <div className="workspace-panel-wrapper">
                <div className="glass-panel workspace-panel">
                  <div className="panel-header">
                    <h2>Select Media</h2>
                    <p className="text-muted">Drop a local video file here, browse your files, or enter a video stream URL below to start playing.</p>
                  </div>

                  {/* Combined Drop Zone & URL Injector */}
                  <div 
                    className={`drop-zone combined-drop-zone ${isDragActive ? 'active' : ''}`}
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={handleSelectLocalFile}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      accept="video/*" 
                      onChange={handleFileSelect}
                    />
                    <input 
                      type="file" 
                      ref={historyVideoInputRef} 
                      style={{ display: 'none' }} 
                      accept="video/*" 
                      onChange={handleHistoryVideoSelect}
                    />
                    
                    
                    {/* File Upload Section */}
                    <div className="drop-zone-upload-section">
                      <UploadCloud size={40} className="drop-zone-icon" />
                      <div>
                        <h3>Select Local Video File</h3>
                        <p className="text-muted">Drag & drop or click to browse local video files</p>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleSelectLocalFile(); }}>Select File</button>
                    </div>

                    <div className="divider-or" onClick={(e) => e.stopPropagation()}>
                      <span>OR</span>
                    </div>

                    {/* Inline URL Input Form */}
                    <form 
                      onSubmit={handleUrlSubmit} 
                      className="inline-url-form"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-url-input-wrapper">
                        <input 
                          type="url" 
                          className="form-input inline-url-input" 
                          placeholder="Enter Video Stream URL (e.g. https://.../movie.mp4)" 
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn btn-primary inline-url-btn" title="Play Stream">
                          <Play size={14} fill="white" />
                          <span>Play</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="workspace-panel-wrapper">
                <div className="glass-panel workspace-panel">
                  <div className="panel-header border-b">
                    <h2>Playback History ({videos.length})</h2>
                  </div>

                  {videos.length === 0 ? (
                    <div className="empty-catalog-box glass-panel">
                      <Film size={44} className="text-muted pulsing" />
                      <p>No playback history yet. Load a stream or select a file to begin.</p>
                    </div>
                  ) : (
                    <div className="history-list">
                      {videos.map((video) => (
                        <div key={video.id} className="history-item glass-panel" onClick={() => handlePlayVideo(video)}>
                          <span className="history-title" title={video.title}>{video.title}</span>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button className="btn btn-primary btn-sm play-btn-compact">
                              <Play size={12} fill="white" />
                              <span>Play</span>
                            </button>
                            <button 
                              className="btn-remove-history" 
                              onClick={(e) => handleRemoveVideo(video.id, e)} 
                              title="Remove from history"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="app-footer">
          <div className="container footer-content">
            <span>&copy; 2026 Dracarys. Direct local WebAssembly media processing.</span>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="mobile-bottom-nav">
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={20} />
          <span>History</span>
        </button>
        <button 
          className="mobile-bottom-nav-item"
          onClick={() => setShowSettings(true)}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </div>

      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-header">
              <h2>Preferences</h2>
              <button className="settings-close-btn" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="settings-modal-body">
              <div className="settings-section">
                <h3>Keyboard Customization</h3>
                <p className="settings-section-desc">Click on a key box and press any key to rebind it.</p>
                <div className="keybind-list">
                  <div className="keybind-row">
                    <span className="keybind-label">Play / Pause</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'playPause' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('playPause')}
                    >
                      {listeningKeyFor === 'playPause' ? 'Press any key...' : settings.keybinds.playPause === ' ' ? 'Space' : settings.keybinds.playPause}
                    </button>
                  </div>
                  <div className="keybind-row">
                    <span className="keybind-label">Rewind 10s</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'rewind' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('rewind')}
                    >
                      {listeningKeyFor === 'rewind' ? 'Press any key...' : settings.keybinds.rewind}
                    </button>
                  </div>
                  <div className="keybind-row">
                    <span className="keybind-label">Forward 10s</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'forward' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('forward')}
                    >
                      {listeningKeyFor === 'forward' ? 'Press any key...' : settings.keybinds.forward}
                    </button>
                  </div>
                  <div className="keybind-row">
                    <span className="keybind-label">Toggle Fullscreen</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'fullscreen' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('fullscreen')}
                    >
                      {listeningKeyFor === 'fullscreen' ? 'Press any key...' : settings.keybinds.fullscreen}
                    </button>
                  </div>
                  <div className="keybind-row">
                    <span className="keybind-label">Exit Player / Back</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'exit' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('exit')}
                    >
                      {listeningKeyFor === 'exit' ? 'Press any key...' : settings.keybinds.exit}
                    </button>
                  </div>
                  <div className="keybind-row">
                    <span className="keybind-label">Cycle Subtitles</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'nextSubtitle' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('nextSubtitle')}
                    >
                      {listeningKeyFor === 'nextSubtitle' ? 'Press any key...' : settings.keybinds.nextSubtitle === ' ' ? 'Space' : settings.keybinds.nextSubtitle}
                    </button>
                  </div>
                  <div className="keybind-row">
                    <span className="keybind-label">Cycle Audio Track</span>
                    <button 
                      className={`keybind-capture-btn ${listeningKeyFor === 'nextAudio' ? 'listening' : ''}`}
                      onClick={() => setListeningKeyFor('nextAudio')}
                    >
                      {listeningKeyFor === 'nextAudio' ? 'Press any key...' : settings.keybinds.nextAudio === ' ' ? 'Space' : settings.keybinds.nextAudio}
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3>Preferred Languages</h3>
                <p className="settings-section-desc">Default selections when loading a new video file.</p>
                <div className="pref-row">
                  <span className="pref-label">Default Audio</span>
                  <select 
                    className="pref-select"
                    value={settings.defaultAudio} 
                    onChange={(e) => handleDefaultLangChange('defaultAudio', e.target.value)}
                  >
                    <option value="Original">Original</option>
                    <option value="ENG">English</option>
                    <option value="JAP">Japanese</option>
                    <option value="CHN">Chinese</option>
                  </select>
                </div>
                <div className="pref-row">
                  <span className="pref-label">Default Subtitles</span>
                  <select 
                    className="pref-select"
                    value={settings.defaultSub} 
                    onChange={(e) => handleDefaultLangChange('defaultSub', e.target.value)}
                  >
                    <option value="Off">Off</option>
                    <option value="ENG">English</option>
                    <option value="JAP">Japanese</option>
                    <option value="CHN">Chinese</option>
                  </select>
                </div>
                <div className="pref-row">
                  <span className="pref-label">History Limit</span>
                  <select 
                    className="pref-select"
                    value={settings.historyLimit} 
                    onChange={(e) => handleDefaultLangChange('historyLimit', e.target.value === 'Infinite' ? 'Infinite' : parseInt(e.target.value, 10))}
                  >
                    <option value="5">5 items</option>
                    <option value="10">10 items (Default)</option>
                    <option value="20">20 items</option>
                    <option value="50">50 items</option>
                    <option value="Infinite">Infinite</option>
                  </select>
                </div>
                <div className="pref-row">
                  <span className="pref-label">Toast Duration (Seconds)</span>
                  <select 
                    className="pref-select"
                    value={settings.toastDuration} 
                    onChange={(e) => handleDefaultLangChange('toastDuration', parseFloat(e.target.value))}
                  >
                    <option value="0.5">0.5 seconds (Default)</option>
                    <option value="1">1.0 second</option>
                    <option value="1.5">1.5 seconds</option>
                    <option value="2">2.0 seconds</option>
                    <option value="3">3.0 seconds</option>
                  </select>
                </div>
                <div className="pref-row">
                  <span className="pref-label">Hide All Overlays (Keyboard Only Mode)</span>
                  <input 
                    type="checkbox" 
                    className="pref-checkbox"
                    checked={settings.hideUIOverlays} 
                    onChange={(e) => handleDefaultLangChange('hideUIOverlays', e.target.checked)}
                  />
                </div>
                <div className="pref-row">
                  <span className="pref-label">Hide Video Name</span>
                  <input 
                    type="checkbox" 
                    className="pref-checkbox"
                    checked={settings.hideVideoName} 
                    onChange={(e) => handleDefaultLangChange('hideVideoName', e.target.checked)}
                  />
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">Video Controls</h3>
                <p className="settings-section-desc">Toggle player control overlays visible on the screen.</p>
                
                <div className="pref-row">
                  <span className="pref-label">Play button</span>
                  <div className="pref-row-right">
                    <span className="pref-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Play size={16} />
                    </span>
                    <input 
                      type="checkbox" 
                      className="pref-checkbox"
                      checked={settings.showPlayButton} 
                      onChange={(e) => handleDefaultLangChange('showPlayButton', e.target.checked)}
                    />
                  </div>
                </div>
                
                <div className="pref-row">
                  <span className="pref-label">Time</span>
                  <div className="pref-row-right">
                    <span className="pref-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Clock size={16} />
                    </span>
                    <input 
                      type="checkbox" 
                      className="pref-checkbox"
                      checked={settings.showTimeDisplay} 
                      onChange={(e) => handleDefaultLangChange('showTimeDisplay', e.target.checked)}
                    />
                  </div>
                </div>
                
                <div className="pref-row">
                  <span className="pref-label">Play bar</span>
                  <div className="pref-row-right">
                    <span className="pref-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Sliders size={16} />
                    </span>
                    <input 
                      type="checkbox" 
                      className="pref-checkbox"
                      checked={settings.showPlayBar} 
                      onChange={(e) => handleDefaultLangChange('showPlayBar', e.target.checked)}
                    />
                  </div>
                </div>
                
                <div className="pref-row">
                  <span className="pref-label">Volume</span>
                  <div className="pref-row-right">
                    <span className="pref-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Volume2 size={16} />
                    </span>
                    <input 
                      type="checkbox" 
                      className="pref-checkbox"
                      checked={settings.showVolumeControl} 
                      onChange={(e) => handleDefaultLangChange('showVolumeControl', e.target.checked)}
                    />
                  </div>
                </div>
                
                <div className="pref-row">
                  <span className="pref-label">Fullscreen</span>
                  <div className="pref-row-right">
                    <span className="pref-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Maximize size={16} />
                    </span>
                    <input 
                      type="checkbox" 
                      className="pref-checkbox"
                      checked={settings.showFullscreen} 
                      onChange={(e) => handleDefaultLangChange('showFullscreen', e.target.checked)}
                    />
                  </div>
                </div>
                <div className="pref-row">
                  <span className="pref-label">Disable Hover & Floating Animations</span>
                  <input 
                    type="checkbox" 
                    className="pref-checkbox"
                    checked={settings.disableAnimations} 
                    onChange={(e) => handleDefaultLangChange('disableAnimations', e.target.checked)}
                  />
                </div>
                <div className="pref-row">
                  <span className="pref-label">Pause Video on Focus Loss (Tab/Window Change)</span>
                  <input 
                    type="checkbox" 
                    className="pref-checkbox"
                    checked={settings.pauseOnFocusChange} 
                    onChange={(e) => handleDefaultLangChange('pauseOnFocusChange', e.target.checked)}
                  />
                </div>
              </div>
            </div>

            <div className="settings-modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={handleResetSettings}>
                Reset to Defaults
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowSettings(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="processing-overlay">
          <div className="loader-box">
            <RefreshCw className="loader-spin" size={40} />
            <h4>Processing Stream</h4>
            <p className="step-text">{processingStep}</p>
          </div>
        </div>
      )}

      <style>{`
        html, body {
          margin: 0;
          padding: 0;
        /* App Layout Grid Shell */
        .app-layout {
          display: flex;
          flex-direction: row;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background-color: #141414;
        }

        /* Sidebar Styling (Desktop/Tablet) */
        .app-sidebar {
          width: 280px;
          height: 100%;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: rgba(18, 18, 18, 0.95);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 1.5rem;
          box-sizing: border-box;
          transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1), padding 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          z-index: 100;
          overflow: hidden;
        }
        .sidebar-header {
          margin-bottom: 2rem;
          flex-shrink: 0;
        }
        .sidebar-logo {
          font-size: 1.5rem;
          font-weight: 800;
          color: #e50914;
          text-shadow: 0 0 10px rgba(229, 9, 20, 0.2);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sidebar-menu {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 2rem;
          flex-shrink: 0;
        }
        .sidebar-menu-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: transparent;
          border: none;
          color: #808080;
          padding: 0.75rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          text-align: left;
          font-size: 0.95rem;
          font-weight: 600;
          width: 100%;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .sidebar-menu-item:hover {
          color: white;
          background: rgba(255, 255, 255, 0.05);
        }
        .sidebar-menu-item.active {
          color: white;
          background: rgba(229, 9, 20, 0.1);
          border-left: 3px solid #e50914;
          padding-left: calc(1rem - 3px);
        }
        .sidebar-menu-text {
          transition: opacity 0.2s ease;
        }
        .sidebar-history-section {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
        }
        .sidebar-history-title {
          flex-shrink: 0;
        }
        .sidebar-history-title h3 {
          margin: 0 0 1rem 0;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #555;
          font-weight: 700;
        }
        .sidebar-empty-history {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 2rem 0;
          color: #444;
          font-size: 0.85rem;
          flex: 1;
        }
        .sidebar-history-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow-y: auto;
          flex: 1;
          padding-right: 0px;
          scrollbar-width: none;
        }
        .sidebar-history-list::-webkit-scrollbar {
          display: none;
        }
        .sidebar-history-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 0.6rem 0.8rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          gap: 0.5rem;
        }
        .sidebar-history-item:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .sidebar-history-item-title {
          font-size: 0.85rem;
          font-weight: 500;
          color: #ccc;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .sidebar-history-remove-btn {
          background: transparent;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .sidebar-history-remove-btn:hover {
          color: #e50914;
        }

        /* Main Content Shell */
        .main-layout-wrapper {
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          box-sizing: border-box;
          position: relative;
        }

        /* Header Navigation styling */
        .glass-navbar {
          background: rgba(20, 20, 20, 0.75);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          position: sticky;
          top: 0;
          z-index: 90;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          flex-shrink: 0;
        }
        .navbar-container {
          width: 100%;
          padding: 1rem clamp(1rem, 3vw, 2.5rem);
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 68px;
          box-sizing: border-box;
        }
        .navbar-logo-mobile {
          display: none;
        }
        .navbar-right {
          display: flex;
          align-items: center;
          margin-left: auto;
        }

        .ffmpeg-status-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #ffffff;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 0.45rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .ffmpeg-status-btn:hover {
          background: rgba(229, 9, 20, 0.1);
          border-color: rgba(229, 9, 20, 0.4);
        }
        .icon-spin-hover {
          transition: transform 0.4s ease;
        }
        .ffmpeg-status-btn:hover .icon-spin-hover {
          transform: rotate(180deg);
        }
        
        .ffmpeg-status-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 500;
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .ffmpeg-status-indicator.loading { color: #e2a014; border-color: rgba(226, 160, 20, 0.2); }
        .ffmpeg-status-indicator.ready { color: #2ecc71; border-color: rgba(46, 204, 113, 0.2); }
        .ffmpeg-status-indicator.error { color: #e74c3c; border-color: rgba(231, 76, 60, 0.2); cursor: pointer; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .status-dot.pulsing { background-color: #e2a014; animation: pulse 1.5s infinite alternate; }
        @keyframes pulse { from { opacity: 0.4; } to { opacity: 1; } }

        /* Main Scrollable Content Area */
        .main-content {
          flex: 1;
          padding-top: 2rem;
          padding-bottom: 3rem;
          box-sizing: border-box;
        }

        /* Continue Watching Banner Card */
        .resume-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: clamp(1rem, 2.5vw, 1.5rem) clamp(1.25rem, 3vw, 2rem);
          margin-bottom: 2rem;
          background: linear-gradient(90deg, rgba(229, 9, 20, 0.15) 0%, rgba(20, 20, 20, 0.4) 100%);
          border: 1px solid rgba(229, 9, 20, 0.25);
          border-radius: 12px;
          gap: 1.5rem;
          box-sizing: border-box;
        }
        .resume-banner-left {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-width: 0;
        }
        .resume-badge {
          align-self: flex-start;
          background: #e50914;
          color: white;
          font-size: 0.65rem;
          font-weight: 800;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          letter-spacing: 0.5px;
        }
        .resume-title {
          margin: 0;
          font-size: clamp(1.1rem, 3vw, 1.35rem);
          font-weight: 700;
          color: white;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .resume-desc {
          margin: 0;
          font-size: clamp(0.75rem, 2vw, 0.85rem);
        }
        .resume-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.4rem;
          font-size: 0.9rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        /* Workspace Panels */
        .workspace-container {
          width: 100%;
        }
        .workspace-panel-wrapper {
          width: 100%;
        }
        .workspace-panel {
          padding: clamp(1.25rem, 4vw, 2.5rem);
          border-radius: 12px;
          box-sizing: border-box;
          width: 100%;
        }
        .panel-header {
          margin-bottom: 1.75rem;
        }
        .panel-header.border-b {
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 1rem;
        }
        .panel-header h2 {
          font-size: clamp(1.35rem, 4vw, 1.8rem);
          margin: 0 0 0.5rem 0;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .panel-header p {
          font-size: clamp(0.85rem, 2vw, 0.95rem);
          margin: 0;
        }
        
        .divider-or {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 1.5rem 0;
          color: #555;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .divider-or::before, .divider-or::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .divider-or:not(:empty)::before { margin-right: 1rem; }
        .divider-or:not(:empty)::after { margin-left: 1rem; }

        /* Combined Drop Zone */
        .combined-drop-zone {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem);
          height: auto;
          cursor: default;
          box-sizing: border-box;
          width: 100%;
        }
        .drop-zone-upload-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          cursor: pointer;
          width: 100%;
          gap: 1rem;
        }
        .drop-zone-upload-section h3 {
          font-size: clamp(1.1rem, 3vw, 1.3rem);
          margin: 0 0 0.25rem 0;
        }
        .drop-zone-upload-section p {
          font-size: clamp(0.75rem, 2vw, 0.85rem);
          margin: 0;
        }
        .inline-url-form {
          width: 100%;
        }
        .inline-url-input-wrapper {
          display: flex;
          gap: 0.75rem;
          width: 100%;
        }
        .inline-url-input {
          flex: 1;
          min-width: 0; /* Ensures the flex input can shrink */
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 0.75rem 1rem;
          color: white;
          outline: none;
          font-size: 0.9rem;
          transition: border-color 0.2s;
        }
        .inline-url-input:focus {
          border-color: #e50914;
        }
        .inline-url-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          font-size: 0.9rem;
          font-weight: 700;
          height: auto;
          flex-shrink: 0;
        }

        /* Playback History Listings */
        .empty-catalog-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 5rem 2rem;
          color: #808080;
          gap: 1rem;
          background: rgba(24, 24, 24, 0.4);
          border-radius: 8px;
        }
        .empty-catalog-box p {
          margin: 0;
          font-size: 0.95rem;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          width: 100%;
        }
        .history-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: clamp(0.75rem, 2vw, 1.1rem) clamp(1rem, 2.5vw, 1.5rem);
          background: rgba(24, 24, 24, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
          gap: 1rem;
          cursor: pointer;
        }
        .history-item:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.02);
        }
        .history-title {
          font-size: clamp(0.9rem, 2.5vw, 1.05rem);
          font-weight: 550;
          color: #ffffff;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
          flex: 1;
          min-width: 0;
        }
        .play-btn-compact {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 0.45rem 0.95rem;
          border-radius: 4px;
        }

        .btn-remove-history {
          background: transparent;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .btn-remove-history:hover {
          color: #e50914;
          background: rgba(229, 9, 20, 0.1);
        }

        /* Mobile Bottom Nav (Mobile Viewports Only) */
        .mobile-bottom-nav {
          display: none;
        }

        /* Processing Loader Overlay */
        .processing-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .loader-box {
          width: 100%;
          max-width: 400px;
          background: #181818;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 2.5rem 2rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }
        .loader-spin {
          color: #e50914;
          animation: spin 1s linear infinite;
        }
        .loader-box h4 { margin: 0; font-size: 1.25rem; }
        .step-text { font-size: 0.85rem; color: #808080; margin: 0; line-height: 1.4; }
        .progress-container {
          width: 100%;
          background: rgba(255,255,255,0.05);
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
          position: relative;
          margin-top: 0.5rem;
        }
        .progress-bar { background-color: #e50914; height: 100%; transition: width 0.2s ease; }
        .progress-text { display: block; font-size: 0.75rem; color: #808080; margin-top: 0.25rem; }
        
        .app-footer {
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 1.5rem 0;
          background: #101010;
          text-align: center;
          font-size: 0.75rem;
          color: #555;
          margin-top: auto;
          flex-shrink: 0;
        }

        /* Settings Modal styling */
        .btn-settings {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .btn-settings:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.30);
        }
        .settings-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: modalFadeIn 0.2s ease-out;
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .settings-modal-card {
          width: 90%;
          max-width: 500px;
          background: rgba(20, 20, 20, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: cardSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes cardSlideIn {
          from { transform: scale(0.95) translateY(10px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .settings-modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .settings-modal-header h2 {
          margin: 0;
          font-size: 1.3rem;
          font-weight: 600;
          color: white;
        }
        .settings-close-btn {
          background: none;
          border: none;
          color: #888;
          cursor: pointer;
          padding: 4px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .settings-close-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.08);
        }
        .settings-modal-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
          max-height: 60vh;
          overflow-y: auto;
        }
        .settings-section h3 {
          margin: 0 0 0.25rem 0;
          font-size: 1.05rem;
          font-weight: 600;
          color: #ffffff;
        }
        .settings-section-desc {
          margin: 0 0 1rem 0;
          font-size: 0.8rem;
          color: #888;
        }
        .keybind-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .keybind-row, .pref-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          padding: 0.6rem 0.85rem;
          border-radius: 6px;
        }
        .keybind-label, .pref-label {
          font-size: 0.9rem;
          font-weight: 500;
          color: #ccc;
        }
        .keybind-capture-btn {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          min-width: 120px;
          text-align: center;
          transition: all 0.2s;
        }
        .keybind-capture-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.25);
        }
        .keybind-capture-btn.listening {
          background: rgba(229, 9, 20, 0.2);
          border-color: rgba(229, 9, 20, 0.6);
          color: #e50914;
          animation: pulse 1.5s infinite alternate;
        }
        .pref-select {
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: white;
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          outline: none;
          transition: all 0.2s;
        }
        .pref-select:focus {
          border-color: #e50914;
        }
        .settings-modal-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .pref-row-right {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }
        .pref-icon {
          font-size: 0.95rem;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 500;
          min-width: 60px;
          text-align: right;
        }
        .pref-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background-color: rgba(255, 255, 255, 0.08);
          border: 2px solid rgba(255, 255, 255, 0.2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          outline: none;
        }
        .pref-checkbox:hover {
          border-color: #3b82f6;
          background-color: rgba(59, 130, 246, 0.05);
        }
        .pref-checkbox:checked {
          background-color: #3b82f6;
          border-color: #3b82f6;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.35);
        }
        .pref-checkbox:checked::after {
          content: '✓';
          color: white;
          font-size: 0.95rem;
          font-weight: bold;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        /* Sidebar Footer & Status Indicators */
        .sidebar-footer {
          margin-top: auto;
          padding-top: 1.25rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          flex-shrink: 0;
        }
        .sidebar-extractor-status {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid rgba(255, 255, 255, 0.03);
          padding: 0.75rem 0.85rem;
          border-radius: 8px;
        }
        .status-light-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-light {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        .status-light.ready {
          background-color: #2ec471;
          box-shadow: 0 0 8px rgba(46, 196, 113, 0.7);
        }
        .status-light.loading {
          background-color: #f39c12;
          box-shadow: 0 0 8px rgba(243, 156, 18, 0.7);
          animation: statusPulse 1.2s infinite alternate ease-in-out;
        }
        .status-light.offline {
          background-color: #e74c3c;
          box-shadow: 0 0 8px rgba(231, 76, 60, 0.7);
        }
        @keyframes statusPulse {
          from { opacity: 0.4; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1.15); }
        }
        .status-light-label {
          font-size: 0.8rem;
          font-weight: 500;
          color: #aaa;
        }
        .sidebar-status-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .sidebar-status-btn:hover {
          background: rgba(229, 9, 20, 0.15);
          border-color: rgba(229, 9, 20, 0.45);
          color: #fff;
        }
        .sidebar-status-btn.btn-retry:hover {
          background: rgba(231, 76, 60, 0.15);
          border-color: rgba(231, 76, 60, 0.45);
        }
        .sidebar-settings-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #fff;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .sidebar-settings-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.25);
        }

        /* Mobile Viewports - Custom Responsive Sidebar & Bottom Nav Styles */
        @media (max-width: 768px) {
          .app-sidebar {
            display: none !important;
          }
          .navbar-logo-mobile {
            display: block !important;
            font-size: 1.3rem;
            font-weight: 800;
            color: #e50914;
            text-shadow: 0 0 10px rgba(229, 9, 20, 0.2);
          }
          .mobile-bottom-nav {
            display: flex !important;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 64px;
            background: rgba(18, 18, 18, 0.96);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            justify-content: space-around;
            align-items: center;
            z-index: 500;
            padding: 0 1rem;
            box-sizing: border-box;
          }
          .mobile-bottom-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            background: none;
            border: none;
            color: #888;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            flex: 1;
            height: 100%;
          }
          .mobile-bottom-nav-item:hover {
            color: #ccc;
          }
          .mobile-bottom-nav-item.active {
            color: #e50914;
          }
          .main-layout-wrapper {
            height: calc(100vh - 64px);
            overflow-y: auto;
          }
        }

        /* Disable animations overrides */
        .no-animations * {
          transition: none !important;
          animation: none !important;
        }
        .no-animations .history-item:hover {
          transform: none !important;
        }
        .no-animations .sidebar-history-item:hover {
          transform: none !important;
        }
      `}</style>
    </div>
  );
}

export default App;
