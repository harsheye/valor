import React, { useEffect, useState, useCallback } from 'react';
import { Play, Sparkles, Tv, Link2 } from 'lucide-react';
import { RemoteVideoPlayer } from '../components/RemoteVideoPlayer';
import { BufferingOverlay } from '../components/LoadingSpinner';
import type { VideoItem, CustomSubtitleTrack } from '../types/media';
import type { SubtitleSettings } from '../components/SubtitleOverlay';
import { DEFAULT_CONTROLS_CONFIG } from '../utils/embedProtocol';
import type { EmbedCommand, EmbedMessageWrapper, ControlsConfig, ThemeConfig } from '../utils/embedProtocol';
import { parseSubtitles } from '../utils/subtitleParser';
import { resolveRemoteMediaName } from '../utils/corsCheck';



import { 
  getEmbedSubtitlesSync, 
  getEmbedSubtitlesAsync, 
  saveEmbedSubtitles, 
  trimSubtitleName 
} from '../utils/embedSubtitleStorage';
import {
  saveMediaTimestamp,
  getMediaTimestamp
} from '../utils/mediaTimestampStorage';

export function parseEmbedControlsFromParams(params: URLSearchParams): ControlsConfig {
  let config: ControlsConfig = { ...DEFAULT_CONTROLS_CONFIG };

  // 1. If JSON 'controls' param is provided, merge it first
  const controlsJson = params.get('controls');
  if (controlsJson) {
    try {
      config = { ...config, ...JSON.parse(controlsJson) };
    } catch (e) {
      console.warn('Failed to parse embed controls configuration JSON', e);
    }
  }

  // 2. Helper to parse boolean from individual query parameters
  const parseBool = (keys: string[], defaultVal: boolean): boolean => {
    for (const key of keys) {
      const val = params.get(key);
      if (val !== null) {
        const lower = val.toLowerCase().trim();
        if (lower === 'false' || lower === '0' || lower === 'hide' || lower === 'off' || lower === 'no' || lower === 'disable') {
          return false;
        }
        if (lower === 'true' || lower === '1' || lower === 'show' || lower === 'on' || lower === 'yes' || lower === 'enable') {
          return true;
        }
      }
    }
    return defaultVal;
  };

  // Direct URL attributes overrides
  config.time = parseBool(['time', 'showTime', 'timeDisplay'], config.time ?? true);
  config.bookmarks = parseBool(['bookmarks', 'showBookmarks', 'bookmark'], config.bookmarks ?? true);
  config.subtitles = parseBool(['subs', 'subtitles', 'showSubs', 'showSubtitles'], config.subtitles ?? true);
  config.audio = parseBool(['audio', 'showAudio', 'audioControls'], config.audio ?? true);
  config.audioOnly = parseBool(['audioOnly', 'audio_only', 'audioonly'], config.audioOnly ?? false);
  config.subFileOnly = parseBool(['subFileOnly', 'onlySubFile', 'allowOnlySubFile'], config.subFileOnly ?? false);
  config.allowSubUpload = parseBool(['allowSubUpload', 'allowSubFile', 'customSub', 'allowCustomSub'], config.allowSubUpload ?? true);

  // Close / cross / X button: default is FALSE (hidden) in embed player
  if (params.has('hideClose') || params.has('hideX') || params.has('removeX')) {
    config.closeButton = false;
  }
  config.closeButton = parseBool(['closeButton', 'xButton', 'crossButton', 'showClose', 'showX', 'showCloseButton'], config.closeButton ?? false);

  config.play = parseBool(['play', 'showPlay'], config.play ?? true);
  config.volume = parseBool(['volume', 'showVolume'], config.volume ?? true);
  config.fullscreen = parseBool(['fullscreen', 'showFullscreen'], config.fullscreen ?? true);
  config.speed = parseBool(['speed', 'showSpeed'], config.speed ?? true);
  config.settings = parseBool(['settings', 'showSettings'], config.settings ?? true);
  config.pip = parseBool(['pip', 'showPip'], config.pip ?? true);

  return config;
}

function deriveTitleFromUrl(url: string, explicitTitle?: string | null): string {
  if (explicitTitle && explicitTitle.trim() && explicitTitle !== 'Embedded Video' && explicitTitle !== 'Embedded Media') {
    return explicitTitle.trim();
  }
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments.pop() || '';
    const clean = decodeURIComponent(last).replace(/\.[^/.]+$/, '').trim();
    if (clean && clean.length > 1 && !/^(video|master|playlist|index|stream|chunk)$/i.test(clean)) {
      return clean;
    }
  } catch {}
  return explicitTitle || 'Embedded Video';
}

