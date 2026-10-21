import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, RotateCcw, RotateCw, X, 
  Maximize, Minimize, Volume2, Volume1, VolumeX, 
  Tv, Zap, ArrowLeft, Settings, AlertCircle
} from 'lucide-react';
import { Button } from './ui/button';
import type { VideoItem, CustomSubtitleTrack } from '../types/media';
import { SubtitleOverlay } from './SubtitleOverlay';
import type { SubtitleSettings } from './SubtitleOverlay';
import { MediaAuthModal } from './MediaAuthModal';
import { getSavedCredentials, saveCredentials, clearCredentials } from '../services/remote/mediaAuthStore';
import { saveMediaTimestamp, getMediaTimestamp } from '../utils/mediaTimestampStorage';
import { LoadingSpinner } from './LoadingSpinner';

export interface SimpleRemotePlayerProps {
  video: VideoItem;
  videos?: VideoItem[];
  onBack: () => void;
  onUpdateVideo: (updatedVideoOrUpdater: VideoItem | ((prev: VideoItem) => VideoItem), isExiting?: boolean, targetVideoId?: string, forceSave?: boolean) => void;
  subSettings?: SubtitleSettings;
  onUpdateSubSettings?: (settings: Partial<SubtitleSettings>) => void;
  saveVolume?: boolean;
  historySaveInterval?: number;
  uiHideTimeout?: number;
  customLoaderUrl?: string;
  customLoaderType?: 'default' | 'image' | 'video' | 'gif';
  spinnerPreset?: string;
  onSwitchMode?: (mode: 'simple' | 'server') => void;
}

