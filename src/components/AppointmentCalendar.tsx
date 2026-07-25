"use client"

import React, { useMemo, useRef } from "react"
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

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar"
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
}

function buildAppointments(anchor: Date): CalendarEvent<ApptData>[] {
  const base = startOfDay(anchor)
  const at = (hour: number, minute = 0) =>
    addMinutes(setHours(base, hour), minute)

  const appt = (
    id: string,
    client: string,
    initials: string,
    avatar: string,
    service: Service,
    startHour: number,
    startMinute: number,
    minutes: number
  ): CalendarEvent<ApptData> => {
    const start = at(startHour, startMinute)
    return {
      id,
      title: client,
      start,
      end: addMinutes(start, minutes),
      color: SERVICE[service].color,
      data: { client, initials, avatar, service },
    }
  }

  return [
    appt(
      "a1",
      "Dana Whitfield",
      "DW",
      "https://randomuser.me/api/portraits/women/44.jpg",
      "consultation",
      9,
      0,
      45
    ),
    appt(
      "a2",
      "Marco Reyes",
      "MR",
      "https://randomuser.me/api/portraits/men/32.jpg",
      "followup",
      11,
      0,
      45
    ),
    appt(
      "a3",
      "Priya Nair",
      "PN",
      "https://randomuser.me/api/portraits/women/68.jpg",
      "assessment",
      14,
      0,
      60
    ),
    appt(
      "a4",
      "Leon Fischer",
      "LF",
      "https://randomuser.me/api/portraits/men/75.jpg",
      "therapy",
      16,
      0,
      45
    ),
  ]
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

export const AppointmentCalendar: React.FC = () => {
  const events = useMemo(() => buildAppointments(new Date()), [])
  const apiRef = useRef<EventCalendarApi | null>(null)
  const counter = useRef(0)

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
