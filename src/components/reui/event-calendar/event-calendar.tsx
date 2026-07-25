import React, { createContext, useContext, useState, useEffect, useImperativeHandle } from "react"
import type { CalendarEvent, EventCalendarResource, EventCalendarSlotDraft, EventCalendarApi } from "./event-calendar-types"

export interface EventCalendarContextProps {
  events: CalendarEvent[]
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>
  view: string
  setView: (view: string) => void
  currentDate: Date
  setCurrentDate: (date: Date) => void
  resources?: EventCalendarResource[]
  dayStartHour: number
  dayEndHour: number
  interval: number
  snapDuration: number
  renderEvent?: (props: any) => React.ReactNode
  onSelectSlot?: (slot: EventCalendarSlotDraft) => void
  canSelectSlot?: (slot: EventCalendarSlotDraft) => boolean
  interactions?: { drag?: boolean; resize?: boolean; selectSlot?: boolean }
}

export const EventCalendarContext = createContext<EventCalendarContextProps | undefined>(undefined)

export interface EventCalendarProps {
  defaultEvents?: CalendarEvent[]
  defaultView?: string
  resources?: EventCalendarResource[]
  dayStartHour?: number
  dayEndHour?: number
  interval?: number
  snapDuration?: number
  apiRef?: React.MutableRefObject<EventCalendarApi | null>
  renderEvent?: (props: any) => React.ReactNode
  onSelectSlot?: (slot: EventCalendarSlotDraft) => void
  canSelectSlot?: (slot: EventCalendarSlotDraft) => boolean
  interactions?: { drag?: boolean; resize?: boolean; selectSlot?: boolean }
  className?: string
  children?: React.ReactNode
}

export interface EventCalendarRenderEventProps<T = any> {
  occurrence: { event: CalendarEvent<T> }
  segment: { startMin: number; endMin: number }
}

export const EventCalendar: React.FC<EventCalendarProps> = ({
  defaultEvents = [],
  defaultView = "day",
  resources,
  dayStartHour = 8,
  dayEndHour = 20,
  interval = 60,
  snapDuration = 15,
  apiRef,
  renderEvent,
  onSelectSlot,
  canSelectSlot,
  interactions,
  className,
  children
}) => {
  const [events, setEvents] = useState<CalendarEvent[]>(defaultEvents)
  const [view, setView] = useState(defaultView)
  const [currentDate, setCurrentDate] = useState(new Date())

  // Implement the API reference object methods
  const api: EventCalendarApi = {
    addEvent: (event) => {
      setEvents(prev => [...prev, event])
    },
    goTo: (date) => {
      setCurrentDate(date)
    },
    setView: (v) => {
      setView(v)
    },
    findOverlapping: ({ start, end, resourceId }) => {
      return events.filter(e => {
        // If resource is provided, filter by resource id too
        if (resourceId && e.resourceId !== resourceId) return false
        
        const sTime = new Date(start).getTime()
        const eTime = new Date(end).getTime()
        const eventStart = new Date(e.start).getTime()
        const eventEnd = new Date(e.end).getTime()
        
        return sTime < eventEnd && eTime > eventStart
      })
    }
  }

  // Bind the API ref
  if (apiRef) {
    apiRef.current = api
  }

  return (
    <EventCalendarContext.Provider
      value={{
        events,
        setEvents,
        view,
        setView,
        currentDate,
        setCurrentDate,
        resources,
        dayStartHour,
        dayEndHour,
        interval,
        snapDuration,
        renderEvent,
        onSelectSlot,
        canSelectSlot,
        interactions
      }}
    >
      <div className={`flex flex-col gap-4 w-full h-full ${className || ""}`}>
        {children}
      </div>
    </EventCalendarContext.Provider>
  )
}

export const useEventCalendar = () => {
  const context = useContext(EventCalendarContext)
  if (!context) {
    throw new Error("useEventCalendar must be used within an EventCalendarProvider")
  }
  return context
}
export type { EventCalendarApi }

