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
    <div
      className="home-page-scroll-container"
      style={{
        flex: 1,
        minHeight: 0,
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        background: 'transparent'
      }}
    >
      <div
        className="home-page-content-wrapper"
        style={{
          maxWidth: 'var(--page-max-width, 1400px)',
          width: '100%',
          margin: '0 auto',
          padding: 'var(--space-6) var(--page-padding-x, var(--space-7)) var(--space-8) var(--page-padding-x, var(--space-7))',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
          boxSizing: 'border-box',
          minHeight: '100%'
        }}
      >
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
            background: 'var(--surface-1)',
            padding: '2rem',
            borderRadius: 'var(--radius-md)',
            width: '420px',
            maxWidth: '90%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={20} color="var(--accent)" />
              Pasted Link Detected
            </h3>
            
            {pastedPreviewTitle && (
              <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>Preview</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: 'var(--text-1)', wordBreak: 'break-all' }}>{pastedPreviewTitle}</p>
              </div>
            )}
            
            <input 
              type="text" 
              value={pastedUrl} 
              onChange={e => setPastedUrl(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--control-border)',
                background: 'var(--surface-2)',
                color: 'var(--text-1)',
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
                  background: 'var(--accent-fill)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
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
                  background: 'var(--surface-3)',
                  color: 'var(--text-1)',
                  border: '1px solid var(--control-border)',
                  borderRadius: 'var(--radius-sm)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
            <Play size={18} color="var(--accent)" fill="var(--accent)" />
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-1)', fontFamily: 'var(--font-display, inherit)' }}>Continue Watching</h2>
          </div>

          <div 
            className="continue-watching-card"
            onClick={() => handlePlayVideo(primaryContinue)}
            style={{ 
              width: '100%', 
              background: 'linear-gradient(135deg, var(--surface-1) 0%, var(--accent-soft) 100%), var(--surface-1)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              boxShadow: 'none',
              border: '1px solid var(--border)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ flex: 1, minWidth: '0', paddingRight: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', background: 'var(--surface-2)', color: 'var(--text-2)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase' }}>
                  RESUME PLAYBACK
                </span>
                {primaryContinue.duration && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 500 }}>
                    {(() => {
                      const dur = parseDurationToSeconds(primaryContinue.duration);
                      return dur > 0 ? `${Math.round(((primaryContinue.currentTime || 0) / dur) * 100)}% watched` : '';
                    })()}
                  </span>
                )}
              </div>
              
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {classifyVideoTitle(primaryContinue.title).displayTitle}
              </h3>
              
              <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--text-2)' }}>
                Position: <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{formatTime(primaryContinue.currentTime || 0)}</b>
              </p>

              {/* Progress bar */}
              {(() => {
                const dur = parseDurationToSeconds(primaryContinue.duration);
                const progress = dur > 0 && primaryContinue.currentTime ? Math.round((primaryContinue.currentTime / dur) * 100) : 0;
                return progress > 0 ? (
                  <div style={{ height: '4px', width: '100%', background: 'var(--surface-3)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.85rem' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)' }} />
                  </div>
                ) : null;
              })()}
            </div>
            
            <button 
              className="resume-btn"
              style={{ 
                background: 'var(--accent-fill)',
                color: 'var(--on-accent)',
                border: 'none',
                padding: '0.75rem 1.6rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: 'none',
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
      <div 
        className="select-media-card"
        style={{
          background: 'var(--surface-1)',
          borderRadius: 'var(--radius-md)',
          padding: '1.75rem',
          border: '1px solid var(--border)',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem'
        }}
      >
        <div 
          className="select-media-header"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UploadCloud size={22} color="var(--accent)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>Select Media</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
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
            background: isDragActive ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
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
            <div 
              className="drop-icon-circle"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--accent-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)'
              }}
            >
              <UploadCloud size={28} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)' }}>
                Open Local Video File
              </h3>
              <p className="desktop-drop-text" style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-2)' }}>
                Drag & drop or click anywhere in this area to browse video files
              </p>
              <p className="mobile-tap-text" style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-2)' }}>
                Tap to browse video files
              </p>
            </div>
            <button 
              className="btn btn-secondary btn-sm browse-files-btn" 
              onClick={(e) => { e.stopPropagation(); handleSelectLocalFile(); }}
              style={{
                marginTop: '6px',
                padding: '8px 20px',
                background: 'transparent',
                border: '1px solid var(--control-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-1)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Browse Files
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', width: '80%', maxWidth: '500px', gap: '1rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              OR STREAM FROM URL
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* Inline URL Input Form */}
          <form 
            onSubmit={handleUrlSubmit} 
            className="url-input-form-mobile"
            style={{ width: '100%', maxWidth: '650px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="url-form-row" style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Enter Stream URL (HLS / m3u8 / MP4)…" 
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--control-border)',
                  background: 'var(--surface-1)',
                  color: 'var(--text-1)',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
                required
              />
              <button 
                type="submit" 
                className="url-stream-submit-btn"
                disabled={isProcessing}
                style={{
                  padding: '12px 24px',
                  background: 'var(--accent-fill)',
                  color: 'var(--on-accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: 'none',
                  opacity: isProcessing ? 0.8 : 1,
                  transition: 'all 0.15s ease'
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
                    <span>Stream</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* =========================================================================
          RECENT PLAYBACK LIBRARY PREVIEW (IF AVAILABLE)
          ========================================================================= */}
      {sortedVideos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Film size={20} color="var(--accent)" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-1)' }}>Recent History</h2>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
              {sortedVideos.length} items recorded
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1rem',
            width: '100%'
          }}>
            {sortedVideos.filter(v => !primaryContinue || v.id !== primaryContinue.id).slice(0, 6).map((video) => (
              <div
                key={video.id}
                onClick={() => handlePlayVideo(video)}
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
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
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-soft)',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                  flexShrink: 0
                }}>
                  <Play size={18} fill="currentColor" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {classifyVideoTitle(video.title).displayTitle}
                  </h4>
                  <p style={{ margin: '3px 0 0 0', fontSize: '0.75rem', color: 'var(--text-2)' }}>
                    {video.currentTime ? `At ${formatTime(video.currentTime)}` : 'Ready to play'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
