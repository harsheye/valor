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
  EventCalendarSlotDraft,
} from "./reui/event-calendar/event-calendar-types"
import { addMinutes, setHours, startOfDay, format, subDays, addDays } from "./reui/event-calendar/date-utils"
import type { VideoItem } from "../types/media"

import { Card, CardContent } from "./ui/card"
import { ListIcon, PlusIcon } from 'lucide-react'

const SERVICE = {
  consultation: { label: "Consultation", color: "#8B5CF6" },
  followup: { label: "Follow-up", color: "#0EA5E9" },
  assessment: { label: "Assessment", color: "#F59E0B" },
  therapy: { label: "Therapy", color: "#F43F5E" },
} as const

type Service = keyof typeof SERVICE

const NEW_COLOR = "#10B981"

interface ApptData {
  client: string
  initials: string
  avatar?: string
  service?: Service
  video?: VideoItem
}

function buildAppointmentsFromHistory(videos: VideoItem[]): CalendarEvent<ApptData>[] {
  const events: CalendarEvent<ApptData>[] = []

  videos.forEach((video, index) => {
    const playDate = (video as any).lastPlayedDate ? new Date((video as any).lastPlayedDate) : null
    if (!playDate) return

    // Ensure it shows in daylight business hours (9 AM - 6 PM) for presentation
    let start = new Date(playDate)
    if (start.getHours() < 9 || start.getHours() >= 18) {
      const indexOffset = index % 5
      start.setHours(9 + indexOffset * 1.5, 0, 0, 0)
    }

    // Set end time based on duration (minimum 30 minutes, default 45 mins)
    const durSeconds = typeof video.duration === 'string' ? parseFloat(video.duration) : (video.duration || 45 * 60)
    const durMinutes = Math.min(Math.max(Math.round(durSeconds / 60), 30), 120)
    const end = new Date(start.getTime() + durMinutes * 60000)

    // Select category service cyclically
    const services: Service[] = ["consultation", "followup", "assessment", "therapy"]
    const service = services[index % services.length]

    const client = video.title
    const initials = video.title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || "V"
    const avatar = video.posterPath || ""

    events.push({
      id: video.id || `hist-${index}`,
      title: client,
      start,
      end,
      color: SERVICE[service].color,
      data: { client, initials, avatar, service, video },
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
  const service = data.service ? SERVICE[data.service] : null
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
      {service && minutes >= 45 && (
        <span className="premium-event-service" style={{ color: accentColor }}>
          {service.label}
        </span>
      )}
    </span>
  )
}

interface CustomHeaderProps {
  onNewAppointment: () => void
}

const CustomHeader: React.FC<CustomHeaderProps> = ({ onNewAppointment }) => {
  const { view, setView, currentDate, setCurrentDate } = useEventCalendar()

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
        
        <div style={{ position: 'relative' }}>
          <select 
            value={view} 
            onChange={(e) => setView(e.target.value)}
            className="calendar-btn-nav"
            style={{ appearance: 'none', paddingRight: '28px', position: 'relative' }}
          >
            <option value="day" style={{ background: '#1b1b1b' }}>Day</option>
            <option value="resource" style={{ background: '#1b1b1b' }}>Resource</option>
            <option value="agenda" style={{ background: '#1b1b1b' }}>Agenda</option>
          </select>
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-55%)', pointerEvents: 'none', fontSize: '9px', opacity: 0.6 }}>▼</span>
        </div>

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button 
          onClick={() => setView("agenda")}
          className="premium-btn-agenda"
        >
          <ListIcon className="size-4" />
          <span>Agenda</span>
        </button>
        <button 
          onClick={onNewAppointment}
          className="premium-btn-new-appt"
        >
          <PlusIcon className="size-4" />
          <span>New appointment</span>
        </button>
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
  const counter = useRef(0)

  // Expose play hook to window context for absolute child trigger
  useEffect(() => {
    if (onPlayVideo) {
      ;(window as any)._onPlayCalendarVideo = onPlayVideo
    }
    return () => {
      delete (window as any)._onPlayCalendarVideo
    }
  }, [onPlayVideo])

  const bookSlot = (slot: EventCalendarSlotDraft) => {
    const api = apiRef.current
    if (!api) return
    api.addEvent({
      id: `appt-${counter.current++}`,
      title: "New appointment",
      start: slot.start,
      end: slot.end,
      color: NEW_COLOR,
      data: { client: "New appointment", initials: "+" },
    })
  }

  const canBook = (slot: EventCalendarSlotDraft) => {
    const api = apiRef.current
    if (!api) return true
    return (
      api.findOverlapping({ start: slot.start, end: slot.end }).length === 0
    )
  }

  const addAppointment = () => {
    const api = apiRef.current
    if (!api) return
    const base = startOfDay(new Date())
    for (let minutes = 9 * 60; minutes + 45 <= 18 * 60; minutes += 30) {
      const start = addMinutes(base, minutes)
      const end = addMinutes(start, 45)
      if (api.findOverlapping({ start, end }).length === 0) {
        api.addEvent({
          id: `appt-${counter.current++}`,
          title: "New appointment",
          start,
          end,
          color: NEW_COLOR,
          data: { client: "New appointment", initials: "+" },
        })
        api.goTo(start)
        return
      }
    }
  }

  return (
    <div className="w-full">
      <Card className="w-full py-0 border-0 bg-transparent shadow-none">
        <CardContent className="p-0">
          <EventCalendar
            defaultEvents={events}
            defaultView="day"
            dayStartHour={9}
            dayEndHour={18}
            interval={30}
            snapDuration={15}
            apiRef={apiRef}
            renderEvent={renderChip}
            onSelectSlot={bookSlot}
            canSelectSlot={canBook}
            interactions={{ drag: true, resize: true, selectSlot: true }}
            className="w-full h-auto"
          >
            <CustomHeader onNewAppointment={addAppointment} />
            <EventCalendarContent />
          </EventCalendar>
          <div className="calendar-footer">
            Drag across an open time to book an appointment. Slots that overlap an existing booking are blocked.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AppointmentCalendar
