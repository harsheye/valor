import React, { useEffect, useState } from 'react';
import { RemoteVideoPlayer } from '../components/RemoteVideoPlayer';
import type { VideoItem } from '../types/media';
import type { SubtitleSettings } from '../components/SubtitleOverlay';
import { DEFAULT_CONTROLS_CONFIG } from '../utils/embedProtocol';
import type { EmbedCommand, EmbedMessageWrapper, ControlsConfig, ThemeConfig } from '../utils/embedProtocol';

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

  const [video, setVideo] = useState<VideoItem | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const mediaUrl = params.get('url') || params.get('media') || params.get('src');
    if (mediaUrl) {
      const cachedSubs = getEmbedSubtitlesSync(mediaUrl);
      const paramTime = Number(params.get('t') || params.get('time') || 0) || 0;
      const savedTime = getMediaTimestamp(mediaUrl);
      const initialTime = paramTime > 0 ? paramTime : savedTime;
      return {
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
    try {
      const controlsParam = params.get('controls');
      if (controlsParam) return { ...DEFAULT_CONTROLS_CONFIG, ...JSON.parse(controlsParam) };
    } catch (e) {
      console.error('Failed to parse embed controls configuration', e);
    }
    return DEFAULT_CONTROLS_CONFIG;
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
        saveMediaTimestamp(video.url, video.currentTime, Number(video.duration) || 0, video.title);
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

  if (!video) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-color, #0b0f19)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#141a28',
          borderRadius: '12px',
          padding: '28px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #ff3e3e, #d62828)', marginBottom: '16px' }}>
            <span style={{ fontSize: '22px', color: '#fff', marginLeft: '3px' }}>▶</span>
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 600 }}>Valor Embed Player</h2>
          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#94a3b8' }}>
            Enter a direct video or stream URL (MP4, MKV, HLS .m3u8, WebM) to begin playback:
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="https://example.com/video.mp4 or .m3u8" 
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePlayUrl(inputVal);
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #334155',
                backgroundColor: '#0b0f19',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button 
              type="button"
              onClick={() => handlePlayUrl(inputVal)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                backgroundColor: '#ff3e3e',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                transition: 'background-color 0.2s'
              }}
            >
              Play
            </button>
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
        video={video}
        onBack={() => {
          setVideo(null);
          try {
            window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'CLOSE' } }, '*');
          } catch (e) {}
        }}
        onUpdateVideo={(updater) => {
          let newVideo: VideoItem;
          if (typeof updater === 'function') {
            newVideo = updater(video);
          } else {
            newVideo = updater;
          }
          if (newVideo?.url && newVideo.subtitleTracks && newVideo.subtitleTracks.length > 0) {
            saveEmbedSubtitles(newVideo, newVideo.subtitleTracks);
          }
          if (newVideo?.url && typeof newVideo.currentTime === 'number') {
            saveMediaTimestamp(newVideo.url, newVideo.currentTime, Number(newVideo.duration) || 0, newVideo.title);
          }
          if (newVideo.currentTime !== video.currentTime) {
            setVideo(newVideo);
            try {
              window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'TIME_UPDATE', payload: { currentTime: newVideo.currentTime, duration: newVideo.duration } } }, '*');
            } catch (e) {}
          } else {
            setVideo(newVideo);
          }
        }}
        showPlayButton={controls.play}
        showTimeDisplay={true}
        showPlayBar={controls.play}
        showVolumeControl={controls.volume}
        showFullscreen={controls.fullscreen}
        subSettings={subSettings}
        onUpdateSubSettings={handleUpdateSubSettings}
        openSubtitlesApiKey={embedSettings.openSubtitlesApiKey || ''}
      />
    </div>
  );
};
