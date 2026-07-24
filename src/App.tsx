import { useState, useEffect, useRef, Component, ReactNode, useCallback, useMemo } from 'react';
import type { VideoItem, CustomAudioTrack, CustomSubtitleTrack } from './types/media';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught error details:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error instanceof Error ? this.state.error.message : String(this.state.error || 'Unknown error');
      const errStack = this.state.error instanceof Error ? this.state.error.stack : '';
      return (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#0b0b10', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>Something went wrong</h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', maxWidth: '600px', margin: '1rem 0', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {errMsg}
          </p>
          {errStack && (
            <pre style={{ maxWidth: '700px', maxHeight: '200px', overflow: 'auto', background: '#121218', padding: '1rem', borderRadius: '8px', fontSize: '0.75rem', color: '#aaa', textAlign: 'left', margin: '0 0 1.5rem 0' }}>
              {errStack}
            </pre>
          )}
          <button 
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { ffmpegService } from './services/ffmpeg';
import { LocalVideoPlayer } from './components/LocalVideoPlayer';
import { RemoteVideoPlayer } from './components/RemoteVideoPlayer';
import { OnlineSearchTab } from './components/OnlineSearchTab';
import { OnlineEmbedPlayer } from './components/OnlineEmbedPlayer';
import { OnlineDetailsPage } from './components/OnlineDetailsPage';
import { GraphQLStorageProvider } from './services/storage/GraphQLStorageProvider';
import { LocalIndexedDBProvider } from './services/storage/LocalIndexedDBProvider';
import { ActorDetailsPage } from './components/ActorDetailsPage';
import { OnlineVideoPlayer } from './components/OnlineVideoPlayer';
import { CustomSelect } from './components/CustomSelect';
import { Onboarding01 } from './components/Onboarding01';
import { CalendarView } from './components/CalendarView';
import { LibraryView } from './components/LibraryView';
import { ApiSettingsView } from './components/ApiSettingsView';
import { EsportsLiveOverlay } from './components/EsportsLiveOverlay';
import Calendar02 from './components/creative-tim/blocks/calendar-02';
import { classifyVideoTitle } from './utils/libraryClassifier';
import { 
  Film, UploadCloud, Play, Settings, X, Calendar, List,
  History, Home, Layers, Type, Clock, Sliders, Volume2,
  Maximize, Zap, Coffee, SkipForward, Ban, FastForward, Lock, ChevronRight, ChevronLeft,
  LogOut, Trash2, Plus, Download, UserPlus, Trophy, Radio
} from 'lucide-react';
import { storeFileHandle, getFileHandle, removeFileHandle, verifyPermission, cleanupFileHandles } from './utils/indexedDB';
import { HttpByteSource, CachedByteSource, detectUrlCapabilities } from './services/remote/remoteByteSource';
import { probeContainer, parseMp4, parseMkv } from './utils/containerParser';
import { parseHlsManifest } from './utils/hlsParser';
import { LoadingSpinner, SPINNER_PRESETS, SpinnerThumbnail } from './components/LoadingSpinner';
import type { SpinnerPreset } from './components/LoadingSpinner';

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ checked, onChange, disabled }) => {
  return (
    <div 
      className={`custom-toggle-switch ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
    >
      <div className="custom-toggle-knob" />
    </div>
  );
};

export const BACKEND_ORIGIN = 'http://127.0.0.1:50001';

export const sanitizeVideoItem = (v: VideoItem, useIdStream: boolean): VideoItem => {
  if (v && v.type === 'local' && v.localFilePath) {
    const streamUrl = useIdStream
      ? `${BACKEND_ORIGIN}/local-video-stream?id=${encodeURIComponent(v.id)}`
      : `${BACKEND_ORIGIN}/local-video-stream?path=${encodeURIComponent(v.localFilePath)}`;
    if (v.url !== streamUrl) {
      return { ...v, url: streamUrl };
    }
  }
  return v;
};

export const sanitizeVideoList = (list: VideoItem[], useIdStream: boolean): VideoItem[] => {
  if (!Array.isArray(list)) return list;
  return list.map(item => sanitizeVideoItem(item, useIdStream));
};

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

const sendLogToServer = (type: string, args: any[]) => {
  try {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    fetch(`${BACKEND_ORIGIN}/api/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message })
    }).catch(() => {});
  } catch {}
};

console.log = (...args) => {
  originalConsoleLog(...args);
  sendLogToServer('INFO', args);
};
console.warn = (...args) => {
  originalConsoleWarn(...args);
  sendLogToServer('WARN', args);
};
console.error = (...args) => {
  originalConsoleError(...args);
  sendLogToServer('ERROR', args);
};

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

const calendarStyleOptions = [
  { value: 'grid', label: 'Classic Grid' },
  { value: 'list', label: 'Schedule List (Modern)' }
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
  { value: 0.5, label: '0.5 seconds' },
  { value: 1.0, label: '1.0 second' },
  { value: 2.0, label: '2.0 seconds' },
  { value: 3.0, label: '3.0 seconds' },
  { value: 4.0, label: '4.0 seconds (Default)' },
  { value: 6.0, label: '6.0 seconds' },
  { value: 8.0, label: '8.0 seconds' }
];

const uiHideTimeoutOptions = [
  { value: 0.5, label: '0.5 seconds' },
  { value: 1, label: '1.0 second' },
  { value: 1.5, label: '1.5 seconds (Default)' },
  { value: 2, label: '2.0 seconds' },
  { value: 2.5, label: '2.5 seconds' },
  { value: 3, label: '3.0 seconds' },
  { value: 4, label: '4.0 seconds' },
  { value: 5, label: '5.0 seconds' }
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

const defaultSettings = {
  keybinds: {
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
  },
  defaultAudio: 'ENG',
  defaultSub: 'ENG',
  historyLimit: 10 as number | 'Infinite',
  historySaveInterval: 5 as number,
  theme: 'dark' as 'dark' | 'black-and-white' | 'light',
  hideUIOverlays: false,
  hideVideoName: false,
  uiHideTimeout: 1.5,
  toastDuration: 4.0,
  disableAnimations: false,
  pauseOnFocusChange: false,
  showPlayButton: true,
  showTimeDisplay: true,
  showPlayBar: true,
  showVolumeControl: true,
  showFullscreen: true,
  allowUiSkipping: true,
  blockSeekingCompletely: false,
  autoSkipIntroOutro: true,
  autoSkipSexScenes: true,
  lockModeActive: false,
  settingsOrder: [
    'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
    'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
  ] as string[],
  saveHistory: true,
  saveTrackPreferences: true,
  saveVolume: true,
  saveSettings: true,
  userId: 'local',
  profileName: 'Local Profile',
  storageMode: 'localstorage' as 'localstorage' | 'file',
  ratingThreshold: 3 as number,
  theIntroDbApiKey: '' as string,
  theIntroDbMode: 'fetch' as 'fetch' | 'send_fetch',
  getOverlayDataFromTmdb: true as boolean,
  tmdbApiKey: '' as string,
  experienceMode: 'cloud' as 'local' | 'cloud' | 'hybrid',
  overlayPosition: 'bottom-left' as 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right',
  overlayShowBackground: true as boolean,
  overlayShowRating: true as boolean,
  overlayShowOverview: true as boolean,
  openSubtitlesApiKey: '' as string,
  traktAccessToken: '' as string,
  traktRedirectUri: 'http://localhost:50000' as string,
  traktSyncHistory: true as boolean,
  traktSyncFavorites: true as boolean,
  calendarStyle: 'grid' as 'grid' | 'list',
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
  },
  customLoaderUrl: '' as string,
  customLoaderType: 'default' as 'default' | 'image' | 'video' | 'gif',
  spinnerPreset: 'fire-circle' as string
};

