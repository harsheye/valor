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

  const [twitchChannel, setTwitchChannel] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('twitch') || null;
  });

  const [stripchatUsername, setStripchatUsername] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('stripchat') || null;
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

  const [twitchLoading, setTwitchLoading] = useState(false);
  const [twitchError, setTwitchError] = useState<string | null>(null);

  useEffect(() => {
    if (!twitchChannel || video) return;

    const fetchTwitch = async () => {
      setTwitchLoading(true);
      setTwitchError(null);
      try {
        const clientId = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        const tokenRes = await fetch('https://gql.twitch.tv/gql', {
          method: 'POST',
          headers: { 'Client-ID': clientId, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationName: 'PlaybackAccessToken',
            variables: { isLive: true, login: twitchChannel, isVod: false, vodID: '', playerType: 'embed' },
            extensions: { persistedQuery: { version: 1, sha256Hash: '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712' } }
          })
        });
        const tokenData = await tokenRes.json();
        const sig = tokenData.data.streamPlaybackAccessToken.signature;
        const token = tokenData.data.streamPlaybackAccessToken.value;
        const url = `/twitch-usher/api/channel/hls/${twitchChannel}.m3u8?client_id=${clientId}&token=${encodeURIComponent(token)}&sig=${sig}&allow_source=true&allow_audio_only=true`;
        
        setVideo({
          id: `twitch-${twitchChannel}`,
          title: `${twitchChannel} - Twitch`,
          url: url,
          type: 'url',
          currentTime: 0,
          duration: '0',
          isRemote: true,
          audioTracks: [],
          subtitleTracks: []
        });
      } catch (err) {
        console.error(err);
        setTwitchError('Failed to load Twitch stream. It might be offline.');
      } finally {
        setTwitchLoading(false);
      }
    };

    fetchTwitch();
  }, [twitchChannel, video]);

  useEffect(() => {
    if (!stripchatUsername || video) return;

    const fetchStripchat = async () => {
      setTwitchLoading(true);
      setTwitchError(null);
      try {
        const res = await fetch(`/stripchat-api/${stripchatUsername}/cam`);
        if (!res.ok) throw new Error('Stream offline or not found');
        const data = await res.json();
        
        let m3u8Url = '';
        if (data && data.cam && data.cam.streamName) {
           const server = data.cam.edgeServer || data.cam.host || 'b-hls-14.doppiocdn.com';
           m3u8Url = `https://${server}/hls/${data.cam.streamName}/master/${data.cam.streamName}_auto.m3u8`;
        } else if (data && data.cam && data.cam.streamUrl) {
           m3u8Url = data.cam.streamUrl;
        } else {
           throw new Error('No stream data available');
        }

        setVideo({
          id: `stripchat-${stripchatUsername}`,
          title: `${stripchatUsername} - Stripchat`,
          url: m3u8Url,
          type: 'url',
          currentTime: 0,
          duration: '0',
          isRemote: true,
          audioTracks: [],
          subtitleTracks: []
        });
      } catch (err) {
        console.error(err);
        setTwitchError('Failed to load Stripchat stream. It might be offline.');
      } finally {
        setTwitchLoading(false);
      }
    };

    fetchStripchat();
  }, [stripchatUsername, video]);

  if (!video && !twitchChannel) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
        <h2 style={{ marginBottom: 24, fontSize: '24px', fontWeight: 'bold' }}>Valor Embed Player</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="Enter username..." 
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '6px', border: '1px solid #333', background: '#1a1a1a', color: 'white', outline: 'none', width: '250px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputVal.trim()) {
                setTwitchChannel(inputVal.trim());
              }
            }}
          />
          <button 
            onClick={() => {
              if (inputVal.trim()) setTwitchChannel(inputVal.trim());
            }}
            style={{ padding: '10px 20px', borderRadius: '6px', background: '#9146FF', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Play Twitch
          </button>
          <button 
            onClick={() => {
              if (inputVal.trim()) setStripchatUsername(inputVal.trim());
            }}
            style={{ padding: '10px 20px', borderRadius: '6px', background: '#f53e3e', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Play Stripchat
          </button>
        </div>
      </div>
    );
  }

  if (twitchLoading || ((twitchChannel || stripchatUsername) && !video)) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', color: 'var(--text-primary)' }}>
        {twitchError ? (
          <>
            <div style={{ color: '#ff4444', marginBottom: 16 }}>{twitchError}</div>
            <button 
              onClick={() => { setTwitchChannel(null); setStripchatUsername(null); setTwitchError(null); }}
              style={{ padding: '8px 16px', borderRadius: '6px', background: '#333', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Try Again
            </button>
          </>
        ) : (
          <div>Fetching Stream...</div>
        )}
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
