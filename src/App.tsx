import { useState, useEffect, useRef } from 'react';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack } from './types/media';
import { ffmpegService } from './services/ffmpeg';
import { VideoPlayer } from './components/VideoPlayer';
import { CustomSelect } from './components/CustomSelect';
import { Onboarding01 } from './components/Onboarding01';
import { CalendarView } from './components/CalendarView';
import { 
  Film, UploadCloud, Play, Settings, X,
  RefreshCw, History, Home
} from 'lucide-react';
import { storeFileHandle, getFileHandle, removeFileHandle, verifyPermission } from './utils/indexedDB';
import { HttpByteSource, CachedByteSource, detectUrlCapabilities } from './utils/remoteByteSource';
import { probeContainer, parseMp4, parseMkv } from './utils/containerParser';
import { parseHlsManifest } from './utils/hlsParser';

const audioOptions = [
  { value: 'Original', label: 'Original' },
  { value: 'ENG', label: 'English (Default)' },
  { value: 'JAP', label: 'Japanese' },
  { value: 'CHN', label: 'Chinese' }
];

const subOptions = [
  { value: 'Off', label: 'Off' },
  { value: 'ENG', label: 'English (Default)' },
  { value: 'JAP', label: 'Japanese' },
  { value: 'CHN', label: 'Chinese' }
];

const limitOptions = [
  { value: 5, label: '5 items' },
  { value: 10, label: '10 items (Default)' },
  { value: 20, label: '20 items' },
  { value: 50, label: '50 items' },
  { value: 'Infinite', label: 'Infinite' }
];

const intervalOptions = [
  { value: 2, label: 'Every 2 seconds' },
  { value: 5, label: 'Every 5 seconds (Default)' },
  { value: 10, label: 'Every 10 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every 60 seconds' }
];

const toastOptions = [
  { value: 0.5, label: '0.5 seconds (Default)' },
  { value: 1, label: '1.0 second' },
  { value: 1.5, label: '1.5 seconds' },
  { value: 2, label: '2.0 seconds' },
  { value: 3, label: '3.0 seconds' }
];

const fontOptions = [
  { value: 'poppins', label: 'Poppins (Default)' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'outfit', label: 'Outfit' },
  { value: 'cinzel', label: 'Cinzel' },
  { value: 'serif', label: 'Playfair Display' },
  { value: 'monospace', label: 'Roboto Mono' }
];

const storageModeOptions = [
  { value: 'localstorage', label: 'Local Browser Storage' },
  { value: 'file', label: 'Persistent Server Files' }
];

