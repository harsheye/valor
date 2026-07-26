import React, { useEffect, useState } from 'react';
import { RemoteVideoPlayer } from '../components/RemoteVideoPlayer';
import type { VideoItem } from '../types/media';
import { DEFAULT_CONTROLS_CONFIG } from '../utils/embedProtocol';
import type { EmbedCommand, EmbedMessageWrapper, ControlsConfig, ThemeConfig } from '../utils/embedProtocol';

export const EmbedPlayerPage: React.FC = () => {
  const [video, setVideo] = useState<VideoItem | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const mediaUrl = params.get('url');
    if (mediaUrl) {
      return {
        id: 'embed-session',
        title: params.get('title') || 'Embedded Video',
        url: mediaUrl,
        type: 'url',
        currentTime: 0,
        duration: '0',
        audioTracks: [],
        subtitleTracks: []
      };
    }
    return null;
  });

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
      // Basic security check (can be expanded based on allowedOrigins)
      if (!event.data || event.data.source !== 'valor-embed-host') return;
      
      const wrapper: EmbedMessageWrapper = event.data;
      const cmd = wrapper.payload as EmbedCommand;

      switch (cmd.type) {
        case 'LOAD':
          setVideo({
            id: 'embed-session',
            title: 'Embedded Media',
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
          break;
        case 'UPDATE_CONFIG':
          if (cmd.payload.controls) setControls(prev => ({ ...prev, ...cmd.payload.controls }));
          if (cmd.payload.theme) setTheme(prev => ({ ...prev, ...cmd.payload.theme }));
          break;
        // The rest of the playback commands (PLAY, PAUSE, SEEK, etc.) will be handled 
        // by the RemoteVideoPlayer directly via an exposed ref or context, 
        // or by bubbling down props. For simplicity, we can pass a `commandBus` down to RemoteVideoPlayer.
      }
    };

    window.addEventListener('message', handleMessage);
    // Tell parent we are ready to receive commands
    window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'READY' } }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!video) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
        Loading Player...
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg-color)' }}>
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
      
      {/* 
        We pass controlsConfig down to RemoteVideoPlayer.
        RemoteVideoPlayer will need to be updated to respect these configs.
      */}
      <RemoteVideoPlayer 
        video={video}
        onBack={() => {}}
        onUpdateVideo={(updater) => {
          if (typeof updater === 'function') {
            const newVideo = updater(video);
            if (newVideo.currentTime !== video.currentTime) {
              setVideo(newVideo);
              window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'TIME_UPDATE', payload: { currentTime: newVideo.currentTime, duration: newVideo.duration } } }, '*');
            } else {
              setVideo(newVideo);
            }
          } else {
            setVideo(updater);
            window.parent.postMessage({ source: 'valor-embed-iframe', version: '1.0.0', payload: { type: 'TIME_UPDATE', payload: { currentTime: updater.currentTime, duration: updater.duration } } }, '*');
          }
        }}
        showPlayButton={controls.play}
        showTimeDisplay={true}
        showPlayBar={controls.play} // Assuming if play is hidden, playbar might be hidden, but we'll show it for seek
        showVolumeControl={controls.volume}
        showFullscreen={controls.fullscreen}
        subSettings={{ fontSize: 'medium', color: 'white', backdrop: 'shadow', fontFamily: 'sans-serif', fontStyle: 'normal', customTextColor: '', customBgColor: '', customSize: 100 }}
        onUpdateSubSettings={() => {}}
      />
    </div>
  );
};
