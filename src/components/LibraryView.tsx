import React, { useState } from 'react';
import { Film, Play, Star, Tv, UploadCloud } from 'lucide-react';
import type { VideoItem } from '../types/media';
import { classifyVideoTitle } from '../utils/libraryClassifier';

interface LibraryViewProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ videos, onPlayVideo, isInstantlyPlayable }) => {
  const [activeSubTab, setActiveSubTab] = useState<'movies' | 'series'>('movies');
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);

  // Classify all video history items
  const classifiedItems = videos.map(video => {
    const classification = classifyVideoTitle(video.title);
    return {
      video,
      ...classification
    };
  });

  const movies = classifiedItems.filter(item => item.type === 'movie');
  const seriesItems = classifiedItems.filter(item => item.type === 'series');

  // Group series items by series title
  const groupedSeries: Record<string, typeof seriesItems> = {};
  seriesItems.forEach(item => {
    const sTitle = item.seriesTitle || 'Unknown Series';
    if (!groupedSeries[sTitle]) {
      groupedSeries[sTitle] = [];
    }
    groupedSeries[sTitle].push(item);
  });

  // Sort episodes in each series
  Object.keys(groupedSeries).forEach(sTitle => {
    groupedSeries[sTitle].sort((a, b) => {
      if (a.season !== b.season) {
        return (a.season || 0) - (b.season || 0);
      }
      return (a.episode || 0) - (b.episode || 0);
    });
  });

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === undefined) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="workspace-panel-wrapper">
      <div className="glass-panel workspace-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', overflow: 'hidden' }}>
        
        {/* Underline Tab Navigation */}
        <div className="settings-tab-nav" style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => {
              setActiveSubTab('movies');
              setSelectedSeries(null);
            }}
            style={{ 
              background: 'none', 
              border: 'none', 
              borderBottom: activeSubTab === 'movies' ? '2px solid var(--accent-color)' : '2px solid transparent', 
              color: activeSubTab === 'movies' ? 'var(--text-primary)' : 'var(--text-muted)', 
              padding: '0.5rem 0.25rem', 
              fontSize: '0.95rem', 
              fontWeight: 600, 
              cursor: 'pointer', 
              transition: 'all 0.2s', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            <Film size={16} />
            <span>Movies ({movies.length})</span>
          </button>
          <button 
            onClick={() => {
              setActiveSubTab('series');
              setSelectedSeries(null);
            }}
            style={{ 
              background: 'none', 
              border: 'none', 
              borderBottom: activeSubTab === 'series' ? '2px solid var(--accent-color)' : '2px solid transparent', 
              color: activeSubTab === 'series' ? 'var(--text-primary)' : 'var(--text-muted)', 
              padding: '0.5rem 0.25rem', 
              fontSize: '0.95rem', 
              fontWeight: 600, 
              cursor: 'pointer', 
              transition: 'all 0.2s', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px' 
            }}
          >
            <Tv size={16} />
            <span>Series ({Object.keys(groupedSeries).length})</span>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', paddingRight: '4px' }}>
          
          {/* Movies Grid */}
          {activeSubTab === 'movies' && (
            movies.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <Film size={44} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <span>No movies in library yet.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                {movies.map((item, idx) => {
                  const rating = (item.video as any).rating || 0;
                  const durationStr = typeof item.video.duration === 'number' ? formatTime(item.video.duration) : item.video.duration || 'Unknown';
                  const watchedProgress = item.video.currentTime && typeof item.video.duration === 'number' && item.video.duration > 0
                    ? Math.round((item.video.currentTime / item.video.duration) * 100)
                    : 0;

                  return (
                    <div 
                      key={idx} 
                      className="glass-panel" 
                      onClick={() => onPlayVideo(item.video)}
                      style={{ 
                        padding: '0.85rem 1rem', 
                        background: 'var(--card-bg)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '10px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.5rem',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, background-color 0.2s, border-color 0.2s',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.background = 'var(--card-hover-bg)';
                        e.currentTarget.style.borderColor = 'var(--accent-color)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = 'var(--card-bg)';
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                      }}
                    >
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.displayTitle}>
                        {item.displayTitle}
                      </div>
                      
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: 'auto', alignItems: 'center' }}>
                        <span>Length: {durationStr}</span>
                        {watchedProgress > 0 && <span style={{ color: '#3b82f6', fontWeight: 600 }}>{watchedProgress}% watched</span>}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                        {rating > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', color: '#f59e0b' }}>
                            <Star size={10} fill="#f59e0b" stroke="#f59e0b" />
                            <span>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
                          </div>
                        ) : <div />}
                        
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          color: isInstantlyPlayable(item.video) ? 'var(--success)' : 'var(--warning)',
                          background: isInstantlyPlayable(item.video) ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: isInstantlyPlayable(item.video) ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          {isInstantlyPlayable(item.video) ? 'Play' : 'Select Media'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* Series Groups */}
          {activeSubTab === 'series' && (
            Object.keys(groupedSeries).length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <Tv size={44} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <span>No series in library yet.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '1.25rem', height: '100%', minHeight: '350px' }}>
                
                {/* Series List Sidebar Tabs */}
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '6px', borderRight: '1px solid var(--border-color)', paddingRight: '1rem', overflowY: 'auto' }}>
                  {Object.entries(groupedSeries).map(([sTitle, episodes]) => {
                    const isSelected = (selectedSeries || Object.keys(groupedSeries)[0]) === sTitle;
                    return (
                      <button
                        key={sTitle}
                        onClick={() => setSelectedSeries(sTitle)}
                        style={{
                          background: isSelected ? 'var(--card-hover-bg)' : 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                          transition: 'all 0.2s',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <Tv size={16} color={isSelected ? 'var(--accent-color)' : 'var(--text-muted)'} />
                          <span style={{ fontSize: '0.85rem', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sTitle}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)', background: 'var(--badge-bg)', padding: '2px 6px', borderRadius: '10px' }}>
                          {episodes.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Episodes Panel */}
                <div style={{ flex: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(() => {
                    const currentSelected = selectedSeries || Object.keys(groupedSeries)[0];
                    if (!currentSelected || !groupedSeries[currentSelected]) return null;

                    const episodesBySeason: Record<number, typeof seriesItems> = {};
                    groupedSeries[currentSelected].forEach(epItem => {
                      const sNum = epItem.season || 1;
                      if (!episodesBySeason[sNum]) {
                        episodesBySeason[sNum] = [];
                      }
                      episodesBySeason[sNum].push(epItem);
                    });

                    const sortedSeasons = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);

                    return (
                      <>
                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {currentSelected}
                        </h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                          {sortedSeasons.map(seasonNum => (
                            <div key={seasonNum} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {/* Season breadcrumb header */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-subtle)' }}>
                                <span>{currentSelected}</span>
                                <span>&gt;</span>
                                <span style={{ color: '#3b82f6' }}>Season {seasonNum}</span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {(episodesBySeason[seasonNum] || []).map((epItem, idx) => {
                                  const durationStr = typeof epItem.video.duration === 'number' ? formatTime(epItem.video.duration) : epItem.video.duration || 'Unknown';
                                  const progress = epItem.video.currentTime && typeof epItem.video.duration === 'number' && epItem.video.duration > 0
                                    ? Math.round((epItem.video.currentTime / epItem.video.duration) * 100)
                                    : 0;
                                  const rating = (epItem.video as any).rating || 0;

                                  return (
                                    <div 
                                      key={idx}
                                      onClick={() => onPlayVideo(epItem.video)}
                                      style={{
                                        background: 'var(--card-bg)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '6px',
                                        padding: '0.65rem 0.85rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s, border-color 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--card-hover-bg)';
                                        e.currentTarget.style.borderColor = 'var(--accent-color)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--card-bg)';
                                        e.currentTarget.style.borderColor = 'var(--border-color)';
                                      }}
                                    >
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                          Episode {epItem.episode}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            Length: {durationStr}
                                          </span>
                                          {rating > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', color: '#f59e0b' }}>
                                              <Star size={9} fill="#f59e0b" stroke="#f59e0b" style={{ color: '#f59e0b' }} />
                                              <span>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {progress > 0 && (
                                          <span style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600 }}>
                                            {progress}% watched
                                          </span>
                                        )}
                                        <button className="btn btn-primary btn-sm play-btn-compact" style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                                          {isInstantlyPlayable(epItem.video) ? (
                                            <>
                                              <Play size={10} fill="white" />
                                              <span style={{ fontSize: '0.75rem' }}>Play</span>
                                            </>
                                          ) : (
                                            <>
                                              <UploadCloud size={10} />
                                              <span style={{ fontSize: '0.75rem' }}>Select Media</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>

              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
