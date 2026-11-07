import type {
  AddressInfo,
  Holiday,
  SocialLink,
  DeliveryLink,
  WebsiteContent,
} from "@/app/types/website-content";

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const URL_RE =
  /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;
const DOMAIN_RE =
  /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/;
const DOMAIN_LABEL_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const PHONE_CHAR_RE = /^[+]?[\d\s().-]{10,25}$/;

export function isNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function withinMaxLength(value: unknown, max: number): boolean {
  if (typeof value !== "string") return true;
  return value.length <= max;
}

export function isValidEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

export function isValidPhone(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!PHONE_CHAR_RE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  // Must have between 10 (US area code + 7 digits) and 15 (E.164 standard) digits
  if (digits.length < 10 || digits.length > 15) return false;
  // If 11 digits and doesn't start with +, must start with 1 (US country code)
  if (digits.length === 11 && !trimmed.startsWith("+") && !digits.startsWith("1")) {
    return false;
  }
  return true;
}

export function formatPhoneNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return trimmed;
}

export type DestinationKind = "url" | "email";

export type DestinationParseResult =
  | { ok: true; destination: string; kind: DestinationKind }
  | { ok: false; error: string };

function isValidDestinationHostname(hostname: string): boolean {
  // A final root dot is valid in a fully qualified domain name. URL parsing
  // handles Unicode-to-ASCII conversion but does not enforce DNS label rules.
  const domain = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  const labels = domain.split(".");
  return domain.length <= 253 && labels.length > 1 &&
    labels.every((label) => DOMAIN_LABEL_RE.test(label));
}

export function parseAndNormalizeDestination(value: unknown): DestinationParseResult {
  if (typeof value !== "string") {
    return { ok: false, error: "Destination must be a text value" };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: "Destination cannot be empty" };
  }
  if (trimmed.length > 2048) {
    return { ok: false, error: "Destination is too long (keep under 2048 characters)" };
  }

  // Bare email address
  if (isValidEmail(trimmed)) {
    return { ok: true, destination: `mailto:${trimmed}`, kind: "email" };
  }

  // A domain with a port resembles a scheme. Recognize that form separately
  // so explicit schemes still work when their destination starts with a digit.
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch && !DOMAIN_RE.test(trimmed)) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme === "mailto") {
      const rest = trimmed.slice(schemeMatch[0].length).trim();
      if (!rest) {
        return { ok: false, error: "Enter a valid email address after mailto:" };
      }
      const [address, ...queryParts] = rest.split("?");
      const trimmedAddress = address.trim();
      if (!isValidEmail(trimmedAddress)) {
        return { ok: false, error: "Enter a valid email address after mailto:" };
      }
      const query = queryParts.length > 0 ? `?${queryParts.join("?")}` : "";
      return { ok: true, destination: `mailto:${trimmedAddress}${query}`, kind: "email" };
    }

    if (scheme !== "http" && scheme !== "https") {
      return {
        ok: false,
        error: `Unsupported scheme "${scheme}:". Only http:, https:, and mailto: destinations are supported.`,
      };
    }

    try {
      const parsed = new URL(trimmed);
      if (!isValidDestinationHostname(parsed.hostname)) {
        return { ok: false, error: "Enter a valid website destination with a domain name" };
      }
      return { ok: true, destination: parsed.href, kind: "url" };
    } catch {
      return { ok: false, error: "Enter a valid website destination" };
    }
  }

  // Reject relative or protocol-relative paths
  if (trimmed.startsWith("/") || trimmed.startsWith(".")) {
    return { ok: false, error: "Relative paths are not supported. Enter a full website address or email." };
  }

  // Domain-only check (e.g. instagram.com/teazosf, domain.com:8080/path)
  if (DOMAIN_RE.test(trimmed)) {
    try {
      const parsed = new URL(`https://${trimmed}`);
      if (isValidDestinationHostname(parsed.hostname)) {
        return { ok: true, destination: parsed.href, kind: "url" };
      }
    } catch {}
  }

  return { ok: false, error: "Enter a valid website destination (e.g. instagram.com/teazo) or email" };
}

