import React from 'react';
import { UploadCloud, Play } from 'lucide-react';
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
}) => {
  const continueWatchingList = videos.filter(v => v.currentTime && v.currentTime > 2 && (typeof v.duration !== 'number' || v.currentTime < v.duration - 5));
  const primaryContinue = continueWatchingList.length > 0 ? continueWatchingList[0] : (videos.length > 0 ? videos[0] : null);

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem', boxSizing: 'border-box', width: '100%' }}>
      {primaryContinue && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          {/* Section Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Play size={22} color="var(--accent-color)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>Continue Watching</h2>
          </div>

          {/* Primary Red Banner (Full-Width, Clickable Container, Red Gradient, Big Resume Button) */}
          <div 
            onClick={() => handlePlayVideo(primaryContinue)}
            style={{ 
              width: '100%', 
              background: 'var(--banner-bg, linear-gradient(135deg, #e50914 0%, #9b040c 100%))', 
              borderRadius: '12px', 
              padding: '1.5rem', 
              marginBottom: '0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--banner-shadow, 0 8px 24px rgba(229, 9, 20, 0.25))',
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
                background: 'var(--play-btn-bg, #ffffff)', 
                color: 'var(--play-btn-text, #e50914)', 
                border: 'none',
                padding: '0.65rem 1.5rem',
                fontSize: '0.88rem',
                fontWeight: 700,
                borderRadius: 'var(--btn-border-radius, 8px)',
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
                  <Play size={14} fill="currentColor" stroke="currentColor" />
                  <span>Resume Playback</span>
                </>
              ) : (
                <>
                  <UploadCloud size={14} stroke="currentColor" />
                  <span>Select Media</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
      <div className="glass-panel workspace-panel">
        {/* Select Media Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <UploadCloud size={22} color="var(--accent-color)" />
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
                <Play size={14} fill="currentColor" stroke="none" />
                <span>Play</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
