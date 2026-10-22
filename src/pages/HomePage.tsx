import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, Play, Sparkles, Film, Loader2, 
  ExternalLink, Clock, Radio, CheckCircle2, Shield, Zap 
} from 'lucide-react';
import type { VideoItem } from '../types/media';
import { classifyVideoTitle } from '../utils/libraryClassifier';

interface HomePageProps {
  videos: VideoItem[];
  isDragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleSelectLocalFile: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  historyVideoInputRef: React.RefObject<HTMLInputElement | null>;
  handleHistoryVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  handleUrlSubmit: (e: React.FormEvent) => void;
  handlePlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  parseDurationToSeconds: (duration: string | number | undefined) => number;
  formatTime: (secs: number) => string;
  theme?: string;
  storageMode?: string;
  onToggleStorageMode?: (mode: 'server' | 'local') => void;
  userId?: string;
  isProcessing?: boolean;
}

export const HomePage: React.FC<HomePageProps> = ({
  videos,
  isDragActive,
  handleDrag,
  handleDrop,
  handleSelectLocalFile,
  fileInputRef,
  handleFileSelect,
  historyVideoInputRef,
  handleHistoryVideoSelect,
  videoUrl,
  setVideoUrl,
  handleUrlSubmit,
  handlePlayVideo,
  isInstantlyPlayable,
  parseDurationToSeconds,
  formatTime,
  theme,
  storageMode = 'localstorage',
  onToggleStorageMode,
  userId = 'local',
  isProcessing = false,
}) => {
  const sortedVideos = React.useMemo(() => {
    return [...videos].sort((a, b) => {
      const dateA = a.lastPlayedDate ? new Date(a.lastPlayedDate).getTime() : 0;
      const dateB = b.lastPlayedDate ? new Date(b.lastPlayedDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [videos]);

  const continueWatchingList = sortedVideos.filter(v => {
    if (!v.currentTime || v.currentTime <= 2) return false;
    const durSecs = typeof v.duration === 'number' ? v.duration : parseDurationToSeconds(v.duration);
    return durSecs <= 0 || v.currentTime < durSecs - 5;
  });
  const primaryContinue = continueWatchingList.length > 0 ? continueWatchingList[0] : (sortedVideos.length > 0 ? sortedVideos[0] : null);

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedUrl, setPastedUrl] = useState('');
  const [pastedPreviewTitle, setPastedPreviewTitle] = useState<string | null>(null);

  useEffect(() => {
    const processPastedText = (text: string) => {
      const trimmed = text.trim().replace(/^["']|["']$/g, '');
      const isUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('www.');
      const isPath = /^[a-zA-Z]:[/\\]/.test(trimmed) || trimmed.startsWith('/');
      
      if (isUrl || isPath) {
        let finalUrl = trimmed;
        if (trimmed.startsWith('www.')) {
          finalUrl = 'https://' + trimmed;
        }
        setPastedUrl(finalUrl);
        setIsPasteModalOpen(true);
        
        try {
          if (isUrl) {
            const urlObj = new URL(finalUrl);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            if (pathParts.length > 0) {
               setPastedPreviewTitle(decodeURIComponent(pathParts[pathParts.length - 1]));
            } else {
               setPastedPreviewTitle(urlObj.hostname);
            }
          } else {
            const parts = finalUrl.split(/[/\\]/);
            setPastedPreviewTitle(parts[parts.length - 1] || 'Local File');
          }
        } catch {
          const parts = finalUrl.split(/[/\\]/);
          setPastedPreviewTitle(parts[parts.length - 1] || 'Local File');
        }
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const text = e.clipboardData?.getData('text');
      if (text) processPastedText(text);
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'v') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        try {
          const text = await navigator.clipboard.readText();
          if (text) processPastedText(text);
        } catch {}
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);

  useEffect(() => {
    if (shouldAutoSubmit && videoUrl === pastedUrl) {
      handleUrlSubmit({ preventDefault: () => {} } as React.FormEvent);
      setShouldAutoSubmit(false);
    }
  }, [shouldAutoSubmit, videoUrl, pastedUrl, handleUrlSubmit]);

  const handlePastePlay = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    if (pastedUrl) {
      setVideoUrl(pastedUrl);
      setShouldAutoSubmit(true);
    }
    setIsPasteModalOpen(false);
  };

  const handleLoadDemo = (url: string) => {
    setVideoUrl(url);
    setTimeout(() => {
      handleUrlSubmit({ preventDefault: () => {} } as React.FormEvent);
    }, 50);
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      height: '100%',
      overflowY: 'auto',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.75rem',
      boxSizing: 'border-box',
      width: '100%',
      position: 'relative',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(229, 9, 20, 0.07) 0%, transparent 65%)'
    }}>
      {/* Paste Modal */}
      {isPasteModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }} onClick={() => setIsPasteModalOpen(false)}>
          <div style={{
            background: 'var(--card-bg, #161622)',
            padding: '2rem',
            borderRadius: '16px',
            width: '420px',
            maxWidth: '90%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={20} color="var(--accent-color, #e50914)" />
              Pasted Link Detected
            </h3>
            
            {pastedPreviewTitle && (
              <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Preview</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: '#fff', wordBreak: 'break-all' }}>{pastedPreviewTitle}</p>
              </div>
            )}
            
            <input 
              type="text" 
              value={pastedUrl} 
              onChange={e => setPastedUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.4)',
                color: '#fff',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button 
                onClick={handlePastePlay}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'var(--accent-color, #e50914)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Play size={16} fill="currentColor" /> Play Stream
              </button>
              <button 
                onClick={() => setIsPasteModalOpen(false)}
                style={{
                  padding: '12px 18px',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* =========================================================================
          CONTINUE WATCHING (HERO BANNER)
          ========================================================================= */}
      {primaryContinue && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Play size={20} color="var(--accent-color, #e50914)" />
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Continue Watching</h2>
          </div>

          <div 
            onClick={() => handlePlayVideo(primaryContinue)}
            style={{ 
              width: '100%', 
              background: 'linear-gradient(135deg, #e50914 0%, #8b0000 100%)', 
              borderRadius: '14px', 
              padding: '1.5rem 1.75rem', 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              boxShadow: '0 10px 28px rgba(229, 9, 20, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ flex: 1, minWidth: '0', paddingRight: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px', background: 'rgba(255,255,255,0.25)', color: '#fff', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  Resume Playback
                </span>
                {primaryContinue.duration && (
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                    {(() => {
                      const dur = parseDurationToSeconds(primaryContinue.duration);
                      return dur > 0 ? `${Math.round(((primaryContinue.currentTime || 0) / dur) * 100)}% Watched` : '';
                    })()}
                  </span>
                )}
              </div>
              
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {classifyVideoTitle(primaryContinue.title).displayTitle}
              </h3>
              
              <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
                Position: <b>{formatTime(primaryContinue.currentTime || 0)}</b>
              </p>

              {/* Progress bar */}
              {(() => {
                const dur = parseDurationToSeconds(primaryContinue.duration);
                const progress = dur > 0 && primaryContinue.currentTime ? Math.round((primaryContinue.currentTime / dur) * 100) : 0;
                return progress > 0 ? (
                  <div style={{ height: '5px', width: '100%', background: 'rgba(255,255,255,0.25)', borderRadius: '3px', overflow: 'hidden', marginTop: '0.85rem' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: '#ffffff', boxShadow: '0 0 8px #ffffff' }} />
                  </div>
                ) : null;
              })()}
            </div>
            
            <button 
              style={{ 
                background: '#ffffff', 
                color: '#e50914', 
                border: 'none',
                padding: '0.75rem 1.6rem',
                fontSize: '0.95rem',
                fontWeight: 800,
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {isInstantlyPlayable(primaryContinue) ? (
                <>
                  <Play size={16} fill="currentColor" stroke="currentColor" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <UploadCloud size={16} stroke="currentColor" />
                  <span>Select File</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MEDIA SELECTION WORKSPACE & DROP ZONE
          ========================================================================= */}
      <div style={{
        background: 'var(--card-bg, #161622)',
        borderRadius: '16px',
        padding: '1.75rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UploadCloud size={22} color="var(--accent-color, #e50914)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Select Media</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
            Supports MP4, MKV, MOV, WebM, HLS Streams
          </span>
        </div>

        {/* Combined Drop Zone & URL Injector */}
        <div 
          className={`drop-zone combined-drop-zone ${isDragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={handleSelectLocalFile}
          style={{
            background: isDragActive ? 'rgba(229, 9, 20, 0.1)' : 'rgba(255, 255, 255, 0.02)',
            border: `2px dashed ${isDragActive ? '#e50914' : 'rgba(255, 255, 255, 0.18)'}`,
            borderRadius: '14px',
            padding: '2.5rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.75rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(229, 9, 20, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-color, #e50914)',
              border: '1px solid rgba(229, 9, 20, 0.3)'
            }}>
              <UploadCloud size={32} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                Open Local Video File
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                Drag & drop or click anywhere in this area to browse video files
              </p>
            </div>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={(e) => { e.stopPropagation(); handleSelectLocalFile(); }}
              style={{
                marginTop: '6px',
                padding: '8px 20px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Browse Files
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', width: '80%', maxWidth: '500px', gap: '1rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              OR STREAM FROM URL
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Inline URL Input Form */}
          <form 
            onSubmit={handleUrlSubmit} 
            style={{ width: '100%', maxWidth: '650px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Enter Stream URL (HLS / m3u8 / MP4) or file path..." 
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
                required
              />
              <button 
                type="submit" 
                disabled={isProcessing}
                style={{
                  padding: '12px 24px',
                  background: 'var(--accent-color, #e50914)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(229, 9, 20, 0.35)',
                  opacity: isProcessing ? 0.8 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" stroke="none" />
                    <span>Play</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick Demo Streams Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '-0.5rem' }} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginRight: '4px' }}>
              Sample Streams:
            </span>
            <button
              type="button"
              onClick={() => handleLoadDemo('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                padding: '4px 10px',
                color: '#ddd',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              Big Buck Bunny (HLS)
            </button>
            <button
              type="button"
              onClick={() => handleLoadDemo('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                padding: '4px 10px',
                color: '#ddd',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              Tears of Steel (MP4)
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          RECENT PLAYBACK LIBRARY PREVIEW (IF AVAILABLE)
          ========================================================================= */}
      {sortedVideos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Film size={20} color="var(--accent-color, #e50914)" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Recent History</h2>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              {sortedVideos.length} items recorded
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1rem',
            width: '100%'
          }}>
            {sortedVideos.slice(0, 6).map((video) => (
              <div
                key={video.id}
                onClick={() => handlePlayVideo(video)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  background: 'rgba(229, 9, 20, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#e50914',
                  flexShrink: 0
                }}>
                  <Play size={18} fill="currentColor" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {classifyVideoTitle(video.title).displayTitle}
                  </h4>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                    {video.currentTime ? `At ${formatTime(video.currentTime)}` : 'Ready to play'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