export const EmbedPlayerPage: React.FC = () => {
  const [embedSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('valor_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [subSettings, setSubSettings] = useState<SubtitleSettings>(() => {
    try {
      const savedSub = localStorage.getItem('valor_sub_settings');
      if (savedSub) return JSON.parse(savedSub);
      const savedSettings = localStorage.getItem('valor_settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.subSettings) return parsed.subSettings;
      }
    } catch {}
    return {
      fontSize: 'medium',
      color: 'white',
      backdrop: 'shadow',
      fontFamily: 'sans-serif',
      fontStyle: 'normal',
      customTextColor: '',
      customBgColor: '',
      customSize: 100,
      showViewColumn: false,
      showStyleColumn: false
    };
  });

  const handleUpdateSubSettings = (updated: Partial<SubtitleSettings>) => {
    setSubSettings((prev) => {
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem('valor_sub_settings', JSON.stringify(next));
        const savedSettings = localStorage.getItem('valor_settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          parsed.subSettings = next;
          localStorage.setItem('valor_settings', JSON.stringify(parsed));
        }
      } catch {}
      return next;
    });
  };

  const [isReloading, setIsReloading] = useState<boolean>(false);
  useEffect(() => {
    if (isReloading) {
      const timer = setTimeout(() => setIsReloading(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isReloading]);
  const [video, setVideo] = useState<VideoItem | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const mediaUrl = params.get('url') || params.get('media') || params.get('src');
    if (mediaUrl) {
      const cachedSubs = getEmbedSubtitlesSync(mediaUrl);
      const paramTime = Number(params.get('t') || params.get('time') || 0) || 0;
      const savedTime = getMediaTimestamp(mediaUrl);
      const initialTime = paramTime > 0 ? paramTime : savedTime;
      const cinemaVal = (params.get('iscinema') || params.get('isCinema') || params.get('cinema') || '').toLowerCase().trim();
      const isCinema = cinemaVal === 'true' || cinemaVal === '1' || cinemaVal === 'yes' || cinemaVal === 'on';
      return {
        isCinema,
        playbackMode: isCinema ? 'server' : undefined,
        id: 'embed-session',
        title: deriveTitleFromUrl(mediaUrl, params.get('title')),
        url: mediaUrl,
        type: 'url',
        currentTime: initialTime,
        duration: '0',
        isRemote: true,
        audioTracks: [],
        subtitleTracks: cachedSubs
      };
    }
    return null;
  });


  const [inputVal, setInputVal] = useState('');

  const [controls, setControls] = useState<ControlsConfig>(() => {
    const params = new URLSearchParams(window.location.search);
    return parseEmbedControlsFromParams(params);
  });

  const [theme, setTheme] = useState<ThemeConfig>(() => {
    const params = new URLSearchParams(window.location.search);
    try {
      const themeParam = params.get('theme');
      if (themeParam) return JSON.parse(themeParam);
    } catch (e) {
      console.error('Failed to parse embed theme', e);
    }
    return {};
  });

  // Set CSS Variables for theming
  useEffect(() => {
    if (theme.accent) document.documentElement.style.setProperty('--accent-color', theme.accent);
    if (theme.background) document.documentElement.style.setProperty('--bg-color', theme.background);
    if (theme.text) document.documentElement.style.setProperty('--text-primary', theme.text);
    if (theme.font) document.documentElement.style.setProperty('--font-family', theme.font);
    if (theme.radius !== undefined) document.documentElement.style.setProperty('--border-radius', `${theme.radius}px`);
  }, [theme]);

  // Report Embed Session Telemetry
  useEffect(() => {
    try {
      const devId = (window as any).__VALOR_DEVICE_ID__ || localStorage.getItem('valor_device_id') || 'dev_embed';
      const ref = document.referrer || window.location.href;
      fetch('/api/embed/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': devId,
          'x-embed-referrer': ref
        },
        body: JSON.stringify({
          referrer: ref,
          title: video?.title || 'Embedded Media',
          path: window.location.pathname
        })
      }).catch(() => {});
    } catch(e) {}
  }, []);

  // Resolve media name from Content-Disposition header
  useEffect(() => {
    if (!video?.url) return;
    const explicitParam = new URLSearchParams(window.location.search).get('title');
    if (explicitParam && explicitParam.trim() && explicitParam !== 'Embedded Video' && explicitParam !== 'Embedded Media') {
      return;
    }
    resolveRemoteMediaName(video.url).then((resolved) => {
      if (resolved && resolved.fileName) {
        setVideo((prev) => {
          if (!prev) return prev;
          if (prev.fileName === resolved.fileName && prev.title === (resolved.title || resolved.fileName)) {
            return prev;
          }
          return {
            ...prev,
            fileName: resolved.fileName,
            title: resolved.title || resolved.fileName
          };
        });
        if (typeof document !== 'undefined') {
          document.title = `${resolved.title || resolved.fileName} - Valor Player`;
        }
      }
    });
  }, [video?.url]);

  // Check browser memory / IndexedDB asynchronously for downloaded subtitles if empty
  useEffect(() => {
    if (!video?.url) return;
    if (video.subtitleTracks && video.subtitleTracks.length > 0) return;
    getEmbedSubtitlesAsync(video.url).then((asyncSubs) => {
      if (asyncSubs && asyncSubs.length > 0) {
        setVideo((prev) => {
          if (!prev) return prev;
          if (!prev.subtitleTracks || prev.subtitleTracks.length === 0) {
            return { ...prev, subtitleTracks: asyncSubs };
          }
          return prev;
        });
      }
    });
  }, [video?.url]);

  // Load external subtitle file specified directly in URL attributes (?sub=, ?subtitle=, ?subFile=, ?subUrl=)
  useEffect(() => {
    if (!video?.url) return;
    const params = new URLSearchParams(window.location.search);
    const subUrl = params.get('sub') || params.get('subtitle') || params.get('subFile') || params.get('subUrl');
    if (!subUrl) return;

    fetch(subUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching subtitle URL`);
        return res.text();
      })
      .then((text) => {
        const filename = subUrl.split('/').pop()?.split('?')[0] || 'subtitles.srt';
        const cues = parseSubtitles(text, filename);
        if (cues && cues.length > 0) {
          const ext = filename.split('.').pop()?.toLowerCase();
          const format = (ext === 'ass' || ext === 'ssa') ? 'ass' : ((ext === 'vtt' || ext === 'webvtt') ? 'vtt' : 'srt');
          const urlTrack: CustomSubtitleTrack = {
            id: `url-sub-${Date.now()}`,
            name: trimSubtitleName(filename),
            url: subUrl,
            cues,
            format: format as any,
            language: 'External',
            isExtracted: false
          };
          setVideo((prev) => {
            if (!prev) return prev;
            const existing = prev.subtitleTracks || [];
            if (existing.some((t) => t.url === subUrl)) return prev;
            const nextTracks = [urlTrack, ...existing];
            saveEmbedSubtitles(prev, nextTracks);
            return {
              ...prev,
              subtitleTracks: nextTracks
            };
          });
        }
      })
      .catch((err) => {
        console.warn('[EmbedPlayer] Failed to load external subtitle from URL query:', err);
      });
  }, [video?.url]);

  // PostMessage Bridge listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.source !== 'valor-embed-host') return;
      
      const wrapper: EmbedMessageWrapper = event.data;
      const cmd = wrapper.payload as EmbedCommand;

      switch (cmd.type) {
        case 'LOAD':
          if (cmd.payload && (cmd.payload.url || cmd.payload.media)) {
            const mediaUrl = cmd.payload.media || cmd.payload.url || '';
            const cachedSubs = getEmbedSubtitlesSync(mediaUrl);
            const explicitTime = cmd.payload.currentTime;
            const savedTime = getMediaTimestamp(mediaUrl);
            const initialTime = typeof explicitTime === 'number' && explicitTime > 0 ? explicitTime : savedTime;
            setVideo({
              id: 'embed-session',
              title: deriveTitleFromUrl(mediaUrl, cmd.payload.title),
              url: mediaUrl,
              type: 'url',
              currentTime: initialTime,
              duration: String(cmd.payload.duration || 0),
              isRemote: true,
              hlsPlaylist: cmd.payload.hlsPlaylist,
              playbackMode: (cmd.payload.playbackMode as any) || undefined,
              audioTracks: [],
              subtitleTracks: cachedSubs
            });
          }
          break;
        case 'RELOAD':
          setIsReloading(true);
          setVideo((prev) => {
            if (!prev) return prev;
            const savedTime = getMediaTimestamp(prev);
            return {
              ...prev,
              currentTime: savedTime > 0 ? savedTime : prev.currentTime
            };
          });
          break;
        case 'UPDATE_CONFIG':
          if (cmd.payload.controls) setControls(prev => ({ ...prev, ...cmd.payload.controls }));
          if (cmd.payload.theme) setTheme(prev => ({ ...prev, ...cmd.payload.theme }));
          break;
        case 'SET_FULLSCREEN':
          if (cmd.payload && typeof cmd.payload.fullscreen === 'boolean') {
            const doc: any = document;
            if (cmd.payload.fullscreen) {
              if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
                (document.documentElement.requestFullscreen || (document.documentElement as any).webkitRequestFullscreen)?.call(document.documentElement)?.catch?.(() => {});
              }
            } else {
              if (doc.fullscreenElement || doc.webkitFullscreenElement) {
                (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc)?.catch?.(() => {});
              }
            }
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    // Tell parent we are ready to receive commands
    try {
      window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'READY' } }, '*');
    } catch (e) {}

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Persist media playback timestamp on browser reload or unload
  useEffect(() => {
    const handleUnload = () => {
      if (video?.url && typeof video.currentTime === 'number') {
        saveMediaTimestamp(video, video.currentTime, Number(video.duration) || 0, video.title);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [video]);

  const handlePlayUrl = (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;
    const cachedSubs = getEmbedSubtitlesSync(trimmed);
    const savedTime = getMediaTimestamp(trimmed);
    setVideo({
      id: 'embed-session',
      title: 'Direct Video Stream',
      url: trimmed,
      type: 'url',
      currentTime: savedTime,
      duration: '0',
      isRemote: true,
      audioTracks: [],
      subtitleTracks: cachedSubs
    });
  };

  const handleUpdateVideo = useCallback((updater: VideoItem | ((prev: VideoItem) => VideoItem)) => {
    setVideo((prev) => {
      if (!prev) return prev;
      const newVideo = typeof updater === 'function' ? updater(prev) : updater;
      if (newVideo?.url && newVideo.subtitleTracks && newVideo.subtitleTracks.length > 0) {
        saveEmbedSubtitles(newVideo, newVideo.subtitleTracks);
      }
      if (newVideo?.url && typeof newVideo.currentTime === 'number') {
        saveMediaTimestamp(newVideo, newVideo.currentTime, Number(newVideo.duration) || 0, newVideo.title);
      }
      if (
        newVideo.currentTime === prev.currentTime &&
        newVideo.duration === prev.duration &&
        newVideo.title === prev.title &&
        newVideo.fileName === prev.fileName &&
        newVideo.streams === prev.streams &&
        newVideo.subtitleTracks === prev.subtitleTracks &&
        (newVideo as any).playbackMode === (prev as any).playbackMode
      ) {
        return prev;
      }
      if (newVideo.currentTime !== prev.currentTime) {
        try {
          window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'TIME_UPDATE', payload: { currentTime: newVideo.currentTime, duration: newVideo.duration } } }, '*');
        } catch (e) {}
      }
      return newVideo;
    });
  }, []);

  if (!video) {
    const accentColor = theme.accent || 'var(--accent-fill, #e50914)';
    const onAccentColor = 'var(--on-accent, #ffffff)';

    return (
      <div 
        className="embed-entry-container"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg, var(--bg-color, #0F1217))',
          color: 'var(--text-1, var(--text-primary, #E4E8EE))',
          fontFamily: 'var(--font-ui, var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif))',
          padding: '24px',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Ambient background glow */}
        <div 
          style={{
            position: 'absolute',
            width: '420px',
            height: '420px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${accentColor} 0%, rgba(0,0,0,0) 70%)`,
            opacity: 0.12,
            filter: 'blur(60px)',
            pointerEvents: 'none',
            transform: 'translate(-50%, -50%)',
            top: '40%',
            left: '50%'
          }} 
        />

        <div 
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: 'var(--surface-1, rgba(21, 26, 33, 0.85))',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: '36px 32px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--border, rgba(255, 255, 255, 0.08))',
            textAlign: 'center',
            position: 'relative',
            zIndex: 1
          }}
        >
          {/* Valor Themed Icon Badge */}
          <div 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '56px', 
              height: '56px', 
              borderRadius: 'var(--radius-md, 12px)', 
              background: `linear-gradient(135deg, ${accentColor}, #b20710)`,
              boxShadow: `0 8px 24px rgba(229, 9, 20, 0.35)`,
              marginBottom: '20px'
            }}
          >
            <Play size={24} fill="currentColor" stroke="none" style={{ color: onAccentColor, marginLeft: '3px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <h2 
              style={{ 
                margin: 0, 
                fontSize: '22px', 
                fontWeight: 700, 
                letterSpacing: '-0.02em',
                color: 'var(--text-1, #E4E8EE)',
                fontFamily: 'var(--font-display, var(--font-ui, sans-serif))'
              }}
            >
              Valor Embed Player
            </h2>
            <span 
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-2, #A9B2C0)'
              }}
            >
              Stream
            </span>
          </div>

          <p 
            style={{ 
              margin: '0 0 24px 0', 
              fontSize: '13.5px', 
              lineHeight: 1.5,
              color: 'var(--text-2, #A9B2C0)' 
            }}
          >
            Paste any direct media or stream URL (HLS <code style={{ color: accentColor, background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '4px' }}>.m3u8</code>, <code style={{ color: accentColor, background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '4px' }}>MKV</code>, <code style={{ color: accentColor, background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: '4px' }}>MP4</code>, WebM) to play:
          </p>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handlePlayUrl(inputVal);
            }}
            style={{ display: 'flex', gap: '10px' }}
          >
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <Link2 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: '14px', 
                  color: 'var(--text-3, #6C778A)',
                  pointerEvents: 'none' 
                }} 
              />
              <input 
                type="text" 
                placeholder="https://domain.com/video.m3u8 or .mkv" 
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 38px',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: '1px solid var(--control-border, #262D39)',
                  backgroundColor: 'var(--surface-2, #1B212A)',
                  color: 'var(--text-1, #E4E8EE)',
                  fontSize: '13.5px',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = accentColor;
                  e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}33`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--control-border, #262D39)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <button 
              type="submit"
              disabled={!inputVal.trim()}
              style={{
                padding: '12px 22px',
                borderRadius: 'var(--radius-sm, 8px)',
                backgroundColor: accentColor,
                color: onAccentColor,
                border: 'none',
                cursor: inputVal.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 700,
                fontSize: '13.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                opacity: inputVal.trim() ? 1 : 0.6,
                boxShadow: inputVal.trim() ? `0 4px 16px rgba(229, 9, 20, 0.4)` : 'none',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (inputVal.trim()) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.filter = 'brightness(1.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.filter = 'none';
              }}
            >
              <Play size={14} fill="currentColor" stroke="none" />
              <span>Stream</span>
            </button>
          </form>

          {/* Quick Format Compatibility Tags */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '6px', 
              marginTop: '20px',
              fontSize: '11px',
              color: 'var(--text-3, #6C778A)'
            }}
          >
            <Tv size={12} style={{ opacity: 0.8 }} />
            <span>Hardware Accelerated HLS Adaptive & MKV Multi-Track Audio/Subs</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg-color, #000000)' }}>
      {theme.logoUrl && !theme.hideLogo && (
        <img 
          src={theme.logoUrl} 
          alt="Logo" 
          style={{ position: 'absolute', top: 20, left: 20, zIndex: 99999, height: 40, pointerEvents: 'none' }} 
        />
      )}
      {theme.watermarkUrl && (
        <img 
          src={theme.watermarkUrl} 
          alt="Watermark" 
          style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 99999, height: 30, opacity: 0.5, pointerEvents: 'none' }} 
        />
      )}
      
      <RemoteVideoPlayer
        isEmbed={true}
        pauseOnFocusChange={embedSettings?.pauseOnFocusChange ?? false}
        focusOnClick={embedSettings?.focusOnClick !== false && embedSettings?.focusOnClickNoPause !== false}
        focusOnClickNoPause={embedSettings?.focusOnClickNoPause !== false && embedSettings?.focusOnClick !== false}
        onUpdateSettings={(updated) => {
          try {
            const current = JSON.parse(localStorage.getItem('valor_settings') || '{}');
            localStorage.setItem('valor_settings', JSON.stringify({ ...current, ...updated }));
          } catch {}
        }}
        uiHideTimeout={5}
        isCinema={(video as any)?.isCinema}
        video={video}
        onBack={() => {
          setVideo(null);
          try {
            window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'CLOSE' } }, '*');
          } catch (e) {}
        }}
        onUpdateVideo={handleUpdateVideo}
        showPlayButton={controls.play !== false}
        showTimeDisplay={controls.time !== false}
        showPlayBar={controls.play !== false}
        showVolumeControl={controls.volume !== false && controls.audio !== false}
        showFullscreen={controls.fullscreen !== false}
        showSubtitleControl={controls.subtitles !== false}
        showBookmarksControl={controls.bookmarks !== false}
        showAudioControl={controls.audio !== false}
        audioOnly={controls.audioOnly === true}
        subFileOnly={controls.subFileOnly === true}
        allowSubUpload={controls.allowSubUpload !== false}
        showCloseButton={controls.closeButton === true}
        subSettings={subSettings}
        onUpdateSubSettings={handleUpdateSubSettings}
        openSubtitlesApiKey={embedSettings.openSubtitlesApiKey || ''}
        cacheSettings={embedSettings?.cacheSettings}
      />
      {/* Explicit Reloading Loader */}
      {isReloading && (
        <BufferingOverlay
          isBuffering={isReloading}
          preset="fire-circle"
        />
      )}
    </div>
  );
};
