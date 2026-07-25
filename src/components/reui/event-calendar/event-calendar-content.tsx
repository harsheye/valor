import React from "react"
import { useEventCalendar } from "./event-calendar"
import { format, differenceInMinutes, startOfDay, addDays, getMinutes, getHours } from "./date-utils"

export const EventCalendarContent: React.FC = () => {
  const {
    events,
    view,
    currentDate,
    resources = [],
    dayStartHour,
    dayEndHour,
    interval,
    renderEvent
  } = useEventCalendar()

  // Generate 30-minute slot list and labels for business hours
  const slotsList: { hour: number; minute: number }[] = []
  const timeLabelsList: string[] = []
  for (let h = dayStartHour; h < dayEndHour; h++) {
    // Top-of-the-hour slot
    slotsList.push({ hour: h, minute: 0 })
    timeLabelsList.push(format(new Date(2026, 0, 1, h, 0), "h:mm a"))
    
    // Half-hour slot
    slotsList.push({ hour: h, minute: 30 })
    timeLabelsList.push(format(new Date(2026, 0, 1, h, 30), "h:mm a"))
  }

  // Calculate pixel top & height based on percentages matching minutes in the day
  const getEventPositionStyles = (start: Date, end: Date) => {
    const totalMinutes = (dayEndHour - dayStartHour) * 60
    const startMin = (getHours(start) - dayStartHour) * 60 + getMinutes(start)
    const duration = differenceInMinutes(end, start)
    
    const topPct = (startMin / totalMinutes) * 100
    const heightPct = (duration / totalMinutes) * 100

    return {
      top: `${Math.max(0, topPct)}%`,
      height: `${Math.min(100 - topPct, heightPct)}%`
    }
  }

  // Maps event color to specific soft background tint and accent border-left
  const getEventCardStyles = (event: any) => {
    const color = event.color || ""
    let bg = "rgba(139,92,246,.25)"
    let borderLeft = "3px solid #8B5CF6"
    
    if (color.includes("violet") || color.includes("8B5CF6") || event.id === "a1") {
      bg = "rgba(139, 92, 246, 0.25)"
      borderLeft = "3px solid #8b5cf6"
    } else if (color.includes("sky") || color.includes("0EA5E9") || event.id === "a2") {
      bg = "rgba(14, 165, 233, 0.22)"
      borderLeft = "3px solid #0ea5e9"
    } else if (color.includes("amber") || color.includes("F59E0B") || event.id === "a3") {
      bg = "rgba(245, 158, 11, 0.25)"
      borderLeft = "3px solid #f59e0b"
    } else if (color.includes("rose") || color.includes("F43F5E") || event.id === "a4") {
      bg = "rgba(244, 63, 94, 0.22)"
      borderLeft = "3px solid #f43f5e"
    } else if (color.includes("emerald")) {
      bg = "rgba(16, 185, 129, 0.25)"
      borderLeft = "3px solid #10b981"
    }
    
    return {
      backgroundColor: bg,
      borderLeft: borderLeft
    }
  }

  // Renders individual event chip
  const renderEventChip = (event: any) => {
    const pos = getEventPositionStyles(event.start, event.end)
    const occurrence = { event }
    const segment = {
      startMin: (getHours(event.start) - dayStartHour) * 60 + getMinutes(event.start),
      endMin: (getHours(event.end) - dayStartHour) * 60 + getMinutes(event.end)
    }

    const defaultContent = (
      <div className="flex flex-col h-full justify-start p-1 overflow-hidden select-none">
        <span className="font-semibold text-xs truncate text-white leading-tight">{event.title}</span>
        <span className="text-[10px] text-white/80 opacity-90 truncate">
          {format(event.start, "h:mm a")} - {format(event.end, "h:mm a")}
        </span>
      </div>
    )

    const content = renderEvent ? renderEvent({ occurrence, segment }) : defaultContent
    const cardStyles = getEventCardStyles(event)

    return (
      <div
        key={event.id}
        className="premium-event-card"
        style={{
          ...pos,
          ...cardStyles,
          zIndex: 10
        }}
      >
        {content || defaultContent}
      </div>
    )
  }

  // View: Day / Single Column View
  if (view === "day") {
    // Filter events for this day
    const dayEvents = events.filter(e => {
      const d1 = startOfDay(new Date(e.start))
      const d2 = startOfDay(new Date(currentDate))
      return d1.getTime() === d2.getTime()
    })

    return (
      <div className="calendar-premium-dark h-[520px]">
        {/* All Day Row */}
        <div className="calendar-all-day-row">
          <div className="calendar-all-day-label">All day</div>
          <div className="calendar-all-day-content"></div>
        </div>

        {/* Time Grid Scroll Container */}
        <div className="calendar-grid-wrapper">
          <div className="calendar-grid-inner" style={{ height: `${slotsList.length * 32}px` }}>
            
            {/* Hours Labels Column */}
            <div className="calendar-time-gutter select-none">
              {timeLabelsList.map((label, idx) => (
                <div key={idx} className="calendar-time-slot-label">
                  {label}
                </div>
              ))}
            </div>

            {/* Time Grid slots rows */}
            <div className="calendar-grid-slots">
              {slotsList.map((_, idx) => (
                <div key={idx} className="calendar-grid-row-slot"></div>
              ))}
              {/* Absolute events container */}
              {dayEvents.map(e => renderEventChip(e))}
            </div>

          </div>
        </div>
      </div>
    )
  }

  // View: Resource (Columns per Room) View
  if (view === "resource") {
    return (
      <div className="calendar-premium-dark h-[520px]">
        {/* Resource Header */}
        <div className="calendar-all-day-row">
          <div className="calendar-all-day-label">Rooms</div>
          <div className="flex-1 flex" style={{ height: '100%' }}>
            {resources.map(r => (
              <div key={r.id} className="flex-1 flex items-center justify-center border-l border-[#2b2b2b] text-xs font-semibold text-muted-foreground truncate px-2">
                {r.title}
              </div>
            ))}
          </div>
        </div>

        {/* Grid Scroll Container */}
        <div className="calendar-grid-wrapper">
          <div className="calendar-grid-inner" style={{ height: `${slotsList.length * 32}px` }}>
            {/* Time Column */}
            <div className="calendar-time-gutter">
              {timeLabelsList.map((label, idx) => (
                <div key={idx} className="calendar-time-slot-label">
                  {label}
                </div>
              ))}
            </div>

            {/* Resource Columns */}
            {resources.map(r => {
              const resEvents = events.filter(e => {
                const d1 = startOfDay(new Date(e.start))
                const d2 = startOfDay(new Date(currentDate))
                return d1.getTime() === d2.getTime() && e.resourceId === r.id
              })

              return (
                <div key={r.id} className="flex-1 relative border-r border-[#2b2b2b] last:border-r-0">
                  {slotsList.map((_, idx) => (
                    <div key={idx} className="calendar-grid-row-slot"></div>
                  ))}
                  {resEvents.map(e => renderEventChip(e))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // View: Agenda list view
  const sortedEvents = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  return (
    <div className="calendar-agenda-view">
      <h3 className="calendar-agenda-title">Agenda Schedule</h3>
      <div className="flex flex-col gap-3">
        {sortedEvents.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">No upcoming events scheduled.</div>
        ) : (
          sortedEvents.map(e => (
            <div key={e.id} className="flex items-center gap-4 p-3 rounded-lg border border-[#2b2b2b] bg-[#1b1b1b] hover:bg-[#262626] transition-colors">
              <div className="w-2.5 h-10 rounded-full" style={{ backgroundColor: e.color || "var(--accent-color)" }} />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-foreground truncate text-white">{e.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {format(e.start, "MMM d, yyyy")} · {format(e.start, "h:mm a")} - {format(e.end, "h:mm a")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
