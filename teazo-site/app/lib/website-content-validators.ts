import type {
  AddressInfo,
  Holiday,
  SocialLink,
  WebsiteContent,
} from "@/app/types/website-content";

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const URL_RE =
  /^(https?:\/\/)?([\w-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?$/i;
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

export function isValidUrlOrEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("mailto:")) return isValidEmail(trimmed.slice(7));
  return isValidEmail(trimmed) || URL_RE.test(trimmed);
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

// month is 1-12, no year attached (holidays repeat annually) so Feb allows day 29
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(month: number | null): number {
  if (!month || month < 1 || month > 12) return 31;
  return DAYS_IN_MONTH[month - 1];
}

export function isValidHolidayDay(
  month: number | null,
  day: number | null,
): boolean {
  if (!month || !day) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(month);
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

export function validateSocialLinks(links: SocialLink[]): {
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
      } else if (!isValidUrlOrEmail(link.url)) {
        errors.push(`Enter a valid link or email for "${link.label || link.id}"`);
      }
    } else if (!labelEmpty || !urlEmpty) {
      if (labelEmpty) errors.push(`Platform name required for link`);
      if (urlEmpty) errors.push(`URL required for link "${link.label}"`);
      else if (!isValidUrlOrEmail(link.url)) {
        errors.push(`Enter a valid link or email for "${link.label}"`);
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
    const [m, d] = (holiday.date || "").split("-").map(Number);
    if (!isValidHolidayDay(m, d)) {
      errors.push(`Select a valid month and day for holiday "${holiday.name || 'unnamed'}"`);
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

  if (patch.holidays !== undefined) {
    const { valid, errors: holidayErrors } = validateHolidays(patch.holidays);
    if (!valid) errors.push(...holidayErrors);
  }

  return { valid: errors.length === 0, errors };
}
