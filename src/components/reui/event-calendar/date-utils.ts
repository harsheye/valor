const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const startOfDay = (date: Date | string | number): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const setHours = (date: Date | string | number, hours: number): Date => {
  const d = new Date(date);
  d.setHours(hours, 0, 0, 0);
  return d;
};

export const addMinutes = (date: Date | string | number, minutes: number): Date => {
  return new Date(new Date(date).getTime() + minutes * 60000);
};

export const subDays = (date: Date | string | number, days: number): Date => {
  return new Date(new Date(date).getTime() - days * 24 * 60 * 60 * 1000);
};

export const addDays = (date: Date | string | number, days: number): Date => {
  return new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);
};

export const differenceInMinutes = (dateLeft: Date | string | number, dateRight: Date | string | number): number => {
  return Math.round((new Date(dateLeft).getTime() - new Date(dateRight).getTime()) / 60000);
};

export const getHours = (date: Date | string | number): number => {
  return new Date(date).getHours();
};

export const getMinutes = (date: Date | string | number): number => {
  return new Date(date).getMinutes();
};

export const format = (date: Date | string | number, formatStr: string): string => {
  const d = new Date(date);
  const hour = d.getHours();
  const minute = d.getMinutes();
  const day = d.getDay();
  const dateNum = d.getDate();
  const month = d.getMonth();
  const year = d.getFullYear();

  const isPm = hour >= 12;
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute < 10 ? `0${minute}` : minute;
  const ampm = isPm ? "PM" : "AM";

  if (formatStr === "h:mm a") {
    return `${displayHour}:${displayMinute} ${ampm}`;
  }
  if (formatStr === "EEEE, MMMM d, yyyy") {
    return `${DAYS[day]}, ${MONTHS[month]} ${dateNum}, ${year}`;
  }
  if (formatStr === "EEEE, MMMM d") {
    return `${DAYS[day]}, ${MONTHS[month]} ${dateNum}`;
  }
  if (formatStr === "MMM d") {
    return `${MONTHS_SHORT[month]} ${dateNum}`;
  }
  if (formatStr === "MMM d, yyyy") {
    return `${MONTHS_SHORT[month]} ${dateNum}, ${year}`;
  }
  if (formatStr === "MMMM yyyy") {
    return `${MONTHS[month]} ${year}`;
  }

  return d.toLocaleDateString();
};
