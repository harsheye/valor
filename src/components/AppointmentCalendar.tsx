"use client"

import React, { useMemo, useEffect, useState } from "react"
import { format } from "./reui/event-calendar/date-utils"
import type { VideoItem } from "../types/media"

interface AppointmentCalendarProps {
  videos?: VideoItem[]
  onPlayVideo?: (video: VideoItem) => void
}

function formatLastWatched(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) {
    return `Today ${timeStr}`
  }
  if (diffDays === 1) {
    return `Yesterday ${timeStr}`
  }
  return `${d.toLocaleDateString()} ${timeStr}`
}

function formatRating(rating?: number): string {
  if (!rating) return ""
  const val = rating > 5 ? rating / 2 : rating
  const formattedVal = val % 1 === 0 ? val.toString() : val.toFixed(1)
  return `★ ${formattedVal} / 5`
}

function parseDurationToSeconds(duration: any): number {
  if (!duration) return 0
  if (typeof duration === 'number') {
    return duration
  }
  const str = String(duration).trim()
  if (str.includes(':')) {
    const parts = str.split(':').map(Number)
    if (parts.some(isNaN)) return 0
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]
    }
  }
  const minMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes)$/i)
  if (minMatch) {
    return parseFloat(minMatch[1]) * 60
  }
  return parseFloat(str) || 0
}

