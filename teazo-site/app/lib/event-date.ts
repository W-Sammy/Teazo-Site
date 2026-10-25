const eventDateOptions: Intl.DateTimeFormatOptions = {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const eventDateFormatter = new Intl.DateTimeFormat("en-US", eventDateOptions);

const eventDateWithYearFormatter = new Intl.DateTimeFormat("en-US", {
  ...eventDateOptions,
  year: "numeric",
});

export function formatEventDate(value: string, includeYear = false): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return (includeYear ? eventDateWithYearFormatter : eventDateFormatter).format(date);
}
