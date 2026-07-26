import { useState, useEffect, useRef, Component, useCallback, useMemo, type ReactNode } from 'react';
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
      return (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-color)', color: 'var(--text-primary)', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '1rem 0 1.5rem 0' }}>
            {this.state.error?.message || 'An unexpected error occurred in the application.'}
          </p>
          <button 
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import './App.css';
import { ffmpegService } from './services/ffmpeg';
import { LocalVideoPlayer } from './components/LocalVideoPlayer';
import { RemoteVideoPlayer } from './components/RemoteVideoPlayer';
import { OnlineSearchTab } from './components/OnlineSearchTab';
import { OnlineEmbedPlayer } from './components/OnlineEmbedPlayer';
import { OnlineDetailsPage } from './components/OnlineDetailsPage';
import { EmbedPlayerPage } from './pages/EmbedPlayerPage';
import { GraphQLStorageProvider } from './services/storage/GraphQLStorageProvider';
import { LocalIndexedDBProvider } from './services/storage/LocalIndexedDBProvider';
import { ActorDetailsPage } from './components/ActorDetailsPage';
import { OnlineVideoPlayer } from './components/OnlineVideoPlayer';
import { CustomSelect } from './components/CustomSelect';
import { Onboarding01 } from './components/Onboarding01';
import { CalendarView } from './components/CalendarView';
import { LibraryView } from './components/LibraryView';
import { ApiSettingsView } from './components/ApiSettingsView';
import { SpinnerSettingsView } from './components/SpinnerSettingsView';
import { EsportsLiveOverlay } from './components/EsportsLiveOverlay';
import Calendar02 from './components/creative-tim/blocks/calendar-02';
import { classifyVideoTitle } from './utils/libraryClassifier';
import { 
  Film, UploadCloud, Play, Settings, X, Calendar, List,
  History, Home, Layers, Type, Clock, Sliders, Volume2,
  Maximize, Zap, Coffee, SkipForward, Ban, FastForward, Lock, ChevronRight, ChevronLeft,
  LogOut, Trash2, Plus, Download, UserPlus, Trophy, Radio, RotateCcw
} from 'lucide-react';
import { storeFileHandle, getFileHandle, removeFileHandle, verifyPermission, cleanupFileHandles } from './utils/indexedDB';
import { HttpByteSource, CachedByteSource, detectUrlCapabilities } from './services/remote/remoteByteSource';
import { probeContainer, parseMp4, parseMkv } from './utils/containerParser';
import { parseHlsManifest } from './utils/hlsParser';
import { LoadingSpinner, SPINNER_PRESETS, SpinnerThumbnail } from './components/LoadingSpinner';
import type { SpinnerPreset } from './components/LoadingSpinner';
import { ToggleSwitch } from './components/ToggleSwitch';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HomePage } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { OnlineStreamPage } from './pages/OnlineStreamPage';
import { SettingsPage } from './pages/SettingsPage';
import { 
  audioOptions, subOptions, calendarStyleOptions, limitOptions, 
  intervalOptions, toastOptions, uiHideTimeoutOptions, fontOptions, 
  storageModeOptions, ratingThresholdOptions 
} from './utils/constants';