export const AppointmentCalendar: React.FC<AppointmentCalendarProps> = ({ videos = [], onPlayVideo }) => {
  const [ratingVideo, setRatingVideo] = useState<VideoItem | null>(null)

  const sortedVideos = useMemo(() => {
    return videos
      .filter(v => (v as any).lastPlayedDate)
      .map(v => ({
        ...v,
        playDate: new Date((v as any).lastPlayedDate)
      }))
      .sort((a, b) => b.playDate.getTime() - a.playDate.getTime()) // Descending (most recent first)
  }, [videos])

  // Group videos chronologically by date headings
  const groupedVideos = useMemo(() => {
    const groups: { [key: string]: typeof sortedVideos } = {}
    sortedVideos.forEach(video => {
      const dateKey = format(video.playDate, "EEEE, MMMM d, yyyy")
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(video)
    })
    return groups
  }, [sortedVideos])

  // Expose play hook to window context for absolute child trigger
  useEffect(() => {
    if (onPlayVideo) {
      ;(window as any)._onPlayCalendarVideo = onPlayVideo
    }
    return () => {
      delete (window as any)._onPlayCalendarVideo
    }
  }, [onPlayVideo])

  // Handle play action
  const handlePlay = (video: VideoItem) => {
    if (onPlayVideo) {
      onPlayVideo(video)
    }
  }

  // Handle rate action
  const handleRate = (video: VideoItem) => {
    setRatingVideo(video)
  }

  // Handle delete action
  const handleDelete = (video: VideoItem) => {
    if (confirm(`Remove "${video.title}" from history?`)) {
      if ((window as any)._onDeleteCalendarVideo) {
        (window as any)._onDeleteCalendarVideo(video)
      }
    }
  }

  // Handle details action
  const handleDetails = (video: VideoItem) => {
    if ((window as any)._onShowMediaDetails) {
      (window as any)._onShowMediaDetails(video)
    }
  }

  // Color mapping matching Screenshot 1 (Yellow, Rose/Red, Purple, Blue)
  const themeColors = ["#F59E0B", "#F43F5E", "#8B5CF6", "#0EA5E9"]
  const bgColors = [
    "rgba(245, 158, 11, 0.03)", // Yellow tint
    "rgba(244, 63, 94, 0.03)",  // Rose tint
    "rgba(139, 92, 246, 0.03)", // Purple tint
    "rgba(14, 165, 233, 0.03)"  // Blue tint
  ]

  return (
    <div className="activity-timeline-container">
      
      {/* Timeline Header */}
      <div className="activity-timeline-header">
        <div>
          <h2 className="activity-timeline-title">Activity Timeline</h2>
          <p className="activity-timeline-subtitle">Your recent streaming sessions</p>
        </div>
        
        <div className="activity-timeline-controls">
          <button className="activity-timeline-btn" style={{ height: '34px' }}>
            <span style={{ fontSize: '14px' }}>⚙</span>
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Timeline List */}
      <div className="activity-timeline-list" style={{ paddingLeft: 0 }}>
        {Object.keys(groupedVideos).length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">No recent streaming sessions recorded.</div>
        ) : (
          Object.keys(groupedVideos).map((dateKey) => (
            <div key={dateKey} style={{ marginBottom: '32px' }}>
              
              {/* Day Header Divider aligned with cards */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '16px', 
                marginBottom: '20px', 
                marginTop: '24px',
                paddingLeft: '132px'
              }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)', whiteSpace: 'nowrap' }}>
                  {dateKey}
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}></div>
              </div>

              {/* Cards List for this day */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                
                {/* Timeline axis line */}
                <div style={{ 
                  position: 'absolute', 
                  left: '105px', 
                  top: 0, 
                  bottom: 0, 
                  width: '2px', 
                  backgroundColor: '#2b2b2b', 
                  zIndex: 1 
                }}></div>

                {groupedVideos[dateKey].map((video, index) => {
                  const timeStr = format(video.playDate, "hh:mm A")
                  
                  // Color matching index
                  const color = themeColors[index % themeColors.length]
                  const cardBg = bgColors[index % bgColors.length]

                  const durSec = parseDurationToSeconds(video.duration)
                  const watchedSec = video.totalTimeWatched || 0
                  
                  // Calculate progress percentage correctly
                  const activeSec = Math.max(watchedSec, video.currentTime || 0)
                  const progressPct = durSec > 0 ? Math.min(Math.round((activeSec / durSec) * 100), 100) : 0
                  
                  // Completion Status Pill definitions
                  let statusText = "Paused"
                  let statusIcon = "⏸"
                  if (progressPct >= 95) {
                    statusText = "Completed"
                    statusIcon = "✔"
                  } else if (progressPct > 10) {
                    statusText = "Watching"
                    statusIcon = "▶"
                  }

                  const watchedMin = Math.round(watchedSec / 60)
                  const lastPlayedText = formatLastWatched(video.playDate.toISOString())

                  // Parse source/resolution from title
                  const resMatch = video.title.match(/(1080p|720p|2160p|4k|480p)/i)
                  const resolution = resMatch ? resMatch[0].toUpperCase() : "1080P"
                  
                  const sourceMatch = video.title.match(/(web-dl|webrip|bluray|hdtv|bdrip|web)/i)
                  const source = sourceMatch ? sourceMatch[0].toUpperCase() : "WEB-DL"

                  const initials = video.title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || "V"

                  // Highlight active color for first item on the axis
                  const timeLabelColor = index === 0 ? color : "rgba(255, 255, 255, 0.6)"

                  return (
                    <div 
                      key={video.id || index}
                      className="activity-timeline-item" 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        width: '100%',
                        position: 'relative'
                      }}
                    >
                      {/* Time Marker Column (80px) */}
                      <div style={{ 
                        width: '80px', 
                        textAlign: 'right', 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        color: timeLabelColor, 
                        flexShrink: 0 
                      }}>
                        {timeStr}
                      </div>

                      {/* Bullet Dot Column (20px) */}
                      <div style={{ 
                        width: '20px', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        flexShrink: 0,
                        zIndex: 2
                      }}>
                        <div style={{ 
                          width: '10px', 
                          height: '10px', 
                          borderRadius: '50%', 
                          backgroundColor: color, 
                          boxShadow: '0 0 0 4px #101010' 
                        }}></div>
                      </div>

                      {/* Timeline Card */}
                      <div 
                        className="activity-timeline-card" 
                        style={{ 
                          '--card-hover-border': `${color}`,
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '20px',
                          background: '#121212',
                          backgroundColor: cardBg,
                          border: `1px solid ${color}`,
                          borderRadius: '12px',
                          boxSizing: 'border-box'
                        } as any}
                      >
                        {/* Circle initials avatar */}
                        <div 
                          className="activity-timeline-avatar" 
                          style={{ 
                            width: '44px', 
                            height: '44px', 
                            borderRadius: '50%', 
                            backgroundColor: color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '16px',
                            color: '#fff',
                            flexShrink: 0
                          }}
                        >
                          {initials}
                        </div>

                        {/* Middle Text Column (Flex-1) */}
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '8px', textAlign: 'left' }}>
                          
                          {/* Row 1: Full filename title */}
                          <h3 
                            style={{ 
                              fontSize: '16px', 
                              fontWeight: 600, 
                              color: '#fff', 
                              margin: 0, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap' 
                            }}
                            title={video.title}
                          >
                            {video.title}
                          </h3>

                          {/* Row 2: Source badge pill */}
                          <span 
                            style={{ 
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: `${color}15`,
                              border: `1px solid ${color}30`,
                              color: color,
                              width: 'max-content'
                            }}
                          >
                            {source}
                          </span>

                          {/* Row 3: Meta details */}
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
                            <span style={{ color: color }}>{statusIcon} {statusText}</span>
                            <span>•</span>
                            {video.rating && (
                              <>
                                <span style={{ color: '#FBBF24' }}>{formatRating(video.rating)}</span>
                                <span>•</span>
                              </>
                            )}
                            <span>⏱ {watchedMin}m watched</span>
                            <span>•</span>
                            <span>Progress: {progressPct}%</span>
                            <span>•</span>
                            <span>Last watched: {lastPlayedText}</span>
                          </div>

                        </div>

                        {/* Right Actions & Progress Bar Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px', flexShrink: 0 }}>
                          
                          {/* Row 1: Action buttons */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button 
                              onClick={() => handlePlay(video)} 
                              style={{ 
                                background: '#1b1b1b', 
                                border: '1px solid #2b2b2b', 
                                color: '#fff', 
                                borderRadius: '8px', 
                                width: '36px', 
                                height: '36px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Resume Playback"
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2b2b2b'; e.currentTarget.style.background = '#1b1b1b'; e.currentTarget.style.color = '#fff'; }}
                            >
                              ▶
                            </button>
                            <button 
                              onClick={() => handleDetails(video)} 
                              style={{ 
                                background: '#1b1b1b', 
                                border: '1px solid #2b2b2b', 
                                color: '#fff', 
                                borderRadius: '8px', 
                                width: '36px', 
                                height: '36px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold'
                              }}
                              title="View Details"
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2b2b2b'; e.currentTarget.style.background = '#1b1b1b'; e.currentTarget.style.color = '#fff'; }}
                            >
                              i
                            </button>
                            <button 
                              onClick={() => handleRate(video)} 
                              style={{ 
                                background: '#1b1b1b', 
                                border: '1px solid #2b2b2b', 
                                color: video.rating ? '#FBBF24' : '#fff', 
                                borderRadius: '8px', 
                                width: '36px', 
                                height: '36px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Rate Media"
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2b2b2b'; e.currentTarget.style.background = '#1b1b1b'; e.currentTarget.style.color = video.rating ? '#FBBF24' : '#fff'; }}
                            >
                              ★
                            </button>
                            <button 
                              onClick={() => handleDelete(video)} 
                              style={{ 
                                background: '#1b1b1b', 
                                border: '1px solid #2b2b2b', 
                                color: '#ef4444', 
                                borderRadius: '8px', 
                                width: '36px', 
                                height: '36px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="Delete History"
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2b2b2b'; e.currentTarget.style.background = '#1b1b1b'; e.currentTarget.style.color = '#ef4444'; }}
                            >
                              🗑
                            </button>
                          </div>

                          {/* Row 2: Progress bar slider track */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '180px' }}>
                            <div style={{ flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', height: '4px', borderRadius: '2px', overflow: 'visible', position: 'relative' }}>
                              {/* Fill */}
                              <div 
                                style={{ width: `${progressPct}%`, backgroundColor: color, height: '100%', borderRadius: '2px', position: 'relative' }}
                              >
                                {/* Dot Handle thumb */}
                                <div style={{
                                  position: 'absolute',
                                  right: '-4px',
                                  top: '-2px',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: color,
                                  boxShadow: '0 0 4px rgba(0,0,0,0.5)'
                                }}></div>
                              </div>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: color, minWidth: '28px', textAlign: 'right' }}>
                              {progressPct}%
                            </span>
                          </div>

                        </div>

                      </div>
                    </div>
                  )
                })}
              </div>

            </div>
          ))
        )}
      </div>

      {/* Custom Rating Dialog modal */}
      {ratingVideo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#161616',
            border: '1px solid #2b2b2b',
            borderRadius: '16px',
            padding: '24px',
            width: '360px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#fff' }}>Rate Media</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>
              How would you rate {ratingVideo.title}?
            </p>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '24px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => {
                    const internalRating = star * 2
                    if ((window as any)._onRateCalendarVideo) {
                      (window as any)._onRateCalendarVideo(ratingVideo, internalRating)
                    }
                    setRatingVideo(null)
                  }}
                  style={{
                    fontSize: '32px',
                    color: '#FBBF24',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'transform 100ms ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                  title={`${star} Star${star > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRatingVideo(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid #2b2b2b',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default AppointmentCalendar