const ratingThresholdOptions = [
  { value: 1, label: '1 minute remaining' },
  { value: 2, label: '2 minutes remaining' },
  { value: 3, label: '3 minutes remaining (Default)' },
  { value: 5, label: '5 minutes remaining' },
  { value: 10, label: '10 minutes remaining' }
];

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
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'calendar' | 'settings'>('home');
  const [settingsTab, setSettingsTab] = useState<'general' | 'hotkeys' | 'subtitle' | 'storage'>('general');
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
      processRemoteUrl(localStreamUrl, true);
    }
  }, []);

  useEffect(() => {
    const initData = async () => {
      let loadedSettings = defaultSettings;
      let settingsLoaded = false;
      try {
        const res = await fetch('/api/settings');
        const fileSettings = await res.json();
        if (fileSettings && Object.keys(fileSettings).length > 0) {
          loadedSettings = {
            ...defaultSettings,
            ...fileSettings,
            keybinds: { ...defaultSettings.keybinds, ...(fileSettings.keybinds || {}) },
            subSettings: { ...defaultSettings.subSettings, ...(fileSettings.subSettings || {}) }
          };
          setSettings(loadedSettings);
          settingsLoaded = true;
        }
      } catch (e) {
        console.warn('Failed to load settings from server file');
      }

      if (!settingsLoaded) {
        const saved = localStorage.getItem('valor_settings');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            loadedSettings = {
              ...defaultSettings,
              ...parsed,
              keybinds: { ...defaultSettings.keybinds, ...(parsed.keybinds || {}) },
              subSettings: { ...defaultSettings.subSettings, ...(parsed.subSettings || {}) }
            };
            setSettings(loadedSettings);
          } catch {}
        }
      }

      // Load History
      const storageMode = loadedSettings.storageMode || 'localstorage';
      let loadedVideos: VideoItem[] = [];
      let historyLoaded = false;

      if (storageMode === 'file') {
        try {
          const res = await fetch('/api/history');
          const fileHistory = await res.json();
          if (Array.isArray(fileHistory)) {
            loadedVideos = fileHistory.map((v: any) => ({
              ...v,
              audioTracks: v.audioTracks || [],
              subtitleTracks: v.subtitleTracks || []
            }));
            setVideos(loadedVideos);
            historyLoaded = true;
          }
        } catch (e) {
          console.warn('Failed to load history from server file');
        }
      }

      if (!historyLoaded) {
        const savedVideos = localStorage.getItem('valor_videos');
        if (savedVideos) {
          try {
            const parsed = JSON.parse(savedVideos);
            if (Array.isArray(parsed)) {
              loadedVideos = parsed.map((v: any) => ({
                ...v,
                audioTracks: v.audioTracks || [],
                subtitleTracks: v.subtitleTracks || []
              }));
              setVideos(loadedVideos);
            }
          } catch {}
        }
      }

      // Resume setup
      const lastId = localStorage.getItem('valor_last_playing_id');
      if (lastId && loadedVideos.length > 0) {
        const match = loadedVideos.find(v => v.id === lastId);
        if (match) {
          setLastPlayingVideo(match);
        }
      } else if (loadedVideos.length > 0) {
        setLastPlayingVideo(loadedVideos[0]);
      }
    };

    initData();
  }, []);



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
      nextAudio: 'v',
      lockControls: 'w'
    },
    defaultAudio: 'ENG',
    defaultSub: 'ENG',
    historyLimit: 10 as number | 'Infinite',
    historySaveInterval: 5 as number,
    hideUIOverlays: false,
    hideVideoName: false,
    toastDuration: 0.5,
    disableAnimations: false,
    pauseOnFocusChange: false,
    showPlayButton: true,
    showTimeDisplay: true,
    showPlayBar: true,
    showVolumeControl: true,
    showFullscreen: true,
    saveHistory: true,
    saveTrackPreferences: true,
    saveVolume: true,
    saveSettings: true,
    storageMode: 'localstorage' as 'localstorage' | 'file',
    ratingThreshold: 3 as number,
    isOnboarded: false as boolean,
    subSettings: {
      fontSize: 'medium' as 'small' | 'medium' | 'large' | 'extra-large',
      color: 'white' as 'white' | 'yellow' | 'cyan' | 'green',
      backdrop: 'shadow' as 'none' | 'shadow' | 'opaque',
      fontFamily: 'sans-serif' as 'sans-serif' | 'serif' | 'monospace' | 'poppins' | 'montserrat' | 'outfit' | 'cinzel',
      fontStyle: 'normal' as 'normal' | 'italic' | 'bold',
      customTextColor: '',
      customBgColor: '',
      customSize: 100
    }
  };


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
          },
          subSettings: {
            ...defaultSettings.subSettings,
            ...(parsed.subSettings || {})
          }
        };
      }
      return defaultSettings;
    } catch (err) {
      return defaultSettings;
    }
  });

  const saveSettingsToStorage = async (state: typeof defaultSettings) => {
    if (state.storageMode === 'file') {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        });
      } catch (e) {
        console.error('Failed to save settings to server:', e);
      }
    }

    if (!state.saveSettings) {
      localStorage.removeItem('valor_settings');
      return;
    }

    const stateToSave = { ...state };
    if (!state.saveTrackPreferences) {
      stateToSave.defaultAudio = defaultSettings.defaultAudio;
      stateToSave.defaultSub = defaultSettings.defaultSub;
    }
    if (!state.saveHistory) {
      stateToSave.historyLimit = defaultSettings.historyLimit;
      stateToSave.historySaveInterval = defaultSettings.historySaveInterval;
    }

    localStorage.setItem('valor_settings', JSON.stringify(stateToSave));
  };

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
        saveSettingsToStorage(updated);
        return updated;
      });
      setListeningKeyFor(null);
    };

    window.addEventListener('keydown', handleKeyBind);
    return () => window.removeEventListener('keydown', handleKeyBind);
  }, [listeningKeyFor]);

  const handleResetSettings = () => {
    setSettings(defaultSettings);
    saveSettingsToStorage(defaultSettings);
  };

  const handleDefaultLangChange = (field: keyof typeof defaultSettings, val: any) => {
    setSettings((prev: typeof defaultSettings) => {
      const updated = {
        ...prev,
        [field]: val
      };
      saveSettingsToStorage(updated);
      return updated;
    });
  };

  useEffect(() => {
    if (playingVideo && settings.saveHistory) {
      localStorage.setItem('valor_last_playing_id', playingVideo.id);
    }
  }, [playingVideo, settings.saveHistory]);

  useEffect(() => {
    const limit = settings.historyLimit;
    if (limit !== 'Infinite' && typeof limit === 'number' && videos.length > limit) {
      setVideos(prev => prev.slice(0, limit));
    }
  }, [videos, settings.historyLimit]);

  useEffect(() => {
    if (!settings.saveHistory) {
      localStorage.removeItem('valor_videos');
      localStorage.removeItem('valor_last_playing_id');
      return;
    }
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
          const updatedItem = typeof updatedVideoOrUpdater === 'function' ? (updatedVideoOrUpdater as Function)(v) : updatedVideoOrUpdater;
          return {
            ...updatedItem,
            lastPlayedDate: new Date().toISOString()
          };
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
      subtitleTracks: mergedSubtitleTracks,
      lastPlayedDate: new Date().toISOString()
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
    if (video.type === 'local' && !video.file && !video.url) {
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
        if (!video.file && video.url) {
          // Play directly from the local stream URL (open-with) without picker
          setVideos(prev => {
            const filtered = prev.filter(v => v.id !== video.id);
            return [video, ...filtered];
          });
          setPlayingVideo(video);
          return;
        }
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

  const processRemoteUrl = async (url: string, isLocalFile = false) => {
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
          type: isLocalFile ? 'local' : 'url',
          isRemote: !isLocalFile,
          fileName: isLocalFile ? title : undefined,
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
        type: isLocalFile ? 'local' : 'url',
        isRemote: !isLocalFile,
        fileName: isLocalFile ? title : undefined,
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
        playbackMode: 'advanced',
        lastPlayedDate: new Date().toISOString()
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
        type: isLocalFile ? 'local' : 'url',
        isRemote: !isLocalFile,
        fileName: isLocalFile ? title : undefined,
        containerType: 'unknown',
        audioTracks: [],
        subtitleTracks: [],
        playbackMode: 'native',
        probingError: probingError || undefined,
        lastPlayedDate: new Date().toISOString()
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
        subSettings={settings.subSettings}
        historySaveInterval={settings.historySaveInterval}
        saveVolume={settings.saveVolume}
        ratingThreshold={settings.ratingThreshold}
        onUpdateSubSettings={(newSubSettings) => {
          const updated = {
            ...settings,
            subSettings: {
              ...settings.subSettings,
              ...newSubSettings
            }
          };
          setSettings(updated);
          saveSettingsToStorage(updated);
        }}
      />
    );
  }

  if (!settings.isOnboarded) {
    return (
      <Onboarding01 
        settings={settings}
        handleDefaultLangChange={handleDefaultLangChange as any}
        audioOptions={audioOptions}
        subOptions={subOptions}
        onComplete={() => {
          const updated = { ...settings, isOnboarded: true };
          setSettings(updated);
          saveSettingsToStorage(updated);
        }}
      />
    );
  }

  return (
    <div className={`app-layout ${settings.disableAnimations ? 'no-animations' : ''}`}>
      {/* Sidebar - Desktop and Tablet */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">Valor</div>
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
          <button 
            className={`sidebar-menu-item ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
            title="Calendar"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span className="sidebar-menu-text">Calendar</span>
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
          <button 
            className={`sidebar-settings-btn ${activeTab === 'settings' ? 'active' : ''}`} 
            onClick={() => setActiveTab('settings')} 
            title="Preferences"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-layout-wrapper">
        {/* Main Content Pane */}
        <main className="main-content container animate-fade-in">
          <div className="workspace-container">
            {activeTab === 'home' && (
              <div className="workspace-panel-wrapper">
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
                          <div className="history-info">
                            <span className="history-title" title={video.title}>{video.title}</span>
                            <div className="history-stats">
                              {video.duration && (
                                <span className="stat-badge">Length: {typeof video.duration === 'number' ? formatTime(video.duration) : video.duration}</span>
                              )}
                              {(video as any).totalTimeWatched > 0 && (
                                <span className="stat-badge">Watched: {formatTime((video as any).totalTimeWatched)}</span>
                              )}
                              {(video as any).rating && (
                                <span className="stat-badge rating-badge">Rating: {'★'.repeat((video as any).rating)}{'☆'.repeat(5 - (video as any).rating)}</span>
                              )}
                              {(video as any).timeToFinish && (
                                <span className="stat-badge finish-badge">Completed in: {formatTime((video as any).timeToFinish)}</span>
                              )}
                            </div>
                          </div>
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

            {activeTab === 'calendar' && (
              <CalendarView 
                videos={videos} 
                onPlayVideo={handlePlayVideo} 
              />
            )}

            {activeTab === 'settings' && (
              <div className="workspace-panel-wrapper">
                <div className="glass-panel workspace-panel settings-panel">
                  
                  {/* Sexy Inner Tab Navigation */}
                  <div className="settings-tab-nav">
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'general' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('general')}
                    >
                      General
                    </button>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'hotkeys' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('hotkeys')}
                    >
                      Hotkeys
                    </button>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'subtitle' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('subtitle')}
                    >
                      Subtitle Style
                    </button>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'storage' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('storage')}
                    >
                      Storage & Saves
                    </button>
                  </div>

                  <div className="settings-page-content-wrapper">
                    
                    {/* General Section */}
                    {settingsTab === 'general' && (
                      <div className="settings-tab-content animate-fade-in">
                        <div className="settings-page-grid">
                          <div className="settings-grid-col">
                            <div className="settings-section">
                              <h3>Preferred Languages</h3>
                              <p className="settings-section-desc">Default selections when loading a new video file.</p>
                              <div className="pref-row">
                                <span className="pref-label">Default Audio</span>
                                <CustomSelect 
                                  value={settings.defaultAudio} 
                                  onChange={(val) => handleDefaultLangChange('defaultAudio', val)}
                                  options={audioOptions}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Default Subtitles</span>
                                <CustomSelect 
                                  value={settings.defaultSub} 
                                  onChange={(val) => handleDefaultLangChange('defaultSub', val)}
                                  options={subOptions}
                                />
                              </div>
                            </div>

                            <div className="settings-section">
                              <h3>History & Toast Preferences</h3>
                              <p className="settings-section-desc">Configure library limits and playback auto-save frequency.</p>
                              <div className="pref-row">
                                <span className="pref-label">History Limit</span>
                                <CustomSelect 
                                  value={settings.historyLimit} 
                                  onChange={(val) => handleDefaultLangChange('historyLimit', val)}
                                  options={limitOptions}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">History Position Auto-Save Interval</span>
                                <CustomSelect 
                                  value={settings.historySaveInterval || 5} 
                                  onChange={(val) => handleDefaultLangChange('historySaveInterval', val)}
                                  options={intervalOptions}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Toast Duration (Seconds)</span>
                                <CustomSelect 
                                  value={settings.toastDuration} 
                                  onChange={(val) => handleDefaultLangChange('toastDuration', val)}
                                  options={toastOptions}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="settings-grid-col">
                            <div className="settings-section">
                              <h3>Player Display & Controls</h3>
                              <p className="settings-section-desc">Toggle display components visible on the video screen.</p>
                              <div className="pref-row">
                                <span className="pref-label">Disable All Overlays (Keyboard Only Mode)</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={settings.hideUIOverlays} 
                                  onChange={(e) => handleDefaultLangChange('hideUIOverlays', e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Video Name Display</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={settings.hideVideoName} 
                                  onChange={(e) => handleDefaultLangChange('hideVideoName', e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Play Button Overlay</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={!settings.showPlayButton} 
                                  onChange={(e) => handleDefaultLangChange('showPlayButton', !e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Time Display</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={!settings.showTimeDisplay} 
                                  onChange={(e) => handleDefaultLangChange('showTimeDisplay', !e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Timeline Scrub Bar</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={!settings.showPlayBar} 
                                  onChange={(e) => handleDefaultLangChange('showPlayBar', !e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Volume Control</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={!settings.showVolumeControl} 
                                  onChange={(e) => handleDefaultLangChange('showVolumeControl', !e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Fullscreen Toggle Button</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={!settings.showFullscreen} 
                                  onChange={(e) => handleDefaultLangChange('showFullscreen', !e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Floating & Hover Animations</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={settings.disableAnimations} 
                                  onChange={(e) => handleDefaultLangChange('disableAnimations', e.target.checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Focus Loss Auto-Pause</span>
                                <input 
                                  type="checkbox" 
                                  className="pref-checkbox"
                                  checked={!settings.pauseOnFocusChange} 
                                  onChange={(e) => handleDefaultLangChange('pauseOnFocusChange', !e.target.checked)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hotkeys Section */}
                    {settingsTab === 'hotkeys' && (
                      <div className="settings-tab-content animate-fade-in">
                        <div className="settings-section max-w-md">
                          <h3>Keyboard Customization</h3>
                          <p className="settings-section-desc">Click on a key box and press any key to rebind it.</p>
                          <div className="keybind-list">
                            {Object.entries(settings.keybinds).map(([key, value]) => {
                              const labelMap: Record<string, string> = {
                                playPause: 'Play / Pause',
                                rewind: 'Rewind 10s',
                                forward: 'Forward 10s',
                                fullscreen: 'Toggle Fullscreen',
                                exit: 'Exit Player / Back',
                                nextSubtitle: 'Cycle Subtitles',
                                nextAudio: 'Cycle Audio',
                                lockControls: 'Toggle Lock Screen / Controls (W)'
                              };
                              return (
                                <div className="keybind-row" key={key}>
                                  <span className="keybind-label">{labelMap[key] || key}</span>
                                  <button 
                                    className={`keybind-capture-btn ${listeningKeyFor === key ? 'listening' : ''}`}
                                    onClick={() => setListeningKeyFor(key as any)}
                                  >
                                    {listeningKeyFor === key ? 'Press any key...' : value === ' ' ? 'Space' : value}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Subtitle Style Section */}
                    {settingsTab === 'subtitle' && (
                      <div className="settings-tab-content animate-fade-in">
                        <div className="settings-section max-w-md">
                          <h3>Default Subtitle Style</h3>
                          <p className="settings-section-desc">Appearance defaults applied to all media tracks.</p>
                          
                           {/* Side-by-side Font Family and Font Size */}
                           <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', width: '100%', flexWrap: 'wrap' }}>
                             <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                               <span className="pref-label">Font Family</span>
                               <CustomSelect 
                                 value={settings.subSettings.fontFamily}
                                 onChange={(val) => {
                                   const updatedSub = { ...settings.subSettings, fontFamily: val };
                                   handleDefaultLangChange('subSettings', updatedSub);
                                 }}
                                 options={fontOptions}
                               />
                             </div>

                             <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                               <span className="pref-label">Font Size</span>
                               <div className="sexy-size-control-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '4px', height: '36px', width: '220px', boxSizing: 'border-box' }}>
                                 <button 
                                   type="button"
                                   onClick={() => {
                                     const currentSize = settings.subSettings.customSize || 100;
                                     const updatedSub = { ...settings.subSettings, customSize: Math.max(50, currentSize - 10) };
                                     handleDefaultLangChange('subSettings', updatedSub);
                                   }}
                                   style={{
                                     width: '28px',
                                     height: '28px',
                                     borderRadius: '6px',
                                     border: 'none',
                                     background: 'rgba(255,255,255,0.06)',
                                     color: '#fff',
                                     cursor: 'pointer',
                                     display: 'flex',
                                     alignItems: 'center',
                                     justifyContent: 'center',
                                     transition: 'all 0.2s',
                                   }}
                                   onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                   onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                 >
                                   <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                 </button>
                                 
                                 <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '45px', textAlign: 'center', color: '#fff', flex: 1 }}>
                                   {settings.subSettings.customSize || 100}%
                                 </span>
                                 
                                 <button 
                                   type="button"
                                   onClick={() => {
                                     const currentSize = settings.subSettings.customSize || 100;
                                     const updatedSub = { ...settings.subSettings, customSize: Math.min(300, currentSize + 10) };
                                     handleDefaultLangChange('subSettings', updatedSub);
                                   }}
                                   style={{
                                     width: '28px',
                                     height: '28px',
                                     borderRadius: '6px',
                                     border: 'none',
                                     background: 'rgba(255,255,255,0.06)',
                                     color: '#fff',
                                     cursor: 'pointer',
                                     display: 'flex',
                                     alignItems: 'center',
                                     justifyContent: 'center',
                                     transition: 'all 0.2s',
                                   }}
                                   onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                   onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                 >
                                   <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                 </button>
                               </div>
                             </div>
                           </div>

                           {/* Premium Swatch Color Pickers */}
                           <div className="style-colors-row style-colors-row-page" style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', width: '100%', flexWrap: 'wrap' }}>
                             <div className="color-picker-item" style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                               <span className="pref-label">Text Color</span>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.4rem 0.6rem', height: '36px', width: '220px', boxSizing: 'border-box', position: 'relative', cursor: 'pointer' }} onClick={() => document.getElementById('textColorInput')?.click()}>
                                 <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: settings.subSettings.customTextColor || '#ffffff', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 0 8px rgba(255,255,255,0.1)', flexShrink: 0 }} />
                                 <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', fontFamily: 'monospace', flex: 1 }}>
                                   {settings.subSettings.customTextColor || '#ffffff'}
                                 </span>
                                 <input 
                                   id="textColorInput"
                                   type="color" 
                                   value={settings.subSettings.customTextColor || '#ffffff'}
                                   onChange={(e) => {
                                     const updatedSub = { ...settings.subSettings, customTextColor: e.target.value };
                                     handleDefaultLangChange('subSettings', updatedSub);
                                   }}
                                   style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', padding: 0 }}
                                 />
                               </div>
                             </div>
                             
                             <div className="color-picker-item bg-picker-item" style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                               <span className="pref-label">Background Color</span>
                               <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '220px' }}>
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.4rem 0.6rem', height: '36px', flex: 1, boxSizing: 'border-box', position: 'relative', cursor: settings.subSettings.customBgColor === 'transparent' ? 'not-allowed' : 'pointer' }} onClick={() => { if (settings.subSettings.customBgColor !== 'transparent') document.getElementById('bgColorInput')?.click(); }}>
                                   <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: settings.subSettings.customBgColor === 'transparent' ? 'transparent' : settings.subSettings.customBgColor || '#000000', border: '2px solid rgba(255,255,255,0.2)', backgroundImage: settings.subSettings.customBgColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none', backgroundSize: '8px 8px', backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px', flexShrink: 0 }} />
                                   <span style={{ fontSize: '0.85rem', fontWeight: 600, color: settings.subSettings.customBgColor === 'transparent' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)', textTransform: 'uppercase', fontFamily: 'monospace', flex: 1 }}>
                                     {settings.subSettings.customBgColor === 'transparent' ? 'NONE' : settings.subSettings.customBgColor || '#000000'}
                                   </span>
                                   <input 
                                     id="bgColorInput"
                                     type="color" 
                                     value={settings.subSettings.customBgColor && !settings.subSettings.customBgColor.startsWith('rgba') && settings.subSettings.customBgColor !== 'transparent' ? settings.subSettings.customBgColor : '#000000'}
                                     onChange={(e) => {
                                       const updatedSub = { ...settings.subSettings, customBgColor: e.target.value };
                                       handleDefaultLangChange('subSettings', updatedSub);
                                     }}
                                     style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none', padding: 0 }}
                                     disabled={settings.subSettings.customBgColor === 'transparent'}
                                   />
                                 </div>
                                 <button 
                                   className={`bg-clear-btn ${settings.subSettings.customBgColor === 'transparent' ? 'active' : ''}`}
                                   onClick={() => {
                                     const updatedSub = { 
                                       ...settings.subSettings, 
                                       customBgColor: settings.subSettings.customBgColor === 'transparent' ? '#000000' : 'transparent' 
                                     };
                                     handleDefaultLangChange('subSettings', updatedSub);
                                   }}
                                   style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', cursor: 'pointer', background: settings.subSettings.customBgColor === 'transparent' ? '#3b82f6' : 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}
                                 >
                                   None
                                 </button>
                               </div>
                             </div>
                           </div>

                          {/* Live Subtitle Style Preview */}
                          <div className="preview-video-frame">
                            <span 
                              className="sub-preview-card"
                              style={{
                                fontFamily: settings.subSettings.fontFamily === 'serif' ? 'Playfair Display, serif' : settings.subSettings.fontFamily === 'monospace' ? 'Roboto Mono, monospace' : settings.subSettings.fontFamily === 'outfit' ? 'Outfit, sans-serif' : settings.subSettings.fontFamily === 'cinzel' ? 'Cinzel, serif' : settings.subSettings.fontFamily === 'montserrat' ? 'Montserrat, sans-serif' : 'Poppins, sans-serif',
                                fontSize: `${Math.min(24, Math.max(12, (settings.subSettings.customSize || 100) * 0.15))}px`,
                                color: settings.subSettings.customTextColor || '#ffffff',
                                backgroundColor: settings.subSettings.customBgColor === 'transparent' ? 'transparent' : settings.subSettings.customBgColor || 'rgba(0,0,0,0.75)',
                                padding: settings.subSettings.customBgColor === 'transparent' ? '0' : '0.4rem 0.8rem',
                                borderRadius: '6px',
                                textShadow: settings.subSettings.customBgColor === 'transparent' ? '1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000' : 'none',
                                display: 'inline-block',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              Valor Subtitle Preview
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Storage & Saves Section */}
                    {settingsTab === 'storage' && (
                      <div className="settings-tab-content animate-fade-in">
                        <div className="settings-section max-w-md">
                          <h3>Storage Location & Advanced Metrics</h3>
                          <p className="settings-section-desc">Configure where your data is stored and playback rating threshold parameters.</p>
                          
                          <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <span className="pref-label">Storage Location</span>
                            <CustomSelect 
                              value={settings.storageMode || 'localstorage'}
                              onChange={(val) => handleDefaultLangChange('storageMode', val)}
                              options={storageModeOptions}
                            />
                          </div>

                          <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <span className="pref-label">Rating Prompt Threshold</span>
                            <CustomSelect 
                              value={settings.ratingThreshold || 3}
                              onChange={(val) => handleDefaultLangChange('ratingThreshold', val)}
                              options={ratingThresholdOptions}
                            />
                          </div>

                          <h3>Data Persistence Preferences</h3>
                          <p className="settings-section-desc">Toggle what data is saved in your active storage location.</p>
                          
                          <div className="pref-row">
                            <span className="pref-label">Save Playback Position & History</span>
                            <input 
                              type="checkbox" 
                              className="pref-checkbox"
                              checked={settings.saveHistory} 
                              onChange={(e) => handleDefaultLangChange('saveHistory', e.target.checked)}
                            />
                          </div>

                          <div className="pref-row">
                            <span className="pref-label">Save Audio/Subtitle Track Preferences</span>
                            <input 
                              type="checkbox" 
                              className="pref-checkbox"
                              checked={settings.saveTrackPreferences} 
                              onChange={(e) => handleDefaultLangChange('saveTrackPreferences', e.target.checked)}
                            />
                          </div>

                          <div className="pref-row">
                            <span className="pref-label">Save Player Volume & Mute States</span>
                            <input 
                              type="checkbox" 
                              className="pref-checkbox"
                              checked={settings.saveVolume} 
                              onChange={(e) => handleDefaultLangChange('saveVolume', e.target.checked)}
                            />
                          </div>

                          <div className="pref-row">
                            <span className="pref-label">Save UI Customization Preferences</span>
                            <input 
                              type="checkbox" 
                              className="pref-checkbox"
                              checked={settings.saveSettings} 
                              onChange={(e) => handleDefaultLangChange('saveSettings', e.target.checked)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  <div className="settings-page-footer">
                    <button className="btn btn-secondary" onClick={handleResetSettings}>
                      Reset All Settings
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="app-footer">
          <div className="container footer-content">
            <span>&copy; 2026 Valor. Direct local WebAssembly media processing.</span>
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
          className={`mobile-bottom-nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 2px auto' }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span>Calendar</span>
        </button>
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </div>



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
        .workspace-panel.settings-panel {
          max-height: 82vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .scrollable-panel {
          max-height: 82vh;
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .settings-page-content-wrapper {
          flex: 1;
          overflow-y: auto;
          scrollbar-width: thin;
          padding-right: 0.5rem;
          box-sizing: border-box;
        }
        .settings-panel .custom-select-container {
          width: 220px !important;
        }
        .settings-tab-nav {
          display: flex;
          gap: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 0.75rem;
          margin-bottom: 1.5rem;
        }
        .settings-nav-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.6);
          padding: 0.5rem 1.25rem;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .settings-nav-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
        }
        .settings-nav-btn.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
        }

        /* Onboarding styles */
        .onboarding-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(8, 8, 8, 0.82);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        .onboarding-card {
          width: 100%;
          max-width: 480px;
          background: #181818;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 1.25rem;
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 20px 40px rgba(0,0,0,0.8);
        }
        .onboarding-header {
          display: flex;
          flex-direction: column;
          margin-bottom: 1.25rem;
        }
        @media (min-width: 640px) {
          .onboarding-header {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }
        .onboarding-title {
          font-size: 1.05rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 0.5rem 0;
        }
        @media (min-width: 640px) {
          .onboarding-title {
            margin-bottom: 0;
          }
        }
        .onboarding-progress-container {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          margin-top: 0.25rem;
        }
        @media (min-width: 640px) {
          .onboarding-progress-container {
            margin-top: 0;
          }
        }
        .progress-ring-svg {
          transform: rotate(-90deg);
        }
        .progress-text {
          margin-left: 0.375rem;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.85rem;
        }
        .progress-text span {
          font-weight: 500;
          color: #ffffff;
        }
        .onboarding-steps-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .onboarding-step-row {
          transition: all 0.2s;
        }
        .onboarding-step-row.border-t {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .onboarding-step-container {
          display: block;
          width: 100%;
          text-align: left;
          cursor: pointer;
          outline: none;
          border-radius: 8px;
        }
        .onboarding-step-inner {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          transition: background-color 0.2s, border-color 0.2s;
          border: 1px solid transparent;
        }
        .onboarding-step-inner.open {
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          margin: 4px 0;
        }
        .onboarding-step-inner:hover {
          background: rgba(255, 255, 255, 0.025);
        }
        .onboarding-step-inner.open:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .onboarding-step-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0.5rem 0.75rem 1rem;
        }
        .step-indicator-wrapper {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          flex: 1;
        }
        .step-dot-wrapper {
          margin-top: 2px;
          flex-shrink: 0;
        }
        .step-title-wrapper {
          flex-grow: 1;
          min-width: 0;
        }
        .step-title {
          font-size: 0.92rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0;
          transition: color 0.2s;
        }
        .step-title.completed {
          color: #3b82f6;
        }
        .step-chevron-right {
          flex-shrink: 0;
          color: rgba(255, 255, 255, 0.4);
        }
        .onboarding-step-body {
          padding: 0 1rem 1.25rem 2.75rem;
        }
        .step-desc {
          font-size: 0.85rem;
          color: rgba(255, 255, 255, 0.55);
          line-height: 1.45;
          margin: 0 0 1rem 0;
        }
        @media (min-width: 640px) {
          .step-desc {
            max-width: 20rem;
          }
        }
        .step-controls-wrapper {
          width: 100%;
        }
        .options-trigger-btn:hover {
          background: rgba(255,255,255,0.06) !important;
          color: #fff !important;
        }
        .dropdown-item:hover {
          background: rgba(255,255,255,0.05) !important;
        }

        /* Subtitle Live Preview styles */
        .preview-video-frame {
          width: 100%;
          height: 120px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(135deg, #141e30, #243b55);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-top: 1.5rem;
          overflow: hidden;
          box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
        }
        .preview-video-frame::before {
          content: 'Live Subtitle Preview';
          position: absolute;
          top: 6px;
          left: 10px;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: rgba(255,255,255,0.4);
          font-weight: 700;
        }
        .settings-page-content-wrapper {
          min-height: 400px;
        }
        .settings-tab-content {
          width: 100%;
        }
        .max-w-md {
          max-width: 480px;
        }
        .settings-page-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin-top: 1.5rem;
        }
        @media (max-width: 900px) {
          .settings-page-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
        }
        .settings-grid-col {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .settings-page-footer {
          margin-top: 2.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: flex-end;
        }
        .pref-row-vertical {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1.25rem;
        }
        .size-btn-group-page {
          background: rgba(0, 0, 0, 0.25) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        .size-action-btn-page {
          color: #ffffff !important;
        }
        .size-action-btn-page:hover {
          background: rgba(255, 255, 255, 0.08) !important;
        }
        .size-value-display-page {
          color: #ffffff !important;
        }
        .style-colors-row-page {
          display: grid;
          grid-template-columns: 1fr 1.6fr;
          gap: 1rem;
          margin-top: 1.25rem;
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
        .history-info {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          flex: 1;
          margin-right: 1.5rem;
          min-width: 0;
        }
        .history-title {
          font-size: clamp(0.9rem, 2.5vw, 1.05rem);
          font-weight: 550;
          color: #ffffff;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
          width: 100%;
        }
        .history-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .stat-badge {
          font-size: 0.72rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(255,255,255,0.55);
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
          font-weight: 500;
        }
        .rating-badge {
          color: #f1c40f;
          border-color: rgba(241, 196, 15, 0.2);
          background: rgba(241, 196, 15, 0.05);
        }
        .finish-badge {
          color: #2ecc71;
          border-color: rgba(46, 204, 113, 0.2);
          background: rgba(46, 204, 113, 0.05);
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
