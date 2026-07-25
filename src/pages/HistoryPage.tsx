import React from 'react';
import { Play, UploadCloud, Film, X, List, Calendar } from 'lucide-react';
import type { VideoItem } from '../types/media';
import { CalendarView } from '../components/CalendarView';
import Calendar02 from '../components/creative-tim/blocks/calendar-02';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { BookingCalendar } from '../components/BookingCalendar';
import { AppointmentCalendar } from '../components/AppointmentCalendar';

interface HistoryPageProps {
  videos: VideoItem[];
  historyViewMode: 'list' | 'calendar';
  setHistoryViewMode: (mode: 'list' | 'calendar') => void;
  settings: any;
  handlePlayVideo: (video: VideoItem) => void;
  handleRemoveVideo: (id: string, e: React.MouseEvent) => void;
  syncVideoToTraktHistory: (video: VideoItem, e: React.MouseEvent) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
  parseDurationToSeconds: (duration: string | number | undefined) => number;
  formatTime: (secs: number) => string;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  videos,
  historyViewMode,
  setHistoryViewMode,
  settings,
  handlePlayVideo,
  handleRemoveVideo,
  syncVideoToTraktHistory,
  isInstantlyPlayable,
  parseDurationToSeconds,
  formatTime,
}) => {
  const continueWatchingList = videos.filter(v => v.currentTime && v.currentTime > 2 && (typeof v.duration !== 'number' || v.currentTime < v.duration - 5));
  const primaryContinue = continueWatchingList.length > 0 ? continueWatchingList[0] : (videos.length > 0 ? videos[0] : null);

  return (
    <>
      <div className="workspace-panel-wrapper">
        <div className="glass-panel workspace-panel">
          {historyViewMode === 'calendar' ? (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {settings.calendarStyle === 'list' && (
                <Calendar02 videos={videos} onPlayVideo={handlePlayVideo} isInstantlyPlayable={isInstantlyPlayable} />
              )}
              {settings.calendarStyle === 'grid' && (
                <CalendarView videos={videos} onPlayVideo={handlePlayVideo} />
              )}
              {settings.calendarStyle === 'booking' && (
                <BookingCalendar />
              )}
              {settings.calendarStyle === 'appointment' && (
                <AppointmentCalendar videos={videos} onPlayVideo={handlePlayVideo} />
              )}
            </div>
          ) : (
            <>
              {primaryContinue && (
                <div 
                  onClick={() => handlePlayVideo(primaryContinue)}
                  style={{ 
                    width: '100%', 
                    background: 'linear-gradient(135deg, #e50914 0%, #9b040c 100%)', 
                    borderRadius: '12px', 
                    padding: '0.85rem 1.1rem', 
                    marginBottom: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(229, 9, 20, 0.25)',
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
                      background: '#ffffff', 
                      color: '#e50914', 
                      border: 'none',
                      padding: '0.65rem 1.5rem',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      borderRadius: '8px',
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
                        <Play size={14} fill="#e50914" stroke="#e50914" />
                        <span>Resume Playback</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={14} stroke="#e50914" />
                        <span>Select Media</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {videos.length === 0 ? (
                <div className="empty-catalog-box glass-panel">
                  <Film size={44} className="text-muted pulsing" />
                  <p>No playback history yet. Load a stream or select a file to begin.</p>
                </div>
              ) : (
                <div className="history-list">
                  {videos.map((video) => (
                    <div key={video.id} className="history-item glass-panel" onClick={() => handlePlayVideo(video)}>
                      <div className="history-item-header">
                        {video.posterPath && (
                          <img 
                            src={video.posterPath} 
                            alt="" 
                            crossOrigin="anonymous"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            style={{ width: '45px', height: '65px', borderRadius: '6px', objectFit: 'cover', marginRight: '1rem', flexShrink: 0 }} 
                          />
                        )}
                        <div className="history-info">
                          <span className="history-title" title={video.title}>{video.title}</span>
                          <div className="history-stats">
                            {video.duration && (
                              <span className="stat-badge">Length: {typeof video.duration === 'number' ? formatTime(video.duration) : video.duration}</span>
                            )}
                            {(video as any).totalTimeWatched > 0 && (
                              <span className="stat-badge">Watched: {formatTime((video as any).totalTimeWatched)}</span>
                            )}
                            {(video as any).rating && (
                              <span className="stat-badge rating-badge">Rating: {'★'.repeat((video as any).rating)}{'☆'.repeat(5 - (video as any).rating)}</span>
                            )}
                            {(video as any).timeToFinish && (
                              <span className="stat-badge finish-badge">Completed in: {formatTime((video as any).timeToFinish)}</span>
                            )}
                            {(video.bookmarks && video.bookmarks.length > 0) && (
                              <span className="stat-badge bookmark-badge">Bookmarks: {video.bookmarks.length}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="history-actions-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button className="btn btn-primary btn-sm play-btn-compact" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {isInstantlyPlayable(video) ? (
                            <>
                              <Play size={12} fill="white" />
                              <span>Play</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud size={12} />
                              <span>Select Media</span>
                            </>
                          )}
                        </button>
                        {(() => {
                          const durationSec = typeof video.duration === 'number' ? video.duration : parseDurationToSeconds(video.duration);
                          const isCompleted = !!(video.timeToFinish || (durationSec > 0 && video.currentTime && video.currentTime >= durationSec - 15));
                          
                          if (!isCompleted && !video.hasScrobbledTrakt) return null;
                          
                          return (
                            <button 
                              className={`btn btn-sm ${video.hasScrobbledTrakt ? 'btn-secondary' : 'btn-outline-danger'}`}
                              onClick={(e) => syncVideoToTraktHistory(video, e)}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                background: video.hasScrobbledTrakt ? 'rgba(255,255,255,0.05)' : 'rgba(229, 9, 20, 0.1)',
                                color: video.hasScrobbledTrakt ? '#888' : '#e50914',
                                border: video.hasScrobbledTrakt ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e50914',
                                padding: '0.4rem 0.8rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                opacity: video.hasScrobbledTrakt ? 0.6 : 1
                              }}
                              title={video.hasScrobbledTrakt ? "Already Synced to Trakt.tv" : "Sync watched status to Trakt.tv"}
                              disabled={video.hasScrobbledTrakt}
                            >
                              <Film size={12} fill={video.hasScrobbledTrakt ? "#888" : "none"} />
                              <span>Trakt</span>
                            </button>
                          );
                        })()}
                        <button 
                          className="btn-remove-history" 
                          onClick={(e) => handleRemoveVideo(video.id, e)} 
                          title="Remove from history"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating Calendar Toggle Button */}
      <button
        className="dom-calendar-btn"
        onClick={() => setHistoryViewMode(historyViewMode === 'calendar' ? 'list' : 'calendar')}
        title={historyViewMode === 'calendar' ? 'Switch to History List' : 'Switch to Calendar View'}
      >
        {historyViewMode === 'calendar' ? <List size={20} color="#ffffff" /> : <Calendar size={20} color="#ffffff" />}
      </button>
    </>
  );
};
