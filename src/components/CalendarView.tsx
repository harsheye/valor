import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Star, Clock, Film, Play, Bookmark } from 'lucide-react';
import type { VideoItem } from '../types/media';

interface CalendarViewProps {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ videos, onPlayVideo }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDayVideos, setSelectedDayVideos] = useState<{ day: number; list: VideoItem[] } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDayVideos(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDayVideos(null);
  };

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

  // Find videos for a specific day
  const getVideosForDay = (day: number) => {
    return videos.filter(video => {
      if (!(video as any).lastPlayedDate) return false;
      const d = new Date((video as any).lastPlayedDate);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });
  };

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  const calendarCells = [];

  // Add previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    calendarCells.push({
      day: prevMonthTotalDays - i,
      isCurrentMonth: false,
      videosList: [] as VideoItem[]
    });
  }

  // Add current month days
  for (let i = 1; i <= totalDays; i++) {
    calendarCells.push({
      day: i,
      isCurrentMonth: true,
      videosList: getVideosForDay(i)
    });
  }

  // Add next month padding days
  const remainingCells = 42 - calendarCells.length;
  for (let i = 1; i <= remainingCells; i++) {
    calendarCells.push({
      day: i,
      isCurrentMonth: false,
      videosList: [] as VideoItem[]
    });
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '2.5rem', boxSizing: 'border-box', width: '100%' }}>
        
        {/* Compact Month Navigation Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface)', padding: '4px 12px', borderRadius: '20px', border: '1px solid var(--border-color)' }}>
            <button onClick={handlePrevMonth} className="settings-close-btn" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.95rem', fontWeight: 600, minWidth: '130px', textAlign: 'center', color: 'var(--text-primary)' }}>
              {monthNames[month]} {year}
            </span>
            <button onClick={handleNextMonth} className="settings-close-btn" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
          
          {/* Main Grid View */}
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {/* Weekday Names */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '4px' }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {calendarCells.map((cell, idx) => {
                const hasVideos = cell.isCurrentMonth && cell.videosList.length > 0;
                const isSelected = selectedDayVideos && selectedDayVideos.day === cell.day && cell.isCurrentMonth;
                
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (cell.isCurrentMonth && hasVideos) {
                        setSelectedDayVideos({ day: cell.day, list: cell.videosList });
                      }
                    }}
                    style={{
                      background: cell.isCurrentMonth 
                        ? hasVideos 
                          ? 'rgba(59, 130, 246, 0.12)' 
                          : 'var(--card-bg)'
                        : 'var(--surface)',
                      border: isSelected
                        ? '1px solid var(--accent-color)'
                        : hasVideos
                          ? '1px solid rgba(59, 130, 246, 0.3)'
                          : '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '65px',
                      cursor: cell.isCurrentMonth && hasVideos ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                      opacity: cell.isCurrentMonth ? 1 : 0.35
                    }}
                    className={cell.isCurrentMonth && hasVideos ? 'calendar-cell-active' : ''}
                  >
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: cell.isCurrentMonth ? 600 : 400, 
                      color: cell.isCurrentMonth 
                        ? hasVideos 
                          ? '#3b82f6' 
                          : 'var(--text-primary)' 
                        : 'var(--text-muted)',
                      alignSelf: 'flex-start',
                      marginBottom: '4px'
                    }}>
                      {cell.day}
                    </span>
                    
                    {hasVideos && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', width: '100%' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details Sidebar panel -> Stacked below */}
          <div style={{ background: 'transparent', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', paddingBottom: '2.5rem', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Day Details
            </h3>
            
            {!selectedDayVideos ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem' }}>
                <Film size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                <span style={{ fontSize: '0.85rem' }}>Select a day with tracked viewing activity to view metrics.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%', boxSizing: 'border-box' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  Viewing records for <b>{monthNames[month]} {selectedDayVideos.day}, {year}</b>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%', boxSizing: 'border-box' }}>
                  {selectedDayVideos.list.map((vid, idx) => {
                    const playTime = (vid as any).lastPlayedDate ? new Date((vid as any).lastPlayedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
                    const rating = (vid as any).rating || 0;
                    const watchedSeconds = (vid as any).totalTimeWatched || 0;
                    const durationStr = typeof vid.duration === 'number' ? formatTime(vid.duration) : vid.duration || 'Unknown';
                    
                    return (
                      <div 
                        key={idx} 
                        className="glass-panel" 
                        style={{ 
                          padding: '1rem', 
                          background: 'var(--card-bg)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '10px', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '0.75rem',
                          boxSizing: 'border-box',
                          width: '100%',
                          transition: 'background-color 0.2s, border-color 0.2s'
                        }}
                      >
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {vid.title}
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Clock size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />
                            <span>Viewed: <b>{playTime}</b></span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Play size={13} style={{ color: '#2ecc71', flexShrink: 0 }} />
                            <span>Watched: <b>{formatTime(watchedSeconds)}</b></span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Film size={13} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                            <span>Length: <b>{durationStr}</b></span>
                          </div>
                          {vid.bookmarks && vid.bookmarks.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Bookmark size={13} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                              <span>Bookmarks: <b>{vid.bookmarks.length}</b></span>
                            </div>
                          )}
                          
                          {rating > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', gridColumn: '1 / -1' }}>
                              <Star size={13} fill="#f59e0b" stroke="#f59e0b" style={{ color: '#f59e0b', flexShrink: 0 }} />
                              <span>Rating: <b style={{ color: '#f59e0b' }}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</b></span>
                            </div>
                          )}
                        </div>

                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={() => onPlayVideo(vid)}
                          style={{ marginTop: '0.35rem', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 600, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', alignSelf: 'flex-start' }}
                        >
                          <Play size={12} fill="white" />
                          <span>Resume Playback</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>

      <style>{`
        .calendar-cell-active:hover {
          background: rgba(59, 130, 246, 0.18) !important;
          border-color: #3b82f6 !important;
        }
      `}</style>
    </div>
  );
};
