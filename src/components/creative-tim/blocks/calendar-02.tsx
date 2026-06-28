import { useState } from "react"
import { ChevronLeft, ChevronRight, Clock, Star, Play, Film, Calendar, UploadCloud } from "lucide-react"
import type { VideoItem } from "../../../types/media"
import { classifyVideoTitle } from "../../../utils/libraryClassifier"

interface Calendar02Props {
  videos: VideoItem[];
  onPlayVideo: (video: VideoItem) => void;
  isInstantlyPlayable: (video: VideoItem) => boolean;
}

export default function Calendar02({ videos, onPlayVideo, isInstantlyPlayable }: Calendar02Props) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
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

  // Filter and group videos for the current month
  const monthVideos = videos.filter(video => {
    if (!(video as any).lastPlayedDate) return false;
    const d = new Date((video as any).lastPlayedDate);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  // Group by day of month
  const groupedByDay: Record<number, VideoItem[]> = {};
  monthVideos.forEach(video => {
    const d = new Date((video as any).lastPlayedDate);
    const day = d.getDate();
    if (!groupedByDay[day]) {
      groupedByDay[day] = [];
    }
    groupedByDay[day].push(video);
  });

  // Sort days descending (latest first)
  const sortedDays = Object.keys(groupedByDay)
    .map(Number)
    .sort((a, b) => b - a);

  const getDayName = (day: number) => {
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getMonthAbbr = () => {
    return monthNames[month].substring(0, 3);
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header Panel */}
      <div 
        className="glass-panel" 
        style={{ 
          display: 'flex', 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '1.25rem 1.5rem',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '8px', borderRadius: '8px', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#fff' }}>
              Viewing Timeline
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', margin: 0 }}>
              Chronological schedule of watched media streams
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            className="settings-close-btn" 
            onClick={handlePrevMonth} 
            style={{ width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, minWidth: '110px', textAlign: 'center', color: '#fff' }}>
            {monthNames[month]} {year}
          </span>
          <button 
            className="settings-close-btn" 
            onClick={handleNextMonth} 
            style={{ width: '28px', height: '28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Main Timeline List */}
      <div 
        className="glass-panel" 
        style={{ 
          padding: '1.5rem', 
          borderRadius: '12px', 
          maxHeight: '65vh', 
          overflowY: 'auto', 
          scrollbarWidth: 'thin',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}
      >
        {sortedDays.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', color: 'rgba(255,255,255,0.4)' }}>
            <Film size={48} style={{ marginBottom: '1rem', opacity: 0.3, color: '#3b82f6' }} />
            <span style={{ fontSize: '0.9rem' }}>No viewing activity logged for {monthNames[month]} {year}</span>
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '1rem' }}>
            {/* Threaded Timeline Line */}
            <div 
              style={{ 
                position: 'absolute', 
                left: '28px', 
                top: '12px', 
                bottom: '12px', 
                width: '2px', 
                background: 'linear-gradient(to bottom, rgba(59, 130, 246, 0.4) 0%, rgba(59, 130, 246, 0.05) 100%)' 
              }} 
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {sortedDays.map(day => (
                <div key={day} style={{ display: 'flex', gap: '1.5rem', position: 'relative', flexWrap: 'wrap' }}>
                  {/* Timeline Date Bullet Node */}
                  <div 
                    style={{ 
                      flex: '0 0 36px', 
                      height: '36px', 
                      borderRadius: '50%', 
                      background: 'rgba(59, 130, 246, 0.15)', 
                      border: '2px solid #3b82f6', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      zIndex: 2,
                      boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)'
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>{day}</span>
                  </div>

                  {/* Day Info & Cards Column */}
                  <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#3b82f6' }}>{getDayName(day)}</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>• {getMonthAbbr()} {day}</span>
                    </div>

                    {/* Dynamic Event Video Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {groupedByDay[day].map((video, vIdx) => {
                        const playTime = (video as any).lastPlayedDate ? new Date((video as any).lastPlayedDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
                        const rating = (video as any).rating || 0;
                        const watchedSeconds = (video as any).totalTimeWatched || 0;
                        const durationSeconds = typeof video.duration === 'number' ? video.duration : parseFloat(video.duration || '0');
                        const durationStr = typeof video.duration === 'number' ? formatTime(video.duration) : video.duration || 'Unknown';
                        const classification = classifyVideoTitle(video.title);

                        const progress = durationSeconds > 0 && video.currentTime
                          ? Math.round((video.currentTime / durationSeconds) * 100)
                          : 0;

                        return (
                          <div 
                            key={vIdx} 
                            style={{ 
                              background: 'rgba(255, 255, 255, 0.02)', 
                              border: '1px solid rgba(255, 255, 255, 0.05)', 
                              borderRadius: '8px', 
                              padding: '1rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '1.25rem',
                              flexWrap: 'wrap',
                              transition: 'all 0.2s',
                              position: 'relative',
                              overflow: 'hidden'
                            }}
                            className="timeline-card-hover"
                          >
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              {/* Classified Beautiful Title */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff' }}>
                                  {classification.displayTitle}
                                </span>
                                <span 
                                  style={{ 
                                    fontSize: '0.62rem', 
                                    fontWeight: 700, 
                                    textTransform: 'uppercase', 
                                    background: classification.type === 'series' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(46, 204, 113, 0.15)', 
                                    color: classification.type === 'series' ? '#3b82f6' : '#2ecc71',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    border: classification.type === 'series' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid rgba(46, 204, 113, 0.2)'
                                  }}
                                >
                                  {classification.type}
                                </span>
                              </div>

                              {/* Muted Raw Filename */}
                              <div 
                                style={{ 
                                  fontSize: '0.68rem', 
                                  color: 'rgba(255,255,255,0.3)', 
                                  fontFamily: 'monospace', 
                                  marginBottom: '0.6rem', 
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis', 
                                  whiteSpace: 'nowrap',
                                  maxWidth: '480px' 
                                }}
                                title={video.title}
                              >
                                {video.title}
                              </div>

                              {/* Metas display */}
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                                  <Clock size={12} style={{ color: '#3b82f6' }} />
                                  <span>Viewed at <b>{playTime}</b></span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                                  <Play size={12} style={{ color: '#2ecc71' }} />
                                  <span>Watched: <b>{formatTime(watchedSeconds)}</b> / {durationStr}</span>
                                </div>
                                {rating > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#f59e0b' }}>
                                    <Star size={12} fill="#f59e0b" stroke="#f59e0b" style={{ color: '#f59e0b' }} />
                                    <span>{'★'.repeat(rating)}{'☆'.repeat(5 - rating)}</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Progress bar */}
                              {progress > 0 && (
                                <div style={{ height: '3px', width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.65rem' }}>
                                  <div style={{ height: '100%', width: `${progress}%`, background: '#3b82f6' }} />
                                </div>
                              )}
                            </div>

                            {/* Resume button */}
                            <button 
                              className="btn btn-primary btn-sm"
                              onClick={() => onPlayVideo(video)}
                              style={{ 
                                padding: '0.4rem 0.85rem', 
                                fontSize: '0.75rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                cursor: 'pointer',
                                height: 'fit-content',
                                alignSelf: 'center',
                                boxShadow: '0 4px 12px rgba(59,130,246,0.2)'
                              }}
                            >
                              {isInstantlyPlayable(video) ? (
                                <>
                                  <Play size={10} fill="white" />
                                  <span>Resume</span>
                                </>
                              ) : (
                                <>
                                  <UploadCloud size={10} />
                                  <span>Select Media</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .timeline-card-hover:hover {
          background: rgba(255, 255, 255, 0.04) !important;
          border-color: rgba(255, 255, 255, 0.08) !important;
          transform: translateX(2px);
        }
      `}</style>
    </div>
  )
}
