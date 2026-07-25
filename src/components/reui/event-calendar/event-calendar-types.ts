export interface CalendarEvent<T = any> {
  id: string
  title: string
  start: Date
  end: Date
  resourceId?: string
  color?: string
  data?: T
}

export interface EventCalendarResource {
  id: string
  title: string
  color?: string
}

export interface EventCalendarSlotDraft {
  start: Date
  end: Date
  resourceId?: string
}

export interface EventCalendarApi {
  addEvent: (event: CalendarEvent) => void
  goTo: (date: Date) => void
  setView: (view: string) => void
  findOverlapping: (slot: { start: Date; end: Date; resourceId?: string }) => CalendarEvent[]
}

