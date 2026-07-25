"use client"

import React, { useMemo, useEffect } from "react"
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

export const AppointmentCalendar: React.FC<AppointmentCalendarProps> = ({ videos = [], onPlayVideo }) => {
  const sortedVideos = useMemo(() => {
    return videos
      .filter(v => (v as any).lastPlayedDate)
      .map(v => ({
        ...v,
        playDate: new Date((v as any).lastPlayedDate)
      }))
      .sort((a, b) => b.playDate.getTime() - a.playDate.getTime()) // Descending (most recent first)
  }, [videos])

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
    const score = prompt("Rate this media (1-10):", video.rating?.toString() || "")
    if (score !== null) {
      const val = parseFloat(score)
      if (!isNaN(val) && val >= 1 && val <= 10) {
        if ((window as any)._onRateCalendarVideo) {
          (window as any)._onRateCalendarVideo(video, val)
        }
      }
    }
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

  // Color mapping cyclically based on index
  const themeColors = ["#F59E0B", "#F43F5E", "#8B5CF6", "#0EA5E9"]

  return (
    <div className="activity-timeline-container">
      
      {/* Timeline Header */}
      <div className="activity-timeline-header">
        <div>
          <h2 className="activity-timeline-title">Activity Timeline</h2>
          <p className="activity-timeline-subtitle">Your recent streaming sessions</p>
        </div>
        
        <div className="activity-timeline-controls">
          <button className="activity-timeline-btn">
            <span style={{ fontSize: '14px' }}>⚙</span>
            <span>Filter</span>
          </button>
          <button className="activity-timeline-btn">
            <span style={{ fontSize: '14px' }}>📅</span>
            <span>Today</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
          </button>
        </div>
      </div>

      {/* Timeline List */}
      <div className="activity-timeline-list">
        {/* Vertical Axis Line */}
        <div className="activity-timeline-line"></div>

        {sortedVideos.length === 0 ? (
          <div className="text-center py-12 text-white/40 text-sm">No recent streaming sessions recorded.</div>
        ) : (
          sortedVideos.map((video, index) => {
            const timeStr = format(video.playDate, "h:mm a")
            const color = themeColors[index % themeColors.length]
            
            const durSec = typeof video.duration === 'string' ? parseFloat(video.duration) : (video.duration || 0)
            const current = video.currentTime || 0
            const progressPct = durSec > 0 ? Math.min(Math.round((current / durSec) * 100), 100) : 0
            
            let statusText = "Paused"
            let statusIcon = "⏸"
            if (progressPct >= 95) {
              statusText = "Completed"
              statusIcon = "✔"
            } else if (progressPct > 10) {
              statusText = "Watching"
              statusIcon = "▶"
            }

            const watchedMin = Math.round((video.totalTimeWatched || 0) / 60)
            const initials = video.title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || "V"
            const lastPlayedText = formatLastWatched(video.playDate.toISOString())

            // Parse source/resolution from title
            const resMatch = video.title.match(/(1080p|720p|2160p|4k|480p)/i)
            const resolution = resMatch ? resMatch[0].toUpperCase() : "1080P"
            
            const sourceMatch = video.title.match(/(web-dl|webrip|bluray|hdtv|bdrip)/i)
            const source = sourceMatch ? sourceMatch[0].toUpperCase() : "WEB-DL"

            return (
              <div key={video.id || index} className="activity-timeline-item">
                {/* Time Indicator on Left */}
                <div className="activity-timeline-time">{timeStr}</div>
                
                {/* Bullet Dot on Line */}
                <div className="activity-timeline-dot" style={{ backgroundColor: color }}></div>
                
                {/* Session Card */}
                <div className="activity-timeline-card" style={{ '--card-hover-border': `${color}60` } as any}>
                  {/* Left Avatar */}
                  <div className="activity-timeline-avatar" style={{ backgroundColor: color }}>
                    {initials}
                  </div>

                  {/* Body Content */}
                  <div className="activity-timeline-body">
                    <h3 className="activity-timeline-card-title" title={video.title}>{video.title}</h3>
                    <div className="activity-timeline-source-badge" style={{ color: color, borderColor: `${color}30` }}>
                      {source}
                    </div>
                    
                    {/* Meta Indicators */}
                    <div className="activity-timeline-meta-row">
                      <span style={{ color: color }}>{statusIcon} {statusText}</span>
                      <span className="activity-timeline-meta-separator">•</span>
                      <span>★ {video.rating ? `${video.rating} / 10` : "Unrated"}</span>
                      <span className="activity-timeline-meta-separator">•</span>
                      <span>⏱ {watchedMin}m watched</span>
                      <span className="activity-timeline-meta-separator">•</span>
                      <span>Progress: {progressPct}%</span>
                      <span className="activity-timeline-meta-separator">•</span>
                      <span>Last watched: {lastPlayedText}</span>
                    </div>
                  </div>

                  {/* Right Actions & Progress Slider */}
                  <div className="activity-timeline-actions-wrapper">
                    {/* Progress Slider */}
                    <div className="activity-timeline-progress-container">
                      <div className="activity-timeline-progress-track">
                        <div 
                          className="activity-timeline-progress-fill" 
                          style={{ width: `${progressPct}%`, backgroundColor: color }}
                        ></div>
                      </div>
                      <span className="activity-timeline-progress-text">{progressPct}%</span>
                    </div>

                    {/* Action buttons */}
                    <div className="activity-timeline-action-btns">
                      <button className="activity-timeline-action-btn" onClick={() => handlePlay(video)} title="Resume Playback">
                        ▶
                      </button>
                      <button className="activity-timeline-action-btn" onClick={() => handleDetails(video)} title="View Details">
                        ℹ
                      </button>
                      <button className="activity-timeline-action-btn" onClick={() => handleRate(video)} title="Rate Media">
                        ★
                      </button>
                      <button className="activity-timeline-action-btn" onClick={() => handleDelete(video)} style={{ color: '#ef4444' }} title="Delete History">
                        🗑
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Bottom Load More */}
      {sortedVideos.length > 4 && (
        <div className="activity-timeline-load-more">
          <button className="activity-timeline-btn">
            <span>Load older activity</span>
            <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
          </button>
        </div>
      )}

    </div>
  )
}

export default AppointmentCalendar
