const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

export function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

export function withinMaxLength(value: string, max: number) {
  return value.length <= max;
}

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export function isValidPhone(value: string) {
  const trimmed = value.trim();
  return PHONE_RE.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7;
}

export function isValidUrlOrEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("mailto:")) return EMAIL_RE.test(trimmed.slice(7));
  return EMAIL_RE.test(trimmed) || URL_RE.test(trimmed);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isValidImageFile(file: File, maxBytes = MAX_IMAGE_BYTES): { valid: boolean; error?: string } {
  if (!file.type.startsWith("image/")) {
    return { valid: false, error: "File must be an image" };
  }
  if (file.size > maxBytes) {
    return { valid: false, error: `Image must be smaller than ${Math.round(maxBytes / (1024 * 1024))}MB` };
  }
  return { valid: true };
}

// month is 1-12, no year attached (holidays repeat annually) so Feb allows day 29
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(month: number | null) {
  if (!month || month < 1 || month > 12) return 31;
  return DAYS_IN_MONTH[month - 1];
}

export function isValidHolidayDay(month: number | null, day: number | null) {
  if (!month || !day) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(month);
}
