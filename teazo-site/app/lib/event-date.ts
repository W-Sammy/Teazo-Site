const eventDateOptions: Intl.DateTimeFormatOptions = {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const eventDateFormatter = new Intl.DateTimeFormat(
  "en-US",
  eventDateOptions,
);

const eventDateWithYearFormatter = new Intl.DateTimeFormat("en-US", {
  ...eventDateOptions,
  year: "numeric",
});

export function formatEventDate(
  value: string | null,
  includeYear = false,
): string {
  // Missing dates are intentional for events without a fixed schedule.
  if (value === null) return "";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "Date unavailable";

  return (
    includeYear
      ? eventDateWithYearFormatter
      : eventDateFormatter
  ).format(date);
}

// Build a readable schedule without displaying missing dates
// or unnecessary separators.
export function formatEventDuration(
  startAt: string | null,
  endAt: string | null,
  includeYear = false,
): string {
  if (startAt !== null && endAt !== null) {
    return `${formatEventDate(startAt, includeYear)} – ${formatEventDate(endAt, includeYear)}`;
  }

  if (startAt !== null) {
    return `Starts ${formatEventDate(startAt, includeYear)}`;
  }

  if (endAt !== null) {
    return `Ends ${formatEventDate(endAt, includeYear)}`;
  }

  return "";
}