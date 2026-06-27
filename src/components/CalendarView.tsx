import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Star, Clock, Film, Play } from 'lucide-react';
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
    <div className="workspace-panel-wrapper">
      <div className="glass-panel workspace-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '82vh', overflow: 'hidden' }}>
        
        {/* Calendar Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Viewing Calendar</h2>
            <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {videos.filter(v => (v as any).lastPlayedDate).length} tracked events
            </span>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={handlePrevMonth} className="settings-close-btn" style={{ width: '28px', height: '28px' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '1.05rem', fontWeight: 600, minWidth: '130px', textAlign: 'center' }}>
              {monthNames[month]} {year}
            </span>
            <button onClick={handleNextMonth} className="settings-close-btn" style={{ width: '28px', height: '28px' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1.25rem', flex: 1, overflow: 'hidden' }}>
          
          {/* Main Grid View */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Weekday Names */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '4px', paddingRight: '4px' }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', flex: 1, overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin' }}>
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
                          ? 'rgba(59, 130, 246, 0.08)' 
                          : 'rgba(255,255,255,0.01)'
                        : 'rgba(255,255,255,0.003)',
                      border: isSelected
                        ? '1px solid #3b82f6'
                        : hasVideos
                          ? '1px solid rgba(59, 130, 246, 0.2)'
                          : '1px solid rgba(255,255,255,0.03)',
                      borderRadius: '6px',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '65px',
                      cursor: cell.isCurrentMonth && hasVideos ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                      opacity: cell.isCurrentMonth ? 1 : 0.25
                    }}
                    className={cell.isCurrentMonth && hasVideos ? 'calendar-cell-active' : ''}
                  >
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: cell.isCurrentMonth ? 600 : 400, 
                      color: cell.isCurrentMonth 
                        ? hasVideos 
                          ? '#3b82f6' 
                          : 'rgba(255,255,255,0.8)' 
                        : 'rgba(255,255,255,0.3)',
                      alignSelf: 'flex-start',
                      marginBottom: '4px'
                    }}>
                      {cell.day}
                    </span>
                    
                    {hasVideos && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1 }}>
                        {cell.videosList.slice(0, 2).map((vid, vIdx) => (
                          <div 
                            key={vIdx} 
                            style={{ 
                              background: 'rgba(255,255,255,0.04)', 
                              borderLeft: '2px solid #3b82f6', 
                              padding: '2px 4px', 
                              borderRadius: '3px', 
                              fontSize: '0.62rem', 
                              whiteSpace: 'nowrap', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis',
                              color: 'rgba(255,255,255,0.9)'
                            }}
                            title={vid.title}
                          >
                            {vid.title}
                          </div>
                        ))}
                        {cell.videosList.length > 2 && (
                          <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', fontWeight: 500, alignSelf: 'flex-end', marginTop: 'auto' }}>
                            +{cell.videosList.length - 2} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details Sidebar panel */}
          <div style={{ flex: 1.2, background: 'rgba(255,255,255,0.01)', borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#fff' }}>
              Day Details
            </h3>
            
            {!selectedDayVideos ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '1rem' }}>
                <Film size={32} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                <span style={{ fontSize: '0.85rem' }}>Select a day with tracked viewing activity to view metrics.</span>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: '0.75rem', scrollbarWidth: 'thin', paddingRight: '4px' }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem' }}>
                  Viewing records for <b>{monthNames[month]} {selectedDayVideos.day}, {year}</b>
                </div>
                
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
                        padding: '0.85rem', 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid rgba(255,255,255,0.06)', 
                        borderRadius: '8px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '0.6rem',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                        {vid.title}
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} style={{ color: '#3b82f6' }} />
                          <span>Viewed: <b>{playTime}</b></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Play size={11} style={{ color: '#2ecc71' }} />
                          <span>Watched: <b>{formatTime(watchedSeconds)}</b></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Film size={11} style={{ color: '#e50914' }} />
                          <span>Length: <b>{durationStr}</b></span>
                        </div>
                        
                        {rating > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', gridColumn: 'span 2' }}>
                            <Star size={11} fill="#f59e0b" stroke="#f59e0b" style={{ color: '#f59e0b' }} />
                            <span>Rating: <b style={{ color: '#f59e0b' }}>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</b></span>
                          </div>
                        )}
                      </div>

                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => onPlayVideo(vid)}
                        style={{ marginTop: '0.25rem', padding: '0.35rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}
                      >
                        <Play size={10} fill="white" />
                        <span>Resume Playback</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      <style>{`
        .calendar-cell-active:hover {
          background: rgba(59, 130, 246, 0.14) !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
        }
      `}</style>
    </div>
  );
};