export function normalizeDestination(value: unknown): string | null {
  const result = parseAndNormalizeDestination(value);
  return result.ok ? result.destination : null;
}

export function isValidDestination(value: unknown): boolean {
  return parseAndNormalizeDestination(value).ok;
}

export function isValidUrlOrEmail(value: unknown): boolean {
  return isValidDestination(value);
}

export function isValidUrl(value: unknown): boolean {
  if (typeof value !== "string") 
    return false;
  const trimmed = value.trim();
  if (!trimmed) 
    return false;
  
  return URL_RE.test(trimmed);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isValidImageFile(
  file: File,
  maxBytes = MAX_IMAGE_BYTES,
): { valid: boolean; error?: string } {
  if (!file.type.startsWith("image/")) {
    return { valid: false, error: "File must be an image" };
  }
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `Image must be smaller than ${Math.round(maxBytes / (1024 * 1024))}MB`,
    };
  }
  return { valid: true };
}

// month is 1-12. Without a year (a holiday that repeats every year) Feb allows day 29.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(month: number | null, year?: number | null): number {
  if (!month || month < 1 || month > 12) return 31;
  if (month === 2 && year) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  return DAYS_IN_MONTH[month - 1];
}

export function isValidHolidayDay(
  month: number | null,
  day: number | null,
  year?: number | null,
): boolean {
  if (!month || !day) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(month, year);
}

export type HolidayDateParts = {
  /** null for a holiday that repeats every year */
  year: number | null;
  month: number | null;
  day: number | null;
};

/**
 * Holiday.date is "MM-DD" for a holiday that repeats every year, or
 * "YYYY-MM-DD" for one that applies to that single day. The editor also
 * passes half-filled values such as "12-" while a date is being picked.
 */
export function parseHolidayDate(date: string): HolidayDateParts {
  const parts = (date || "").split("-");
  const toNumber = (value: string | undefined) => (value ? Number(value) || null : null);
  if (parts.length === 3) {
    return { year: toNumber(parts[0]), month: toNumber(parts[1]), day: toNumber(parts[2]) };
  }
  return { year: null, month: toNumber(parts[0]), day: toNumber(parts[1]) };
}

export function isValidHolidayDate(date: string): boolean {
  if (!/^(\d{4}-)?\d{2}-\d{2}$/.test(date || "")) return false;
  const { year, month, day } = parseHolidayDate(date);
  if (year !== null && (year < 2000 || year > 2100)) return false;
  return isValidHolidayDay(month, day, year);
}

export function validateAddressField(
  field: keyof AddressInfo,
  value: string,
): string | undefined {
  switch (field) {
    case "businessName":
      if (!isNonEmpty(value)) return "Business name is required";
      if (!withinMaxLength(value, 100)) return "Keep under 100 characters";
      return undefined;
    case "phone":
      if (!isNonEmpty(value)) return "Phone number is required";
      if (!isValidPhone(value)) return "Enter a valid phone number (e.g. +1 (415) 748-7398)";
      return undefined;
    case "streetAddress":
      if (!isNonEmpty(value)) return "Street address is required";
      if (!withinMaxLength(value, 200)) return "Keep under 200 characters";
      return undefined;
    case "locality":
      if (!isNonEmpty(value)) return "City, state, and ZIP are required";
      if (!withinMaxLength(value, 100)) return "Keep under 100 characters";
      return undefined;
    case "email":
      if (!isNonEmpty(value)) return "Email is required";
      if (!isValidEmail(value)) return "Enter a valid email address (e.g. teazosf@hotmail.com)";
      return undefined;
    case "mapQuery":
      if (value && !withinMaxLength(value, 300)) return "Keep under 300 characters";
      return undefined;
    default:
      return undefined;
  }
}