export const SimpleRemotePlayer: React.FC<SimpleRemotePlayerProps> = ({
  video,
  onBack,
  onUpdateVideo,
  subSettings,
  saveVolume = true,
  historySaveInterval = 5,
  uiHideTimeout = 2.5,
  customLoaderUrl,
  customLoaderType = 'default',
  spinnerPreset = 'fire-circle',
  onSwitchMode
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(() => video.currentTime || 0);
  const latestTimeRef = useRef<number>(currentTime);
  latestTimeRef.current = currentTime;

  const [duration, setDuration] = useState<number>(() => {
    if (typeof video.duration === 'number') return video.duration;
    if (typeof video.duration === 'string') {
      const parts = video.duration.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    return 0;
  });

  const [volume, setVolume] = useState<number>(() => {
    if (saveVolume) {
      const saved = localStorage.getItem('valor_volume');
      return saved !== null ? parseFloat(saved) : 1.0;
    }
    return 1.0;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (saveVolume) {
      const saved = localStorage.getItem('valor_muted');
      return saved === 'true';
    }
    return false;
  });

  const [bufferedRanges, setBufferedRanges] = useState<{ start: number; end: number }[]>([]);
  const [hoverTime, setHoverTime] = useState<string>('0:00');
  const [hoverPercent, setHoverPercent] = useState<number>(0);
  const [showCenterPlayHint, setShowCenterPlayHint] = useState(false);

  // Auth modal
  const [authModalState, setAuthModalState] = useState<{
    isOpen: boolean;
    initialUsername: string;
    errorMessage: string | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    initialUsername: '',
    errorMessage: null,
    isLoading: false
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSeekedInitialRef = useRef(false);
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 10));

  // Build proxied URL with session sliding buffer
  const getProxiedUrl = useCallback((rawUrl: string): string => {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('/api/proxy-media')) return rawUrl;
    const creds = (video as any).auth || getSavedCredentials(rawUrl);
    let proxyUrl = `/api/proxy-media?url=${encodeURIComponent(rawUrl)}&sessionId=${sessionIdRef.current}`;
    if (video.duration) {
      proxyUrl += `&duration=${encodeURIComponent(video.duration.toString())}`;
    }
    if (creds?.username) {
      proxyUrl += `&user=${encodeURIComponent(creds.username)}`;
      if (creds.password) proxyUrl += `&pass=${encodeURIComponent(creds.password)}`;
    }
    return proxyUrl;
  }, [video]);

  // Master Play/Pause
  const handlePlay = async () => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.play();
      setIsPlaying(true);
      setShowCenterPlayHint(false);
    } catch (err: any) {
      console.warn('[SimpleRemotePlayer] Play blocked by browser policy:', err);
      setShowCenterPlayHint(true);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      handlePlay();
    } else {
      handlePause();
    }
  };

  const handleSeek = (targetTime: number) => {
    const clamped = Math.max(0, Math.min(targetTime, duration || Infinity));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Volume control
  const updateVolume = (newVol: number, newMuted: boolean) => {
    setVolume(newVol);
    setIsMuted(newMuted);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newMuted;
    }
    if (saveVolume) {
      localStorage.setItem('valor_volume', newVol.toString());
      localStorage.setItem('valor_muted', newMuted ? 'true' : 'false');
    }
  };

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          handleSeek(currentTime + (e.shiftKey ? 30 : 10));
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          handleSeek(currentTime - (e.shiftKey ? 30 : 10));
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateVolume(Math.min(1, volume + 0.05), false);
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateVolume(Math.max(0, volume - 0.05), false);
          break;
        case 'm':
          e.preventDefault();
          updateVolume(volume, !isMuted);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            onBack();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTime, volume, isMuted, duration]);

  // Controls visibility timeout
  const resetControlsTimeout = () => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setControlsVisible(false);
      }
    }, uiHideTimeout * 1000);
  };

  // History autosave
  useEffect(() => {
    const interval = setInterval(() => {
      if (latestTimeRef.current > 0) {
        onUpdateVideo({
          ...video,
          currentTime: latestTimeRef.current,
          duration: duration ? String(duration) : video.duration
        }, false);
        saveMediaTimestamp(video, latestTimeRef.current, duration, video.title);
      }
    }, historySaveInterval * 1000);
    return () => clearInterval(interval);
  }, [historySaveInterval, video, duration, onUpdateVideo]);

  // Format time
  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="simple-remote-player-container"
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* 1. Main HTML5 Video Element */}
      <video
        ref={videoRef}
        src={getProxiedUrl(video.url)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
        playsInline
        autoPlay
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (!videoRef.current) return;
          const cur = videoRef.current.currentTime;
          setCurrentTime(cur);
          latestTimeRef.current = cur;

          const buf = videoRef.current.buffered;
          const ranges = [];
          for (let i = 0; i < buf.length; i++) {
            ranges.push({ start: buf.start(i), end: buf.end(i) });
          }
          setBufferedRanges(ranges);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false);
          setIsPlaying(true);
          setShowCenterPlayHint(false);
        }}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (!videoRef.current) return;
          const vidDur = videoRef.current.duration;
          if (vidDur && !isNaN(vidDur)) {
            setDuration(vidDur);
          }

          if (!hasSeekedInitialRef.current) {
            hasSeekedInitialRef.current = true;
            const stored = getMediaTimestamp(video, vidDur);
            const targetResume = (video.currentTime && video.currentTime > 0) ? video.currentTime : stored;
            if (targetResume > 0 && targetResume < (vidDur - 3)) {
              videoRef.current.currentTime = targetResume;
              setCurrentTime(targetResume);
            }
          }

          // Trigger autoplay
          handlePlay().catch(() => {
            setShowCenterPlayHint(true);
          });
        }}
        onError={() => {
          // Check if auth required
          fetch(getProxiedUrl(video.url), { method: 'HEAD' }).then(res => {
            if (res.status === 401) {
              setAuthModalState({
                isOpen: true,
                initialUsername: '',
                errorMessage: 'Authentication required. Please enter username and password.',
                isLoading: false
              });
            } else {
              setPlaybackError('Network error loading remote media file.');
            }
          }).catch(() => {
            setPlaybackError('Unable to connect to remote stream.');
          });
        }}
      />

      {/* 2. Buffering Spinner */}
      {isBuffering && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 100 }}>
          <LoadingSpinner preset={spinnerPreset as any} customLoaderUrl={customLoaderUrl} customLoaderType={customLoaderType} />
        </div>
      )}

      {/* 3. Center Play / Resume Button when autoplay blocked or paused on load */}
      {showCenterPlayHint && !isPlaying && (
        <div
          onClick={handlePlay}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 150,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(10px)',
            padding: '24px 36px',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            transition: 'transform 0.15s ease'
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.04)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)')}
        >
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.5)'
          }}>
            <Play size={32} color="#ffffff" style={{ marginLeft: '4px' }} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
            {currentTime > 5 ? `Resume at ${formatTime(currentTime)}` : 'Click to Play'}
          </span>
        </div>
      )}

      {/* 4. Playback Error Overlay */}
      {playbackError && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          padding: '24px 32px',
          borderRadius: '16px',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#f87171',
          zIndex: 200,
          textAlign: 'center',
          maxWidth: '420px'
        }}>
          <AlertCircle size={40} style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#fff' }}>Playback Error</h3>
          <p style={{ fontSize: '13px', color: '#cbd5e1', margin: '0 0 16px 0' }}>{playbackError}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            {onSwitchMode && (
              <Button
                onClick={() => onSwitchMode('server')}
                style={{ background: '#8b5cf6', color: '#fff', fontSize: '13px', fontWeight: 700 }}
              >
                Try Server Remote Engine
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onBack}
              style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }}
            >
              Go Back
            </Button>
          </div>
        </div>
      )}

      {/* 5. Sleek Floating UI Controls */}
      <div
        className="simple-player-ui"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          opacity: controlsVisible ? 1 : 0,
          transition: 'opacity 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        {/* Top Header */}
        <div style={{
          padding: '20px 28px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={onBack}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                {video.title || 'Remote Video'}
              </h1>
              <span style={{ fontSize: '12px', color: '#06b6d4', fontWeight: 600 }}>
                ⚡ Simple HTML5 Player
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Mode Switcher Button */}
            {onSwitchMode && (
              <button
                onClick={() => {
                  if (videoRef.current) {
                    onUpdateVideo({
                      ...video,
                      currentTime: videoRef.current.currentTime,
                      duration: duration ? String(duration) : video.duration
                    }, false);
                  }
                  onSwitchMode('server');
                }}
                style={{
                  background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  color: '#c4b5fd',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(139, 92, 246, 0.35)';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(139, 92, 246, 0.2)';
                  e.currentTarget.style.color = '#c4b5fd';
                }}
                title="Switch to Server Remote Engine (Movies & TV)"
              >
                <Tv size={14} />
                Switch to Movies & TV Engine
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Fullscreen (F)"
            >
              <Maximize size={18} />
            </button>
          </div>
        </div>

        {/* Bottom Bar Controls */}
        <div style={{
          padding: '16px 28px 24px 28px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {/* Progress / Scrub Bar */}
          <div
            style={{ position: 'relative', width: '100%', height: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickPercent = (e.clientX - rect.left) / rect.width;
              handleSeek(clickPercent * duration);
            }}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setHoverPercent(percent * 100);
              setHoverTime(formatTime(percent * duration));
            }}
          >
            {/* Background Track */}
            <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: '3px', position: 'relative', overflow: 'hidden' }}>
              {/* Buffered Ranges */}
              {bufferedRanges.map((r, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${duration > 0 ? (r.start / duration) * 100 : 0}%`,
                    width: `${duration > 0 ? ((r.end - r.start) / duration) * 100 : 0}%`,
                    backgroundColor: 'rgba(255, 255, 255, 0.35)'
                  }}
                />
              ))}
              {/* Play Progress */}
              <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: '#06b6d4' }} />
            </div>

            {/* Scrub Handle */}
            <div style={{
              position: 'absolute',
              left: `${progressPercent}%`,
              transform: 'translateX(-50%)',
              width: '13px',
              height: '13px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 0 8px rgba(6, 182, 212, 0.8)'
            }} />
          </div>

          {/* Control Buttons Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={togglePlay}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px'
                }}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button
                onClick={() => handleSeek(currentTime - 10)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px' }}
                title="Rewind 10s (Left Arrow)"
              >
                <RotateCcw size={20} />
              </button>

              <button
                onClick={() => handleSeek(currentTime + 10)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px' }}
                title="Forward 10s (Right Arrow)"
              >
                <RotateCw size={20} />
              </button>

              {/* Volume Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '6px' }}>
                <button
                  onClick={() => updateVolume(volume, !isMuted)}
                  style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}
                  title="Mute / Unmute (M)"
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={e => updateVolume(parseFloat(e.target.value), false)}
                  style={{ width: '70px', accentColor: '#06b6d4', cursor: 'pointer' }}
                />
              </div>

              {/* Time Display */}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginLeft: '8px' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={toggleFullscreen}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px' }}
                title="Fullscreen (F)"
              >
                <Maximize size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Media Auth Modal if 401 encountered */}
      <MediaAuthModal
        isOpen={authModalState.isOpen}
        initialUsername={authModalState.initialUsername}
        errorMessage={authModalState.errorMessage}
        isLoading={authModalState.isLoading}
        onSubmit={async (username, password) => {
          setAuthModalState(prev => ({ ...prev, isLoading: true, errorMessage: null }));
          saveCredentials(video.url, username, password);
          if (videoRef.current) {
            videoRef.current.src = getProxiedUrl(video.url);
            videoRef.current.load();
            videoRef.current.play().catch(() => {});
          }
          setAuthModalState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        }}
        onCancel={() => {
          setAuthModalState(prev => ({ ...prev, isOpen: false }));
          onBack();
        }}
      />
    </div>
  );
};
