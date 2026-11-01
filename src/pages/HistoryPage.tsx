import React, { useState } from 'react';
import { Play, UploadCloud, Film, X } from 'lucide-react';
import type { VideoItem } from '../types/media';
import { CalendarView } from '../components/CalendarView';
import Calendar02 from '../components/creative-tim/blocks/calendar-02';
import { classifyVideoTitle } from '../utils/libraryClassifier';
import { smartTitleCase, getTileColors, getFirstAlphanumeric } from '../utils/libraryViewModel';
import { formatRuntime, formatTimecode, formatFullTimecode, parseDurationToSeconds } from '../utils/timeFormat';
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
  formatTime: (secs: number | string | undefined) => string;
}

function getCleanDisplayTitle(video: VideoItem): { title: string; rawTitle: string; subtitle?: string } {
  const rawTitle = video.title || 'Untitled';
  const info = classifyVideoTitle(rawTitle);
  if (info.type === 'series' && info.season !== undefined && info.episode !== undefined) {
    const sTitle = smartTitleCase(info.seriesTitle || 'Unknown Series').replace(/\s*\(\d{4}\)$/, '').trim();
    const sStr = String(info.season).padStart(2, '0');
    const eStr = String(info.episode).padStart(2, '0');
    return {
      title: `${sTitle} S${sStr}E${eStr}`,
      rawTitle,
      subtitle: info.episodeTitle ? smartTitleCase(info.episodeTitle) : undefined
    };
  }
  const base = smartTitleCase(info.cleanTitle || rawTitle);
  const title = info.year ? `${base} (${info.year})` : base;
  return { title, rawTitle };
}

