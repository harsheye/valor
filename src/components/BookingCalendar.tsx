import React, { useMemo, useRef } from "react"
import { EventCalendar, type EventCalendarApi } from "./reui/event-calendar/event-calendar"
import { EventCalendarContent } from "./reui/event-calendar/event-calendar-content"
import { EventCalendarNav, EventCalendarToolbar } from "./reui/event-calendar/event-calendar-nav"
import type { CalendarEvent, EventCalendarResource } from "./reui/event-calendar/event-calendar-types"
import { addMinutes, setHours, startOfDay } from "./reui/event-calendar/date-utils"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { PlusIcon } from "lucide-react"

const ROOMS: EventCalendarResource[] = [
  { id: "r101", title: "101 · King", color: "var(--color-blue-500)" },
  { id: "r102", title: "102 · Queen", color: "var(--color-emerald-500)" },
  { id: "r204", title: "204 · Twin", color: "var(--color-violet-500)" },
  { id: "r301", title: "Suite 301", color: "var(--color-amber-500)" },
]

type BookingStatus = "occupied" | "checkout" | "housekeeping" | "checkin"

const STATUS: Record<BookingStatus, { label: string; color: string }> = {
  occupied: { label: "Occupied", color: "var(--color-emerald-500)" },
  checkout: { label: "Check-out", color: "var(--color-rose-500)" },
  housekeeping: { label: "Housekeeping", color: "var(--color-cyan-500)" },
  checkin: { label: "Check-in", color: "var(--color-blue-500)" },
}

interface BookingData {
  status: BookingStatus
}

function buildBookings(anchor: Date): CalendarEvent<BookingData>[] {
  const base = startOfDay(anchor)
  const at = (hour: number) => addMinutes(base, Math.round(hour * 60))

  const booking = (
    id: string,
    title: string,
    startHour: number,
    endHour: number,
    resourceId: string,
    status: BookingStatus
  ): CalendarEvent<BookingData> => ({
    id,
    title,
    start: at(startHour),
    end: at(endHour),
    resourceId,
    color: STATUS[status].color,
    data: { status },
  })

  return [
    booking("stay-reed", "Occupied · Reed", 8, 10, "r101", "occupied"),
    booking("checkout-reed", "Check-out · Reed", 10, 10.5, "r101", "checkout"),
    booking("clean-101", "Housekeeping", 10.5, 12, "r101", "housekeeping"),
    booking("checkin-alvarez", "Check-in · Alvarez", 14, 15, "r101", "checkin"),
    booking("stay-chen", "Occupied · Chen", 8, 16, "r102", "occupied"),
    booking("checkout-chen", "Check-out · Chen", 16, 16.5, "r102", "checkout"),
    booking("clean-102", "Housekeeping", 16.5, 18, "r102", "housekeeping"),
    booking("checkout-novak", "Check-out · Novak", 11, 11.5, "r204", "checkout"),
    booking("clean-204", "Deep clean", 11.5, 13, "r204", "housekeeping"),
    booking("checkin-ford", "Check-in · Ford", 15, 16, "r204", "checkin"),
    booking("stay-ford", "Occupied · Ford", 16, 20, "r204", "occupied"),
    booking("clean-301", "Housekeeping", 8, 9.5, "r301", "housekeeping"),
    booking("checkin-osei", "Check-in · Osei", 10, 11, "r301", "checkin"),
    booking("stay-osei", "Occupied · Osei", 11, 20, "r301", "occupied"),
  ]
}

export const BookingCalendar: React.FC = () => {
  const events = useMemo(() => buildBookings(new Date()), [])
  const apiRef = useRef<EventCalendarApi | null>(null)
  const bookingCount = useRef(0)

  const addBooking = () => {
    const api = apiRef.current
    if (!api) return
    const start = setHours(startOfDay(new Date()), 12)
    const end = addMinutes(start, 60)
    api.addEvent({
      id: `booking-${bookingCount.current++}`,
      title: "New booking",
      start,
      end,
      resourceId: "r101",
      color: STATUS.checkin.color,
      data: { status: "checkin" },
    })
    api.goTo(start)
  }

  return (
    <div className="w-full">
      <Card className="w-full py-0 border-0 bg-transparent shadow-none">
        <CardContent className="p-0">
          <EventCalendar
            defaultEvents={events}
            defaultView="resource"
            resources={ROOMS}
            dayStartHour={8}
            dayEndHour={20}
            interval={60}
            interactions={{ drag: true, resize: true, selectSlot: false }}
            apiRef={apiRef}
            className="h-[520px] w-full"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <EventCalendarNav
                className="min-w-0 flex-1 p-0"
                showViewSwitcher={false}
              />
              <EventCalendarToolbar>
                <Button size="sm" onClick={addBooking} className="h-8">
                  <PlusIcon className="size-4 mr-1" aria-hidden="true" />
                  New booking
                </Button>
              </EventCalendarToolbar>
            </div>
            <EventCalendarContent />
          </EventCalendar>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-muted/50 px-2 py-3 text-xs mt-4">
            {Object.values(STATUS).map((status) => (
              <span key={status.label} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                {status.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
export default BookingCalendar

