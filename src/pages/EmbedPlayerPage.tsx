import React, { useEffect, useState } from 'react';
import { RemoteVideoPlayer } from '../components/RemoteVideoPlayer';
import type { VideoItem } from '../types/media';
import { DEFAULT_CONTROLS_CONFIG } from '../utils/embedProtocol';
import type { EmbedCommand, EmbedMessageWrapper, ControlsConfig, ThemeConfig } from '../utils/embedProtocol';

export const EmbedPlayerPage: React.FC = () => {
  const [video, setVideo] = useState<VideoItem | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const mediaUrl = params.get('url') || params.get('media') || params.get('src');
    if (mediaUrl) {
      return {
        id: 'embed-session',
        title: params.get('title') || 'Embedded Video',
        url: mediaUrl,
        type: 'url',
        currentTime: Number(params.get('t') || params.get('time') || 0) || 0,
        duration: '0',
        isRemote: true,
        audioTracks: [],
        subtitleTracks: []
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

  // PostMessage Bridge listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.source !== 'valor-embed-host') return;
      
      const wrapper: EmbedMessageWrapper = event.data;
      const cmd = wrapper.payload as EmbedCommand;

      switch (cmd.type) {
        case 'LOAD':
          if (cmd.payload && (cmd.payload.url || cmd.payload.media)) {
            setVideo({
              id: 'embed-session',
              title: cmd.payload.title || 'Embedded Media',
              url: cmd.payload.media || cmd.payload.url || '',
              type: 'url',
              currentTime: cmd.payload.currentTime || 0,
              duration: String(cmd.payload.duration || 0),
              isRemote: true,
              hlsPlaylist: cmd.payload.hlsPlaylist,
              playbackMode: (cmd.payload.playbackMode as any) || undefined,
              audioTracks: [],
              subtitleTracks: []
            });
          }
          break;
        case 'UPDATE_CONFIG':
          if (cmd.payload.controls) setControls(prev => ({ ...prev, ...cmd.payload.controls }));
          if (cmd.payload.theme) setTheme(prev => ({ ...prev, ...cmd.payload.theme }));
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

  const handlePlayUrl = (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;
    setVideo({
      id: 'embed-session',
      title: 'Direct Video Stream',
      url: trimmed,
      type: 'url',
      currentTime: 0,
      duration: '0',
      isRemote: true,
      audioTracks: [],
      subtitleTracks: []
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
          if (typeof updater === 'function') {
            const newVideo = updater(video);
            if (newVideo.currentTime !== video.currentTime) {
              setVideo(newVideo);
              try {
                window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'TIME_UPDATE', payload: { currentTime: newVideo.currentTime, duration: newVideo.duration } } }, '*');
              } catch (e) {}
            } else {
              setVideo(newVideo);
            }
          } else {
            setVideo(updater);
            try {
              window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'TIME_UPDATE', payload: { currentTime: updater.currentTime, duration: updater.duration } } }, '*');
            } catch (e) {}
          }
        }}
        showPlayButton={controls.play}
        showTimeDisplay={true}
        showPlayBar={controls.play}
        showVolumeControl={controls.volume}
        showFullscreen={controls.fullscreen}
        subSettings={{ fontSize: 'medium', color: 'white', backdrop: 'shadow', fontFamily: 'sans-serif', fontStyle: 'normal', customTextColor: '', customBgColor: '', customSize: 100 }}
        onUpdateSubSettings={() => {}}
      />
    </div>
  );
};