const HistoryThumbnail: React.FC<{ posterPath?: string; title: string }> = ({ posterPath, title }) => {
  const [imgError, setImgError] = useState(false);
  const tile = getTileColors(title);
  const glyph = getFirstAlphanumeric(title);

  return (
    <div 
      style={{ 
        width: '48px', 
        height: '68px', 
        borderRadius: 'var(--radius-sm, 8px)', 
        overflow: 'hidden', 
        flexShrink: 0, 
        marginRight: '1rem',
        background: posterPath && !imgError ? 'var(--surface-2)' : tile.tileBg,
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      {posterPath && !imgError ? (
        <img 
          src={posterPath} 
          alt="" 
          crossOrigin="anonymous"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      ) : (
        <span 
          style={{ 
            fontSize: '1.25rem', 
            fontWeight: 700, 
            color: tile.glyphColor, 
            fontFamily: 'var(--font-display, inherit)',
            lineHeight: 1,
            userSelect: 'none'
          }}
        >
          {glyph}
        </span>
      )}
    </div>
  );
};

export const HistoryPage: React.FC<HistoryPageProps> = ({
  videos,
  historyViewMode,
  setHistoryViewMode: _setHistoryViewMode,
  settings,
  handlePlayVideo,
  handleRemoveVideo,
  syncVideoToTraktHistory,
  isInstantlyPlayable,
  parseDurationToSeconds: _parseDurationToSeconds,
  formatTime: _formatTime,
}) => {
  const sortedVideos = React.useMemo(() => {
    return [...videos].sort((a, b) => {
      const dateA = a.lastPlayedDate ? new Date(a.lastPlayedDate).getTime() : 0;
      const dateB = b.lastPlayedDate ? new Date(b.lastPlayedDate).getTime() : 0;
      return dateB - dateA; // Newest first
    });
  }, [videos]);

  const continueWatchingList = sortedVideos.filter(v => {
    if (!v.currentTime || v.currentTime <= 2) return false;
    const durSecs = typeof v.duration === 'number' ? v.duration : parseDurationToSeconds(v.duration);
    return durSecs <= 0 || v.currentTime < durSecs - 15;
  });
  const primaryContinue = continueWatchingList.length > 0 ? continueWatchingList[0] : (sortedVideos.length > 0 ? sortedVideos[0] : null);

  return (
    <div className="workspace-panel-wrapper">
      <div className="glass-panel workspace-panel">
        {historyViewMode === 'calendar' ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {settings.calendarStyle === 'list' && (
              <Calendar02 videos={sortedVideos} onPlayVideo={handlePlayVideo} isInstantlyPlayable={isInstantlyPlayable} />
            )}
            {settings.calendarStyle === 'grid' && (
              <CalendarView videos={sortedVideos} onPlayVideo={handlePlayVideo} />
            )}
            {settings.calendarStyle === 'booking' && (
              <BookingCalendar />
            )}
            {settings.calendarStyle === 'appointment' && (
              <AppointmentCalendar videos={sortedVideos} onPlayVideo={handlePlayVideo} />
            )}
          </div>
        ) : (
          <>
            {primaryContinue && (() => {
              const primaryClean = getCleanDisplayTitle(primaryContinue);
              const primaryDur = typeof primaryContinue.duration === 'number' ? primaryContinue.duration : parseDurationToSeconds(primaryContinue.duration);
              const isPrimaryInProgress = typeof primaryContinue.currentTime === 'number' && primaryContinue.currentTime > 2;
              const primaryProgressPct = primaryDur > 0 && primaryContinue.currentTime ? Math.round((primaryContinue.currentTime / primaryDur) * 100) : 0;
              const isCompleted = !!(primaryContinue.completed || (primaryContinue as any).timeToFinish || (primaryDur > 0 && primaryContinue.currentTime && primaryContinue.currentTime >= primaryDur - 15));

              return (
                <div 
                  onClick={() => handlePlayVideo(primaryContinue)}
                  style={{ 
                    width: '100%', 
                    background: 'var(--surface-1)',
                    backgroundImage: 'linear-gradient(135deg, var(--accent-soft) 0%, transparent 75%)', 
                    borderRadius: 'var(--radius-md, 12px)', 
                    padding: '1rem 1.25rem', 
                    marginBottom: '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    boxShadow: 'none',
                    border: '1px solid var(--border)',
                    transition: 'transform 0.2s, border-color 0.2s',
                    boxSizing: 'border-box'
                  }}
                  className="premium-red-banner"
                >
                  <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, paddingRight: '1.5rem' }}>
                    <HistoryThumbnail posterPath={primaryContinue.posterPath} title={primaryClean.title} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.35rem' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.8px', background: 'var(--surface-2)', color: 'var(--text-1)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                          {isCompleted ? 'Watched' : isPrimaryInProgress ? 'Continue watching' : 'Latest item'}
                        </span>
                        {primaryProgressPct > 0 && !isCompleted && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 500 }}>
                            {primaryProgressPct}% Watched
                          </span>
                        )}
                        {primaryDur > 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>
                            {formatRuntime(primaryDur)}
                          </span>
                        )}
                      </div>
                      
                      <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={primaryClean.rawTitle}>
                        {primaryClean.title}
                      </h3>
                      
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-2)' }}>
                        {isCompleted ? (
                          <span>Watched completely • Ready to replay</span>
                        ) : isPrimaryInProgress ? (
                          <span>Resume playback at <b>{formatTimecode(primaryContinue.currentTime)}</b></span>
                        ) : (
                          <span>Not started • Click to play</span>
                        )}
                      </p>

                      {/* Progress bar inside banner */}
                      {primaryProgressPct > 0 && !isCompleted && (
                        <div style={{ height: '4px', width: '100%', maxWidth: '360px', background: 'var(--surface-2)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.65rem' }}>
                          <div style={{ height: '100%', width: `${primaryProgressPct}%`, background: 'var(--accent)' }} />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <button 
                    className="btn btn-primary" 
                    style={{ 
                      background: 'var(--surface-3)',
                      color: 'var(--text-1)',
                      border: '1px solid var(--control-border)',
                      padding: '0.65rem 1.4rem',
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-sm, 8px)',
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
                        <Play size={14} fill="currentColor" stroke="currentColor" />
                        <span>{isCompleted ? 'Play again' : isPrimaryInProgress ? 'Resume playback' : 'Play now'}</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={14} stroke="currentColor" />
                        <span>Select Media</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}

            {sortedVideos.length === 0 ? (
              <div className="empty-catalog-box glass-panel">
                <Film size={44} className="text-muted pulsing" />
                <p>No playback history yet. Load a stream or select a file to begin.</p>
              </div>
            ) : (
              <div className="history-list">
                {sortedVideos.map((video) => {
                  const clean = getCleanDisplayTitle(video);
                  const durationSec = typeof video.duration === 'number' ? video.duration : parseDurationToSeconds(video.duration);
                  const isCompleted = !!(video.completed || (video as any).timeToFinish || (durationSec > 0 && video.currentTime && video.currentTime >= durationSec - 15));
                  const hasProgress = !isCompleted && typeof video.currentTime === 'number' && video.currentTime > 2;
                  const rating = (video as any).rating;

                  return (
                    <div key={video.id} className="history-item glass-panel" onClick={() => handlePlayVideo(video)}>
                      <div className="history-item-header">
                        <HistoryThumbnail posterPath={video.posterPath} title={clean.title} />
                        <div className="history-info">
                          <span className="history-title" title={clean.rawTitle}>
                            {clean.title}
                          </span>
                          <div className="history-stats">
                            {durationSec > 0 ? (
                              <span className="stat-badge" title={formatFullTimecode(durationSec)}>
                                Length: {formatRuntime(durationSec)}
                              </span>
                            ) : (
                              <span className="stat-badge" style={{ opacity: 0.6 }}>
                                Length: Unknown
                              </span>
                            )}
                            {isCompleted ? (
                              <span className="stat-badge finish-badge">
                                Watched
                              </span>
                            ) : hasProgress ? (
                              <span className="stat-badge">
                                Watched: {formatTimecode(video.currentTime)}
                                {durationSec > 0 && ` (${Math.round((video.currentTime! / durationSec) * 100)}%)`}
                              </span>
                            ) : (video as any).totalTimeWatched > 2 ? (
                              <span className="stat-badge">
                                Watched: {formatTimecode((video as any).totalTimeWatched)}
                              </span>
                            ) : (
                              <span className="stat-badge" style={{ color: 'var(--text-3)' }}>
                                Not started
                              </span>
                            )}
                            {rating && (
                              <span className="stat-badge rating-badge">
                                Rating: {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
                              </span>
                            )}
                            {(video.bookmarks && video.bookmarks.length > 0) && (
                              <span className="stat-badge bookmark-badge">
                                Bookmarks: {video.bookmarks.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="history-actions-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                          className="btn btn-sm play-btn-compact" 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px',
                            background: 'var(--surface-3)',
                            color: 'var(--text-1)',
                            border: '1px solid var(--control-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.45rem 0.95rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {isInstantlyPlayable(video) ? (
                            <>
                              <Play size={13} fill="currentColor" />
                              <span>{hasProgress ? 'Resume' : 'Play'}</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud size={13} />
                              <span>Select Media</span>
                            </>
                          )}
                        </button>
                        {(() => {
                          if (!isCompleted && !video.hasScrobbledTrakt) return null;
                          return (
                            <button 
                              className={`btn btn-sm ${video.hasScrobbledTrakt ? 'btn-secondary' : 'btn-outline-danger'}`}
                              onClick={(e) => syncVideoToTraktHistory(video, e)}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                background: video.hasScrobbledTrakt ? 'var(--surface-2)' : 'var(--accent-soft)',
                                color: video.hasScrobbledTrakt ? 'var(--text-3)' : 'var(--accent)',
                                border: video.hasScrobbledTrakt ? '1px solid var(--border)' : '1px solid var(--accent)',
                                padding: '0.45rem 0.85rem',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                opacity: video.hasScrobbledTrakt ? 0.6 : 1
                              }}
                              title={video.hasScrobbledTrakt ? "Already Synced to Trakt.tv" : "Sync watched status to Trakt.tv"}
                              disabled={video.hasScrobbledTrakt}
                            >
                              <Film size={12} fill={video.hasScrobbledTrakt ? "var(--text-3)" : "none"} />
                              <span>Trakt</span>
                            </button>
                          );
                        })()}
                        <button 
                          className="btn-remove-history ghost-icon-btn" 
                          onClick={(e) => handleRemoveVideo(video.id, e)} 
                          aria-label="Remove from history"
                          title="Remove from history"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-2)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius-sm)',
                            marginLeft: '0.25rem',
                            transition: 'color 0.15s, background 0.15s'
                          }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
