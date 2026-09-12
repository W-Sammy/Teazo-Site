export const AXIS_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p", "12a"];

export const SNAP_HOURS = 0.5; // drag snaps to the nearest 30 minutes
export const MIN_DURATION_HOURS = 0.5;

// converts a 24hr hour into a 12hr clock label, e.g. 14 -> "2:00pm"
export function formatHour(hour: number) {
  const totalMinutes = Math.round(hour * 60);
  const wholeHour = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = wholeHour >= 12 ? "pm" : "am";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")}${period}`;
}

// "HH:MM" value expected by <input type="time">
export function hourToTimeValue(hour: number) {
  const totalMinutes = Math.round(hour * 60);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function timeValueToHour(value: string) {
  const [hh, mm] = value.split(":").map(Number);
  return hh + mm / 60;
}

// the 7 dates (Sun-Sat) of the week containing referenceDate, matching the Sun-first order of DayHours[]
export function getWeekDates(referenceDate: Date) {
  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// "MM-DD" to match Holiday.date's format
export function toMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getCurrentWeekLabel(referenceDate: Date) {
  const week = getWeekDates(referenceDate);
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return `${fmt(week[0])} - ${fmt(week[6])}`;
}