export function validateAddress(address: Partial<AddressInfo>): {
  valid: boolean;
  errors: Partial<Record<keyof AddressInfo, string>>;
} {
  const errors: Partial<Record<keyof AddressInfo, string>> = {};

  if (address.businessName !== undefined) {
    const err = validateAddressField("businessName", address.businessName);
    if (err) errors.businessName = err;
  }
  if (address.phone !== undefined) {
    const err = validateAddressField("phone", address.phone);
    if (err) errors.phone = err;
  }
  if (address.streetAddress !== undefined) {
    const err = validateAddressField("streetAddress", address.streetAddress);
    if (err) errors.streetAddress = err;
  }
  if (address.locality !== undefined) {
    const err = validateAddressField("locality", address.locality);
    if (err) errors.locality = err;
  }
  if (address.email !== undefined) {
    const err = validateAddressField("email", address.email);
    if (err) errors.email = err;
  }
  if (address.mapQuery !== undefined) {
    const err = validateAddressField("mapQuery", address.mapQuery);
    if (err) errors.mapQuery = err;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateSocialLinks(links: (SocialLink | DeliveryLink)[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (const link of links) {
    const labelEmpty = !isNonEmpty(link.label);
    const urlEmpty = !isNonEmpty(link.url);

    if (link.enabled) {
      if (labelEmpty) {
        errors.push(`Platform name required for link "${link.id}"`);
      }
      if (urlEmpty) {
        errors.push(`URL required for link "${link.label || link.id}"`);
      } else {
        const dest = parseAndNormalizeDestination(link.url);
        if (!dest.ok) {
          errors.push(`Enter a valid link or email for "${link.label || link.id}": ${dest.error}`);
        }
      }
    } else if (!labelEmpty || !urlEmpty) {
      if (labelEmpty) errors.push(`Platform name required for link`);
      if (urlEmpty) errors.push(`URL required for link "${link.label}"`);
      else {
        const dest = parseAndNormalizeDestination(link.url);
        if (!dest.ok) {
          errors.push(`Enter a valid link or email for "${link.label}": ${dest.error}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateStory(story: string): { valid: boolean; error?: string } {
  if (!isNonEmpty(story)) return { valid: false, error: "Story can't be empty" };
  if (!withinMaxLength(story, 2000)) return { valid: false, error: "Keep it under 2000 characters" };
  return { valid: true };
}

export function validateHolidays(holidays: Holiday[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const seenDates = new Set<string>();

  for (const holiday of holidays) {
    if (!isNonEmpty(holiday.name)) {
      errors.push("Holiday name is required");
    }
    if (!isValidHolidayDate(holiday.date)) {
      errors.push(`Select a valid date for holiday "${holiday.name || 'unnamed'}"`);
    } else if (seenDates.has(holiday.date)) {
      errors.push(`Duplicate holiday date: ${holiday.date}`);
    } else {
      seenDates.add(holiday.date);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateWebsiteContentPatch(
  patch: Partial<WebsiteContent>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (patch.address) {
    const { valid, errors: addrErrors } = validateAddress(patch.address);
    if (!valid) {
      for (const msg of Object.values(addrErrors)) {
        if (msg) errors.push(msg);
      }
    }
  }

  if (patch.story !== undefined) {
    const { valid, error } = validateStory(patch.story);
    if (!valid && error) errors.push(error);
  }

  if (patch.socialLinks !== undefined) {
    const { valid, errors: socialErrors } = validateSocialLinks(patch.socialLinks);
    if (!valid) errors.push(...socialErrors);
  }

  if (patch.deliveryLinks !== undefined) {
    const { valid, errors: deliveryErrors } = validateSocialLinks(patch.deliveryLinks);
    if (!valid) 
      errors.push(...deliveryErrors);

    // delivery buttons need links, even though social links can use emails
    for (const link of patch.deliveryLinks)
      if (isNonEmpty(link.url) && (!/^https?:\/\//i.test(link.url.trim()) || !isValidUrl(link.url)))
        errors.push(`Enter a valid http:// or https:// link for "${link.label || link.id}"`);
  }

  if (patch.holidays !== undefined) {
    const { valid, errors: holidayErrors } = validateHolidays(patch.holidays);
    if (!valid) errors.push(...holidayErrors);
  }

  for (const key of ["contactFormEnabled", "onlineOrderingEnabled"] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== "boolean") {
      errors.push(`${key} must be true or false`);
    }
  }

  return { valid: errors.length === 0, errors };
}
