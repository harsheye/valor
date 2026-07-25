import React from "react"
import { useEventCalendar } from "./event-calendar"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"
import { Button } from "../../ui/button"
import { format, addDays, subDays } from "./date-utils"

interface EventCalendarNavProps {
  className?: string
  showViewSwitcher?: boolean
}

export const EventCalendarNav: React.FC<EventCalendarNavProps> = ({
  className,
  showViewSwitcher = true
}) => {
  const { view, setView, currentDate, setCurrentDate } = useEventCalendar()

  const handlePrev = () => {
    if (view === "day" || view === "resource") {
      setCurrentDate(subDays(currentDate, 1))
    } else if (view === "week") {
      setCurrentDate(subDays(currentDate, 7))
    } else {
      // Month
      const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
      setCurrentDate(prevMonth)
    }
  }

  const handleNext = () => {
    if (view === "day" || view === "resource") {
      setCurrentDate(addDays(currentDate, 1))
    } else if (view === "week") {
      setCurrentDate(addDays(currentDate, 7))
    } else {
      // Month
      const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
      setCurrentDate(nextMonth)
    }
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  const formatHeaderDate = () => {
    if (view === "day" || view === "resource") {
      return format(currentDate, "MMMM d, yyyy")
    } else if (view === "week") {
      const startOfWeek = subDays(currentDate, currentDate.getDay())
      const endOfWeek = addDays(startOfWeek, 6)
      return `${format(startOfWeek, "MMM d")} - ${format(endOfWeek, "MMM d, yyyy")}`
    } else {
      return format(currentDate, "MMMM yyyy")
    }
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 p-2 ${className || ""}`}>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleToday} className="h-8">
          Today
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={handlePrev} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleNext} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-semibold ml-2 select-none text-foreground">
          {formatHeaderDate()}
        </span>
      </div>

      {showViewSwitcher && (
        <div className="flex items-center gap-1 bg-muted p-1 rounded-md">
          {["day", "week", "month", "resource"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-medium rounded-sm capitalize transition-all ${
                view === v
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const EventCalendarToolbar: React.FC<{ className?: string; children?: React.ReactNode }> = ({
  className,
  children
}) => {
  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      {children}
    </div>
  )
}