const NotchedFrame: React.FC<{ children: React.ReactNode; resetAction: React.ReactNode }> = ({ children, resetAction }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { width: w, height: h } = dimensions;
  const r = 14;   // Outer corner radius
  const nw = 175; // Notch width from right
  const nh = 48;  // Notch height from bottom
  const cr = 8;   // Notch corner curve radius

  const pathD = (w > 0 && h > 0) ? `
    M ${r},0 
    L ${w - r},0 
    A ${r},${r} 0 0 1 ${w},${r} 
    L ${w},${h - nh - cr} 
    A ${cr},${cr} 0 0 1 ${w - cr},${h - nh} 
    L ${w - nw + cr},${h - nh} 
    A ${cr},${cr} 0 0 0 ${w - nw},${h - nh + cr} 
    L ${w - nw},${h - cr} 
    A ${cr},${cr} 0 0 1 ${w - nw - cr},${h} 
    L ${r},${h} 
    A ${r},${r} 0 0 1 0,${h - r} 
    L 0,${r} 
    A ${r},${r} 0 0 1 ${r},0 
    Z
  `.replace(/\s+/g, ' ').trim() : '';

  return (
    <div ref={containerRef} className="notched-container-wrapper" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}>
      {/* SVG Continuous Notched Border & Fill */}
      {w > 0 && h > 0 && (
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'visible'
          }}
        >
          <path
            d={pathD}
            fill="var(--card-bg)"
            stroke="var(--border-color)"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {/* Main Inner Content (clipped to notched path) */}
      <div 
        className="notched-content-inner"
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          padding: '0.85rem 1rem',
          clipPath: pathD ? `path('${pathD}')` : undefined
        }}
      >
        {children}
      </div>

      {/* Detached Floating Reset Button docked inside the notched recess */}
      <div
        className="notched-reset-dock"
        style={{
          position: 'absolute',
          bottom: '7px',
          right: '8px',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {resetAction}
      </div>
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
    const useIdStream = Boolean(settings.storageMode === 'file' && settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_'));
    if (typeof val === 'function') {
      rawSetVideos(prev => sanitizeVideoList(val(prev), useIdStream));
    } else {
      rawSetVideos(sanitizeVideoList(val, useIdStream));
    }
  }, [settings.storageMode, settings.userId]);

  const setPlayingVideo = useCallback((val: VideoItem | null | ((prev: VideoItem | null) => VideoItem | null)) => {
    const useIdStream = Boolean(settings.storageMode === 'file' && settings.userId && settings.userId !== 'local' && !settings.userId.startsWith('local_'));
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
  const [uiOverlaySection, setUiOverlaySection] = useState<'gridOverlay' | 'pauseOverlay'>('gridOverlay');
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
      params.set('details_id', String(selectedDetailsMedia.id));
      if (selectedDetailsMedia.tmdbId) {
        params.set('details_tmdb_id', String(selectedDetailsMedia.tmdbId));
      } else {
        params.delete('details_tmdb_id');
      }
      params.set('details_type', selectedDetailsMedia.type);
      params.set('details_title', selectedDetailsMedia.title);
      if (selectedDetailsMedia.posterPath) {
        params.set('details_poster', selectedDetailsMedia.posterPath);
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
  const settingsScrollRef = useRef<HTMLDivElement>(null);


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
    (window as any)._onShowMediaDetails = (video: VideoItem) => {
      setSelectedActor(null);
      setSelectedDetailsMedia(video);
    };
    (window as any)._onRateCalendarVideo = (video: VideoItem, rating: number) => {
      handleUpdateVideo((prev) => ({ ...prev, rating }), false, video.id, true);
    };
    (window as any)._onDeleteCalendarVideo = (video: VideoItem) => {
      const mockEvent = { stopPropagation: () => {} } as any;
      handleRemoveVideo(video.id, mockEvent);
    };
    return () => {
      delete (window as any)._onShowMediaDetails;
      delete (window as any)._onRateCalendarVideo;
      delete (window as any)._onDeleteCalendarVideo;
    };
  }, [playingVideo, videos]);

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

  // Global Scroll Direction Detection for Floating Handle Animation
  useEffect(() => {
    const lastScrollY = new WeakMap<Element, number>();

    const handleScroll = (e: Event) => {
      const target = (e.target === document ? document.documentElement : e.target) as HTMLElement;
      if (!target || typeof target.scrollTop !== 'number') return;
      
      const prev = lastScrollY.get(target) ?? target.scrollTop;
      const current = target.scrollTop;
      const diff = current - prev;
      
      if (Math.abs(diff) > 2) {
        const dir = diff > 0 ? 'down' : 'up';
        if (target.getAttribute('data-scroll-dir') !== dir) {
          target.setAttribute('data-scroll-dir', dir);
        }
        lastScrollY.set(target, current);
      }
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

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

  const handleSwitchProfile = (p: any) => {
    const isServer = p.userId && !p.userId.startsWith('local_') && p.userId !== 'local';
    if (isServer) {
      openAuthModal('login', p);
    } else {
      localStorage.setItem('valor_active_user_id', p.userId);
      const settingsKey = p.userId === 'local' ? 'valor_settings' : `valor_settings_${p.userId}`;
      const videosKey = p.userId === 'local' ? 'valor_videos' : `valor_videos_${p.userId}`;
      const savedSettings = localStorage.getItem(settingsKey);
      if (savedSettings) {
        try { setSettings(prev => ({ ...prev, ...JSON.parse(savedSettings), userId: p.userId, storageMode: 'localstorage' })); } catch {}
      } else {
        setSettings(prev => ({ ...prev, userId: p.userId, profileName: p.name || 'Local Profile', storageMode: 'localstorage' }));
      }
      const savedVideos = localStorage.getItem(videosKey);
      if (savedVideos) {
        try { setVideos(JSON.parse(savedVideos)); } catch {}
      }
      addToast(`Switched to profile: ${p.name || p.userId}`, 'success');
    }
  };

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
                    // No handle in IndexedDB, but still keep the video so the player's
                    // lock overlay can let the user re-select the file via onReassociate.
                    console.log('[Recovery] Local video has no handle. Retaining for user-initiated reassociation.');
                    return videoObj;
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

        // Clean up stale file handles from IndexedDB (only removes entries for videos no longer in history)
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
        
        // Try restoring from IndexedDB handle (silently if permission is already granted)
        try {
          const handle = await getFileHandle(playingVideo.id);
          if (handle) {
            const options = { mode: 'read' as const };
            if ((await (handle as any).queryPermission(options)) === 'granted') {
              const file = await handle.getFile();
              await processLocalVideo(file, playingVideo.id, handle);
              return;
            } else {
              // Permission is 'prompt'. Can't auto-request without user gesture.
              // The player will mount with the lock overlay for user-initiated permission.
              console.log('[Recovery] Found IndexedDB handle but permission is prompt. Waiting for user interaction.');
              return;
            }
          }
        } catch (err) {
          console.error('[Recovery] Failed during startup IndexedDB handle check:', err);
        }

        // No handle found — the player will mount with the lock overlay.
        // User can click "Resume Playback" to trigger onReassociate (which falls back to file picker).
        console.log('[Recovery] No handle in IndexedDB. Player will show lock overlay for user-initiated reassociation.');
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

  // If playing, render VideoPlayer fullscreen.
  // Always render the player when playingVideo exists — the lock overlay handles
  // file reassociation for unplayable local videos (dead blob URLs).
  if (playingVideo) {
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
        
        // Try IndexedDB handle first — but we must also start the file picker
        // synchronously to preserve the user gesture activation for showOpenFilePicker.
        // Strategy: start both paths, use whichever succeeds.
        
        // Path 1: Try IndexedDB handle (fast path — no user interaction needed)
        let handleRestored = false;
        try {
          const handle = await getFileHandle(videoId);
          if (handle) {
            const hasPermission = await verifyPermission(handle);
            if (hasPermission) {
              const file = await handle.getFile();
              await processLocalVideo(file, videoId, handle);
              handleRestored = true;
            }
          }
        } catch (err) {
          console.error('[Recovery] Failed to restore from IndexedDB in onReassociate:', err);
        }
        
        if (handleRestored) return;

        // Path 2: Fallback to file picker.
        // The hidden file input may not be in the DOM (we're in the player render path),
        // so we create a temporary one on-the-fly. This works even after async awaits
        // because <input>.click() doesn't require transient user activation like showOpenFilePicker.
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.style.display = 'none';
        input.onchange = async () => {
          if (input.files && input.files[0]) {
            const file = input.files[0];
            pendingLocalReassociateIdRef.current = null;
            
            // Try to get a persistent handle via showOpenFilePicker for future reloads
            let handle: FileSystemFileHandle | undefined;
            if ('showOpenFilePicker' in window) {
              // We can't call showOpenFilePicker here (no gesture), but we have the file.
              // The handle won't be saved this time, but the file will work for this session.
            }
            
            await processLocalVideo(file, videoId);
          }
          document.body.removeChild(input);
        };
        document.body.appendChild(input);
        input.click();
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
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSidebarCollapsed={isSidebarCollapsed}
        videos={videos}
        setSelectedActor={setSelectedActor}
        setSelectedDetailsMedia={setSelectedDetailsMedia}
        handlePlayVideo={handlePlayVideo}
        handleRemoveVideo={handleRemoveVideo}
      />

      {/* Floating Right Side Midways Live VCT Overlay */}
      <EsportsLiveOverlay />

      {/* Main Content Area */}
      <div className="main-layout-wrapper">
        {/* Main Content Pane */}
        <main className="main-content full-width-details animate-fade-in">
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
            <>
              {activeTab === 'home' && (
                <HomePage
                  videos={videos}
                  isDragActive={isDragActive}
                  handleDrag={handleDrag}
                  handleDrop={handleDrop}
                  handleSelectLocalFile={handleSelectLocalFile}
                  fileInputRef={fileInputRef}
                  handleFileSelect={handleFileSelect}
                  historyVideoInputRef={historyVideoInputRef}
                  handleHistoryVideoSelect={handleHistoryVideoSelect}
                  videoUrl={videoUrl}
                  setVideoUrl={setVideoUrl}
                  handleUrlSubmit={handleUrlSubmit}
                  handlePlayVideo={handlePlayVideo}
                  isInstantlyPlayable={isInstantlyPlayable}
                  parseDurationToSeconds={parseDurationToSeconds}
                  formatTime={formatTime}
                />
              )}

              {activeTab === 'history' && (
                <HistoryPage
                  videos={videos}
                  historyViewMode={historyViewMode}
                  setHistoryViewMode={setHistoryViewMode}
                  settings={settings}
                  handlePlayVideo={handlePlayVideo}
                  handleRemoveVideo={handleRemoveVideo}
                  syncVideoToTraktHistory={syncVideoToTraktHistory}
                  isInstantlyPlayable={isInstantlyPlayable}
                  parseDurationToSeconds={parseDurationToSeconds}
                  formatTime={formatTime}
                />
              )}

              {activeTab === 'library' && (
                <LibraryPage
                  videos={videos}
                  onPlayVideo={handlePlayVideo}
                  isInstantlyPlayable={isInstantlyPlayable}
                />
              )}

              {activeTab === 'online' && (
                <OnlineStreamPage
                  onSelectMedia={setSelectedDetailsMedia}
                  tmdbApiKey={settings.tmdbApiKey}
                  traktAccessToken={settings.traktAccessToken}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsPage
                  settingsTab={settingsTab}
                  setSettingsTab={setSettingsTab}
                  uiOverlaySection={uiOverlaySection}
                  setUiOverlaySection={setUiOverlaySection}
                  settings={settings}
                  setSettings={setSettings}
                  handleDefaultLangChange={handleDefaultLangChange}
                  saveSettingsToStorage={saveSettingsToStorage}
                  listeningKeyFor={listeningKeyFor}
                  setListeningKeyFor={setListeningKeyFor}
                  hoveredHotkey={hoveredHotkey}
                  setHoveredHotkey={setHoveredHotkey}
                  availableProfiles={availableProfiles}
                  handleSwitchProfile={handleSwitchProfile}
                  openAuthModal={openAuthModal}
                  setDeleteTargetProfile={setDeleteTargetProfile}
                  setRemoveError={setRemoveError}
                  setIsRemoveModalOpen={setIsRemoveModalOpen}
                  setNewProfileName={setNewProfileName}
                  setNewProfilePassword={setNewProfilePassword}
                  setCreateProfileError={setCreateProfileError}
                  setIsCreateProfileModalOpen={setIsCreateProfileModalOpen}
                  addToast={addToast}
                  setVideos={setVideos}
                  previewExpanded={previewExpanded}
                  setPreviewExpanded={setPreviewExpanded}
                  renderMockPreviewButton={renderMockPreviewButton}
                  setShowResetConfirm={setShowResetConfirm}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setSelectedActor={setSelectedActor}
        setSelectedDetailsMedia={setSelectedDetailsMedia}
      />

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
  if (window.location.pathname.startsWith('/embed')) {
    return (
      <ErrorBoundary>
        <EmbedPlayerPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
