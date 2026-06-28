import React, { useState } from 'react';
import { Film, Play, Star, List, Tv, UploadCloud } from 'lucide-react';
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
        
        {/* Panel Header & Sub Navigation Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Media Library</h2>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className={`settings-nav-btn ${activeSubTab === 'movies' ? 'active' : ''}`}
              onClick={() => {
                setActiveSubTab('movies');
                setSelectedSeries(null);
              }}
              style={{ padding: '0.4rem 1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <Film size={14} />
              <span>Movies ({movies.length})</span>
            </button>
            <button 
              className={`settings-nav-btn ${activeSubTab === 'series' ? 'active' : ''}`}
              onClick={() => {
                setActiveSubTab('series');
                setSelectedSeries(null);
              }}
              style={{ padding: '0.4rem 1rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <Tv size={14} />
              <span>Series ({Object.keys(groupedSeries).length})</span>
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', paddingRight: '4px' }}>
          
          {/* Movies Grid */}
          {activeSubTab === 'movies' && (
            movies.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                <Film size={44} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <span>No movies in library yet.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
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
                        padding: '1rem', 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid rgba(255,255,255,0.06)', 
                        borderRadius: '8px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.5rem',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, background-color 0.2s',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      }}
                    >
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.displayTitle}>
                        {item.displayTitle}
                      </div>
                      
                      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', display: 'flex', justifyContent: 'space-between', marginTop: 'auto', alignItems: 'center' }}>
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
                          fontSize: '0.65rem', 
                          fontWeight: 700, 
                          color: isInstantlyPlayable(item.video) ? '#2ecc71' : '#f59e0b',
                          background: isInstantlyPlayable(item.video) ? 'rgba(46,204,113,0.1)' : 'rgba(245,158,11,0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: isInstantlyPlayable(item.video) ? '1px solid rgba(46,204,113,0.2)' : '1px solid rgba(245,158,11,0.2)'
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '200px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                <Tv size={44} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <span>No series in library yet.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '1.25rem', height: '100%' }}>
                
                {/* Series List Sidebar */}
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.5rem', borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '1rem' }}>
                  {Object.entries(groupedSeries).map(([sTitle, episodes]) => {
                    const isSelected = selectedSeries === sTitle;
                    const ratedEpisodes = episodes.filter(e => (e.video as any).rating);
                    const avgRating = ratedEpisodes.length > 0
                      ? Math.round(ratedEpisodes.reduce((acc, curr) => acc + ((curr.video as any).rating || 0), 0) / ratedEpisodes.length)
                      : 0;

                    return (
                      <div 
                        key={sTitle}
                        onClick={() => setSelectedSeries(sTitle)}
                        style={{
                          background: isSelected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                          border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          padding: '0.75rem 1rem',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }} title={sTitle}>
                            {sTitle}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '10px' }}>
                            {episodes.length} ep
                          </span>
                        </div>
                        {avgRating > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#f59e0b' }}>
                            <Star size={9} fill="#f59e0b" stroke="#f59e0b" style={{ color: '#f59e0b' }} />
                            <span>{'★'.repeat(avgRating)}{'☆'.repeat(5 - avgRating)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Episodes Panel */}
                <div style={{ flex: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {!selectedSeries ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      <List size={36} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                      <span style={{ fontSize: '0.85rem' }}>Select a series to view episodes.</span>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#fff' }}>
                        {selectedSeries}
                      </h3>
                      
                      {(() => {
                        const episodesBySeason: Record<number, typeof seriesItems> = {};
                        groupedSeries[selectedSeries].forEach(epItem => {
                          const sNum = epItem.season || 1;
                          if (!episodesBySeason[sNum]) {
                            episodesBySeason[sNum] = [];
                          }
                          episodesBySeason[sNum].push(epItem);
                        });

                        const sortedSeasons = Object.keys(episodesBySeason).map(Number).sort((a, b) => a - b);

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {sortedSeasons.map(seasonNum => (
                              <div key={seasonNum} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {/* Season breadcrumb header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', paddingBottom: '0.35rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                  <span>{selectedSeries}</span>
                                  <span>&gt;</span>
                                  <span style={{ color: '#3b82f6' }}>Season {seasonNum}</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                  {episodesBySeason[seasonNum].map((epItem, idx) => {
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
                                          background: 'rgba(255,255,255,0.01)',
                                          border: '1px solid rgba(255,255,255,0.05)',
                                          borderRadius: '6px',
                                          padding: '0.65rem 0.85rem',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          cursor: 'pointer',
                                          transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'}
                                      >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>
                                            Episode {epItem.episode}
                                          </span>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
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
                        );
                      })()}
                    </>
                  )}
                </div>

              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