function App() {
  const [settings, setSettings] = useState<typeof defaultSettings>(() => {
    try {
      const activeUserId = localStorage.getItem('valor_active_user_id') || 'local';
      const settingsKey = activeUserId === 'local' ? 'valor_settings' : `valor_settings_${activeUserId}`;
      const saved = localStorage.getItem(settingsKey);
      
      const isLocal = activeUserId === 'local' || activeUserId.startsWith('local_');
      const baseSettings = {
        ...defaultSettings,
        userId: activeUserId,
        storageMode: isLocal ? ('localstorage' as const) : ('file' as const)
      };

      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            ...baseSettings,
            ...parsed,
            userId: activeUserId,
            storageMode: isLocal ? ('localstorage' as const) : ('file' as const),
            keybinds: {
              ...defaultSettings.keybinds,
              ...(parsed.keybinds && typeof parsed.keybinds === 'object' ? parsed.keybinds : {})
            },
            subSettings: {
              ...defaultSettings.subSettings,
              ...(parsed.subSettings && typeof parsed.subSettings === 'object' ? parsed.subSettings : {})
            }
          };
        }
      }
      return baseSettings;
    } catch (err) {
      return defaultSettings;
    }
  });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const getUseIdStreamFromStorage = (): boolean => {
    try {
      const activeUserId = localStorage.getItem('valor_active_user_id') || 'local';
      if (activeUserId === 'local' || activeUserId.startsWith('local_')) {
        return false;
      }
      const settingsKey = `valor_settings_${activeUserId}`;
      const saved = localStorage.getItem(settingsKey);
      if (saved) {
        const settingsObj = JSON.parse(saved);
        return settingsObj.storageMode === 'file';
      }
      return false;
    } catch {
      return false;
    }
  };

  const [videosState, rawSetVideos] = useState<VideoItem[]>(() => {
    try {
      const activeUserId = localStorage.getItem('valor_active_user_id') || 'local';
      const videosKey = activeUserId === 'local' ? 'valor_videos' : `valor_videos_${activeUserId}`;
      const saved = localStorage.getItem(videosKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const useIdStreamInit = getUseIdStreamFromStorage();
          return sanitizeVideoList(parsed.map((v: any) => ({
            ...v,
            audioTracks: [],
            subtitleTracks: []
          })), useIdStreamInit);
        }
      }
      return [];
    } catch (err) {
      console.error('Failed to parse saved videos:', err);
      return [];
    }
  });
  const [playingVideoState, rawSetPlayingVideo] = useState<VideoItem | null>(() => {
    try {
      const saved = localStorage.getItem('valor_currently_playing');
      const useIdStreamInit = getUseIdStreamFromStorage();
      return saved ? sanitizeVideoItem(JSON.parse(saved), useIdStreamInit) : null;
    } catch (err) {
      console.error('Failed to parse currently playing video:', err);
      return null;
    }
  });

  const [isPlaybackRestoring, setIsPlaybackRestoring] = useState(() => {
    try {
      return !!localStorage.getItem('valor_currently_playing');
    } catch {
      return false;
    }
  });

  const videos = videosState;
  const playingVideo = playingVideoState;

  const setVideos = useCallback((val: VideoItem[] | ((prev: VideoItem[]) => VideoItem[])) => {
    const useIdStream = settings.storageMode === 'file' && settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_');
    if (typeof val === 'function') {
      rawSetVideos(prev => sanitizeVideoList(val(prev), useIdStream));
    } else {
      rawSetVideos(sanitizeVideoList(val, useIdStream));
    }
  }, [settings.storageMode, settings.userId]);

  const setPlayingVideo = useCallback((val: VideoItem | null | ((prev: VideoItem | null) => VideoItem | null)) => {
    const useIdStream = settings.storageMode === 'file' && settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_');
    if (typeof val === 'function') {
      rawSetPlayingVideo(prev => {
        const res = val(prev);
        return res ? sanitizeVideoItem(res, useIdStream) : null;
      });
    } else {
      rawSetPlayingVideo(val ? sanitizeVideoItem(val, useIdStream) : null);
    }
  }, [settings.storageMode, settings.userId]);
  const [selectedDetailsMedia, setSelectedDetailsMedia] = useState<VideoItem | null>(null);
  const [selectedActor, setSelectedActor] = useState<{ id: number; name: string; profilePath?: string } | null>(null);
  const [historyViewMode, setHistoryViewMode] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'calendar' | 'library' | 'settings' | 'online' | 'vlr'>(() => {
    const saved = localStorage.getItem('valor_active_tab');
    return (saved as any) || 'home';
  });

  useEffect(() => {
    localStorage.setItem('valor_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (isPlaybackRestoring) return;
    if (playingVideo) {
      localStorage.setItem('valor_currently_playing', JSON.stringify(playingVideo));
    } else {
      localStorage.removeItem('valor_currently_playing');
    }
  }, [playingVideo, isPlaybackRestoring]);

  const [settingsTab, setSettingsTab] = useState<'general' | 'hotkeys' | 'subtitle' | 'storage' | 'gridOverlay' | 'api' | 'bookmarks' | 'loader'>('general');
  const [uiOverlaySection, setUiOverlaySection] = useState<'hotkeys' | 'gridOverlay' | 'pauseOverlay'>('hotkeys');
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [hoveredHotkey, setHoveredHotkey] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  const renderMockPreviewButton = (key: string) => {
    const iconSize = 14;
    const style = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '6px',
      height: '28px',
      fontSize: '0.75rem',
      cursor: 'default'
    };

    const value = (settings as any)[key];
    const isNegativeKey = key === 'hideUIOverlays' || key === 'hideVideoName';
    
    let mode = 'enable';
    if (isNegativeKey) {
      if (value === 'disable') mode = 'disable';
      else if (value === true) mode = 'hide';
      else mode = 'enable';
    } else {
      if (value === 'disable') mode = 'disable';
      else if (value === false) mode = 'hide';
      else mode = 'enable';
    }

    let bg = 'rgba(255,255,255,0.06)';
    let border = '1px solid rgba(255,255,255,0.1)';
    let color = 'rgba(255,255,255,0.8)';
    
    if (mode === 'enable') {
      bg = 'rgba(0, 122, 255, 0.15)';
      border = '1px solid rgba(0, 122, 255, 0.3)';
      color = '#007aff';
    } else if (mode === 'hide') {
      bg = 'rgba(255, 159, 10, 0.15)';
      border = '1px solid rgba(255, 159, 10, 0.3)';
      color = '#ff9f0a';
    } else if (mode === 'disable') {
      bg = 'rgba(255, 69, 58, 0.15)';
      border = '1px solid rgba(255, 69, 58, 0.3)';
      color = '#ff453a';
    }

    const mergedStyle = { ...style, background: bg, border: border, color: color };

    switch (key) {
      case 'hideUIOverlays': return <div key={key} style={mergedStyle}><Layers size={iconSize} /></div>;
      case 'hideVideoName': return <div key={key} style={mergedStyle}><Type size={iconSize} /></div>;
      case 'showPlayButton': return <div key={key} style={mergedStyle}><Play size={iconSize} /></div>;
      case 'showTimeDisplay': return <div key={key} style={mergedStyle}><Clock size={iconSize} /></div>;
      case 'showPlayBar': return <div key={key} style={mergedStyle}><Sliders size={iconSize} /></div>;
      case 'showVolumeControl': return <div key={key} style={mergedStyle}><Volume2 size={iconSize} /></div>;
      case 'showFullscreen': return <div key={key} style={mergedStyle}><Maximize size={iconSize} /></div>;
      case 'disableAnimations': return <div key={key} style={mergedStyle}><Zap size={iconSize} /></div>;
      case 'pauseOnFocusChange': return <div key={key} style={mergedStyle}><Coffee size={iconSize} /></div>;
      case 'allowUiSkipping': return <div key={key} style={mergedStyle}><SkipForward size={iconSize} /></div>;
      case 'blockSeekingCompletely': return <div key={key} style={mergedStyle}><Ban size={iconSize} /></div>;
      case 'autoSkipIntroOutro': return <div key={key} style={mergedStyle}><FastForward size={iconSize} /></div>;
      case 'lockModeActive': return <div key={key} style={mergedStyle}><Lock size={iconSize} /></div>;
      default: return null;
    }
  };

  if (false as boolean) {
    console.log(isProcessing, processingStep);
  }

  // Heartbeat to keep the server alive while the app is active and receive commands
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch(`${BACKEND_ORIGIN}/api/heartbeat`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.playFile) {
            const localStreamUrl = `${BACKEND_ORIGIN}/local-video-stream?path=${encodeURIComponent(data.playFile)}`;
            processRemoteUrl(localStreamUrl, true);
            // Update URL query parameters without reloading the page
            const newUrl = `${window.location.pathname}?file=${encodeURIComponent(data.playFile)}`;
            window.history.replaceState({}, '', newUrl);
          }
        }
      } catch (err) {
        // ignore fetch/parse errors
      }
    };
    ping();
    const interval = setInterval(ping, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fileParam = params.get('file');
    if (fileParam) {
      const localStreamUrl = `${BACKEND_ORIGIN}/local-video-stream?path=${encodeURIComponent(fileParam)}`;
      processRemoteUrl(localStreamUrl, true);
    }

    // Recovery of online details page
    const detId = params.get('details_id');
    const detTmdbId = params.get('details_tmdb_id');
    const detType = params.get('details_type');
    const detTitle = params.get('details_title');
    const detPoster = params.get('details_poster');
    if (detId && detType) {
      setSelectedDetailsMedia({
        id: detId,
        tmdbId: detTmdbId || undefined,
        type: detType as any,
        title: detTitle || '',
        poster_path: detPoster || '',
        backdrop_path: ''
      } as any);
      setActiveTab('online');
    }

    const traktCode = params.get('code');
    if (traktCode) {
      const exchangeTraktCode = async () => {
        try {
          let redirectUri = 'http://localhost:50000';
          try {
            const activeUserId = localStorage.getItem('valor_active_user_id') || 'local';
            const settingsKey = activeUserId === 'local' ? 'valor_settings' : `valor_settings_${activeUserId}`;
            const savedSettings = localStorage.getItem(settingsKey);
            if (savedSettings) {
              const parsed = JSON.parse(savedSettings);
              if (parsed.traktRedirectUri) {
                redirectUri = parsed.traktRedirectUri;
              }
            }
          } catch {}

          let accessToken = null;

          // 1. Try Backend API exchange endpoint
          try {
            const res = await fetch(`${BACKEND_ORIGIN}/api/trakt/exchange`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: traktCode,
                redirect_uri: redirectUri
              })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.access_token) accessToken = data.access_token;
            }
          } catch (e) {
            console.warn('Backend Trakt exchange failed, trying client fallback');
          }

          // 2. Client-side direct Trakt token exchange fallback
          if (!accessToken) {
            const traktRes = await fetch('https://api.trakt.tv/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: traktCode,
                client_id: 'f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289',
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
              })
            });
            if (traktRes.ok) {
              const data = await traktRes.json();
              if (data.access_token) accessToken = data.access_token;
            }
          }

          if (accessToken) {
            setSettings(prev => {
              const updated = {
                ...prev,
                traktAccessToken: accessToken
              };
              saveSettingsToStorage(updated);
              return updated;
            });
            addToast('Successfully connected to Trakt.tv!', 'success');
          } else {
            throw new Error('Failed to exchange code for access token');
          }
        } catch (err) {
          console.error('Error exchanging Trakt auth code:', err);
          addToast('Failed to connect to Trakt.tv.', 'error');
        } finally {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      };
      exchangeTraktCode();
    }
  }, []);

  // Synchronize selectedDetailsMedia with URL search parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedDetailsMedia) {
      params.set('details_id', selectedDetailsMedia.id);
      if (selectedDetailsMedia.tmdbId) {
        params.set('details_tmdb_id', selectedDetailsMedia.tmdbId);
      } else {
        params.delete('details_tmdb_id');
      }
      params.set('details_type', selectedDetailsMedia.type);
      params.set('details_title', selectedDetailsMedia.title);
      if (selectedDetailsMedia.poster_path) {
        params.set('details_poster', selectedDetailsMedia.poster_path);
      } else {
        params.delete('details_poster');
      }
      window.history.replaceState({}, document.title, `?${params.toString()}`);
    } else if (!playingVideo) {
      params.delete('details_id');
      params.delete('details_tmdb_id');
      params.delete('details_type');
      params.delete('details_title');
      params.delete('details_poster');
      const qs = params.toString();
      window.history.replaceState({}, document.title, qs ? `?${qs}` : window.location.pathname);
    }
  }, [selectedDetailsMedia, playingVideo]);

  useEffect(() => {
    const initData = async () => {
      let loadedSettings = defaultSettings;
      let settingsLoaded = false;
      let loadedVideos: VideoItem[] = [];
      let historyLoaded = false;

      let activeUserId = localStorage.getItem('valor_active_user_id') || 'local';
      if (activeUserId === 'local') {
        const newUserId = 'local_' + Math.random().toString(36).substring(2, 11);
        const oldSettings = localStorage.getItem('valor_settings');
        if (oldSettings) {
          localStorage.setItem(`valor_settings_${newUserId}`, oldSettings);
          localStorage.removeItem('valor_settings');
        }
        const oldVideos = localStorage.getItem('valor_videos');
        if (oldVideos) {
          localStorage.setItem(`valor_videos_${newUserId}`, oldVideos);
          localStorage.removeItem('valor_videos');
        }
        activeUserId = newUserId;
        localStorage.setItem('valor_active_user_id', activeUserId);
      }

      console.log('[VALOR INITIALIZATION] Starting setup. activeUserId in localStorage:', activeUserId);

      // 0. If using local browser profile, load it immediately and do not let server override it
      if (activeUserId === 'local' || activeUserId.startsWith('local_')) {
        const settingsKey = activeUserId === 'local' ? 'valor_settings' : `valor_settings_${activeUserId}`;
        const saved = localStorage.getItem(settingsKey);
        console.log('[VALOR INITIALIZATION] Loading local profile settings. settingsKey:', settingsKey, 'savedContentLength:', saved ? saved.length : 0);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            loadedSettings = {
              ...defaultSettings,
              ...parsed,
              userId: activeUserId,
              storageMode: 'localstorage',
              keybinds: { ...defaultSettings.keybinds, ...(parsed.keybinds || {}) },
              subSettings: { ...defaultSettings.subSettings, ...(parsed.subSettings || {}) }
            };
            setSettings(loadedSettings);
          } catch {
            loadedSettings = {
              ...defaultSettings,
              userId: activeUserId,
              storageMode: 'localstorage'
            };
            setSettings(loadedSettings);
          }
        } else {
          loadedSettings = {
            ...defaultSettings,
            userId: activeUserId,
            storageMode: 'localstorage'
          };
          setSettings(loadedSettings);
        }
        settingsLoaded = true;
        
        const videosKey = activeUserId === 'local' ? 'valor_videos' : `valor_videos_${activeUserId}`;
        const savedVideos = localStorage.getItem(videosKey);
        console.log('[VALOR INITIALIZATION] Loading local profile videos. videosKey:', videosKey, 'savedVideosContentLength:', savedVideos ? savedVideos.length : 0);
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
              historyLoaded = true;
            }
          } catch {}
        }
      }

      // 1. If we have a saved active SQLite profile ID, try to load it first
      if (activeUserId && activeUserId !== 'local' && !activeUserId.startsWith('local_')) {
        try {
          const pData = await gqlFetch(`
            query GetProfileData($userId: String!) {
              profile(userId: $userId) {
                settings
                history
              }
            }
          `, { userId: activeUserId });
          const profileData = pData.profile || {};
          if (profileData && profileData.settings) {
            loadedSettings = {
              ...defaultSettings,
              ...profileData.settings,
              userId: activeUserId,
              storageMode: 'file',
              keybinds: { ...defaultSettings.keybinds, ...(profileData.settings.keybinds || {}) },
              subSettings: { ...defaultSettings.subSettings, ...(profileData.settings.subSettings || {}) }
            };
            setSettings(loadedSettings);
            settingsLoaded = true;
          }
          if (profileData && Array.isArray(profileData.history)) {
            loadedVideos = profileData.history.map((v: any) => ({
              ...v,
              audioTracks: v.audioTracks || [],
              subtitleTracks: v.subtitleTracks || []
            }));
            setVideos(loadedVideos);
            historyLoaded = true;
          }
        } catch (e) {
          console.warn('Failed to load profile data from saved local user ID');
        }
      }

      // 2. Fetch server settings to check if server-wide storage is active
      if (!settingsLoaded) {
        try {
          const res = await secureFetch(`${BACKEND_ORIGIN}/api/settings`);
          const serverSettings = await res.json();
          
          if (serverSettings && Object.keys(serverSettings).length > 0) {
            const serverActiveUserId = serverSettings.activeUserId;
            const serverActiveUsername = serverSettings.activeUsername;

            if (serverActiveUserId && serverActiveUserId !== 'local') {
              localStorage.setItem('valor_active_user_id', serverActiveUserId);
              if (serverActiveUsername) {
                localStorage.setItem('valor_logged_in_username', serverActiveUsername);
              }

              // Now fetch the profile data for this serverActiveUserId!
              const pData = await gqlFetch(`
                query GetProfileData($userId: String!) {
                  profile(userId: $userId) {
                    settings
                    history
                  }
                }
              `, { userId: serverActiveUserId });
              const profileData = pData.profile || {};
              if (profileData && profileData.settings) {
                loadedSettings = {
                  ...defaultSettings,
                  ...profileData.settings,
                  userId: serverActiveUserId,
                  storageMode: 'file',
                  keybinds: { ...defaultSettings.keybinds, ...(profileData.settings.keybinds || {}) },
                  subSettings: { ...defaultSettings.subSettings, ...(profileData.settings.subSettings || {}) }
                };
                setSettings(loadedSettings);
                settingsLoaded = true;
              }
              if (profileData && Array.isArray(profileData.history)) {
                loadedVideos = profileData.history.map((v: any) => ({
                  ...v,
                  audioTracks: v.audioTracks || [],
                  subtitleTracks: v.subtitleTracks || []
                }));
                setVideos(loadedVideos);
                historyLoaded = true;
              }
            } else {
              const storageMode = serverSettings.storageMode || 'localstorage';
              const userId = serverSettings.userId;

              if (storageMode === 'file') {
                if (userId && userId !== 'local' && !userId.startsWith('local_')) {
                  // This is a SQLite user! Fetch their profile data.
                  localStorage.setItem('valor_active_user_id', userId);
                  const pData = await gqlFetch(`
                    query GetProfileData($userId: String!) {
                      profile(userId: $userId) {
                        settings
                        history
                      }
                    }
                  `, { userId });
                  const profileData = pData.profile || {};
                  if (profileData && profileData.settings) {
                    loadedSettings = {
                      ...defaultSettings,
                      ...profileData.settings,
                      userId: userId,
                      storageMode: 'file',
                      keybinds: { ...defaultSettings.keybinds, ...(profileData.settings.keybinds || {}) },
                      subSettings: { ...defaultSettings.subSettings, ...(profileData.settings.subSettings || {}) }
                    };
                    setSettings(loadedSettings);
                    settingsLoaded = true;
                  }
                  if (profileData && Array.isArray(profileData.history)) {
                    loadedVideos = profileData.history.map((v: any) => ({
                      ...v,
                      audioTracks: v.audioTracks || [],
                      subtitleTracks: v.subtitleTracks || []
                    }));
                    setVideos(loadedVideos);
                    historyLoaded = true;
                  }
                } else {
                  // Legacy "Server File" user without a SQLite profile.
                  // Load the server file settings and history directly.
                  loadedSettings = {
                    ...defaultSettings,
                    ...serverSettings,
                    userId: 'local',
                    storageMode: 'file',
                    keybinds: { ...defaultSettings.keybinds, ...(serverSettings.keybinds || {}) },
                    subSettings: { ...defaultSettings.subSettings, ...(serverSettings.subSettings || {}) }
                  };
                  setSettings(loadedSettings);
                  settingsLoaded = true;

                  try {
                    const historyRes = await secureFetch(`${BACKEND_ORIGIN}/api/history`);
                    const fileHistory = await historyRes.json();
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
                    console.warn('Failed to load history from legacy server file');
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('Failed to fetch server settings on startup');
        }
      }

      // 3. Fallback to localStorage if still not loaded
      if (!settingsLoaded) {
        const settingsKey = activeUserId === 'local' ? 'valor_settings' : `valor_settings_${activeUserId}`;
        const saved = localStorage.getItem(settingsKey);
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

      // 4. Load history from localStorage if history not loaded
      if (!historyLoaded) {
        const videosKey = activeUserId === 'local' ? 'valor_videos' : `valor_videos_${activeUserId}`;
        const savedVideos = localStorage.getItem(videosKey);
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

  const isInstantlyPlayable = (video: VideoItem): boolean => {
    if (video.type === 'local') return true;
    if (video.type === 'url') return true;
    if (video.type === 'online_movie' || video.type === 'online_tv' || video.type === 'online_anime') return true;
    if (video.localFilePath) return true;
    if ((video as any).hasHandle) return true;
    if (video.file) {
      try {
        video.file.slice(0, 1);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  };

  const parseDurationToSeconds = (duration: string | number | undefined): number => {
    if (duration === undefined || duration === null) return 0;
    if (typeof duration === 'number') return duration;
    const clean = String(duration).trim();
    if (!clean || clean.toLowerCase() === 'unknown') return 0;
    if (!isNaN(Number(clean))) {
      return Number(clean);
    }
    const parts = clean.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const getVideoIdentity = (title: string): string => {
    const info = classifyVideoTitle(title);
    if (info.type === 'series' && info.season !== undefined && info.episode !== undefined) {
      const cleanSeries = info.seriesTitle ? info.seriesTitle.toLowerCase().trim() : info.displayTitle.toLowerCase().trim();
      return `series:${cleanSeries}:s${info.season.toString().padStart(2, '0')}e${info.episode.toString().padStart(2, '0')}`;
    }
    return `movie:${info.displayTitle.toLowerCase().trim()}`;
  };

  const mergeOrAddVideo = (prev: VideoItem[], newItem: VideoItem): VideoItem[] => {
    const newIdentity = getVideoIdentity(newItem.title);
    const existingIndex = prev.findIndex(v => getVideoIdentity(v.title) === newIdentity);
    const nowIso = new Date().toISOString();

    if (existingIndex !== -1) {
      const existing = prev[existingIndex];
      const merged: VideoItem = {
        ...existing,
        ...newItem,
        id: existing.id,
        currentTime: existing.currentTime || newItem.currentTime || 0,
        lastPlayedDate: nowIso,
        playedDates: Array.from(new Set([...(existing.playedDates || []), nowIso])),
        rating: existing.rating || newItem.rating,
        totalTimeWatched: existing.totalTimeWatched || newItem.totalTimeWatched || 0,
        timeToFinish: existing.timeToFinish || newItem.timeToFinish
      };
      
      const filtered = prev.filter((_, idx) => idx !== existingIndex);
      return [merged, ...filtered];
    } else {
      const initItem = {
        ...newItem,
        lastPlayedDate: nowIso,
        playedDates: [nowIso]
      };
      const filtered = prev.filter(v => v.url !== newItem.url);
      return [initItem, ...filtered];
    }
  };

  // Selector Form states
  const [isDragActive, setIsDragActive] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyVideoInputRef = useRef<HTMLInputElement>(null);
  const pendingLocalReassociateIdRef = useRef<string | null>(null);
  const isPickerOpenRef = useRef(false);
  const lastHistorySyncTimeRef = useRef<number>(0);
  const historySyncTimeoutRef = useRef<any>(null);
  const saveTimeoutRef = useRef<any>(null);
  const loadedVideosUserIdRef = useRef<string | null>(localStorage.getItem('valor_active_user_id') || 'local');


  const [listeningKeyFor, setListeningKeyFor] = useState<keyof typeof defaultSettings.keybinds | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
  
  // Toast notifications state
  const [toasts, setToasts] = useState<{ 
    id: string; 
    title: string; 
    text: string; 
    type: 'success' | 'error' | 'warning'; 
    duration: number; 
    timeLeft: number; 
    isPaused: boolean 
  }[]>([]);
  
  const addToast = useCallback((text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    const title = type === 'success' ? 'Changes saved' : type === 'error' ? 'Error' : 'Warning';
    const durationMs = (settingsRef.current.toastDuration || 4.0) * 1000;
    setToasts(prev => [...prev, { 
      id, 
      title, 
      text, 
      type, 
      duration: durationMs, 
      timeLeft: durationMs, 
      isPaused: false 
    }]);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setToasts(prev => {
        let hasChanges = false;
        const next = prev.map(t => {
          if (t.isPaused) return t;
          hasChanges = true;
          return { ...t, timeLeft: Math.max(0, t.timeLeft - 100) };
        }).filter(t => t.timeLeft > 0);
        return hasChanges ? next : prev;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const showProfileStatus = useCallback((text: string, type: 'success' | 'error' | 'warning') => {
    addToast(text, type);
  }, [addToast]);

  // Auth (Login / Signup) modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [authName, setAuthName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [selectedProfileForLogin, setSelectedProfileForLogin] = useState<any | null>(null);
  const [onAuthSuccess, setOnAuthSuccess] = useState<((userId: string) => void) | null>(null);

  // Delete profile modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteTargetProfile, setDeleteTargetProfile] = useState<any | null>(null);

  // Direct Profile Creation Modal (directly in settings, bypassing onboarding)
  const [isCreateProfileModalOpen, setIsCreateProfileModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfilePassword, setNewProfilePassword] = useState('');
  const [createProfileError, setCreateProfileError] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Remove profile (hide from switcher) state
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [removeTargetProfile, setRemoveTargetProfile] = useState<any | null>(null);
  const [removePasswordText, setRemovePasswordText] = useState('');
  const [removeError, setRemoveError] = useState('');

  // Rewatch Confirmation Modal state
  const [isRewatchModalOpen, setIsRewatchModalOpen] = useState(false);
  const [rewatchVideoTarget, setRewatchVideoTarget] = useState<VideoItem | null>(null);
  const [hiddenProfileIds, setHiddenProfileIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('valor_hidden_profile_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const openAuthModal = (tab: 'login' | 'signup', targetProfile?: any, onSuccess?: (userId: string) => void) => {
    setAuthModalTab(tab);
    setSelectedProfileForLogin(targetProfile || null);
    setAuthError('');
    setOnAuthSuccess(() => onSuccess || null);
    setIsAuthModalOpen(true);
  };

  const secureFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const ipBlockedUntil = localStorage.getItem('valor_ip_blocked_until');
    const accountLockedUntil = localStorage.getItem('valor_account_locked_until');
    const now = Date.now();
    
    if (ipBlockedUntil && new Date(ipBlockedUntil).getTime() > now) {
      const msg = `IP blocked until ${new Date(ipBlockedUntil).toLocaleString()}`;
      showProfileStatus(msg, 'error');
      throw new Error(msg);
    }
    
    if (accountLockedUntil && new Date(accountLockedUntil).getTime() > now) {
      const msg = `Account locked until ${new Date(accountLockedUntil).toLocaleString()}`;
      showProfileStatus(msg, 'error');
      throw new Error(msg);
    }
    
    const response = await fetch(input, init);
    
    if (response.status === 403) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data.blockedUntil) {
          localStorage.setItem('valor_ip_blocked_until', data.blockedUntil);
          showProfileStatus(`IP blocked until ${new Date(data.blockedUntil).toLocaleString()}`, 'error');
        }
        if (data.lockedUntil) {
          localStorage.setItem('valor_account_locked_until', data.lockedUntil);
          showProfileStatus(`Account locked until ${new Date(data.lockedUntil).toLocaleString()}`, 'error');
        }
      } catch (e) {}
    }
    
    return response;
  }, [showProfileStatus]);

  const gqlFetch = useCallback(async (query: string, variables: any = {}) => {
    try {
      const response = await secureFetch(`${BACKEND_ORIGIN}/api/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      return result.data;
    } catch (err: any) {
      console.error('GraphQL Fetch Error:', err.message);
      throw err;
    }
  }, [secureFetch]);

  const fetchProfiles = async () => {
    try {
      const loggedInUsername = localStorage.getItem('valor_logged_in_username') || undefined;
      const data = await gqlFetch(`
        query GetProfiles($username: String) {
          profiles(username: $username) {
            userId
            name
            username
            hasPassword
            createdAt
          }
        }
      `, { username: loggedInUsername });
      const serverList = data.profiles || [];
      
      // Load local profiles list from localStorage
      let localProfiles = [];
      try {
        const localSaved = localStorage.getItem('valor_local_profiles');
        if (localSaved) {
          localProfiles = JSON.parse(localSaved);
        }
      } catch {}
      
      const combined = [...localProfiles, ...serverList];
      setAvailableProfiles(combined);
      
      // Auto-select if there is exactly 1 profile on the server and no profile is currently active
      const activeUserId = localStorage.getItem('valor_active_user_id') || 'local';
      if (combined.length === 1 && activeUserId === 'local') {
        const singleProfile = combined[0];
        localStorage.setItem('valor_active_user_id', singleProfile.userId);
        
        try {
          // If the single profile is server profile, load via GraphQL
          if (singleProfile.userId !== 'local' && !singleProfile.userId.startsWith('local_')) {
            const pData = await gqlFetch(`
              query GetProfileData($userId: String!) {
                profile(userId: $userId) {
                  settings
                  history
                }
              }
            `, { userId: singleProfile.userId });
            const profileData = pData.profile || {};
            
            setSettings(() => {
              const updated = {
                ...defaultSettings,
                ...(profileData.settings || {}),
                userId: singleProfile.userId,
                storageMode: 'file',
                isOnboarded: true
              };
              saveSettingsToStorage(updated);
              return updated;
            });
            
            if (profileData && Array.isArray(profileData.history)) {
              setVideos(profileData.history.map((v: any) => ({
                ...v,
                audioTracks: v.audioTracks || [],
                subtitleTracks: v.subtitleTracks || []
              })));
            }
            
            showProfileStatus(`Auto-selected server profile: ${singleProfile.name}`, 'success');
          } else {
            // Local profile auto-selection
            const settingsKey = singleProfile.userId === 'local' ? 'valor_settings' : `valor_settings_${singleProfile.userId}`;
            const videosKey = singleProfile.userId === 'local' ? 'valor_videos' : `valor_videos_${singleProfile.userId}`;
            
            const saved = localStorage.getItem(settingsKey);
            if (saved) {
              setSettings({ ...defaultSettings, ...JSON.parse(saved), userId: singleProfile.userId, storageMode: 'localstorage', isOnboarded: true });
            }
            const savedVideos = localStorage.getItem(videosKey);
            if (savedVideos) {
              setVideos(JSON.parse(savedVideos));
            }
            showProfileStatus(`Auto-selected local profile: ${singleProfile.name}`, 'success');
          }
        } catch (e) {
          console.warn('Failed to auto-select single profile data:', e);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch profiles:', e);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings.theme]);

  const storageProvider = useMemo(() => {
    if (settings.storageMode === 'file' && settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) {
      return new GraphQLStorageProvider(settings.userId, gqlFetch);
    }
    return new LocalIndexedDBProvider();
  }, [settings.storageMode, settings.userId, gqlFetch]);

  useEffect(() => {
    let active = true;
    const loadFromProvider = async () => {
      try {
        console.log('[StorageProvider] Loading settings and history from provider for userId:', settings.userId);
        
        // 1. Load latest settings
        const loadedSettings = await storageProvider.getSettings(defaultSettings);
        if (active && loadedSettings) {
          setSettings(prev => ({
            ...prev,
            ...loadedSettings
          }));
        }

        // 2. Load latest history
        const loadedHistory = await storageProvider.getHistory();
        if (active && loadedHistory) {
          setVideos(loadedHistory);
          loadedVideosUserIdRef.current = settings.userId;

          // 3. Recover currently playing video with full path and metadata
          const currentlyPlaying = localStorage.getItem('valor_currently_playing');
          if (currentlyPlaying) {
            try {
              let videoObj = JSON.parse(currentlyPlaying) as VideoItem;
              
              // Try to find a match in the loaded history
              const matched = loadedHistory.find(h => h.id === videoObj.id || h.title === videoObj.title);
              if (matched) {
                const useIdStream = (loadedSettings?.storageMode === 'file' || settings.storageMode === 'file');
                const merged = {
                  ...videoObj,
                  ...matched,
                  file: videoObj.file || matched.file,
                  currentTime: videoObj.currentTime !== undefined ? videoObj.currentTime : matched.currentTime
                };
                videoObj = sanitizeVideoItem(merged, useIdStream);
              }
              
              // If it's a local file and still using a blob URL (no localFilePath), try to recover from IndexedDB handle
              let hasHandle = false;
              if (videoObj.type === 'local' && !videoObj.localFilePath && (!videoObj.url || videoObj.url.startsWith('blob:'))) {
                const handle = await getFileHandle(videoObj.id);
                if (handle) {
                  hasHandle = true;
                  const options = { mode: 'read' as const };
                  try {
                    if ((await (handle as any).queryPermission(options)) === 'granted') {
                      const file = await handle.getFile();
                      const newBlobUrl = URL.createObjectURL(file);
                      videoObj = {
                        ...videoObj,
                        file,
                        url: newBlobUrl
                      };
                      console.log('[Recovery] Successfully programmatically recovered local file handle and generated new blob URL.');
                    }
                  } catch (e) {
                    console.error('[Recovery] Failed to query permission on load:', e);
                  }
                }
              }
              
              if (active) {
                rawSetPlayingVideo(current => {
                  const isFileObj = (obj: any): obj is File => obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
                  if (current && (isFileObj(current.file) || current.url !== videoObj.url)) {
                    return current;
                  }
                  if (videoObj.type === 'local' && !videoObj.localFilePath && (!isFileObj(videoObj.file) || !videoObj.url || videoObj.url.startsWith('blob:'))) {
                    if (hasHandle) {
                      console.log('[Recovery] Local video has a saved handle. Retaining playingVideo for deferred permission grant.');
                      return {
                        ...videoObj,
                        hasHandle: true
                      };
                    }
                    console.warn('[Recovery] Local video is unplayable (dead blob and no file handle). Clearing playingVideo.');
                    localStorage.removeItem('valor_currently_playing');
                    return null;
                  }
                  return videoObj;
                });
              }
            } catch (err) {
              console.error('[Recovery] Failed to restore playing video:', err);
            }
          }
        }
      } catch (err) {
        console.error('[StorageProvider] Failed to load data:', err);
      } finally {
        if (active) {
          setIsPlaybackRestoring(false);
        }
      }
    };

    loadFromProvider();

    return () => {
      active = false;
    };
  }, [storageProvider]);

  const saveSettingsToStorage = async (state: typeof defaultSettings) => {
    const settingsKey = state.userId === 'local' || !state.userId ? 'valor_settings' : `valor_settings_${state.userId}`;

    if (!state.saveSettings) {
      localStorage.removeItem(settingsKey);
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

    await storageProvider.saveSettings(stateToSave);
  };

  const handleExportData = () => {
    let csvContent = 'DataType,RecordId,Property,Value,ExtraDetails\n';

    Object.entries(settings).forEach(([key, val]) => {
      if (typeof val === 'object' && val !== null) {
        Object.entries(val).forEach(([subKey, subVal]) => {
          csvContent += `Setting,${key}.${subKey},value,"${String(subVal).replace(/"/g, '""')}",\n`;
        });
      } else {
        csvContent += `Setting,${key},value,"${String(val).replace(/"/g, '""')}",\n`;
      }
    });

    videos.forEach(v => {
      csvContent += `History,${v.id},title,"${(v.title || '').replace(/"/g, '""')}",\n`;
      csvContent += `History,${v.id},url,"${(v.url || '').replace(/"/g, '""')}",\n`;
      csvContent += `History,${v.id},type,"${(v.type || '').replace(/"/g, '""')}",\n`;
      csvContent += `History,${v.id},fileName,"${(v.fileName || '').replace(/"/g, '""')}",\n`;
      csvContent += `History,${v.id},duration,"${v.duration || ''}",\n`;
      csvContent += `History,${v.id},currentTime,"${v.currentTime || ''}",\n`;
      csvContent += `History,${v.id},lastPlayedDate,"${v.lastPlayedDate || ''}",\n`;
      csvContent += `History,${v.id},totalTimeWatched,"${(v as any).totalTimeWatched || ''}",\n`;
      csvContent += `History,${v.id},rating,"${(v as any).rating || ''}",\n`;
      csvContent += `History,${v.id},timeToFinish,"${(v as any).timeToFinish || ''}",\n`;
      csvContent += `History,${v.id},localFilePath,"${((v as any).localFilePath || '').replace(/"/g, '""')}",\n`;
      csvContent += `History,${v.id},playedDates,"${(JSON.stringify((v as any).playedDates || [])).replace(/"/g, '""')}",\n`;

      if (v.bookmarks && Array.isArray(v.bookmarks)) {
        v.bookmarks.forEach(bm => {
          csvContent += `Bookmark,${v.id},bookmarkId,"${bm.id}","Time: ${bm.time} | EndTime: ${bm.endTime || ''} | Label: ${(bm.label || '').replace(/"/g, '""')} | Intro: ${bm.isIntro || false} | Outro: ${bm.isOutro || false} | Skip: ${bm.skipEnabled || false}"\n`;
        });
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `valor_export_${settings.userId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addToast('Data successfully exported to CSV!', 'success');
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

    const handleMouseBind = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      let pressedKey = '';
      if (e.button === 0) pressedKey = 'leftclick';
      else if (e.button === 1) pressedKey = 'middleclick';
      else if (e.button === 2) pressedKey = 'rightclick';
      else return;

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

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyBind);
    window.addEventListener('mousedown', handleMouseBind);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyBind);
      window.removeEventListener('mousedown', handleMouseBind);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
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

  // Global keybind for 'm' to play last played media when player is closed
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is typing in inputs or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (!playingVideo) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === 's') {
          e.preventDefault();
          setActiveTab('settings');
        } else if (keyLower === 'd') {
          e.preventDefault();
          setActiveTab('history');
        } else if (keyLower === 'w') {
          e.preventDefault();
          setActiveTab('library');
        } else if (keyLower === 'a') {
          e.preventDefault();
          setActiveTab('calendar');
        } else if (keyLower === 'f') {
          e.preventDefault();
          setActiveTab('home');
          handleSelectLocalFile();
        } else if (keyLower === 'm') {
          e.preventDefault();
          // Find last played video in history
          const lastPlayed = [...videos]
            .filter(v => v.lastPlayedDate)
            .sort((a, b) => new Date(b.lastPlayedDate!).getTime() - new Date(a.lastPlayedDate!).getTime())[0];

          if (lastPlayed) {
            handlePlayVideo(lastPlayed);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [playingVideo, videos]);

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

  const saveVideosToStorage = (videoList: VideoItem[], forceSync = false) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const performSave = async () => {
      try {
        const videosKey = settings.userId === 'local' || !settings.userId ? 'valor_videos' : `valor_videos_${settings.userId}`;
        console.log('[VALOR HISTORY SAVE] saveVideosToStorage called. videosKey:', videosKey, 'videosLength:', videoList.length, 'saveHistorySetting:', settings.saveHistory, 'loadedVideosUserId:', loadedVideosUserIdRef.current, 'activeSettingsUserId:', settings.userId);
        if (loadedVideosUserIdRef.current !== settings.userId) {
          console.log('[VALOR HISTORY SAVE] Aborting save. loadedVideosUserIdRef:', loadedVideosUserIdRef.current, 'does not match active settings.userId:', settings.userId);
          return;
        }
        if (!settings.saveHistory) {
          localStorage.removeItem(videosKey);
          localStorage.removeItem('valor_last_playing_id');
          return;
        }

        const limit = settings.historyLimit;
        let targetVideos = videoList;
        if (limit !== 'Infinite' && typeof limit === 'number') {
          targetVideos = videoList.slice(0, limit);
        }

        await storageProvider.saveHistory(targetVideos, forceSync);

        // Clean up unneeded or bloated file handles/blobs from IndexedDB
        const activeIds = targetVideos.map(v => v.id);
        cleanupFileHandles(activeIds).catch(err => console.warn('[IndexedDB Cleanup] Failed:', err));

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
          currentTime: v.currentTime || 0,
          lastPlayedDate: v.lastPlayedDate,
          totalTimeWatched: (v as any).totalTimeWatched,
          rating: (v as any).rating,
          timeToFinish: (v as any).timeToFinish,
          localFilePath: v.localFilePath,
          playedDates: v.playedDates,
          bookmarks: v.bookmarks || [],
          tmdbId: v.tmdbId,
          hasScrobbledTrakt: v.hasScrobbledTrakt
        }));

        try {
          localStorage.setItem(videosKey, JSON.stringify(serialized));
        } catch (err: any) {
          if (err.name === 'QuotaExceededError' || err.code === 22) {
            console.warn('LocalStorage quota exceeded. Evicting older video history...');
            let currentList = [...serialized];
            while (currentList.length > 1) {
              currentList.pop();
              try {
                localStorage.setItem(videosKey, JSON.stringify(currentList));
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
    };

    if (forceSync) {
      performSave();
    } else {
      saveTimeoutRef.current = setTimeout(performSave, 500);
    }
  };

  useEffect(() => {
    saveVideosToStorage(videos, false);
  }, [videos, settings.historyLimit]);

  useEffect(() => {
    // Check if the playingVideo is unplayable (dead local blob URL with no File object)
    const isFileObj = (obj: any): obj is File => obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
    const isPlayable = playingVideo && (
      playingVideo.type !== 'local' || 
      playingVideo.localFilePath || 
      isFileObj(playingVideo.file) || 
      (playingVideo as any).hasHandle || 
      (playingVideo.url && !playingVideo.url.startsWith('blob:'))
    );

    if (playingVideo && !isPlaybackRestoring && !isPlayable) {
      const triggerReassociate = async () => {
        pendingLocalReassociateIdRef.current = playingVideo.id;
        
        // 1. Try restoring from IndexedDB handle first (silently if permission is already granted)
        try {
          const handle = await getFileHandle(playingVideo.id);
          if (handle) {
            const options = { mode: 'read' as const };
            if ((await (handle as any).queryPermission(options)) === 'granted') {
              const file = await handle.getFile();
              await processLocalVideo(file, playingVideo.id, handle);
              return;
            } else {
              // Permission is 'prompt'. Eager automatic permission request is not allowed by browser security.
              // We return early and let user-initiated interaction (like clicking play) trigger the permission prompt.
              console.log('[Recovery] Found IndexedDB handle on startup but permission is prompt. Waiting for user interaction.');
              return;
            }
          }
        } catch (err) {
          console.error('[Recovery] Failed during startup IndexedDB handle check:', err);
        }

        // 2. Otherwise fallback to file picker
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
            await processLocalVideo(file, playingVideo.id, handle);
          } catch (err) {
            console.error('Auto re-association cancelled:', err);
            setPlayingVideo(null);
          }
        } else {
          historyVideoInputRef.current?.click();
        }
      };
      triggerReassociate();
    }
  }, [playingVideo, isPlaybackRestoring]);

  useEffect(() => {
    // Sync the loaded history user ID reference when the videos list changes
    loadedVideosUserIdRef.current = settings.userId;
  }, [videos]);

  const handleUpdateVideo = (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting = false, targetVideoId?: string, forceSave = false) => {
    setVideos((prev) => {
      let targetVideo: VideoItem | null = null;
      if (typeof updatedVideoOrUpdater !== 'function') {
        targetVideo = updatedVideoOrUpdater;
      } else {
        const activePlaying = targetVideoId ? { id: targetVideoId } : playingVideo;
        if (activePlaying) {
          const current = prev.find(v => v.id === activePlaying.id);
          if (current) {
            targetVideo = (updatedVideoOrUpdater as Function)(current);
          }
        }
      }

      let nextVideos: VideoItem[];
      if (!targetVideo) {
        nextVideos = prev.map((v) => {
          const isTarget = typeof updatedVideoOrUpdater === 'function'
            ? ((targetVideoId ? v.id === targetVideoId : playingVideo && v.id === playingVideo.id))
            : v.id === updatedVideoOrUpdater.id;
          if (isTarget) {
            const updatedItem = typeof updatedVideoOrUpdater === 'function' ? (updatedVideoOrUpdater as Function)(v) : updatedVideoOrUpdater;
            return {
              ...updatedItem,
              lastPlayedDate: new Date().toISOString()
            };
          }
          return v;
        });
      } else {
        const seriesInfo = targetVideo.title ? classifyVideoTitle(targetVideo.title) : null;
        const isSeries = seriesInfo && seriesInfo.type === 'series';
        const seriesTitle = isSeries ? seriesInfo.seriesTitle : undefined;
        const targetBookmarks = targetVideo.bookmarks || [];

        nextVideos = prev.map((v) => {
          const isTarget = v.id === targetVideo!.id;
          if (isTarget) {
            return {
              ...targetVideo!,
              lastPlayedDate: new Date().toISOString()
            };
          }

          if (seriesTitle && v.title) {
            const otherSeriesInfo = classifyVideoTitle(v.title);
            if (otherSeriesInfo.type === 'series' && otherSeriesInfo.seriesTitle === seriesTitle) {
              const otherBookmarks = v.bookmarks || [];
              let updatedOtherBookmarks = [...otherBookmarks];

              if (targetBookmarks.length > 0) {
                targetBookmarks.forEach((tb) => {
                  const isIntro = tb.isIntro || tb.category === 'Intro';
                  const isOutro = tb.isOutro || tb.category === 'Outro';
                  
                  if (isIntro) {
                    updatedOtherBookmarks = updatedOtherBookmarks.filter((b) => !b.isIntro && b.category !== 'Intro');
                  } else if (isOutro) {
                    updatedOtherBookmarks = updatedOtherBookmarks.filter((b) => !b.isOutro && b.category !== 'Outro');
                  } else if (tb.label) {
                    updatedOtherBookmarks = updatedOtherBookmarks.filter((b) => b.label !== tb.label);
                  }

                  updatedOtherBookmarks.push({
                    ...tb,
                    id: `bm-${tb.isIntro ? 'intro' : tb.isOutro ? 'outro' : tb.id || Date.now()}-${v.id}`
                  });
                });
              }

              return {
                ...v,
                bookmarks: updatedOtherBookmarks.sort((a, b) => a.time - b.time)
              };
            }
          }

          return v;
        });
      }

      saveVideosToStorage(nextVideos, isExiting || forceSave);
      return nextVideos;
    });
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
              await processLocalVideo(file, fingerprint, handle);
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

    let finalCustomId = customId;
    if (customId) {
      const targetHistVideo = videos.find(v => v.id === customId);
      if (targetHistVideo) {
        const histName = (targetHistVideo.fileName || '').toLowerCase();
        const histTitle = (targetHistVideo.title || '').toLowerCase();
        const currentName = file.name.toLowerCase();
        const currentTitle = title.toLowerCase();
        const matchesName = histName === currentName || histTitle === currentTitle;
        if (!matchesName) {
          // File name mismatch! Check if there's a matching history entry for the selected file name/title
          const betterMatch = videos.find(v => 
            v.type === 'local' && (
              (v.fileName && v.fileName.toLowerCase() === currentName) ||
              (v.title && v.title.toLowerCase() === currentTitle)
            )
          );
          if (betterMatch) {
            finalCustomId = betterMatch.id;
          } else {
            finalCustomId = undefined;
          }
        }
      }
    } else {
      // No customId provided (e.g. they dropped a file or used open-file directly),
      // we check if there's a historical entry for this file name/title to resume it!
      const betterMatch = videos.find(v => 
        v.type === 'local' && (
          (v.fileName && v.fileName.toLowerCase() === file.name.toLowerCase()) ||
          (v.title && v.title.toLowerCase() === title.toLowerCase())
        )
      );
      if (betterMatch) {
        finalCustomId = betterMatch.id;
      }
    }

    let maxCurrentTime = 0;
    const mergedAudioTracks: CustomAudioTrack[] = [];
    const mergedSubtitleTracks: CustomSubtitleTrack[] = [];
    let mergedDuration: string | undefined = undefined;
    let mergedFormat: string | undefined = undefined;
    let mergedStreams: any[] | undefined = undefined;

    // Find all matching items in history (legacy or fingerprint style) using current state
    const matches = videos.filter(v => 
      v.id === targetId || 
      (finalCustomId && v.id === finalCustomId) ||
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
      lastPlayedDate: new Date().toISOString(),
      localFilePath: (file as any).path || (file as any).localFilePath || undefined
    };

    setVideos(prev => {
      const newIdentity = getVideoIdentity(newVideoItem.title);
      const filtered = prev.filter(v => v.id !== targetId && getVideoIdentity(v.title) !== newIdentity && !matches.some(m => m.id === v.id));
      return mergeOrAddVideo(filtered, newVideoItem);
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
    
    if (video.type === 'online_movie' || video.type === 'online_tv' || video.type === 'online_anime') {
      setVideos(prev => mergeOrAddVideo(prev, video));
      setPlayingVideo(video);
      return;
    }

    // Set picker open lock if we might open a file picker
    if (video.type === 'local' && !video.file && !video.url) {
      isPickerOpenRef.current = true;
    }

    try {
      if (video.type === 'url') {
        setVideos(prev => mergeOrAddVideo(prev, video));
        setPlayingVideo(video);
      } else if (video.type === 'local') {
        if (video.localFilePath) {
          const useIdStream = settings.storageMode === 'file' && settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_');
          const streamUrl = useIdStream
            ? `${BACKEND_ORIGIN}/local-video-stream?id=${encodeURIComponent(video.id)}`
            : `${BACKEND_ORIGIN}/local-video-stream?path=${encodeURIComponent(video.localFilePath)}`;
          const updated = {
            ...video,
            url: streamUrl
          };
          setVideos(prev => mergeOrAddVideo(prev, updated));
          setPlayingVideo(updated);
          isPickerOpenRef.current = false;
          return;
        }

        if (!video.file && video.url) {
          // Play directly from the local stream URL (open-with) without picker
          setVideos(prev => mergeOrAddVideo(prev, video));
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
            setVideos(prev => mergeOrAddVideo(prev, updatedVideo));
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
  const syncVideoToTraktHistory = async (video: VideoItem, e?: React.MouseEvent, ignoreCheck = false) => {
    if (e) e.stopPropagation();
    if (video.hasScrobbledTrakt && !ignoreCheck) {
      setRewatchVideoTarget(video);
      setIsRewatchModalOpen(true);
      return;
    }
    try {
      const token = settings.traktAccessToken;
      if (!token) {
        addToast("Trakt Sync: Please log in to Trakt.tv first", "warning");
        return;
      }

      const seriesInfo = classifyVideoTitle(video.title);
      const isTV = seriesInfo.type === 'series';
      
      let tmdbId = video.tmdbId;

      if (!tmdbId) {
        const tmdbToken = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMzQwMGRhZWZjODJjNTJlZDEyYzk1MWU1ZWFmYmVhYyIsIm5iZiI6MTc4MzU0MTI2OS44NzUsInN1YiI6IjZhNGVhZTE1MzFhOWUyYmNhZjBmY2RlMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.GT6_b6NSJwjYCXlbaCi_djq09ug0rKDxY9iouqVrYWY";
        let searchUrl = "";
        if (isTV && seriesInfo.seriesTitle) {
          searchUrl = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(seriesInfo.seriesTitle)}&include_adult=false`;
        } else {
          searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(seriesInfo.displayTitle || video.title)}&include_adult=false`;
        }

        const searchRes = await fetch(searchUrl, {
          headers: {
            'Authorization': `Bearer ${tmdbToken}`,
            'accept': 'application/json'
          }
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.results && searchData.results.length > 0) {
            tmdbId = searchData.results[0].id;
            handleUpdateVideo((prev) => ({ ...prev, tmdbId }), false, video.id, true);
          }
        }
      }

      const nowIso = new Date().toISOString();
      const body: any = {};
      if (isTV) {
        if (!tmdbId) {
          addToast("Trakt Sync: No TMDB ID resolved for series", "error");
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
            title: seriesInfo.displayTitle || video.title,
            watched_at: nowIso,
            ids: tmdbId ? { tmdb: tmdbId } : undefined
          }
        ];
        if (!tmdbId && !seriesInfo.displayTitle) {
          addToast("Trakt Sync: No title or TMDB ID resolved", "error");
          return;
        }
      }

      addToast("Syncing watch history to Trakt.tv...", "success");
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
        const resData = await res.json();
        addToast(`Trakt Sync: Added ${resData.added?.movies || resData.added?.episodes || 1} item to history`, "success");
        handleUpdateVideo((prev) => ({ ...prev, hasScrobbledTrakt: true }), false, video.id, true);

        // Sync rating to Trakt if present
        const userRating = video.rating;
        if (userRating && userRating > 0) {
          const ratingBody: any = {};
          if (isTV) {
            ratingBody.shows = [
              {
                ids: { tmdb: tmdbId },
                seasons: [
                  {
                    number: seriesInfo.season || 1,
                    episodes: [
                      {
                        number: seriesInfo.episode || 1,
                        rating: userRating * 2,
                        rated_at: nowIso
                      }
                    ]
                  }
                ]
              }
            ];
          } else {
            ratingBody.movies = [
              {
                title: seriesInfo.displayTitle || video.title,
                rating: userRating * 2,
                rated_at: nowIso,
                ids: tmdbId ? { tmdb: tmdbId } : undefined
              }
            ];
          }

          console.log(`[Trakt Rating Sync] Syncing rating (${userRating * 2}/10) to Trakt.tv...`);
          try {
            const ratingRes = await fetch('https://api.trakt.tv/sync/ratings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'trakt-api-key': 'f2926f0d87d3e789c50a3c276ab6002f5027dec31089fe75792c2836165c7289',
                'trakt-api-version': '2'
              },
              body: JSON.stringify(ratingBody)
            });

            if (ratingRes.ok) {
              console.log('[Trakt Rating Sync] Successfully synced rating to Trakt.tv!');
              addToast(`Trakt Rating Sync: Rated ${userRating * 2}/10 successfully`, "success");
            } else {
              console.warn(`[Trakt Rating Sync] Trakt.tv rating sync failed with status: ${ratingRes.status}`);
            }
          } catch (ratingErr) {
            console.error('[Trakt Rating Sync] Error syncing rating:', ratingErr);
          }
        }
      } else {
        const errText = await res.text();
        addToast(`Trakt Sync Failed: ${res.status} - ${errText.substring(0, 40)}`, "error");
      }
    } catch (err) {
      console.error(err);
      addToast("Trakt Sync Error: Connection failed", "error");
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
    
    let localPathVal: string | undefined = undefined;
    if (url.includes('path=')) {
      try {
        const u = new URL(url);
        const p = u.searchParams.get('path');
        if (p) {
          localPathVal = p;
        }
      } catch {}
    }

    const getResumeTimeFromMatch = (match?: VideoItem): number | undefined => {
      const time = match?.currentTime || 0;
      return time > 5 ? time : undefined;
    };
    
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
        const title = localPathVal ? (localPathVal.split(/[/\\]/).pop() || localPathVal) : (url.substring(url.lastIndexOf('/') + 1) || 'Remote Stream');
        
        // Match history by normalized identity
        let match: VideoItem | undefined = undefined;
        try {
          const savedHistory = localStorage.getItem('valor_videos');
          if (savedHistory) {
            const parsedHistory = JSON.parse(savedHistory) as VideoItem[];
            const targetIden = getVideoIdentity(title);
            match = parsedHistory.find(v => getVideoIdentity(v.title) === targetIden);
          }
        } catch (e) {}

        const nativeItem: VideoItem = {
          id: match ? match.id : urlId,
          title,
          url,
          type: isLocalFile ? 'local' : 'url',
          isRemote: !isLocalFile,
          fileName: isLocalFile ? title : undefined,
          containerType: 'unknown',
          audioTracks: match ? match.audioTracks : [],
          subtitleTracks: match ? match.subtitleTracks : [],
          playbackMode: 'native',
          probingError: 'The remote server blocks cross-origin byte access (CORS).',
          localFilePath: localPathVal,
          currentTime: 0,
          resumeTime: getResumeTimeFromMatch(match),
          lastPlayedDate: new Date().toISOString(),
          playedDates: match ? Array.from(new Set([...(match.playedDates || []), new Date().toISOString()])) : [new Date().toISOString()],
          rating: match ? match.rating : undefined,
          totalTimeWatched: match ? match.totalTimeWatched : undefined,
          timeToFinish: match ? match.timeToFinish : undefined
        };
        setVideos(prev => mergeOrAddVideo(prev, nativeItem));
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

      let title = localPathVal ? (localPathVal.split(/[/\\]/).pop() || localPathVal) : (url.substring(url.lastIndexOf('/') + 1) || 'Remote Stream');
      
      // Match history by normalized identity
      let match: VideoItem | undefined = undefined;
      try {
        const savedHistory = localStorage.getItem('valor_videos');
        if (savedHistory) {
          const parsedHistory = JSON.parse(savedHistory) as VideoItem[];
          const targetIden = getVideoIdentity(title);
          match = parsedHistory.find(v => getVideoIdentity(v.title) === targetIden);
        }
      } catch (e) {}

      const videoItem: VideoItem = {
        id: match ? match.id : urlId,
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
        audioTracks: match ? match.audioTracks : audioTracks,
        subtitleTracks: match ? match.subtitleTracks : subtitleTracks,
        currentTime: 0,
        resumeTime: getResumeTimeFromMatch(match),
        timecodeScale,
        playbackMode: 'advanced',
        lastPlayedDate: new Date().toISOString(),
        localFilePath: localPathVal,
        playedDates: match ? Array.from(new Set([...(match.playedDates || []), new Date().toISOString()])) : [new Date().toISOString()],
        rating: match ? match.rating : undefined,
        totalTimeWatched: match ? match.totalTimeWatched : undefined,
        timeToFinish: match ? match.timeToFinish : undefined
      };

      setVideos(prev => mergeOrAddVideo(prev, videoItem));
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
      
      // Match history by normalized identity
      let match: VideoItem | undefined = undefined;
      try {
        const savedHistory = localStorage.getItem('valor_videos');
        if (savedHistory) {
          const parsedHistory = JSON.parse(savedHistory) as VideoItem[];
          const targetIden = getVideoIdentity(title);
          match = parsedHistory.find(v => getVideoIdentity(v.title) === targetIden);
        }
      } catch (e) {}

      const fallbackItem: VideoItem = {
        id: match ? match.id : `url-${Date.now()}`,
        title,
        url,
        type: isLocalFile ? 'local' : 'url',
        isRemote: !isLocalFile,
        fileName: isLocalFile ? title : undefined,
        containerType: 'unknown',
        audioTracks: match ? match.audioTracks : [],
        subtitleTracks: match ? match.subtitleTracks : [],
        playbackMode: 'native',
        probingError: probingError || undefined,
        currentTime: 0,
        resumeTime: getResumeTimeFromMatch(match),
        lastPlayedDate: new Date().toISOString(),
        playedDates: match ? Array.from(new Set([...(match.playedDates || []), new Date().toISOString()])) : [new Date().toISOString()],
        rating: match ? match.rating : undefined,
        totalTimeWatched: match ? match.totalTimeWatched : undefined,
        timeToFinish: match ? match.timeToFinish : undefined
      };
      setVideos(prev => mergeOrAddVideo(prev, fallbackItem));
      setPlayingVideo(fallbackItem);
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  // URL / Path Form submit handler
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl) return;
    let url = videoUrl.trim();
    
    // Check if it is a local path rather than a URL
    const isUrl = url.startsWith('http://') || url.startsWith('https://');
    let isLocalFile = false;
    if (!isUrl) {
      // It is a local path! Convert it to local-video-stream URL served by our backend
      url = `http://127.0.0.1:50001/local-video-stream?path=${encodeURIComponent(url)}`;
      isLocalFile = true;
    }
    
    setVideoUrl('');
    await processRemoteUrl(url, isLocalFile);
  };

  const isFileObj = (obj: any): obj is File => obj instanceof File || (obj && typeof obj.size === 'number' && typeof obj.slice === 'function');
  const isPlayable = playingVideo && (
    playingVideo.type !== 'local' || 
    playingVideo.localFilePath || 
    isFileObj(playingVideo.file) || 
    (playingVideo as any).hasHandle || 
    (playingVideo.url && !playingVideo.url.startsWith('blob:'))
  );

  // If playing, render VideoPlayer fullscreen (blocking mount until playback source restoration finishes)
  if (playingVideo && (isPlayable || isPlaybackRestoring)) {
    if (playingVideo.type === 'online_movie' || playingVideo.type === 'online_tv' || playingVideo.type === 'online_anime') {
      return (
        <OnlineVideoPlayer
          video={playingVideo}
          userId={settings.userId}
          profileName={settings.profileName || 'Local Profile'}
          onBack={() => {
            setPlayingVideo(null);
            window.history.replaceState({}, document.title, window.location.pathname);
          }}
          onUpdateVideo={handleUpdateVideo}
          hideUIOverlays={settings.hideUIOverlays}
          toastDuration={settings.toastDuration}
          disableAnimations={settings.disableAnimations}
          showPlayButton={settings.showPlayButton}
          showTimeDisplay={settings.showTimeDisplay}
          showPlayBar={settings.showPlayBar}
          showVolumeControl={settings.showVolumeControl}
          showFullscreen={settings.showFullscreen}
          historySaveInterval={settings.historySaveInterval}
          saveVolume={settings.saveVolume}
          allowUiSkipping={settings.allowUiSkipping}
          blockSeekingCompletely={settings.blockSeekingCompletely}
          autoSkipIntroOutro={settings.autoSkipIntroOutro}
          autoSkipSexScenes={settings.autoSkipSexScenes}
          lockModeActive={settings.lockModeActive}
          uiHideTimeout={settings.uiHideTimeout}
          tmdbApiKey={settings.tmdbApiKey}
          customLoaderUrl={settings.customLoaderUrl}
          customLoaderType={settings.customLoaderType}
          spinnerPreset={settings.spinnerPreset}
        />
      );
    }

    const playerProps = {
      video: playingVideo,
      userId: settings.userId,
      profileName: settings.profileName || 'Local Profile',
      onBack: () => {
        setPlayingVideo(null);
        // Clear query parameter when returning to library
        window.history.replaceState({}, document.title, window.location.pathname);
      },
      onUpdateVideo: handleUpdateVideo,
      hideUIOverlays: settings.hideUIOverlays,
      customLoaderUrl: settings.customLoaderUrl,
      customLoaderType: settings.customLoaderType,
      spinnerPreset: settings.spinnerPreset,
      hideVideoName: settings.hideVideoName,
      uiHideTimeout: settings.uiHideTimeout,
      toastDuration: settings.toastDuration,
      disableAnimations: settings.disableAnimations,
      pauseOnFocusChange: settings.pauseOnFocusChange,
      showPlayButton: settings.showPlayButton,
      showTimeDisplay: settings.showTimeDisplay,
      showPlayBar: settings.showPlayBar,
      showVolumeControl: settings.showVolumeControl,
      showFullscreen: settings.showFullscreen,
      subSettings: settings.subSettings,
      historySaveInterval: settings.historySaveInterval,
      saveVolume: settings.saveVolume,
      ratingThreshold: settings.ratingThreshold,
      getOverlayDataFromTmdb: settings.getOverlayDataFromTmdb !== false,
      overlayPosition: settings.overlayPosition || 'bottom-left',
      overlayShowBackground: settings.overlayShowBackground !== false,
      overlayShowRating: settings.overlayShowRating !== false,
      overlayShowOverview: settings.overlayShowOverview !== false,
      openSubtitlesApiKey: settings.openSubtitlesApiKey,
      allowUiSkipping: settings.allowUiSkipping,
      blockSeekingCompletely: settings.blockSeekingCompletely,
      autoSkipIntroOutro: settings.autoSkipIntroOutro,
      autoSkipSexScenes: settings.autoSkipSexScenes,
      lockModeActive: settings.lockModeActive,
      settingsOrder: settings.settingsOrder,
      onUpdateSubSettings: (newSubSettings: any) => {
        const updated = {
          ...settings,
          subSettings: {
            ...settings.subSettings,
            ...newSubSettings
          }
        };
        setSettings(updated);
        saveSettingsToStorage(updated);
      },
      onUpdateSettings: (updatedSettings: any) => {
        setSettings(prev => {
          const updated = { ...prev, ...updatedSettings };
          saveSettingsToStorage(updated);
          return updated;
        });
      },
      onReassociate: async (videoId: string) => {
        pendingLocalReassociateIdRef.current = videoId;
        
        // 1. Try to restore from IndexedDB handle and request permission (runs inside user gesture context)
        try {
          const handle = await getFileHandle(videoId);
          if (handle) {
            const hasPermission = await verifyPermission(handle);
            if (hasPermission) {
              const file = await handle.getFile();
              await processLocalVideo(file, videoId, handle);
              return;
            }
          }
        } catch (err) {
          console.error('[Recovery] Failed to restore from IndexedDB in onReassociate:', err);
        }

        // 2. Fallback to picker
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
            await processLocalVideo(file, videoId, handle);
          } catch (err) {
            console.error('Re-association picker cancelled:', err);
          }
        } else {
          historyVideoInputRef.current?.click();
        }
      }
    };

    if (playingVideo.isRemote) {
      return (
        <RemoteVideoPlayer 
          key={playingVideo.id}
          {...playerProps}
        />
      );
    } else {
      return (
        <LocalVideoPlayer 
          key={playingVideo.id}
          {...playerProps}
        />
      );
    }
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
        onSelectProfile={async (userId, _storageMode) => {
          localStorage.setItem('valor_active_user_id', userId);
          
          if (userId !== 'local' && !userId.startsWith('local_')) {
            try {
              const pData = await gqlFetch(`
                query GetProfileData($userId: String!) {
                  profile(userId: $userId) {
                    settings
                    history
                  }
                }
              `, { userId });
              const profileData = pData.profile || {};
              const loaded = {
                ...defaultSettings,
                ...(profileData.settings || {}),
                userId: userId,
                storageMode: 'file'
              };
              setSettings(loaded);
              saveSettingsToStorage(loaded);
              if (profileData && Array.isArray(profileData.history)) {
                setVideos(profileData.history.map((v: any) => ({
                  ...v,
                  audioTracks: v.audioTracks || [],
                  subtitleTracks: v.subtitleTracks || []
                })));
              }
            } catch (e) {
              console.warn('Failed to load profile data from server');
            }
          } else {
            const settingsKey = userId === 'local' ? 'valor_settings' : `valor_settings_${userId}`;
            const videosKey = userId === 'local' ? 'valor_videos' : `valor_videos_${userId}`;
            
            const saved = localStorage.getItem(settingsKey);
            let loaded;
            if (saved) {
              try {
                loaded = { ...defaultSettings, ...JSON.parse(saved), userId: userId, storageMode: 'localstorage' };
              } catch {
                loaded = { ...defaultSettings, userId: userId, storageMode: 'localstorage' };
              }
            } else {
              loaded = { ...defaultSettings, userId: userId, storageMode: 'localstorage' };
            }
            setSettings(loaded);
            saveSettingsToStorage(loaded);
            const savedVideos = localStorage.getItem(videosKey);
            if (savedVideos) {
              try {
                setVideos(JSON.parse(savedVideos));
              } catch {}
            } else {
              setVideos([]);
            }
          }
        }}
        videos={videos}
        openAuthModal={(tab, targetProfile, onSuccess) => openAuthModal(tab, targetProfile, onSuccess)}
        availableProfiles={availableProfiles}
      />
    );
  }

  const isSidebarCollapsed = !!selectedActor || !!selectedDetailsMedia;

  return (
    <div className={`app-layout ${settings.disableAnimations ? 'no-animations' : ''} ${activeTab === 'settings' ? 'settings-active' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar - Desktop and Tablet */}
      <aside className={`app-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">{isSidebarCollapsed ? 'V' : 'Valor'}</div>
        </div>
        
        <nav className="sidebar-menu">
          <button 
            className={`sidebar-menu-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => {
              setSelectedActor(null);
              setSelectedDetailsMedia(null);
              setActiveTab('home');
            }}
            title="Select Media"
          >
            <Home size={20} />
            <span className="sidebar-menu-text">Select Media</span>
          </button>
          <button 
            className={`sidebar-menu-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => {
              setSelectedActor(null);
              setSelectedDetailsMedia(null);
              setActiveTab('history');
            }}
            title="History"
          >
            <History size={20} />
            <span className="sidebar-menu-text">History ({videos.length})</span>
          </button>
          <button 
            className={`sidebar-menu-item ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => {
              setSelectedActor(null);
              setSelectedDetailsMedia(null);
              setActiveTab('library');
            }}
            title="Library"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <span className="sidebar-menu-text">Library</span>
          </button>
          <button 
            className={`sidebar-menu-item ${activeTab === 'online' ? 'active' : ''}`}
            onClick={() => {
              setSelectedActor(null);
              setSelectedDetailsMedia(null);
              setActiveTab('online');
            }}
            title="Online Stream"
          >
            <Play size={20} />
            <span className="sidebar-menu-text">Online Stream</span>
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
                <div key={`sidebar-${video.id}`} className="sidebar-history-item" onClick={() => handlePlayVideo(video)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {video.posterPath && (
                    <img 
                      src={video.posterPath} 
                      alt="" 
                      crossOrigin="anonymous"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      style={{ width: '20px', height: '30px', borderRadius: '3px', objectFit: 'cover', flexShrink: 0 }} 
                    />
                  )}
                  <span className="sidebar-history-item-title" title={video.title} style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</span>
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
            onClick={() => {
              setSelectedActor(null);
              setSelectedDetailsMedia(null);
              setActiveTab('settings');
            }} 
            title="Preferences"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Floating Right Side Midways Live VCT Overlay */}
      <EsportsLiveOverlay />

      {/* Main Content Area */}
      <div className="main-layout-wrapper">
        {/* Main Content Pane */}
        <main className={`main-content ${isSidebarCollapsed ? 'full-width-details' : 'container'} animate-fade-in`}>
          {selectedActor ? (
            <ActorDetailsPage
              actorId={selectedActor.id}
              actorName={selectedActor.name}
              onClose={() => setSelectedActor(null)}
              onSelectMedia={(clickedMedia) => {
                setSelectedActor(null);
                setSelectedDetailsMedia(clickedMedia);
              }}
              tmdbApiKey={settings.tmdbApiKey}
              profilePath={selectedActor.profilePath}
            />
          ) : selectedDetailsMedia ? (
            <OnlineDetailsPage
              video={selectedDetailsMedia}
              onClose={() => setSelectedDetailsMedia(null)}
              onPlay={(selectedVideo, season, episode) => {
                const match = videos.find(v => {
                  if (selectedVideo.type === 'online_movie') {
                    return v.id === selectedVideo.id;
                  } else {
                    return v.id === selectedVideo.id && v.season === season && v.episode === episode;
                  }
                });
                const toPlay = {
                  ...selectedVideo,
                  season,
                  episode,
                  currentTime: match ? (match.currentTime || 0) : 0
                };
                handlePlayVideo(toPlay);
              }}
              onSelectMedia={setSelectedDetailsMedia}
              onSelectActor={(actor) => setSelectedActor(actor)}
              tmdbApiKey={settings.tmdbApiKey}
            />
          ) : (
            <div className="workspace-container">
              {activeTab === 'home' && (
              <div className="workspace-panel-wrapper">
                {(() => {
                  const continueWatchingList = videos.filter(v => v.currentTime && v.currentTime > 2 && (typeof v.duration !== 'number' || v.currentTime < v.duration - 5));
                  const primaryContinue = continueWatchingList.length > 0 ? continueWatchingList[0] : (videos.length > 0 ? videos[0] : null);
                  if (!primaryContinue) return null;

                  return (
                    <div className="continue-watching-section animate-fade-in" style={{ marginBottom: '1.5rem', width: '100%' }}>
                      {/* Primary Red Banner (Full-Width, Clickable Container, Red Gradient, Big Resume Button) */}
                      <div 
                        onClick={() => handlePlayVideo(primaryContinue)}
                        style={{ 
                          width: '100%', 
                          background: 'linear-gradient(135deg, #e50914 0%, #9b040c 100%)', 
                          borderRadius: '12px', 
                          padding: '1.5rem', 
                          marginBottom: '0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 8px 24px rgba(229, 9, 20, 0.25)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          boxSizing: 'border-box'
                        }}
                        className="premium-red-banner"
                      >
                        <div style={{ flex: 1, minWidth: '0', paddingRight: '1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px', background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                              Continue Watching
                            </span>
                            {primaryContinue.duration && (
                              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                {(() => {
                                  const dur = parseDurationToSeconds(primaryContinue.duration);
                                  return dur > 0 ? `${Math.round(((primaryContinue.currentTime || 0) / dur) * 100)}% Watched` : '';
                                })()}
                              </span>
                            )}
                          </div>
                          
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {classifyVideoTitle(primaryContinue.title).displayTitle}
                          </h3>
                          
                          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
                            Resume playback at <b>{formatTime(primaryContinue.currentTime || 0)}</b>
                          </p>

                          {/* Progress bar inside banner */}
                          {(() => {
                            const dur = parseDurationToSeconds(primaryContinue.duration);
                            const progress = dur > 0 && primaryContinue.currentTime ? Math.round((primaryContinue.currentTime / dur) * 100) : 0;
                            return progress > 0 ? (
                              <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.8rem' }}>
                                <div style={{ height: '100%', width: `${progress}%`, background: '#fff' }} />
                              </div>
                            ) : null;
                          })()}
                        </div>
                        
                        <button 
                          className="btn btn-primary" 
                          style={{ 
                            background: '#ffffff', 
                            color: '#e50914', 
                            border: 'none',
                            padding: '0.65rem 1.5rem',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          {isInstantlyPlayable(primaryContinue) ? (
                            <>
                              <Play size={14} fill="#e50914" stroke="#e50914" />
                              <span>Resume Playback</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud size={14} stroke="#e50914" />
                              <span>Select Media</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                <div className="glass-panel workspace-panel">
                  {/* Select Media Section Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <UploadCloud size={22} color="#e50914" />
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Select Media</h2>
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
                          type="text" 
                          className="form-input inline-url-input" 
                          placeholder="Enter Stream URL or Local File Path (e.g. C:\movies\film.mp4)" 
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
              <>
                <div className="workspace-panel-wrapper">
                  <div className="glass-panel workspace-panel" style={{ position: 'relative', minHeight: '100%' }}>
                    {historyViewMode === 'calendar' ? (
                      <div>
                        {settings.calendarStyle === 'list' ? (
                          <Calendar02 videos={videos} onPlayVideo={handlePlayVideo} isInstantlyPlayable={isInstantlyPlayable} />
                        ) : (
                          <CalendarView videos={videos} onPlayVideo={handlePlayVideo} />
                        )}
                      </div>
                    ) : (
                      <>

                  {(() => {
                    const continueWatchingList = videos.filter(v => v.currentTime && v.currentTime > 2 && (typeof v.duration !== 'number' || v.currentTime < v.duration - 5));
                    const primaryContinue = continueWatchingList.length > 0 ? continueWatchingList[0] : (videos.length > 0 ? videos[0] : null);
                    if (!primaryContinue) return null;
                    return (
                      <div 
                        onClick={() => handlePlayVideo(primaryContinue)}
                        style={{ 
                          width: '100%', 
                          background: 'linear-gradient(135deg, #e50914 0%, #9b040c 100%)', 
                          borderRadius: '12px', 
                          padding: '0.85rem 1.1rem', 
                          marginBottom: '1rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 8px 24px rgba(229, 9, 20, 0.25)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          boxSizing: 'border-box'
                        }}
                        className="premium-red-banner"
                      >
                        <div style={{ flex: 1, minWidth: '0', paddingRight: '1.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px', background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                              Continue Watching
                            </span>
                            {primaryContinue.duration && (
                              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                                {(() => {
                                  const dur = parseDurationToSeconds(primaryContinue.duration);
                                  return dur > 0 ? `${Math.round(((primaryContinue.currentTime || 0) / dur) * 100)}% Watched` : '';
                                })()}
                              </span>
                            )}
                          </div>
                          
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {classifyVideoTitle(primaryContinue.title).displayTitle}
                          </h3>
                          
                          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)' }}>
                            Resume playback at <b>{formatTime(primaryContinue.currentTime || 0)}</b>
                          </p>

                          {/* Progress bar inside banner */}
                          {(() => {
                            const dur = parseDurationToSeconds(primaryContinue.duration);
                            const progress = dur > 0 && primaryContinue.currentTime ? Math.round((primaryContinue.currentTime / dur) * 100) : 0;
                            return progress > 0 ? (
                              <div style={{ height: '4px', width: '100%', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.8rem' }}>
                                <div style={{ height: '100%', width: `${progress}%`, background: '#fff' }} />
                              </div>
                            ) : null;
                          })()}
                        </div>
                        
                        <button 
                          className="btn btn-primary" 
                          style={{ 
                            background: '#ffffff', 
                            color: '#e50914', 
                            border: 'none',
                            padding: '0.65rem 1.5rem',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          {isInstantlyPlayable(primaryContinue) ? (
                            <>
                              <Play size={14} fill="#e50914" stroke="#e50914" />
                              <span>Resume Playback</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud size={14} stroke="#e50914" />
                              <span>Select Media</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}

                  {videos.length === 0 ? (
                    <div className="empty-catalog-box glass-panel">
                      <Film size={44} className="text-muted pulsing" />
                      <p>No playback history yet. Load a stream or select a file to begin.</p>
                    </div>
                  ) : (
                    <div className="history-list">
                      {videos.map((video) => (
                        <div key={video.id} className="history-item glass-panel" onClick={() => handlePlayVideo(video)} style={{ display: 'flex', alignItems: 'center' }}>
                          {video.posterPath && (
                            <img 
                              src={video.posterPath} 
                              alt="" 
                              crossOrigin="anonymous"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                              style={{ width: '45px', height: '65px', borderRadius: '6px', objectFit: 'cover', marginRight: '1rem', flexShrink: 0 }} 
                            />
                          )}
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
                              {(video.bookmarks && video.bookmarks.length > 0) && (
                                <span className="stat-badge bookmark-badge">Bookmarks: {video.bookmarks.length}</span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button className="btn btn-primary btn-sm play-btn-compact" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {isInstantlyPlayable(video) ? (
                                <>
                                  <Play size={12} fill="white" />
                                  <span>Play</span>
                                </>
                              ) : (
                                <>
                                  <UploadCloud size={12} />
                                  <span>Select Media</span>
                                </>
                              )}
                            </button>
                            {(() => {
                              const durationSec = typeof video.duration === 'number' ? video.duration : parseDurationToSeconds(video.duration);
                              const isCompleted = !!(video.timeToFinish || (durationSec > 0 && video.currentTime && video.currentTime >= durationSec - 15));
                              
                              if (!isCompleted && !video.hasScrobbledTrakt) return null;
                              
                              return (
                                <button 
                                  className={`btn btn-sm ${video.hasScrobbledTrakt ? 'btn-secondary' : 'btn-outline-danger'}`}
                                  onClick={(e) => syncVideoToTraktHistory(video, e)}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '4px',
                                    background: video.hasScrobbledTrakt ? 'rgba(255,255,255,0.05)' : 'rgba(229, 9, 20, 0.1)',
                                    color: video.hasScrobbledTrakt ? '#888' : '#e50914',
                                    border: video.hasScrobbledTrakt ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e50914',
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: video.hasScrobbledTrakt ? 0.6 : 1
                                  }}
                                  title={video.hasScrobbledTrakt ? "Already Synced to Trakt.tv" : "Sync watched status to Trakt.tv"}
                                  disabled={video.hasScrobbledTrakt}
                                >
                                  <Film size={12} fill={video.hasScrobbledTrakt ? "#888" : "none"} />
                                  <span>Trakt</span>
                                </button>
                              );
                            })()}
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
                  </>
                )}
              </div>
            </div>

            {/* Floating Calendar Toggle Button */}
            <button
              className="dom-calendar-btn"
              onClick={() => setHistoryViewMode(historyViewMode === 'calendar' ? 'list' : 'calendar')}
              title={historyViewMode === 'calendar' ? 'Switch to History List' : 'Switch to Calendar View'}
            >
              {historyViewMode === 'calendar' ? <List size={20} color="#ffffff" /> : <Calendar size={20} color="#ffffff" />}
            </button>
          </>
        )}



            {activeTab === 'library' && (
              <LibraryView 
                videos={videos} 
                onPlayVideo={handlePlayVideo} 
                isInstantlyPlayable={isInstantlyPlayable}
              />
            )}

            {activeTab === 'online' && (
              <OnlineSearchTab 
                onSelectMedia={setSelectedDetailsMedia}
                tmdbApiKey={settings.tmdbApiKey}
                traktAccessToken={settings.traktAccessToken}
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
                    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                      <CustomSelect
                        value={
                          settingsTab === 'subtitle' ? 'subtitle' : 
                          settingsTab === 'hotkeys' ? 'hotkeys' : 
                          uiOverlaySection
                        }
                        onChange={(val) => {
                          if (val === 'hotkeys') {
                            setSettingsTab('hotkeys');
                          } else if (val === 'subtitle') {
                            setSettingsTab('subtitle');
                          } else {
                            setSettingsTab('gridOverlay');
                            setUiOverlaySection(val as any);
                          }
                        }}
                        options={[
                          { value: 'subtitle', label: 'Subtitle Style' },
                          { value: 'hotkeys', label: 'Hotkeys' },
                          { value: 'gridOverlay', label: 'Grid Overlay' },
                          { value: 'pauseOverlay', label: 'Pause Overlay' }
                        ]}
                        hideSearch
                        width="max-content"
                        className={`settings-nav-select ${
                          settingsTab === 'gridOverlay' || 
                          settingsTab === 'hotkeys' || 
                          settingsTab === 'subtitle' ? 'active' : ''
                        }`}
                      />
                    </div>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'storage' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('storage')}
                    >
                      Storage & Saves
                    </button>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'api' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('api')}
                    >
                      API Settings
                    </button>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'bookmarks' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('bookmarks')}
                    >
                      Bookmarks
                    </button>
                    <button 
                      className={`settings-nav-btn ${settingsTab === 'loader' ? 'active' : ''}`}
                      onClick={() => setSettingsTab('loader')}
                    >
                      Spinner
                    </button>
                  </div>

                  <div className="settings-page-content-wrapper">
                    
                    {/* General Section */}
                    {settingsTab === 'general' && (
                      <div className="settings-tab-content animate-fade-in">
                        <div className="settings-page-grid">
                          <div className="settings-grid-col">

                            <div className="settings-section">
                              <h3>Visual Theme Engine</h3>
                              <p className="settings-section-desc">Select your preferred color theme for the entire application.</p>
                              <div className="pref-row">
                                <span className="pref-label">Application Theme</span>
                                <CustomSelect 
                                  value={settings.theme || 'dark'} 
                                  onChange={(val) => handleDefaultLangChange('theme' as any, val)}
                                  options={[
                                    { value: 'dark', label: '🌙 Dark Mode (Default)' },
                                    { value: 'black-and-white', label: '🏁 Black & White (Monochrome Noir)' },
                                    { value: 'light', label: '☀️ Light Mode' }
                                  ]}
                                />
                              </div>
                            </div>

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
                              <h3>Calendar Preferences</h3>
                              <p className="settings-section-desc">Choose between the interactive month grid or the schedule list.</p>
                              <div className="pref-row">
                                <span className="pref-label">Calendar Layout Style</span>
                                <CustomSelect 
                                  value={settings.calendarStyle} 
                                  onChange={(val) => handleDefaultLangChange('calendarStyle', val)}
                                  options={calendarStyleOptions}
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
                              <div className="pref-row">
                                <span className="pref-label">UI Overlays Auto-Hide Timeout</span>
                                <CustomSelect 
                                  value={settings.uiHideTimeout || 1.5} 
                                  onChange={(val) => handleDefaultLangChange('uiHideTimeout', val)}
                                  options={uiHideTimeoutOptions}
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
                                <ToggleSwitch 
                                  checked={settings.hideUIOverlays} 
                                  onChange={(checked) => handleDefaultLangChange('hideUIOverlays', checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Video Name Display</span>
                                <ToggleSwitch 
                                  checked={settings.hideVideoName} 
                                  onChange={(checked) => handleDefaultLangChange('hideVideoName', checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Play Button Overlay</span>
                                <ToggleSwitch 
                                  checked={!settings.showPlayButton} 
                                  onChange={(checked) => handleDefaultLangChange('showPlayButton', !checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Time Display</span>
                                <ToggleSwitch 
                                  checked={!settings.showTimeDisplay} 
                                  onChange={(checked) => handleDefaultLangChange('showTimeDisplay', !checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Timeline Scrub Bar</span>
                                <ToggleSwitch 
                                  checked={!settings.showPlayBar} 
                                  onChange={(checked) => handleDefaultLangChange('showPlayBar', !checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Volume Control</span>
                                <ToggleSwitch 
                                  checked={!settings.showVolumeControl} 
                                  onChange={(checked) => handleDefaultLangChange('showVolumeControl', !checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Fullscreen Toggle Button</span>
                                <ToggleSwitch 
                                  checked={!settings.showFullscreen} 
                                  onChange={(checked) => handleDefaultLangChange('showFullscreen', !checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Floating & Hover Animations</span>
                                <ToggleSwitch 
                                  checked={settings.disableAnimations} 
                                  onChange={(checked) => handleDefaultLangChange('disableAnimations', checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Disable Focus Loss Auto-Pause</span>
                                <ToggleSwitch 
                                  checked={!settings.pauseOnFocusChange} 
                                  onChange={(checked) => handleDefaultLangChange('pauseOnFocusChange', !checked)}
                                />
                              </div>
                              <div className="pref-row" style={{ opacity: settings.blockSeekingCompletely ? 0.5 : 1 }}>
                                <span className="pref-label">Show Skip Buttons in Player UI</span>
                                <ToggleSwitch 
                                  checked={settings.allowUiSkipping}
                                  disabled={settings.blockSeekingCompletely}
                                  onChange={(checked) => handleDefaultLangChange('allowUiSkipping', checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label" style={{ color: '#ff4444' }}>Block Seeking / Skipping Completely</span>
                                <ToggleSwitch 
                                  checked={settings.blockSeekingCompletely}
                                  onChange={(checked) => {
                                    setSettings((prev) => {
                                      const updated = {
                                        ...prev,
                                        blockSeekingCompletely: checked,
                                        allowUiSkipping: checked ? false : prev.allowUiSkipping
                                      };
                                      saveSettingsToStorage(updated);
                                      return updated;
                                    });
                                  }}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Auto-Skip Intros & Outros</span>
                                <ToggleSwitch 
                                  checked={settings.autoSkipIntroOutro}
                                  onChange={(checked) => handleDefaultLangChange('autoSkipIntroOutro', checked)}
                                />
                              </div>
                              <div className="pref-row">
                                <span className="pref-label">Lock Mode Active (Lock Controls on Startup)</span>
                                <ToggleSwitch 
                                  checked={settings.lockModeActive}
                                  onChange={(checked) => handleDefaultLangChange('lockModeActive', checked)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Hotkeys Section */}
                    {settingsTab === 'hotkeys' && (
                      <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', width: '100%' }}>
                          
                          {/* Left Column: Key Customization */}
                          <div style={{ flex: '1 1 420px', minWidth: '320px' }}>
                            <div className="settings-section">
                              <h3>Keyboard Customization</h3>
                              <p className="settings-section-desc">Click on a key box and press any key to rebind it. Hover over a setting to highlight it in the player map.</p>
                              
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: '0.4rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem' }}>
                                {Object.entries(settings.keybinds).map(([key, value]) => {
                                  const labelMap: Record<string, string> = {
                                    playPause: 'Play / Pause',
                                    rewind: 'Rewind 10s',
                                    forward: 'Forward 10s',
                                    fullscreen: 'Toggle Fullscreen',
                                    exit: 'Exit Player / Back',
                                    nextSubtitle: 'Cycle Subtitles',
                                    nextAudio: 'Cycle Audio',
                                    lockControls: 'Toggle Lock Controls',
                                    openSettings: 'Toggle UI settings modal',
                                    addBookmark: 'Create Bookmark',
                                    toggleMute: 'Toggle Mute / Unmute',
                                    audioBoost: 'Cycle Audio Boost',
                                    frameStep: 'Step Frame Forward',
                                    screenshot: 'Take Video Screenshot'
                                  };
                                  return (
                                    <div 
                                      className="keybind-row-hoverable" 
                                      key={key}
                                      onMouseEnter={() => setHoveredHotkey(key)}
                                      onMouseLeave={() => setHoveredHotkey(null)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0.4rem 0.6rem',
                                        borderRadius: '6px',
                                        background: hoveredHotkey === key ? 'rgba(229, 9, 20, 0.08)' : 'transparent',
                                        border: hoveredHotkey === key ? '1px solid rgba(229, 9, 20, 0.2)' : '1px solid transparent',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      <span className="keybind-label" style={{ fontSize: '0.85rem', color: hoveredHotkey === key ? '#fff' : 'rgba(255,255,255,0.7)' }}>
                                        {labelMap[key] || key}
                                      </span>
                                      <button 
                                        className={`keybind-capture-btn ${listeningKeyFor === key ? 'listening' : ''}`}
                                        onClick={() => setListeningKeyFor(key as any)}
                                        style={{
                                          background: listeningKeyFor === key ? '#e50914' : 'rgba(255,255,255,0.06)',
                                          border: '1px solid rgba(255,255,255,0.1)',
                                          borderRadius: '4px',
                                          color: '#fff',
                                          padding: '4px 10px',
                                          fontSize: '0.75rem',
                                          minWidth: '70px',
                                          textAlign: 'center',
                                          cursor: 'pointer',
                                          outline: 'none'
                                        }}
                                      >
                                        {listeningKeyFor === key ? 'Press key...' : (value as string) === ' ' ? 'Space' : (value as string)}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Right Column: Player Interface HUD Diagram */}
                          <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="settings-section" style={{ width: '100%' }}>
                              <h3>Player Shortcut Map</h3>
                              <p className="settings-section-desc">Interactive representation of active player commands. Rebind keys on the left to see changes here.</p>
                              
                              {/* Simulated Player Screen with Pointers */}
                              <div style={{
                                position: 'relative',
                                width: '100%',
                                height: '350px',
                                background: 'radial-gradient(circle at center, #1b2030 0%, #0d0f17 100%)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '1rem',
                                boxSizing: 'border-box'
                              }}>
                                {/* Top Overlay Area */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                  {/* Back / Exit mapping */}
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: hoveredHotkey === 'exit' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                                    border: hoveredHotkey === 'exit' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    boxShadow: hoveredHotkey === 'exit' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                                    transition: 'all 0.2s ease'
                                  }}>
                                    <span style={{ fontSize: '0.65rem', color: '#888', fontWeight: 600 }}>Exit</span>
                                    <kbd style={{ background: '#333', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>
                                      {settings.keybinds.exit === 'Escape' ? 'Esc' : settings.keybinds.exit}
                                    </kbd>
                                  </div>

                                  {/* Lock mode mapping */}
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                    background: hoveredHotkey === 'lockControls' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                                    border: hoveredHotkey === 'lockControls' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    boxShadow: hoveredHotkey === 'lockControls' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                                    transition: 'all 0.2s ease'
                                  }}>
                                    <span style={{ fontSize: '0.65rem', color: '#888', fontWeight: 600 }}>Lock Mode</span>
                                    <kbd style={{ background: '#333', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>
                                      {settings.keybinds.lockControls === ' ' ? 'Space' : settings.keybinds.lockControls.toUpperCase()}
                                    </kbd>
                                  </div>
                                </div>

                                {/* Center Play & Seek Controls Diagram */}
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.25rem', margin: 'auto 0' }}>
                                  {/* Rewind */}
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    background: hoveredHotkey === 'rewind' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                                    border: hoveredHotkey === 'rewind' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    boxShadow: hoveredHotkey === 'rewind' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                                    transition: 'all 0.2s ease'
                                  }}>
                                    <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 600 }}>Rewind 10s</span>
                                    <kbd style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                                      {settings.keybinds.rewind === 'ArrowLeft' ? '←' : settings.keybinds.rewind}
                                    </kbd>
                                  </div>

                                  {/* Play/Pause */}
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    background: hoveredHotkey === 'playPause' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                                    border: hoveredHotkey === 'playPause' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    boxShadow: hoveredHotkey === 'playPause' ? '0 0 12px rgba(229,9,20,0.4)' : 'none',
                                    transition: 'all 0.2s ease'
                                  }}>
                                    <span style={{ fontSize: '0.65rem', color: '#aaa', fontWeight: 600 }}>Play / Pause</span>
                                    <kbd style={{ background: '#222', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                                      {settings.keybinds.playPause === ' ' ? 'Space' : settings.keybinds.playPause}
                                    </kbd>
                                  </div>

                                  {/* Forward */}
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    background: hoveredHotkey === 'forward' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                                    border: hoveredHotkey === 'forward' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    boxShadow: hoveredHotkey === 'forward' ? '0 0 10px rgba(229,9,20,0.4)' : 'none',
                                    transition: 'all 0.2s ease'
                                  }}>
                                    <span style={{ fontSize: '0.6rem', color: '#888', fontWeight: 600 }}>Forward 10s</span>
                                    <kbd style={{ background: '#222', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                                      {settings.keybinds.forward === 'ArrowRight' ? '→' : settings.keybinds.forward}
                                    </kbd>
                                  </div>
                                </div>

                                {/* Floating Sidebar overlay representation for UI settings */}
                                <div style={{
                                  position: 'absolute',
                                  right: '0.5rem',
                                  top: '25%',
                                  bottom: '25%',
                                  width: '50px',
                                  background: hoveredHotkey === 'openSettings' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.03)',
                                  border: hoveredHotkey === 'openSettings' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: '6px 0 0 6px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.25rem',
                                  boxShadow: hoveredHotkey === 'openSettings' ? '-5px 0 10px rgba(229,9,20,0.3)' : 'none',
                                  transition: 'all 0.2s ease'
                                }}>
                                  <span style={{ fontSize: '0.55rem', color: '#666', fontWeight: 600, textAlign: 'center', writingMode: 'vertical-lr', textTransform: 'uppercase' }}>Settings</span>
                                  <kbd style={{ background: '#333', color: '#fff', padding: '1px 4px', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700 }}>
                                    {settings.keybinds.openSettings === 'Delete' ? 'Del' : settings.keybinds.openSettings.toUpperCase()}
                                  </kbd>
                                </div>

                                {/* Bottom Seekbar Line */}
                                <div style={{
                                  width: '100%',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.4rem',
                                  marginTop: 'auto'
                                }}>
                                  {/* Frame step pointer */}
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0 0.5rem'
                                  }}>
                                    {/* Mute and Boost indicators */}
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        background: hoveredHotkey === 'toggleMute' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.02)',
                                        border: hoveredHotkey === 'toggleMute' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        <span style={{ fontSize: '0.55rem', color: '#666' }}>Mute</span>
                                        <kbd style={{ background: '#333', color: '#fff', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '2px' }}>{settings.keybinds.toggleMute.toUpperCase()}</kbd>
                                      </div>
                                      
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        background: hoveredHotkey === 'audioBoost' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.02)',
                                        border: hoveredHotkey === 'audioBoost' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        <span style={{ fontSize: '0.55rem', color: '#666' }}>Boost</span>
                                        <kbd style={{ background: '#333', color: '#fff', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '2px' }}>{settings.keybinds.audioBoost.toUpperCase()}</kbd>
                                      </div>
                                    </div>

                                    {/* Screenshot indicator */}
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      background: hoveredHotkey === 'screenshot' ? 'rgba(229, 9, 20, 0.25)' : 'rgba(255,255,255,0.02)',
                                      border: hoveredHotkey === 'screenshot' ? '1px solid #e50914' : '1px solid rgba(255,255,255,0.06)',
                                      borderRadius: '4px',
                                      padding: '2px 6px',
                                      transition: 'all 0.15s ease'
                                    }}>
                                      <span style={{ fontSize: '0.55rem', color: '#666' }}>Capture</span>
                                      <kbd style={{ background: '#333', color: '#fff', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '2px' }}>{(settings.keybinds.screenshot || 's').toUpperCase()}</kbd>
                                    </div>
                                  </div>

                                  {/* Seekbar wireframe */}
                                  <div style={{
                                    height: '4px',
                                    width: '100%',
                                    borderRadius: '2px',
                                    position: 'relative',
                                    background: hoveredHotkey === 'frameStep' ? 'rgba(229, 9, 20, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                    border: hoveredHotkey === 'frameStep' ? '1px solid #e50914' : 'none',
                                    transition: 'all 0.15s ease'
                                  }}>
                                    <div style={{ position: 'absolute', left: '0', top: '0', bottom: '0', width: '35%', background: '#e50914', borderRadius: '2px' }}></div>
                                    {hoveredHotkey === 'frameStep' && (
                                      <div style={{
                                        position: 'absolute',
                                        bottom: '8px',
                                        left: '35%',
                                        transform: 'translateX(-50%)',
                                        background: '#222',
                                        border: '1px solid #e50914',
                                        borderRadius: '4px',
                                        padding: '2px 6px',
                                        fontSize: '0.55rem',
                                        color: '#fff',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        Frame Step: <kbd style={{ background: '#333', padding: '1px 3px', borderRadius: '2px' }}>{settings.keybinds.frameStep.toUpperCase()}</kbd>
                                      </div>
                                    )}
                                  </div>

                                  {/* Subtitles / Audio Streams / Bookmarks / Fullscreen pointers */}
                                  <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '0.6rem',
                                    color: 'rgba(255,255,255,0.5)'
                                  }}>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      {/* Audio Cycle */}
                                      <div style={{
                                        background: hoveredHotkey === 'nextAudio' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                                        border: hoveredHotkey === 'nextAudio' ? '1px solid #e50914' : '1px solid transparent',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        Audio: <kbd>{settings.keybinds.nextAudio.toUpperCase()}</kbd>
                                      </div>
                                      
                                      {/* Subs Cycle */}
                                      <div style={{
                                        background: hoveredHotkey === 'nextSubtitle' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                                        border: hoveredHotkey === 'nextSubtitle' ? '1px solid #e50914' : '1px solid transparent',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        Subs: <kbd>{settings.keybinds.nextSubtitle.toUpperCase()}</kbd>
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                      {/* Add Bookmark */}
                                      <div style={{
                                        background: hoveredHotkey === 'addBookmark' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                                        border: hoveredHotkey === 'addBookmark' ? '1px solid #e50914' : '1px solid transparent',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        Bookmark: <kbd>{settings.keybinds.addBookmark.toUpperCase()}</kbd>
                                      </div>

                                      {/* Fullscreen */}
                                      <div style={{
                                        background: hoveredHotkey === 'fullscreen' ? 'rgba(229, 9, 20, 0.25)' : 'transparent',
                                        border: hoveredHotkey === 'fullscreen' ? '1px solid #e50914' : '1px solid transparent',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        transition: 'all 0.15s ease'
                                      }}>
                                        FS: <kbd>{settings.keybinds.fullscreen.toUpperCase()}</kbd>
                                      </div>
                                    </div>
                                  </div>

                                </div>
                              </div>
                            </div>
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
                             <div style={{ width: '50%', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
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
                        <div className="settings-section" style={{ marginBottom: '2rem' }}>
                          <h3>Active User Profile</h3>
                          <p className="settings-section-desc">Manage your profile storage and server synchronization.</p>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            
                            {/* Active Profile Banner Card */}
                            <div style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '12px', 
                              background: (settings.userId && settings.userId !== 'local') 
                                ? 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(37,99,235,0.06) 100%)' 
                                : 'rgba(255,255,255,0.03)', 
                              padding: '1.25rem', 
                              borderRadius: '10px', 
                              border: (settings.userId && settings.userId !== 'local') 
                                ? '1px solid rgba(59,130,246,0.25)' 
                                : '1px solid rgba(255,255,255,0.08)' 
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ 
                                  width: '48px', 
                                  height: '48px', 
                                  borderRadius: '50%', 
                                  background: (settings.userId && settings.userId !== 'local') ? '#3b82f6' : 'rgba(255,255,255,0.1)', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  fontSize: '1.4rem', 
                                  fontWeight: 'bold',
                                  color: '#fff',
                                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                                }}>
                                  {availableProfiles.find(p => p.userId === settings.userId) 
                                     ? (availableProfiles.find(p => p.userId === settings.userId)?.name?.[0] || 'U').toUpperCase() 
                                     : (settings.profileName?.[0] || 'L').toUpperCase()}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                                      {availableProfiles.find(p => p.userId === settings.userId) 
                                        ? (availableProfiles.find(p => p.userId === settings.userId)?.name || 'Profile') 
                                        : (settings.profileName || 'Local Browser Saves')}
                                    </span>
                                    <span style={{ 
                                      fontSize: '0.68rem', 
                                      padding: '2px 8px', 
                                      borderRadius: '4px', 
                                      background: (settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) ? 'rgba(46,204,113,0.18)' : 'rgba(239,68,68,0.15)', 
                                      color: (settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) ? '#2ecc71' : '#ef4444', 
                                      fontWeight: 'bold',
                                      letterSpacing: '0.5px'
                                    }}>
                                      {(settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_')) ? 'SYNCING ACTIVE' : 'LOCAL SAVE ONLY'}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                                    {availableProfiles.find(p => p.userId === settings.userId) 
                                      ? `User ID: ${settings.userId} ${availableProfiles.find(p => p.userId === settings.userId)?.username ? `• Username: ${availableProfiles.find(p => p.userId === settings.userId).username}` : '• Local Storage Profile'}` 
                                      : 'Playback data is saved locally inside your browser storage.'}
                                  </span>
                                </div>
                              </div>

                              <div className="profile-button-management" style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.75rem',
                                width: '100%',
                                marginTop: '1rem',
                                borderTop: '1px solid rgba(255,255,255,0.06)',
                                paddingTop: '1.25rem'
                              }}>
                                {/* Left Side: Primary Sync Actions */}
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
                                  {(!settings.userId || settings.userId === 'local' || settings.userId.startsWith('local_')) ? (
                                    <button
                                      type="button"
                                      onClick={() => openAuthModal('signup')}
                                      className="btn btn-primary"
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '8px 20px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        background: '#e50914',
                                        color: '#fff',
                                        border: 'none',
                                        transition: 'background 0.2s',
                                        fontFamily: 'Outfit, sans-serif'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#ff0914'}
                                      onMouseLeave={e => e.currentTarget.style.background = '#e50914'}
                                    >
                                      <UserPlus size={14} />
                                      <span>Create Server Profile & Sync</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm('Are you sure you want to logout? Your watch history and settings will remain on the server, and you will switch back to local browser storage.')) {
                                          localStorage.setItem('valor_active_user_id', 'local');
                                          setSettings(prev => ({
                                            ...prev,
                                            userId: 'local',
                                            storageMode: 'localstorage'
                                          }));
                                          const savedVideos = localStorage.getItem('valor_videos');
                                          if (savedVideos) {
                                            try { setVideos(JSON.parse(savedVideos)); } catch {}
                                          }
                                          addToast('Logged out of server profile successfully', 'success');
                                        }
                                      }}
                                      className="btn"
                                      style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '8px 20px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        fontFamily: 'Outfit, sans-serif'
                                      }}
                                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    >
                                      <LogOut size={14} />
                                      <span>Logout</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const curProfile = availableProfiles.find(p => p.userId === settings.userId) || {
                                        userId: settings.userId || 'local',
                                        name: settings.profileName || 'Local Browser Saves',
                                        storageMode: 'localstorage'
                                      };
                                      setDeleteTargetProfile(curProfile);
                                      setDeleteConfirmText('');
                                      setIsDeleteModalOpen(true);
                                    }}
                                    className="btn"
                                    style={{
                                      background: 'rgba(239,68,68,0.06)',
                                      border: '1px solid rgba(239,68,68,0.25)',
                                      color: '#ef4444',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '8px 20px',
                                      fontSize: '0.8rem',
                                      fontWeight: 600,
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                      fontFamily: 'Outfit, sans-serif'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                                  >
                                    <Trash2 size={14} />
                                    <span>Delete Profile</span>
                                  </button>
                                </div>

                                {/* Right Side: Data Actions */}
                                <button
                                  type="button"
                                  onClick={handleExportData}
                                  className="btn"
                                  style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 20px',
                                    fontSize: '0.8rem',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    transition: 'background 0.2s',
                                    fontFamily: 'Outfit, sans-serif'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                >
                                  <Download size={14} />
                                  <span>Export Data</span>
                                </button>
                              </div>
                            </div>

                            {/* Profiles Picker Grid */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Profiles Switcher</span>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                                {availableProfiles.filter(p => !hiddenProfileIds.includes(p.userId)).map(p => {
                                  const isActive = settings.userId === p.userId;
                                  const isLocal = p.userId === 'local' || p.userId.startsWith('local_');
                                  
                                  const themeColor = isLocal ? '#2ecc71' : '#ef4444'; 
                                  const themeActiveBg = isLocal ? 'rgba(46, 204, 113, 0.18)' : 'rgba(239, 68, 68, 0.18)';
                                  const themeInactiveBg = isLocal ? 'rgba(46, 204, 113, 0.04)' : 'rgba(239, 68, 68, 0.04)';
                                  const themeBorder = isLocal ? 'rgba(46, 204, 113, 0.2)' : 'rgba(239, 68, 68, 0.2)';
                                  const themeDotBg = isLocal ? 'rgba(46, 204, 113, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                                  const themeGlow = isLocal ? '0 0 12px rgba(46, 204, 113, 0.3)' : '0 0 12px rgba(239, 68, 68, 0.3)';

                                  return (
                                    <div
                                      key={p.userId}
                                      onClick={async () => {
                                        if (isActive) return;
                                        if (p.hasPassword) {
                                          openAuthModal('login', p);
                                          return;
                                        }
                                        
                                        localStorage.setItem('valor_active_user_id', p.userId);
                                        const isLocalSelect = p.userId === 'local' || p.userId.startsWith('local_');

                                        if (!isLocalSelect) {
                                          try {
                                            const pData = await gqlFetch(`
                                              query GetProfileData($userId: String!) {
                                                profile(userId: $userId) {
                                                  settings
                                                  history
                                                }
                                              }
                                            `, { userId: p.userId });
                                            const profileData = pData.profile || {};
                                            const loaded = {
                                              ...defaultSettings,
                                              ...(profileData.settings || {}),
                                              userId: p.userId,
                                              storageMode: 'file'
                                            };
                                            setSettings(loaded);
                                            saveSettingsToStorage(loaded);
                                            if (profileData && Array.isArray(profileData.history)) {
                                              setVideos(profileData.history.map((v: any) => ({
                                                ...v,
                                                audioTracks: v.audioTracks || [],
                                                subtitleTracks: v.subtitleTracks || []
                                              })));
                                            }
                                            addToast(`Switched to profile: ${p.name}`, 'success');
                                          } catch (e) {
                                            console.warn('Failed to switch profile data');
                                            addToast('Failed to switch profile data', 'error');
                                          }
                                        } else {
                                          const settingsKey = p.userId === 'local' ? 'valor_settings' : `valor_settings_${p.userId}`;
                                          const videosKey = p.userId === 'local' ? 'valor_videos' : `valor_videos_${p.userId}`;
                                          
                                          const saved = localStorage.getItem(settingsKey);
                                          let loaded;
                                          if (saved) {
                                            try {
                                              loaded = { ...defaultSettings, ...JSON.parse(saved), userId: p.userId, storageMode: 'localstorage' };
                                            } catch {
                                              loaded = { ...defaultSettings, userId: p.userId, storageMode: 'localstorage' };
                                            }
                                          } else {
                                            loaded = { ...defaultSettings, userId: p.userId, storageMode: 'localstorage', profileName: p.name };
                                          }
                                          setSettings(loaded);
                                          saveSettingsToStorage(loaded);
                                          const savedVideos = localStorage.getItem(videosKey);
                                          if (savedVideos) {
                                            try {
                                              setVideos(JSON.parse(savedVideos));
                                            } catch {}
                                          } else {
                                            setVideos([]);
                                          }
                                          addToast(`Switched to local profile: ${p.name}`, 'success');
                                        }
                                      }}
                                      style={{
                                        background: isActive ? themeActiveBg : themeInactiveBg,
                                        border: isActive ? `1px solid ${themeColor}` : `1px solid ${themeBorder}`,
                                        boxShadow: isActive ? themeGlow : 'none',
                                        padding: '12px 10px',
                                        borderRadius: '8px',
                                        cursor: isActive ? 'default' : 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.2s ease',
                                        opacity: isActive ? 1 : 0.8,
                                        position: 'relative'
                                      }}
                                      onMouseEnter={(e) => { 
                                        if (!isActive) {
                                          e.currentTarget.style.background = isLocal ? 'rgba(46, 204, 113, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                                          e.currentTarget.style.borderColor = themeColor;
                                        }
                                      }}
                                      onMouseLeave={(e) => { 
                                        if (!isActive) {
                                          e.currentTarget.style.background = themeInactiveBg;
                                          e.currentTarget.style.borderColor = themeBorder;
                                        }
                                      }}
                                    >
                                      {/* Small Delete Icon Overlay (Only show if not active profile) */}
                                      {!isActive && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setRemoveTargetProfile(p);
                                            setRemovePasswordText('');
                                            setRemoveError('');
                                            setIsRemoveModalOpen(true);
                                          }}
                                          style={{
                                            position: 'absolute',
                                            top: '4px',
                                            right: '4px',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            width: '18px',
                                            height: '18px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            fontSize: '0.65rem',
                                            zIndex: 10,
                                            padding: 0
                                          }}
                                          title="Remove from Switcher"
                                        >
                                          ❌
                                        </button>
                                      )}

                                      <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        background: isActive ? themeColor : themeDotBg,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 'bold',
                                        fontSize: '0.9rem',
                                        color: '#fff',
                                        border: `1px solid ${themeColor}`
                                      }}>
                                        {(p.name?.[0] || 'U').toUpperCase()}
                                      </div>
                                      <span style={{ fontSize: '0.72rem', fontWeight: isActive ? 600 : 400, color: '#fff', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {p.name} {p.hasPassword ? '🔒' : ''}
                                      </span>
                                    </div>
                                  );
                                })}

                                {/* Add Profile Tile */}
                                <div
                                  onClick={() => {
                                    setNewProfileName('');
                                    setNewProfilePassword('');
                                    setCreateProfileError('');
                                    setIsCreateProfileModalOpen(true);
                                  }}
                                  style={{
                                    background: 'rgba(255,255,255,0.01)',
                                    border: '1px dashed rgba(255,255,255,0.15)',
                                    padding: '12px 10px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s ease',
                                    height: '78px',
                                    boxSizing: 'border-box'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
                                >
                                  <div style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>+</div>
                                  <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Add Profile</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

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
                            <ToggleSwitch 
                              checked={settings.saveHistory} 
                              onChange={(checked) => handleDefaultLangChange('saveHistory', checked)}
                            />
                          </div>

                          <div className="pref-row">
                            <span className="pref-label">Save Audio/Subtitle Track Preferences</span>
                            <ToggleSwitch 
                              checked={settings.saveTrackPreferences} 
                              onChange={(checked) => handleDefaultLangChange('saveTrackPreferences', checked)}
                            />
                          </div>

                          <div className="pref-row">
                            <span className="pref-label">Save Player Volume & Mute States</span>
                            <ToggleSwitch 
                              checked={settings.saveVolume} 
                              onChange={(checked) => handleDefaultLangChange('saveVolume', checked)}
                            />
                          </div>

                          <div className="pref-row">
                            <span className="pref-label">Save UI Customization Preferences</span>
                            <ToggleSwitch 
                              checked={settings.saveSettings} 
                              onChange={(checked) => handleDefaultLangChange('saveSettings', checked)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* API Settings Section */}
                    {settingsTab === 'api' && (
                      <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
                        <ApiSettingsView 
                          settings={settings}
                          handleDefaultLangChange={handleDefaultLangChange}
                          addToast={addToast}
                        />
                      </div>
                    )}

                    {/* Bookmarks settings section */}
                    {settingsTab === 'bookmarks' && (
                      <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
                        <div className="settings-section">
                          <h3>Auto-Skip Scenes</h3>
                          <p className="settings-section-desc">Choose which marked segments are automatically skipped during playback.</p>
                          
                          <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <span className="pref-label">Auto-Skip Intro & Outro Sections</span>
                            <ToggleSwitch 
                              checked={settings.autoSkipIntroOutro} 
                              onChange={(checked) => handleDefaultLangChange('autoSkipIntroOutro', checked)}
                            />
                          </div>

                          <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="pref-label">Auto-Skip Sex & Nudity Scenes</span>
                            <ToggleSwitch 
                              checked={settings.autoSkipSexScenes} 
                              onChange={(checked) => handleDefaultLangChange('autoSkipSexScenes', checked)}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Spinner / Loading Animation Tab */}
                    {settingsTab === 'loader' && (
                      <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', width: '100%' }}>
                          
                          {/* Left: Live Preview */}
                          <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="settings-section">
                              <h3>Active Animation</h3>
                              <p className="settings-section-desc">Currently shown during buffering.</p>
                              <div style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                background: 'rgba(0,0,0,0.65)', borderRadius: '14px', height: '220px',
                                border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden'
                              }}>
                                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(255,60,0,0.06) 0%, transparent 70%)' }} />
                                <LoadingSpinner 
                                  customLoaderUrl={settings.customLoaderUrl} 
                                  customLoaderType={settings.customLoaderType}
                                  preset={settings.spinnerPreset as SpinnerPreset}
                                />
                              </div>
                              <div style={{ 
                                marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.04)',
                                borderRadius: '6px', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)'
                              }}>
                                <span style={{ 
                                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                                  background: settings.customLoaderType === 'default' ? '#22c55e' : '#f59e0b'
                                }} />
                                {settings.customLoaderType === 'default' 
                                  ? `${SPINNER_PRESETS.find(p => p.id === settings.spinnerPreset)?.emoji || '🔥'} ${SPINNER_PRESETS.find(p => p.id === settings.spinnerPreset)?.name || 'Fire Circle'}`
                                  : settings.customLoaderUrl ? `Custom ${settings.customLoaderType}` : 'No file uploaded'}
                              </div>
                            </div>
                          </div>

                          {/* Right: Gallery + Upload */}
                          <div style={{ flex: '1 1 380px', minWidth: '300px' }}>
                            
                            {/* Preset Gallery */}
                            <div className="settings-section">
                              <h3>Built-in Presets</h3>
                              <p className="settings-section-desc">Click to select a preset animation. The active one is highlighted.</p>
                              <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                                gap: '0.75rem', marginTop: '0.5rem'
                              }}>
                                {SPINNER_PRESETS.map(p => {
                                  const isActive = settings.customLoaderType === 'default' && settings.spinnerPreset === p.id;
                                  return (
                                    <div
                                      key={p.id}
                                      onClick={() => {
                                        setSettings(prev => {
                                          const updated = { ...prev, spinnerPreset: p.id, customLoaderType: 'default' as const, customLoaderUrl: '' };
                                          saveSettingsToStorage(updated);
                                          return updated;
                                        });
                                      }}
                                      style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                        gap: '0.5rem', padding: '0.75rem 0.5rem',
                                        background: isActive ? 'rgba(255,100,0,0.12)' : 'rgba(255,255,255,0.03)',
                                        border: isActive ? '2px solid rgba(255,100,0,0.5)' : '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '10px', cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        position: 'relative', overflow: 'hidden'
                                      }}
                                      onMouseOver={(e) => {
                                        if (!isActive) {
                                          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                                        }
                                      }}
                                      onMouseOut={(e) => {
                                        if (!isActive) {
                                          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                        }
                                      }}
                                    >
                                      {isActive && (
                                        <div style={{
                                          position: 'absolute', top: '4px', right: '6px',
                                          fontSize: '0.65rem', color: '#22c55e', fontWeight: 700
                                        }}>✓</div>
                                      )}
                                      <div style={{ 
                                        width: '70px', height: '70px', display: 'flex', 
                                        alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(0,0,0,0.4)', borderRadius: '8px',
                                        overflow: 'hidden'
                                      }}>
                                        <SpinnerThumbnail preset={p.id} size={60} />
                                      </div>
                                      <span style={{ 
                                        fontSize: '0.72rem', color: isActive ? 'rgba(255,180,100,0.9)' : 'rgba(255,255,255,0.55)',
                                        fontWeight: isActive ? 600 : 400, textAlign: 'center', lineHeight: 1.2
                                      }}>
                                        {p.emoji} {p.name}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Custom Upload */}
                            <div className="settings-section" style={{ marginTop: '1.5rem' }}>
                              <h3>Custom Upload</h3>
                              <p className="settings-section-desc">Upload your own GIF, image, or MP4 video to use as the loading animation instead.</p>
                              
                              <div className="pref-row" style={{ marginBottom: '0.75rem' }}>
                                <span className="pref-label">Upload Type</span>
                                <CustomSelect 
                                  value={settings.customLoaderType === 'default' ? 'none' : settings.customLoaderType}
                                  onChange={(val) => {
                                    if (val === 'none') {
                                      setSettings(prev => {
                                        const updated = { ...prev, customLoaderType: 'default' as const, customLoaderUrl: '' };
                                        saveSettingsToStorage(updated);
                                        return updated;
                                      });
                                    } else {
                                      handleDefaultLangChange('customLoaderType' as any, val);
                                    }
                                  }}
                                  options={[
                                    { value: 'none', label: '— Use Preset' },
                                    { value: 'image', label: '🖼️ Image / GIF' },
                                    { value: 'video', label: '🎬 MP4 Video' }
                                  ]}
                                />
                              </div>

                              {settings.customLoaderType !== 'default' && (
                                <>
                                  <div 
                                    style={{ 
                                      border: '2px dashed rgba(255,255,255,0.12)', borderRadius: '10px', 
                                      padding: '1.5rem', textAlign: 'center', 
                                      background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
                                      transition: 'all 0.25s ease'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.borderColor = 'rgba(255,100,0,0.4)';
                                      e.currentTarget.style.background = 'rgba(255,100,0,0.04)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                    }}
                                    onClick={() => {
                                      const input = document.createElement('input');
                                      input.type = 'file';
                                      input.accept = settings.customLoaderType === 'video' ? 'video/mp4' : 'image/*';
                                      input.onchange = (e: any) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const reader = new FileReader();
                                          reader.onload = (event) => {
                                            const dataUrl = event.target?.result as string;
                                            setSettings(prev => {
                                              const updated = { ...prev, customLoaderUrl: dataUrl };
                                              saveSettingsToStorage(updated);
                                              return updated;
                                            });
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      };
                                      input.click();
                                    }}
                                  >
                                    <div style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>
                                      {settings.customLoaderUrl ? '🔄' : '📂'}
                                    </div>
                                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.2rem', fontWeight: 500 }}>
                                      {settings.customLoaderUrl ? 'Click to Replace' : 'Click to Upload'}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                                      {settings.customLoaderType === 'video' ? 'MP4 format' : 'GIF · SVG · PNG · JPG'}
                                    </span>
                                  </div>

                                  {settings.customLoaderUrl && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                      <div style={{ 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                        background: 'rgba(255,255,255,0.04)', borderRadius: '8px', 
                                        padding: '0.5rem 0.8rem', border: '1px solid rgba(255,255,255,0.06)'
                                      }}>
                                        <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: 600 }}>✓ Custom active</span>
                                        <button 
                                          style={{ 
                                            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', 
                                            color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', 
                                            padding: '3px 10px', borderRadius: '6px', fontWeight: 500
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSettings(prev => {
                                              const updated = { ...prev, customLoaderUrl: '', customLoaderType: 'default' as const };
                                              saveSettingsToStorage(updated);
                                              return updated;
                                            });
                                          }}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                      {/* Upload preview */}
                                      <div style={{ 
                                        marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                        background: 'rgba(0,0,0,0.5)', borderRadius: '8px', height: '120px',
                                        border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden'
                                      }}>
                                        {settings.customLoaderType === 'video' ? (
                                          <video src={settings.customLoaderUrl} autoPlay loop muted playsInline
                                            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                                          />
                                        ) : (
                                          <img src={settings.customLoaderUrl} alt="Preview"
                                            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Settings Grid Overlay Section */}
                    {settingsTab === 'gridOverlay' && (
                      <div className="settings-tab-content animate-fade-in" style={{ width: '100%' }}>
                        
                        {/* ── Grid Overlay Sub-section ── */}
                        {uiOverlaySection === 'gridOverlay' && (
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', width: '100%' }}>
                          
                          {/* Left Column: Drag & Drop List */}
                          <div style={{ flex: '1 1 350px' }}>
                            <div className="settings-section">
                              <h3>Settings Grid Ordering</h3>
                              <p className="settings-section-desc">Drag and drop settings to change their order in the player's UI settings grid. Pinned items will be displayed in the collapsed view.</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '0.75rem' }}>
                                {(settings.settingsOrder || [
                                  'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                  'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                ]).map((key, index) => {
                                  const labelMap: Record<string, string> = {
                                    hideUIOverlays: 'UI Overlays',
                                    hideVideoName: 'Video Name',
                                    showPlayButton: 'Play Button HUD',
                                    showTimeDisplay: 'Time Display',
                                    showPlayBar: 'Timeline Scrub',
                                    showVolumeControl: 'Volume Control',
                                    showFullscreen: 'Fullscreen Toggle',
                                    disableAnimations: 'Disable Animations',
                                    pauseOnFocusChange: 'Disable Auto-Pause',
                                    allowUiSkipping: 'Skip Buttons',
                                    blockSeekingCompletely: 'Block Seeking',
                                    autoSkipIntroOutro: 'Auto-Skip Intro/Outro',
                                    lockModeActive: 'Lock Controls'
                                  };
                                  return (
                                    <div
                                      key={key}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', index.toString());
                                      }}
                                      onDragOver={(e) => e.preventDefault()}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                        const currentOrder = settings.settingsOrder || [
                                          'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                          'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                        ];
                                        const newOrder = [...currentOrder];
                                        const [movedItem] = newOrder.splice(sourceIndex, 1);
                                        newOrder.splice(index, 0, movedItem);
                                        handleDefaultLangChange('settingsOrder', newOrder);
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: index < 5 ? 'rgba(0, 122, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                                        border: index < 5 ? '1px dashed rgba(0, 122, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '6px',
                                        cursor: 'grab',
                                        fontSize: '0.85rem',
                                        color: '#fff',
                                        userSelect: 'none'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 'bold' }}>{index + 1}</span>
                                        <span>{labelMap[key] || key}</span>
                                      </div>
                                      {index < 5 ? (
                                        <span style={{ fontSize: '0.7rem', color: '#007aff', fontWeight: 600, background: 'rgba(0, 122, 255, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                                          Pinned
                                        </span>
                                      ) : index === 5 ? (
                                        <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600, background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px' }}>
                                          Grid Action
                                        </span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Right Column: Player Style Preview */}
                          <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="settings-section" style={{ width: '100%' }}>
                              <h3>Real-time HUD Preview</h3>
                              <p className="settings-section-desc">See how the overlay settings card looks on screen. Toggle collapsed/expanded view below.</p>
                              
                              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <button
                                  className={`btn`}
                                  onClick={() => setPreviewExpanded(false)}
                                  style={{
                                    padding: '0.4rem 1rem',
                                    fontSize: '0.8rem',
                                    background: !previewExpanded ? '#e50914' : 'rgba(255,255,255,0.08)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                  }}
                                >
                                  Collapsed (3x2 Combo)
                                </button>
                                <button
                                  className={`btn`}
                                  onClick={() => setPreviewExpanded(true)}
                                  style={{
                                    padding: '0.4rem 1rem',
                                    fontSize: '0.8rem',
                                    background: previewExpanded ? '#e50914' : 'rgba(255,255,255,0.08)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                  }}
                                >
                                  Expanded (4x4 Combo)
                                </button>
                              </div>

                              {/* Simulated Video Frame */}
                              <div style={{
                                position: 'relative',
                                width: '100%',
                                height: '260px',
                                background: 'radial-gradient(circle, #2a2a2a 0%, #111 100%)',
                                borderRadius: '12px',
                                border: '1px solid rgba(255,255,255,0.08)',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end'
                              }}>
                                <div style={{ position: 'absolute', left: '1.25rem', top: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Video Player Preview</span>
                                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Mock Episode 01</span>
                                </div>

                                {/* Mock Volume Pill at the bottom-left corner */}
                                <div className="mock-volume-pill" style={{ position: 'absolute', left: '1.25rem', bottom: '1.25rem', zIndex: 10 }}>
                                  <div className="mock-volume-btn">
                                    <Volume2 size={16} />
                                  </div>
                                  <div className="mock-volume-slider-container">
                                    <div className="mock-volume-track">
                                      <div className="mock-volume-thumb"></div>
                                    </div>
                                  </div>
                                  <span className="mock-volume-percent">80</span>
                                </div>

                                {/* Mock Settings Overlay Card clinged to right edge */}
                                <div style={{
                                  background: 'rgba(18, 18, 18, 0.96)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  borderRight: 'none',
                                  borderRadius: '16px 0 0 16px',
                                  padding: '1rem',
                                  width: !previewExpanded ? '110px' : '200px',
                                  height: '200px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.75rem',
                                  boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
                                  transition: 'all 0.3s ease',
                                  boxSizing: 'border-box'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#888', fontWeight: 600 }}>UI Settings</span>
                                    <X size={12} style={{ color: '#555', cursor: 'default' }} />
                                  </div>

                                  {/* Grid representation */}
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: !previewExpanded ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                                    gap: '0.4rem',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                  }}>
                                    {!previewExpanded ? (
                                      <>
                                        {(settings.settingsOrder || [
                                          'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                          'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                        ]).slice(0, 5).map((key) => renderMockPreviewButton(key))}
                                        
                                        <div style={{
                                          background: 'rgba(255, 255, 255, 0.05)',
                                          border: '1px solid rgba(255, 255, 255, 0.1)',
                                          color: 'rgba(255, 255, 255, 0.8)',
                                          borderRadius: '6px',
                                          padding: '5px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '0.75rem',
                                          height: '28px'
                                        }}>
                                          <ChevronRight size={14} />
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        {(settings.settingsOrder || [
                                          'hideUIOverlays', 'hideVideoName', 'showPlayButton', 'showTimeDisplay', 'showPlayBar', 'showVolumeControl',
                                          'showFullscreen', 'disableAnimations', 'pauseOnFocusChange', 'allowUiSkipping', 'blockSeekingCompletely', 'autoSkipIntroOutro', 'lockModeActive'
                                        ]).map((key) => renderMockPreviewButton(key))}

                                        <div style={{
                                          background: 'rgba(255, 255, 255, 0.05)',
                                          border: '1px solid rgba(255, 255, 255, 0.1)',
                                          color: 'rgba(255, 255, 255, 0.8)',
                                          borderRadius: '6px',
                                          padding: '5px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '0.75rem',
                                          height: '28px'
                                        }}>
                                          <ChevronLeft size={14} />
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                        </div>
                        )}

                        {/* ── Pause Overlay Sub-section ── */}
                        {uiOverlaySection === 'pauseOverlay' && (
                          <div className="animate-fade-in" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', width: '100%' }}>
                            {/* Settings Card */}
                            <div style={{
                              flex: '1 1 350px',
                              background: 'rgba(255,255,255,0.025)',
                              border: '1px solid rgba(255,255,255,0.07)',
                              borderRadius: '12px',
                              padding: '1.25rem 1.5rem',
                            }}>
                              <div className="settings-section" style={{ margin: 0 }}>
                                <h3 style={{ marginTop: 0 }}>Pause Overlay</h3>
                                <p className="settings-section-desc">Customize the metadata overlay shown when the video is paused.</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.6rem' }}>
                                  
                                  {/* Enable Toggle */}
                                  <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span className="pref-label">Enable Pause Overlay</span>
                                    <ToggleSwitch 
                                      checked={settings.getOverlayDataFromTmdb !== false} 
                                      onChange={(checked) => handleDefaultLangChange('getOverlayDataFromTmdb', checked)}
                                    />
                                  </div>

                                  {settings.getOverlayDataFromTmdb !== false && (
                                    <>
                                      {/* Position Select */}
                                      <div className="pref-row animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="pref-label">Overlay Position</span>
                                        <CustomSelect 
                                          value={settings.overlayPosition || 'bottom-left'}
                                          onChange={(val) => handleDefaultLangChange('overlayPosition', val)}
                                          options={[
                                            { value: 'bottom-left', label: 'Bottom Left' },
                                            { value: 'bottom-right', label: 'Bottom Right' },
                                            { value: 'top-left', label: 'Top Left' },
                                            { value: 'top-right', label: 'Top Right' }
                                          ]}
                                        />
                                      </div>

                                      {/* Show Background Gradient */}
                                      <div className="pref-row animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="pref-label">Background Gradient</span>
                                        <ToggleSwitch 
                                          checked={settings.overlayShowBackground !== false} 
                                          onChange={(checked) => handleDefaultLangChange('overlayShowBackground', checked)}
                                        />
                                      </div>

                                      {/* Show Rating */}
                                      <div className="pref-row animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="pref-label">Show Rating</span>
                                        <ToggleSwitch 
                                          checked={settings.overlayShowRating !== false} 
                                          onChange={(checked) => handleDefaultLangChange('overlayShowRating', checked)}
                                        />
                                      </div>

                                      {/* Show Overview */}
                                      <div className="pref-row animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="pref-label">Show Overview</span>
                                        <ToggleSwitch 
                                          checked={settings.overlayShowOverview !== false} 
                                          onChange={(checked) => handleDefaultLangChange('overlayShowOverview', checked)}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Visual Drag-Drop Preview */}
                            {settings.getOverlayDataFromTmdb !== false && (
                              <div style={{
                                flex: '1 1 350px',
                                background: 'rgba(255,255,255,0.025)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: '12px',
                                padding: '1.25rem 1.5rem',
                              }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                                  Preview — Click a corner to position
                                </h4>
                                <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 1rem 0' }}>
                                  Click any corner of the video frame below to move the overlay.
                                </p>

                                {/* Mock Video Frame */}
                                <div style={{
                                  position: 'relative',
                                  width: '100%',
                                  height: '280px',
                                  background: 'radial-gradient(circle at 30% 40%, #2a2a3a 0%, #0f0f15 100%)',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  overflow: 'hidden',
                                  cursor: 'pointer'
                                }}
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const x = (e.clientX - rect.left) / rect.width;
                                  const y = (e.clientY - rect.top) / rect.height;
                                  const isLeft = x < 0.5;
                                  const isTop = y < 0.5;
                                  const pos = `${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`;
                                  handleDefaultLangChange('overlayPosition', pos);
                                }}
                                >
                                  {/* Gradient Scrim Preview */}
                                  {settings.overlayShowBackground !== false && (
                                    <div style={{
                                      position: 'absolute',
                                      inset: 0,
                                      background: (() => {
                                        const pos = settings.overlayPosition || 'bottom-left';
                                        const hGrad = pos.includes('left')
                                          ? 'linear-gradient(to right, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 30%, transparent 60%)'
                                          : 'linear-gradient(to left, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 30%, transparent 60%)';
                                        const vGrad = pos.includes('top')
                                          ? 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 35%, transparent 60%)'
                                          : 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.25) 35%, transparent 60%)';
                                        return `${hGrad}, ${vGrad}`;
                                      })(),
                                      transition: 'background 0.4s ease',
                                      pointerEvents: 'none',
                                      zIndex: 1
                                    }} />
                                  )}

                                  {/* Corner Hotspots */}
                                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => {
                                    const isActive = (settings.overlayPosition || 'bottom-left') === corner;
                                    return (
                                      <div key={corner} style={{
                                        position: 'absolute',
                                        ...(corner.includes('top') ? { top: '8px' } : { bottom: '8px' }),
                                        ...(corner.includes('left') ? { left: '8px' } : { right: '8px' }),
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        border: `2px solid ${isActive ? '#8b5cf6' : 'rgba(255,255,255,0.2)'}`,
                                        background: isActive ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.05)',
                                        zIndex: 5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s ease',
                                        pointerEvents: 'none'
                                      }}>
                                        {isActive && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }} />}
                                      </div>
                                    );
                                  })}

                                  {/* Mock Overlay Text */}
                                  <div style={{
                                    position: 'absolute',
                                    zIndex: 3,
                                    ...((() => {
                                      const pos = settings.overlayPosition || 'bottom-left';
                                      return {
                                        ...(pos.includes('top') ? { top: '20px' } : { bottom: '20px' }),
                                        ...(pos.includes('left') ? { left: '20px' } : { right: '20px' }),
                                      };
                                    })()),
                                    maxWidth: '45%',
                                    textAlign: (settings.overlayPosition || 'bottom-left').includes('right') ? 'right' as const : 'left' as const,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    alignItems: (settings.overlayPosition || 'bottom-left').includes('right') ? 'flex-end' : 'flex-start',
                                    transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                                    pointerEvents: 'none'
                                  }}>
                                    <div style={{
                                      fontSize: '1.1rem',
                                      fontWeight: 800,
                                      color: '#fff',
                                      textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                                      fontFamily: "'Outfit', 'Inter', sans-serif",
                                      letterSpacing: '-0.02em'
                                    }}>
                                      Movie Title
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                                      Season 1 · Episode 4 · 50m
                                    </div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>
                                      Episode Title
                                    </div>
                                    {settings.overlayShowOverview !== false && (
                                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', lineHeight: '1.4', maxWidth: '200px' }}>
                                        A brief description of the episode content appears here...
                                      </div>
                                    )}
                                    {settings.overlayShowRating !== false && (
                                      <div style={{ fontSize: '0.6rem', color: '#fbbf24', fontWeight: 600 }}>
                                        ★ 8.5 / 10
                                      </div>
                                    )}
                                  </div>

                                  {/* Video watermark text */}
                                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.08)', letterSpacing: '2px', textTransform: 'uppercase', pointerEvents: 'none', zIndex: 0 }}>
                                    VIDEO PREVIEW
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    )}

                  </div>

                  <div className="settings-page-footer">
                    <button className="btn-dark-reset" onClick={() => setShowResetConfirm(true)}>
                      Reset All Settings
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="mobile-bottom-nav">
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => {
            setSelectedActor(null);
            setSelectedDetailsMedia(null);
            setActiveTab('home');
          }}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => {
            setSelectedActor(null);
            setSelectedDetailsMedia(null);
            setActiveTab('history');
          }}
        >
          <History size={20} />
          <span>History</span>
        </button>
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'online' ? 'active' : ''}`}
          onClick={() => {
            setSelectedActor(null);
            setSelectedDetailsMedia(null);
            setActiveTab('online');
          }}
        >
          <Play size={20} />
          <span>Online</span>
        </button>
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => {
            setSelectedActor(null);
            setSelectedDetailsMedia(null);
            setActiveTab('library');
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 2px auto' }}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>Library</span>
        </button>
        <button 
          className={`mobile-bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => {
            setSelectedActor(null);
            setSelectedDetailsMedia(null);
            setActiveTab('settings');
          }}
        >
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </div>

      {/* Reset settings confirmation modal */}
      {showResetConfirm && (
        <div 
          className="modal-backdrop-clean animate-fade-in" 
          onClick={() => setShowResetConfirm(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            className="confirm-modal-box animate-scale-in" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181818',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '2rem',
              width: '380px',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#fff', fontSize: '1.25rem', fontFamily: 'sans-serif' }}>Reset All Settings?</h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#aaa', fontSize: '0.9rem', lineHeight: '1.5', fontFamily: 'sans-serif' }}>
              This will reset all player controls, keybinds, and display settings to their factory defaults. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '6px',
                  color: 'rgba(255,255,255,0.8)',
                  padding: '0.6rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleResetSettings();
                  setShowResetConfirm(false);
                }}
                style={{
                  background: '#e50914',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '0.6rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(229,9,20,0.3)',
                  transition: 'background 0.2s, transform 0.1s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f40b17'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#e50914'}
              >
                Yes, Reset
              </button>
            </div>
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
        .app-sidebar.collapsed {
          width: 80px;
          padding: 1.5rem 0.5rem;
        }
        /* Sub-page layout space overrides to reclaim wasted space */
        .sidebar-collapsed .media-details-page-container,
        .sidebar-collapsed .actor-page-container {
          position: relative !important;
          top: auto !important;
          left: auto !important;
          width: 100% !important;
          height: auto !important;
          min-height: 100% !important;
          z-index: 1 !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
        }
        .sidebar-collapsed .media-details-content-wrapper,
        .sidebar-collapsed .actor-details-container {
          max-width: 100% !important;
          padding: 1rem 3rem 4rem !important;
          margin: 0 !important;
          box-sizing: border-box !important;
        }
        .sidebar-collapsed .actor-details-header,
        .sidebar-collapsed .media-details-header {
          height: 60px !important;
          padding: 0 3rem !important;
        }
        .sidebar-collapsed .main-content {
          padding-top: 0 !important;
          padding-bottom: 0 !important;
        }
        .full-width-details {
          max-width: 100% !important;
          width: 100% !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .workspace-panel-wrapper {
          width: 100% !important;
          max-width: 100% !important;
          padding-top: 1rem !important;
        }
        .workspace-panel {
          width: 100% !important;
          max-width: 100% !important;
          padding: 1.25rem !important;
        }
        @media (max-width: 576px) {
          .workspace-panel {
            padding: 0.85rem 0.75rem !important;
          }
          .container {
            padding: 0.5rem 0.5rem !important;
          }
        }
        .app-sidebar.collapsed .sidebar-header {
          display: flex;
          justify-content: center;
          margin-bottom: 2.5rem;
        }
        .app-sidebar.collapsed .sidebar-logo {
          font-size: 1.8rem;
          font-weight: 900;
          text-align: center;
        }
        .app-sidebar.collapsed .sidebar-menu-text,
        .app-sidebar.collapsed .sidebar-history-section,
        .app-sidebar.collapsed .sidebar-settings-btn span {
          display: none;
        }
        .app-sidebar.collapsed .sidebar-menu-item,
        .app-sidebar.collapsed .sidebar-settings-btn {
          justify-content: center;
          padding: 0.75rem;
          gap: 0;
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
        .settings-active .main-layout-wrapper {
          overflow-y: hidden !important;
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
          padding-top: 1.5rem;
          padding-bottom: 1.5rem;
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
          height: calc(100vh - 32px);
          max-height: calc(100vh - 32px);
          padding-top: 1.25rem;
          padding-bottom: 1rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .scrollable-panel {
          max-height: calc(100vh - 124px);
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
          gap: 1.25rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 0.75rem;
          margin-bottom: 2rem !important;
          margin-top: 0.5rem !important;
          overflow: visible !important;
          flex-wrap: nowrap !important;
          width: 100%;
          box-sizing: border-box;
          position: relative;
          z-index: 100;
        }
        .settings-tab-nav::-webkit-scrollbar {
          display: none;
        }
        .settings-nav-btn {
          flex-shrink: 0;
        }
        .settings-nav-btn {
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: rgba(255, 255, 255, 0.6);
          padding: 0.5rem 0.25rem;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .settings-nav-btn:hover {
          color: #ffffff;
        }
        .settings-nav-btn.active {
          border-bottom: 2px solid #e50914;
          color: #ffffff;
          box-shadow: none;
        }
        .settings-nav-select .custom-select-trigger {
          background: transparent !important;
          border: none !important;
          border-bottom: 2px solid transparent !important;
          border-radius: 0 !important;
          color: rgba(255, 255, 255, 0.6) !important;
          padding: 0.5rem 0.25rem !important;
          font-size: 0.95rem !important;
          font-weight: 600 !important;
          box-shadow: none !important;
        }
        .settings-nav-select .custom-select-trigger:hover {
          color: #ffffff !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .settings-nav-select.active .custom-select-trigger {
          border-bottom: 2px solid #e50914 !important;
          color: #ffffff !important;
        }
        .settings-nav-select .custom-select-dropdown {
          min-width: 160px;
          right: auto;
          z-index: 999999 !important;
          top: 100% !important;
          background: #18181c !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.95) !important;
        }
        /* Override the global 220px !important for this specific nav dropdown */
        .settings-panel .custom-select-container.settings-nav-select {
          width: 140px !important;
          position: relative !important;
          z-index: 99999 !important;
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
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          justify-content: flex-end;
        }
        .btn-dark-reset {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.7);
          padding: 0.6rem 1.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          outline: none;
        }
        .btn-dark-reset:hover {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.4);
          color: #ef4444;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
        }
        .mock-volume-pill {
          display: flex;
          align-items: center;
          background: rgba(18, 18, 18, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 2px;
          height: 38px;
          box-sizing: border-box;
          gap: 0px;
          transition: gap 0.25s cubic-bezier(0.16, 1, 0.3, 1), padding 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          cursor: pointer;
        }
        .mock-volume-pill:hover {
          gap: 12px;
          padding-right: 12px;
        }
        .mock-volume-btn {
          width: 32px;
          height: 32px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.8);
          transition: background 0.25s ease, border-color 0.25s ease;
          flex-shrink: 0;
        }
        .mock-volume-pill:hover .mock-volume-btn {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .mock-volume-slider-container {
          width: 0;
          min-width: 0;
          overflow: hidden;
          opacity: 0;
          display: flex;
          align-items: center;
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
          flex-shrink: 0;
        }
        .mock-volume-pill:hover .mock-volume-slider-container {
          width: 130px;
          opacity: 1;
        }
        .mock-volume-track {
          width: 130px;
          height: 3px;
          background: linear-gradient(to right, #007aff 0%, #007aff 80%, rgba(255, 255, 255, 0.08) 80%, rgba(255, 255, 255, 0.08) 100%);
          border-radius: 2px;
          position: relative;
        }
        .mock-volume-thumb {
          position: absolute;
          left: 80%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #007aff;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        }
        .mock-volume-percent {
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 500;
          width: 0;
          min-width: 0;
          overflow: hidden;
          opacity: 0;
          text-align: right;
          font-family: 'Outfit', sans-serif;
          flex-shrink: 0;
          user-select: none;
          transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
        }
        .mock-volume-pill:hover .mock-volume-percent {
          width: 24px;
          opacity: 1;
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
          padding: 0.6rem 0.85rem;
          background: rgba(24, 24, 24, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
          gap: 0.75rem;
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
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem 1.5rem;
          width: 100%;
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
        @media (max-width: 580px) {
          .premium-red-banner {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 1.2rem;
          }
          .premium-red-banner button {
            width: 100%;
            justify-content: center;
          }
          .inline-url-input-wrapper {
            flex-direction: column;
            gap: 0.55rem;
          }
          .inline-url-btn {
            width: 100%;
            justify-content: center;
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

        /* Toast Animations */
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
        /* Modal Animations */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Global Toast Container */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}>
        {toasts.map(t => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const isWarning = t.type === 'warning';
          
          const iconColor = isSuccess ? '#10b981' : isError ? '#ef4444' : '#f59e0b';
          const borderHighlight = isSuccess ? 'rgba(16, 185, 129, 0.25)' : isError ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)';
          const glowShadow = isSuccess ? '0 10px 25px rgba(16, 185, 129, 0.12)' : isError ? '0 10px 25px rgba(239, 68, 68, 0.12)' : '0 10px 25px rgba(245, 158, 11, 0.12)';

          return (
            <div
              key={t.id}
              style={{
                pointerEvents: 'auto',
                background: '#161616',
                border: `1px solid ${borderHighlight}`,
                color: '#fff',
                borderRadius: '10px',
                boxShadow: `0 15px 35px rgba(0, 0, 0, 0.6), ${glowShadow}`,
                display: 'flex',
                flexDirection: 'column',
                width: '350px',
                animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                position: 'relative',
                overflow: 'hidden',
                fontFamily: 'Outfit, sans-serif'
              }}
            >
              {/* Header Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 18px 6px 18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Icon */}
                  {isSuccess && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  )}
                  {isError && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  )}
                  {isWarning && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  )}
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>{t.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: 0,
                    lineHeight: 1,
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
                >
                  ×
                </button>
              </div>

              {/* Subtitle text */}
              <div style={{
                fontSize: '0.8rem',
                color: 'rgba(255, 255, 255, 0.65)',
                lineHeight: 1.4,
                padding: '0 18px 12px 46px'
              }}>
                {t.text}
              </div>

              {/* Bottom countdown strip */}
              <div 
                onClick={() => {
                  setToasts(prev => prev.map(item => {
                    if (item.id === t.id) {
                      return { ...item, isPaused: !item.isPaused };
                    }
                    return item;
                  }));
                }}
                style={{
                  background: 'rgba(0, 0, 0, 0.25)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                  padding: '8px 18px',
                  fontSize: '0.72rem',
                  color: 'rgba(255, 255, 255, 0.45)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                {t.isPaused 
                  ? "Auto-dismiss paused. Click to resume." 
                  : `This message will close in ${Math.ceil(t.timeLeft / 1000)} seconds. Click to stop.`}
              </div>

              {/* Bottom Progress Bar */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2.5px',
                background: iconColor,
                width: `${(t.timeLeft / t.duration) * 100}%`,
                transition: 'width 0.1s linear'
              }} />
            </div>
          );
        })}
      </div>

      {/* Global Auth Modal (Login / Signup) */}
      {isAuthModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 9990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '380px',
            background: '#141414',
            borderRadius: '16px',
            boxShadow: '0 0 35px rgba(239, 68, 68, 0.18)',
            overflow: 'hidden',
            padding: '32px 24px 28px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            position: 'relative',
            border: '1px solid rgba(239, 68, 68, 0.25)'
          }}>
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setAuthName('');
                setAuthUsername('');
                setAuthPassword('');
                setSelectedProfileForLogin(null);
                setIsAuthModalOpen(false);
                setAuthError('');
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: 'pointer',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                padding: 0,
                lineHeight: 1
              }}
              title="Close"
            >
              ×
            </button>

            {/* Header Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'center' }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '1.35rem', 
                fontWeight: 700, 
                color: '#ef4444', 
                fontFamily: 'Outfit, sans-serif' 
              }}>
                {selectedProfileForLogin ? "Enter Profile Password" : "Log in or create account"}
              </h2>
              {selectedProfileForLogin && (
                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'Outfit, sans-serif' }}>
                  Logging into profile <strong>{selectedProfileForLogin.name}</strong>
                </span>
              )}
            </div>

            {/* Tab Selection (Centered in the middle) */}
            {!selectedProfileForLogin && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '24px', 
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)', 
                paddingBottom: '8px' 
              }}>
                <button
                  type="button"
                  onClick={() => { setAuthModalTab('login'); setAuthError(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: authModalTab === 'login' ? '#ef4444' : 'rgba(255, 255, 255, 0.4)',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    position: 'relative',
                    paddingBottom: '6px',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                >
                  Login
                  {authModalTab === 'login' && (
                    <div style={{
                      position: 'absolute',
                      bottom: '-9px',
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: 'linear-gradient(90deg, #ef4444, #f97316)'
                    }} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthModalTab('signup'); setAuthError(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: authModalTab === 'signup' ? '#ef4444' : 'rgba(255, 255, 255, 0.4)',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    position: 'relative',
                    paddingBottom: '6px',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                >
                  Sign Up
                  {authModalTab === 'signup' && (
                    <div style={{
                      position: 'absolute',
                      bottom: '-9px',
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: 'linear-gradient(90deg, #ef4444, #f97316)'
                    }} />
                  )}
                </button>
              </div>
            )}

            {/* Error Message */}
            {authError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                fontSize: '0.78rem',
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 500,
                fontFamily: 'Outfit, sans-serif'
              }}>
                ⚠️ {authError}
              </div>
            )}

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Profile Name Input (Only on Sign Up) */}
              {authModalTab === 'signup' && !selectedProfileForLogin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                    Profile Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter profile name..."
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '0.88rem',
                      color: '#ffffff',
                      outline: 'none',
                      fontFamily: 'Outfit, sans-serif'
                    }}
                  />
                </div>
              )}

              {/* Username Input */}
              {!selectedProfileForLogin && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    placeholder="Enter username..."
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '0.88rem',
                      color: '#ffffff',
                      outline: 'none',
                      fontFamily: 'Outfit, sans-serif'
                    }}
                  />
                </div>
              )}

              {/* Password Input */}
              {(selectedProfileForLogin || authModalTab === 'login' || authModalTab === 'signup') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '0.88rem',
                      color: '#ffffff',
                      outline: 'none',
                      fontFamily: 'Outfit, sans-serif'
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        document.getElementById('auth-modal-submit-btn')?.click();
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Actions Submit Button */}
            <button
              id="auth-modal-submit-btn"
              type="button"
              onClick={async () => {
                setAuthError('');
                const isSignUp = authModalTab === 'signup' && !selectedProfileForLogin;
                
                if (isSignUp) {
                  const profileName = authName.trim() || authUsername.trim() || 'New User';
                  const currentIsOnboarded = settings.isOnboarded;
                  try {
                    const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/migrate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ 
                        name: profileName, 
                        username: authUsername.trim() || undefined,
                        password: authPassword || undefined,
                        isSignUp: true,
                        settings: { ...settings, isOnboarded: currentIsOnboarded }, 
                        history: videos 
                      })
                    });
                    const resData = await res.json();
                    if (resData.success) {
                      const oldUserId = settings.userId;
                      localStorage.setItem('valor_active_user_id', resData.userId);
                      localStorage.setItem('valor_logged_in_username', authUsername.trim());
                      const updated = {
                         ...settings,
                         userId: resData.userId,
                         storageMode: 'file' as const,
                         isOnboarded: currentIsOnboarded
                       };
                       setSettings(updated);
                       saveSettingsToStorage(updated);
                      
                      // Remove local profile from localStorage
                      if (oldUserId && (oldUserId === 'local' || oldUserId.startsWith('local_'))) {
                        let localProfiles = [];
                        try {
                          const localSaved = localStorage.getItem('valor_local_profiles');
                          if (localSaved) localProfiles = JSON.parse(localSaved);
                        } catch {}
                        localProfiles = localProfiles.filter((p: any) => p.userId !== oldUserId);
                        localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));
                        
                        const oldSettingsKey = oldUserId === 'local' ? 'valor_settings' : `valor_settings_${oldUserId}`;
                        const oldVideosKey = oldUserId === 'local' ? 'valor_videos' : `valor_videos_${oldUserId}`;
                        localStorage.removeItem(oldSettingsKey);
                        localStorage.removeItem(oldVideosKey);
                      }
                      
                      addToast(`Successfully created Server Profile: ${profileName}!`, 'success');
                      addToast('Starting synchronization of watch history and settings...', 'success');
                      
                      const historyRes = await secureFetch(`${BACKEND_ORIGIN}/api/history?userId=${resData.userId}`);
                      const serverHistory = await historyRes.json();
                      if (Array.isArray(serverHistory)) {
                        setVideos(serverHistory);
                      }
                      
                      addToast('Synchronization complete! All settings and watch history synced.', 'success');
                      
                      if (onAuthSuccess) {
                        onAuthSuccess(resData.userId);
                      }
                      
                      setAuthName('');
                      setAuthUsername('');
                      setAuthPassword('');
                      setIsAuthModalOpen(false);
                      await fetchProfiles();
                    } else {
                      setAuthError(resData.error || 'Failed to create profile');
                    }
                  } catch (err: any) {
                    setAuthError(err.message || 'Profile generation failed.');
                  }
                } else {
                  try {
                    const isAccountLoginAndSync = !selectedProfileForLogin && (!settings.userId || settings.userId === 'local' || settings.userId.startsWith('local_'));
                    
                    if (isAccountLoginAndSync) {
                      // 1. Verify credentials by attempting a login
                      const verifyRes = await secureFetch(`${BACKEND_ORIGIN}/api/profile/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: authUsername.trim(), password: authPassword })
                      });
                      const verifyData = await verifyRes.json();
                      if (!verifyData.success) {
                        setAuthError(verifyData.error || 'Incorrect username or password');
                        return;
                      }
                      
                      // 2. Credentials are correct! Create a new profile under this account with the current local data
                      const profileName = settings.profileName || 'Local Browser Saves';
                      const migrateRes = await secureFetch(`${BACKEND_ORIGIN}/api/profile/migrate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          name: profileName, 
                          username: authUsername.trim(),
                          password: authPassword,
                          isLoginAndSync: true,
                          settings: { ...settings, isOnboarded: true }, 
                          history: videos 
                        })
                      });
                      const migrateData = await migrateRes.json();
                      if (migrateData.success) {
                        const oldUserId = settings.userId;
                        const pId = migrateData.userId;
                        localStorage.setItem('valor_active_user_id', pId);
                        localStorage.setItem('valor_logged_in_username', authUsername.trim());
                        
                        const updated = {
                          ...settings,
                          userId: pId,
                          storageMode: 'file' as const,
                          isOnboarded: true
                        };
                        setSettings(updated);
                        saveSettingsToStorage(updated);
                        
                        // Remove local profile from localStorage
                        if (oldUserId && (oldUserId === 'local' || oldUserId.startsWith('local_'))) {
                          let localProfiles = [];
                          try {
                            const localSaved = localStorage.getItem('valor_local_profiles');
                            if (localSaved) localProfiles = JSON.parse(localSaved);
                          } catch {}
                          localProfiles = localProfiles.filter((p: any) => p.userId !== oldUserId);
                          localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));
                          
                          const oldSettingsKey = oldUserId === 'local' ? 'valor_settings' : `valor_settings_${oldUserId}`;
                          const oldVideosKey = oldUserId === 'local' ? 'valor_videos' : `valor_videos_${oldUserId}`;
                          localStorage.removeItem(oldSettingsKey);
                          localStorage.removeItem(oldVideosKey);
                        }
                        
                        addToast(`Successfully created Server Profile under account: ${profileName}!`, 'success');
                        addToast('Starting synchronization of watch history and settings...', 'success');
                        
                        const historyRes = await secureFetch(`${BACKEND_ORIGIN}/api/history?userId=${pId}`);
                        const serverHistory = await historyRes.json();
                        if (Array.isArray(serverHistory)) {
                          setVideos(serverHistory);
                        }
                        
                        addToast('Synchronization complete! All settings and watch history synced.', 'success');
                        
                        if (onAuthSuccess) {
                          onAuthSuccess(pId);
                        }
                        
                        setAuthName('');
                        setAuthUsername('');
                        setAuthPassword('');
                        setIsAuthModalOpen(false);
                        await fetchProfiles();
                      } else {
                        setAuthError(migrateData.error || 'Failed to create profile under account');
                      }
                    } else {
                      // Regular login (unlocking an existing profile, or server profile switch)
                      const payload = selectedProfileForLogin 
                        ? { userId: selectedProfileForLogin.userId, password: authPassword }
                        : { username: authUsername.trim(), password: authPassword };
                        
                      const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                      });
                      const resData = await res.json();
                      if (resData.success) {
                        const pId = resData.userId;
                        const finalUsername = selectedProfileForLogin ? selectedProfileForLogin.username : authUsername.trim();
                        localStorage.setItem('valor_active_user_id', pId);
                        if (finalUsername) {
                          localStorage.setItem('valor_logged_in_username', finalUsername);
                        }
                        const initialLoaded = {
                          ...settings,
                          userId: pId,
                          storageMode: 'file' as const
                        };
                        setSettings(initialLoaded);
                        saveSettingsToStorage(initialLoaded);
                        
                        const profileRes = await secureFetch(`${BACKEND_ORIGIN}/api/profile/data?userId=${pId}`);
                        const profileData = await profileRes.json();
                        if (profileData && profileData.settings) {
                          const loaded = {
                            ...defaultSettings,
                            ...profileData.settings,
                            userId: pId,
                            storageMode: 'file' as const
                          };
                          setSettings(loaded);
                          saveSettingsToStorage(loaded);
                        }
                        if (profileData && Array.isArray(profileData.history)) {
                          setVideos(profileData.history.map((v: any) => ({
                            ...v,
                            audioTracks: v.audioTracks || [],
                            subtitleTracks: v.subtitleTracks || []
                          })));
                        }
                        
                        addToast(`Logged in and switched to profile: ${resData.name}`, 'success');
                        
                        if (onAuthSuccess) {
                          onAuthSuccess(pId);
                        }
                        
                        setAuthName('');
                        setAuthUsername('');
                        setAuthPassword('');
                        setSelectedProfileForLogin(null);
                        setIsAuthModalOpen(false);
                        await fetchProfiles();
                      } else {
                        setAuthError(resData.error || 'Incorrect username or password');
                      }
                    }
                  } catch (err: any) {
                    setAuthError(err.message || 'Login / Sync failed.');
                  }
                }
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: 'none',
                color: '#ffffff',
                padding: '14px',
                fontSize: '0.9rem',
                borderRadius: '999px',
                cursor: 'pointer',
                fontWeight: 600,
                marginTop: '10px',
                transition: 'opacity 0.2s',
                fontFamily: 'Outfit, sans-serif',
                boxShadow: '0 4px 15px rgba(249, 115, 22, 0.3)'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {selectedProfileForLogin || authModalTab === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>
      )}

      {/* Direct Profile Creation Modal (Bypasses onboarding) */}
      {isCreateProfileModalOpen && (() => {
        const isServerMode = settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_');
        const activeServerProfile = (availableProfiles || []).find(p => p.userId === settings.userId);
        const loggedInUsername = activeServerProfile?.username || localStorage.getItem('valor_logged_in_username') || '';
        
        const themeColor = isServerMode ? '#ef4444' : '#2ecc71';
        const themeBorder = isServerMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(46, 204, 113, 0.25)';
        const themeTitle = isServerMode ? 'Create Server Profile' : 'Create Local Profile';
        const themeButtonBg = isServerMode ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, #2ecc71, #27ae60)';
        
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              width: '380px',
              background: '#141414',
              borderRadius: '16px',
              border: `1px solid ${themeBorder}`,
              boxShadow: isServerMode ? '0 0 30px rgba(239,68,68,0.15)' : '0 0 30px rgba(46,204,113,0.15)',
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              position: 'relative'
            }}>
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsCreateProfileModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  padding: 0
                }}
              >
                ×
              </button>

              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: themeColor, fontFamily: 'Outfit, sans-serif' }}>
                  {themeTitle}
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'Outfit, sans-serif', lineHeight: 1.4 }}>
                  {isServerMode 
                    ? `Create a new syncing profile under your account: ${loggedInUsername}`
                    : 'Create a new local storage profile inside your browser.'}
                </p>
              </div>

              {createProfileError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontSize: '0.75rem',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontFamily: 'Outfit, sans-serif'
                }}>
                  ⚠️ {createProfileError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                    Profile Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter profile name..."
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '0.88rem',
                      color: '#ffffff',
                      outline: 'none',
                      fontFamily: 'Outfit, sans-serif'
                    }}
                  />
                </div>

                 {isServerMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>
                      Profile Password (Optional)
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={newProfilePassword}
                      onChange={e => setNewProfilePassword(e.target.value)}
                      style={{
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '0.88rem',
                        color: '#ffffff',
                        outline: 'none',
                        fontFamily: 'Outfit, sans-serif'
                      }}
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={async () => {
                  setCreateProfileError('');
                  if (!newProfileName.trim()) {
                    setCreateProfileError('Profile name is required');
                    return;
                  }

                  if (isServerMode) {
                    try {
                      const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/migrate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                          name: newProfileName.trim(), 
                          username: loggedInUsername,
                          password: newProfilePassword,
                          isLoggedIn: true,
                          settings: { ...settings, isOnboarded: true },
                          history: [] 
                        })
                      });
                      const resData = await res.json();
                      if (resData.success) {
                        localStorage.setItem('valor_active_user_id', resData.userId);
                        setSettings({
                          ...defaultSettings,
                          userId: resData.userId,
                          profileName: newProfileName.trim(),
                          storageMode: 'file',
                          isOnboarded: true
                        });
                        setVideos([]);
                        addToast(`Successfully created Server Profile: ${newProfileName.trim()}`, 'success');
                        setIsCreateProfileModalOpen(false);
                        await fetchProfiles();
                      } else {
                        setCreateProfileError(resData.error || 'Failed to create profile');
                      }
                    } catch (err: any) {
                      setCreateProfileError(err.message || 'Creation failed.');
                    }
                  } else {
                    const newUserId = 'local_' + Math.random().toString(36).substring(2, 11);
                    localStorage.setItem('valor_active_user_id', newUserId);
                    
                    let localProfiles = [];
                    try {
                      const localSaved = localStorage.getItem('valor_local_profiles');
                      if (localSaved) localProfiles = JSON.parse(localSaved);
                    } catch {}
                    
                    const newProfile = {
                      userId: newUserId,
                      name: newProfileName.trim(),
                      storageMode: 'localstorage',
                      hasPassword: false
                    };
                    localProfiles.push(newProfile);
                    localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));
                    
                    try {
                      const settingsKey = `valor_settings_${newUserId}`;
                      localStorage.setItem(settingsKey, JSON.stringify({
                        ...defaultSettings,
                        profileName: newProfileName.trim(),
                        userId: newUserId,
                        storageMode: 'localstorage',
                        isOnboarded: true
                      }));
                    } catch {}
                    
                    // Switch profile
                    setSettings({
                      ...defaultSettings,
                      profileName: newProfileName.trim(),
                      userId: newUserId,
                      storageMode: 'localstorage',
                      isOnboarded: true
                    });
                    setVideos([]);
                    
                    addToast(`Successfully created Local Profile: ${newProfileName.trim()}`, 'success');
                    setIsCreateProfileModalOpen(false);
                    await fetchProfiles();
                  }
                }}
                style={{
                  width: '100%',
                  background: themeButtonBg,
                  border: 'none',
                  color: '#ffffff',
                  padding: '12px',
                  fontSize: '0.88rem',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  marginTop: '6px',
                  transition: 'opacity 0.2s',
                  fontFamily: 'Outfit, sans-serif'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Create Profile
              </button>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(12px)',
          zIndex: 9990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '380px',
            background: 'rgba(22,22,22,0.95)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ef4444' }}>
                ⚠️ Permanent Deletion
              </span>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
                Are you sure you want to permanently delete profile <strong>{deleteTargetProfile?.name}</strong>? All associated watch history, bookmarks, and settings will be permanently destroyed.
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                Type <strong style={{ color: '#ef4444' }}>DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                placeholder="Type DELETE..."
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: '0.78rem',
                  color: '#fff',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                disabled={deleteConfirmText !== 'DELETE'}
                onClick={async () => {
                  if (deleteConfirmText !== 'DELETE' || !deleteTargetProfile) return;
                  const isLocalTarget = deleteTargetProfile.userId === 'local' || deleteTargetProfile.userId.startsWith('local_');
                  
                  if (isLocalTarget) {
                    try {
                      let localProfiles = [];
                      try {
                        const localSaved = localStorage.getItem('valor_local_profiles');
                        if (localSaved) localProfiles = JSON.parse(localSaved);
                      } catch {}
                      
                      localProfiles = localProfiles.filter((p: any) => p.userId !== deleteTargetProfile.userId);
                      localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));
                      
                      const settingsKey = deleteTargetProfile.userId === 'local' ? 'valor_settings' : `valor_settings_${deleteTargetProfile.userId}`;
                      const videosKey = deleteTargetProfile.userId === 'local' ? 'valor_videos' : `valor_videos_${deleteTargetProfile.userId}`;
                      localStorage.removeItem(settingsKey);
                      localStorage.removeItem(videosKey);
                      
                      addToast(`Successfully deleted local profile: ${deleteTargetProfile.name}`, 'success');
                      
                      if (settings.userId === deleteTargetProfile.userId) {
                        const serverProfiles = availableProfiles.filter((p: any) => p.userId !== 'local' && !p.userId.startsWith('local_') && p.userId !== deleteTargetProfile.userId);
                        const combinedRemaining = [...localProfiles, ...serverProfiles];
                        
                        if (combinedRemaining.length > 0) {
                          const nextProfile = combinedRemaining[0];
                          localStorage.setItem('valor_active_user_id', nextProfile.userId);
                          
                          const nextIsLocal = nextProfile.userId === 'local' || nextProfile.userId.startsWith('local_');
                          if (nextIsLocal) {
                            const nextSettingsKey = nextProfile.userId === 'local' ? 'valor_settings' : `valor_settings_${nextProfile.userId}`;
                            const nextVideosKey = nextProfile.userId === 'local' ? 'valor_videos' : `valor_videos_${nextProfile.userId}`;
                            const saved = localStorage.getItem(nextSettingsKey);
                            if (saved) {
                              try { setSettings({ ...defaultSettings, ...JSON.parse(saved), userId: nextProfile.userId, storageMode: 'localstorage' }); } catch {}
                            } else {
                              setSettings({ ...defaultSettings, userId: nextProfile.userId, storageMode: 'localstorage', profileName: nextProfile.name });
                            }
                            const savedVids = localStorage.getItem(nextVideosKey);
                            if (savedVids) {
                              try { setVideos(JSON.parse(savedVids)); } catch {}
                            } else {
                              setVideos([]);
                            }
                          } else {
                            setSettings({
                              ...defaultSettings,
                              userId: nextProfile.userId,
                              storageMode: 'file'
                            });
                            
                            try {
                              const pData = await gqlFetch(`
                                query GetProfileData($userId: String!) {
                                  profile(userId: $userId) {
                                    settings
                                    history
                                  }
                                }
                              `, { userId: nextProfile.userId });
                              const profileData = pData.profile || {};
                              if (profileData && profileData.settings) {
                                setSettings({
                                  ...defaultSettings,
                                  ...profileData.settings,
                                  userId: nextProfile.userId,
                                  storageMode: 'file'
                                });
                              }
                              if (profileData && Array.isArray(profileData.history)) {
                                setVideos(profileData.history.map((v: any) => ({
                                  ...v,
                                  audioTracks: v.audioTracks || [],
                                  subtitleTracks: v.subtitleTracks || []
                                })));
                              }
                            } catch {}
                          }
                        } else {
                          localStorage.removeItem('valor_active_user_id');
                          setSettings({
                            ...defaultSettings,
                            userId: 'local',
                            storageMode: 'localstorage',
                            isOnboarded: false
                          });
                          setVideos([]);
                        }
                      }
                      
                      setIsDeleteModalOpen(false);
                      setDeleteTargetProfile(null);
                      setDeleteConfirmText('');
                      await fetchProfiles();
                    } catch (e: any) {
                      addToast(e.message || 'Deletion error', 'error');
                    }
                  } else {
                    try {
                      const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: deleteTargetProfile.userId })
                      });
                      const resData = await res.json();
                      if (resData.success) {
                        addToast(`Successfully deleted profile: ${deleteTargetProfile.name}`, 'success');
                        
                        if (settings.userId === deleteTargetProfile.userId) {
                          localStorage.setItem('valor_active_user_id', 'local');
                          setSettings(prev => ({
                            ...prev,
                            userId: 'local',
                            storageMode: 'localstorage'
                          }));
                          const savedVideos = localStorage.getItem('valor_videos');
                          if (savedVideos) {
                            try { setVideos(JSON.parse(savedVideos)); } catch {}
                          }
                        }
                        
                        setIsDeleteModalOpen(false);
                        setDeleteTargetProfile(null);
                        setDeleteConfirmText('');
                        await fetchProfiles();
                      } else {
                        addToast(resData.error || 'Deletion failed', 'error');
                      }
                    } catch (e: any) {
                      addToast(e.message || 'Deletion error', 'error');
                    }
                  }
                }}
                style={{
                  flex: 1,
                  background: deleteConfirmText === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.2)',
                  border: 'none',
                  color: deleteConfirmText === 'DELETE' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                  padding: '10px 16px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  transition: 'background-color 0.2s'
                }}
              >
                Delete Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteTargetProfile(null);
                  setDeleteConfirmText('');
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 16px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal (Hides from switcher view on this device with verification) */}
      {isRemoveModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(12px)',
          zIndex: 9990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '380px',
            background: 'rgba(22,22,22,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                Remove Profile from Switcher
              </span>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
                This will remove the profile <strong>{removeTargetProfile?.name}</strong> from this device's profile list. The profile data is NOT deleted and remains safe on the server.
              </span>
            </div>

            {removeTargetProfile?.hasPassword ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                  Enter Password to Verify:
                </label>
                <input
                  type="password"
                  placeholder="Enter password..."
                  value={removePasswordText}
                  onChange={e => setRemovePasswordText(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    color: '#fff',
                    outline: 'none'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      document.getElementById('remove-confirm-btn')?.click();
                    }
                  }}
                />
              </div>
            ) : (
              <span style={{ fontSize: '0.72rem', color: '#2ecc71', fontWeight: 500 }}>
                ✓ No password required for this profile.
              </span>
            )}

            {removeError && (
              <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                ⚠️ {removeError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                id="remove-confirm-btn"
                type="button"
                onClick={async () => {
                  if (!removeTargetProfile) return;
                  setRemoveError('');
                  
                  if (removeTargetProfile.userId === 'local' || removeTargetProfile.userId.startsWith('local_')) {
                    let localProfiles = [];
                    try {
                      const localSaved = localStorage.getItem('valor_local_profiles');
                      if (localSaved) {
                        localProfiles = JSON.parse(localSaved);
                      }
                    } catch {}
                    
                    localProfiles = localProfiles.filter((p: any) => p.userId !== removeTargetProfile.userId);
                    localStorage.setItem('valor_local_profiles', JSON.stringify(localProfiles));
                    
                    localStorage.removeItem(`valor_settings_${removeTargetProfile.userId}`);
                    localStorage.removeItem(`valor_videos_${removeTargetProfile.userId}`);
                    
                    addToast(`Deleted local profile: ${removeTargetProfile.name}`, 'success');
                    
                    if (settings.userId === removeTargetProfile.userId) {
                      const nextProfile = localProfiles[0] || { userId: 'local', storageMode: 'localstorage' };
                      localStorage.setItem('valor_active_user_id', nextProfile.userId);
                      
                      const settingsKey = nextProfile.userId === 'local' ? 'valor_settings' : `valor_settings_${nextProfile.userId}`;
                      const videosKey = nextProfile.userId === 'local' ? 'valor_videos' : `valor_videos_${nextProfile.userId}`;
                      
                      const saved = localStorage.getItem(settingsKey);
                      if (saved) {
                        setSettings({ ...defaultSettings, ...JSON.parse(saved), userId: nextProfile.userId, storageMode: 'localstorage' });
                      } else {
                        setSettings({ ...defaultSettings, userId: nextProfile.userId, storageMode: 'localstorage' });
                      }
                      const savedVideos = localStorage.getItem(videosKey);
                      if (savedVideos) {
                        setVideos(JSON.parse(savedVideos));
                      } else {
                        setVideos([]);
                      }
                    }
                    
                    setIsRemoveModalOpen(false);
                    setRemoveTargetProfile(null);
                    setRemovePasswordText('');
                    setRemoveError('');
                    await fetchProfiles();
                    return;
                  }
                  
                  if (removeTargetProfile.hasPassword) {
                    try {
                      const res = await secureFetch(`${BACKEND_ORIGIN}/api/profile/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: removeTargetProfile.userId, password: removePasswordText })
                      });
                      const resData = await res.json();
                      if (!resData.success) {
                        setRemoveError('Incorrect password. Access denied.');
                        return;
                      }
                    } catch (e: any) {
                      setRemoveError(e.message || 'Verification failed');
                      return;
                    }
                  }

                  const newHidden = [...hiddenProfileIds, removeTargetProfile.userId];
                  setHiddenProfileIds(newHidden);
                  localStorage.setItem('valor_hidden_profile_ids', JSON.stringify(newHidden));
                  
                  addToast(`Removed profile: ${removeTargetProfile.name} from switcher list`, 'success');
                  
                  setIsRemoveModalOpen(false);
                  setRemoveTargetProfile(null);
                  setRemovePasswordText('');
                  setRemoveError('');
                }}
                style={{
                  flex: 1,
                  background: '#ef4444',
                  border: 'none',
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Remove Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRemoveModalOpen(false);
                  setRemoveTargetProfile(null);
                  setRemovePasswordText('');
                  setRemoveError('');
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 16px',
                  fontSize: '0.8rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Trakt Rewatch Confirmation Modal */}
      {isRewatchModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(12px)',
          zIndex: 9990,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            width: '420px',
            background: 'rgba(22,22,22,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            {/* Close Button X at Top Right */}
            <button
              onClick={() => {
                setIsRewatchModalOpen(false);
                setRewatchVideoTarget(null);
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255,255,255,0.05)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <X size={14} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '24px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ff7a00' }}>
                Sync Another Watch?
              </span>
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                {rewatchVideoTarget?.title}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4, marginTop: '8px' }}>
                You have already synced this media to your Trakt.tv watch history. Did you rewatch this media and want to push another watch history record?
              </span>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  if (rewatchVideoTarget) {
                    syncVideoToTraktHistory(rewatchVideoTarget, undefined, true);
                  }
                  setIsRewatchModalOpen(false);
                  setRewatchVideoTarget(null);
                }}
                style={{
                  flex: 1,
                  background: '#ff7a00',
                  border: 'none',
                  color: '#ffffff',
                  padding: '10px 16px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'background-color 0.2s'
                }}
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRewatchModalOpen(false);
                  setRewatchVideoTarget(null);
                }}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#fff',
                  padding: '10px 16px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
