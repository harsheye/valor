"use client"

import React, { useMemo, useRef, useEffect } from "react"
import {
  EventCalendar,
  type EventCalendarApi,
  type EventCalendarRenderEventProps,
  useEventCalendar,
} from "./reui/event-calendar/event-calendar"
import { EventCalendarContent } from "./reui/event-calendar/event-calendar-content"
import type {
  CalendarEvent,
} from "./reui/event-calendar/event-calendar-types"
import { startOfDay, format, subDays, addDays } from "./reui/event-calendar/date-utils"
import type { VideoItem } from "../types/media"

import { Card, CardContent } from "./ui/card"

const SERVICE = {
  consultation: { label: "Consultation", color: "#8B5CF6" },
  followup: { label: "Follow-up", color: "#0EA5E9" },
  assessment: { label: "Assessment", color: "#F59E0B" },
  therapy: { label: "Therapy", color: "#F43F5E" },
} as const

type Service = keyof typeof SERVICE

interface ApptData {
  client: string
  initials: string
  avatar?: string
  service?: Service
  video?: VideoItem
  watchedText?: string
}

function formatWatchTime(seconds: number): string {
  if (!seconds || seconds <= 0) return "Started watching"
  const mins = Math.floor(seconds / 60)
  if (mins === 0) return `${Math.round(seconds)}s watched`
  return `${mins}m watched`
}

function buildAppointmentsFromHistory(videos: VideoItem[]): CalendarEvent<ApptData>[] {
  const events: CalendarEvent<ApptData>[] = []

  // Filter and sort chronologically (oldest watch event first)
  const validVideos = videos
    .filter(v => (v as any).lastPlayedDate)
    .map(v => ({
      ...v,
      playDate: new Date((v as any).lastPlayedDate)
    }))
    .sort((a, b) => a.playDate.getTime() - b.playDate.getTime())

  let lastEnd: Date | null = null

  validVideos.forEach((video, index) => {
    let start = new Date(video.playDate)
    
    // Push start forward if it overlaps with the previous end time (prevent stack/overlap)
    if (lastEnd && start.getTime() < lastEnd.getTime()) {
      start = new Date(lastEnd.getTime())
    }

    const watchedSec = video.totalTimeWatched || 0
    const watchMin = Math.round(watchedSec / 60)
    const durMinutes = Math.max(watchMin, 15) // Enforce minimum 15 minutes for visibility
    const end = new Date(start.getTime() + durMinutes * 60000)

    lastEnd = end

    const services: Service[] = ["consultation", "followup", "assessment", "therapy"]
    const service = services[index % services.length]

    const client = video.title
    const initials = video.title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || "V"
    const avatar = video.posterPath || ""
    const watchedText = formatWatchTime(watchedSec)

    events.push({
      id: video.id || `hist-${index}`,
      title: client,
      start,
      end,
      color: SERVICE[service].color,
      data: { client, initials, avatar, service, video, watchedText },
    })
  })

  return events
}

function renderChip({
  occurrence,
  segment,
}: EventCalendarRenderEventProps<ApptData>) {
  const data = occurrence.event.data
  if (!data) return undefined
  const minutes = (segment.endMin ?? 0) - (segment.startMin ?? 0)
  const accentColor = occurrence.event.color || "#8B5CF6"

  return (
    <span className="flex h-full w-full min-w-0 flex-col justify-start gap-1 select-none text-left">
      <span className="premium-event-row1">
        {data.avatar ? (
          <img src={data.avatar} alt={data.client} className="premium-event-avatar" />
        ) : (
          <div className="premium-event-avatar-fallback" style={{ backgroundColor: accentColor }}>
            {data.initials}
          </div>
        )}
        <span className="premium-event-client-name">{data.client}</span>
      </span>
      {data.watchedText && minutes >= 20 && (
        <span className="premium-event-service" style={{ color: accentColor }}>
          {data.watchedText}
        </span>
      )}
    </span>
  )
}

const CustomHeader: React.FC = () => {
  const { currentDate, setCurrentDate } = useEventCalendar()

  const handlePrev = () => {
    setCurrentDate(subDays(currentDate, 1))
  }

  const handleNext = () => {
    setCurrentDate(addDays(currentDate, 1))
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  return (
    <div className="calendar-header select-none">
      <div className="calendar-header-left">
        <button onClick={handleToday} className="calendar-btn-nav">
          Today
        </button>

        <button onClick={handlePrev} className="calendar-btn-nav calendar-btn-nav-arrow" title="Previous Day">
          ◀
        </button>
        <button onClick={handleNext} className="calendar-btn-nav calendar-btn-nav-arrow" title="Next Day">
          ▶
        </button>

        <span className="calendar-header-date">
          {format(currentDate, "EEEE, MMMM d, yyyy")}
        </span>
      </div>
    </div>
  )
}

interface AppointmentCalendarProps {
  videos?: VideoItem[]
  onPlayVideo?: (video: VideoItem) => void
}

export const AppointmentCalendar: React.FC<AppointmentCalendarProps> = ({ videos = [], onPlayVideo }) => {
  const events = useMemo(() => buildAppointmentsFromHistory(videos), [videos])
  const apiRef = useRef<EventCalendarApi | null>(null)

  // Expose play hook to window context for absolute child trigger
  useEffect(() => {
    if (onPlayVideo) {
      ;(window as any)._onPlayCalendarVideo = onPlayVideo
    }
    return () => {
      delete (window as any)._onPlayCalendarVideo
    }
  }, [onPlayVideo])

  return (
    <div className="w-full">
      <Card className="w-full py-0 border-0 bg-transparent shadow-none">
        <CardContent className="p-0">
          <EventCalendar
            defaultEvents={events}
            defaultView="day"
            dayStartHour={0}
            dayEndHour={24}
            interval={30}
            snapDuration={15}
            apiRef={apiRef}
            renderEvent={renderChip}
            interactions={{ drag: false, resize: false, selectSlot: false }}
            className="w-full h-auto"
          >
            <CustomHeader />
            <EventCalendarContent />
          </EventCalendar>
          <div className="calendar-footer">
            Media playback timeline displays the exact watch duration of played items. Click any event to resume playback.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AppointmentCalendar
