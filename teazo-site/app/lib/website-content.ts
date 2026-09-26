import type {
  AddressInfo,
  DayHours,
  Holiday,
  SocialLink,
  WebsiteContent,
} from "@/app/types/website-content";
import { prepare, batch } from "@/app/lib/d1";

export type ContactHour = {
  day: string;
  hours: string;
};

export type ContactContent = {
  location: {
    businessName: string;
    streetAddress: string;
    locality: string;
    phone: string;
    email: string;
    mapQuery: string;
  };
  hours: ContactHour[];
  contactFormEnabled: boolean;
};

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  logo: "/TEAZO_logo.png",
  story:
    "TEAZO is specializing in bringing you high qualities drink, snack and dessert. We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used. From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!",
  socialLinks: [
    { id: "facebook", label: "Facebook", icon: "/social_icons/teazo_fb_icon.png", url: "https://www.facebook.com/people/TEAZO/100063111166083", enabled: true },
    { id: "email", label: "Email", icon: "/social_icons/teazo_email_icon.png", url: "mailto:teazosf@hotmail.com", enabled: true },
    { id: "instagram", label: "Instagram", icon: "/social_icons/teazo_insta_icon.png", url: "https://www.instagram.com/teazosf/", enabled: true },
    { id: "yelp", label: "Yelp", icon: "/social_icons/teazo_yelp_icon.png", url: "https://www.yelp.com/biz/teazo-san-francisco", enabled: true },
  ],
  deliveryLinks: [
    { id: "ubereats", label: "UBER EATS", icon: "", url: "https://www.ubereats.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg?srsltid=AfmBOoranl_YtSY-qug2w6ZzmFcwawnUN1t6RJMvTnqq32BwwVXubRgr", enabled: true },
    { id: "doordash", label: "DOORDASH", icon: "", url: "https://www.doordash.com/en/store/teazo-san-francisco-849601/1213761/?srsltid=AfmBOortGz8HB9dVSbrcnGxXWHRoalBu_ObBQ_Fv-r0SRKiFrYvWQawu", enabled: true },
    { id: "postmates", label: "POSTMATES", icon: "", url: "https://postmates.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg", enabled: true },
  ],
  address: {
    businessName: "TEAZO",
    streetAddress: "1050 Taraval St.",
    locality: "San Francisco, CA 94116-2423",
    phone: "+1 (415) 748-7398",
    email: "teazosf@hotmail.com",
    mapQuery: "1050 Taraval St, San Francisco, CA 94116",
  },
  hours: [
    { day: "Sun", start: 11, end: 20, closed: false },
    { day: "Mon", start: 11, end: 20, closed: false },
    { day: "Tue", start: 11, end: 18, closed: false },
    { day: "Wed", start: 11, end: 20, closed: false },
    { day: "Thu", start: 11, end: 20, closed: false },
    { day: "Fri", start: 11, end: 22, closed: false },
    { day: "Sat", start: 11, end: 22, closed: false },
  ],
  holidays: [
    { id: "christmas", name: "Christmas", date: "12-25", closed: true },
    { id: "presidents", name: "Presidents Day", date: "02-16", closed: false, start: 10, end: 14 },
  ],
  contactFormEnabled: true,
};

let currentWebsiteContent: WebsiteContent = { ...DEFAULT_WEBSITE_CONTENT };

const WEEKDAY_NAMES_FROM_MONDAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const WEEKDAY_ABBRS_FROM_SUNDAY = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function formatTime(hour: number): string {
  const totalMinutes = Math.round(hour * 60);
  const wholeHour = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = wholeHour >= 12 ? "PM" : "AM";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function parseTimeToHour(timeStr: string | null): number {
  if (!timeStr) return 9;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

function hourToTimeString(hour: number): string {
  const totalMinutes = Math.round(hour * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Loads current website content from D1 if configured, otherwise falls back to memory.
 */
export async function getWebsiteContent(): Promise<WebsiteContent> {
  try {
    const profile = await prepare(
      `SELECT business_name, street_address, locality, phone, email, map_query, contact_form_enabled
         FROM business_profile WHERE id = 1`
    ).first<{
      business_name: string;
      street_address: string;
      locality: string;
      phone: string | null;
      email: string | null;
      map_query: string;
      contact_form_enabled: number;
    }>();

    const d1Hours = await prepare(
      `SELECT day_of_week, display_text, opens_at, closes_at, is_closed
         FROM business_hours ORDER BY day_of_week`
    ).all<{
      day_of_week: number;
      display_text: string;
      opens_at: string | null;
      closes_at: string | null;
      is_closed: number;
    }>();

    const d1Links = await prepare(
      `SELECT key, link_group, label, url, aria_label, sort_order, is_active
         FROM site_link ORDER BY sort_order, key`
    ).all<{
      key: string;
      link_group: string;
      label: string;
      url: string;
      aria_label: string | null;
      sort_order: number;
      is_active: number;
    }>();

    const d1Copy = await prepare(
      `SELECT key, value FROM content_block WHERE key IN ('home.story', 'site.logo')`
    ).all<{ key: string; value: string | null }>();

    const d1Holidays = await prepare(
      `SELECT date, is_closed, display_text, note FROM hours_exception ORDER BY date`
    ).all<{ date: string; is_closed: number; display_text: string | null; note: string | null }>();

    if (profile) {
      currentWebsiteContent.address = {
        businessName: profile.business_name || currentWebsiteContent.address.businessName,
        streetAddress: profile.street_address || currentWebsiteContent.address.streetAddress,
        locality: profile.locality || currentWebsiteContent.address.locality,
        phone: profile.phone || currentWebsiteContent.address.phone,
        email: profile.email || currentWebsiteContent.address.email,
        mapQuery: profile.map_query || currentWebsiteContent.address.mapQuery,
      };
      currentWebsiteContent.contactFormEnabled = profile.contact_form_enabled === 1;
    }

    if (d1Hours.results.length === 7) {
      // D1 is 0=Monday .. 6=Sunday. Admin UI expects 0=Sunday .. 6=Saturday.
      const mappedHours: DayHours[] = WEEKDAY_ABBRS_FROM_SUNDAY.map((abbr, jsDay) => {
        const d1Day = (jsDay + 6) % 7;
        const row = d1Hours.results.find((r) => r.day_of_week === d1Day);
        if (!row) return currentWebsiteContent.hours[jsDay];
        return {
          day: abbr,
          start: parseTimeToHour(row.opens_at),
          end: parseTimeToHour(row.closes_at),
          closed: row.is_closed === 1,
        };
      });
      currentWebsiteContent.hours = mappedHours;
    }

    if (d1Links.results.length > 0) {
      const socials = d1Links.results
        .filter((l) => l.link_group === "social")
        .map((l) => ({
          id: l.key,
          label: l.label,
          icon: `/social_icons/teazo_${l.key}_icon.png`,
          url: l.url,
          enabled: l.is_active === 1,
        }));
      if (socials.length > 0) currentWebsiteContent.socialLinks = socials;

      const delivery = d1Links.results
        .filter((l) => l.link_group === "delivery")
        .map((l) => ({
          id: l.key,
          label: l.label,
          icon: "",
          url: l.url,
          enabled: l.is_active === 1,
        }));
      if (delivery.length > 0) currentWebsiteContent.deliveryLinks = delivery;
    }

    if (d1Copy.results.length > 0) {
      for (const block of d1Copy.results) {
        if (block.key === "home.story" && block.value) {
          currentWebsiteContent.story = block.value;
        } else if (block.key === "site.logo" && block.value) {
          currentWebsiteContent.logo = block.value;
        }
      }
    }

    if (d1Holidays.results.length > 0) {
      currentWebsiteContent.holidays = d1Holidays.results.map((h, i) => ({
        id: `holiday-${h.date || i}`,
        name: h.note || `Holiday`,
        date: h.date,
        closed: h.is_closed === 1,
      }));
    }
  } catch {
    // Keep in-memory content when D1 is unconfigured or unreachable.
  }

  return currentWebsiteContent;
}

/**
 * Updates website content with the provided partial values and persists to D1.
 */
export async function updateWebsiteContent(
  patch: Partial<WebsiteContent>,
): Promise<WebsiteContent> {
  currentWebsiteContent = {
    ...currentWebsiteContent,
    ...patch,
    address: {
      ...currentWebsiteContent.address,
      ...(patch.address ?? {}),
    },
  };

  try {
    const stmts: Array<{ toStmt(): { sql: string; params: unknown[] } }> = [];

    if (patch.address || patch.contactFormEnabled !== undefined) {
      const addr = currentWebsiteContent.address;
      const formEnabled = currentWebsiteContent.contactFormEnabled ? 1 : 0;
      stmts.push(
        prepare(
          `UPDATE business_profile
             SET business_name = ?1, street_address = ?2, locality = ?3,
                 phone = ?4, email = ?5, map_query = ?6, contact_form_enabled = ?7,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = 1`
        ).bind(
          addr.businessName,
          addr.streetAddress,
          addr.locality,
          addr.phone,
          addr.email,
          addr.mapQuery || `${addr.streetAddress}, ${addr.locality}`,
          formEnabled,
        )
      );
    }

    if (patch.story !== undefined) {
      stmts.push(
        prepare(
          `INSERT INTO content_block (key, page_key, slot_key, block_type, value)
           VALUES ('home.story', 'home', 'story', 'text', ?1)
           ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
        ).bind(patch.story)
      );
    }

    if (patch.logo !== undefined) {
      stmts.push(
        prepare(
          `INSERT INTO content_block (key, page_key, slot_key, block_type, value)
           VALUES ('site.logo', 'site', 'logo', 'text', ?1)
           ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
        ).bind(patch.logo)
      );
    }

    if (patch.hours && patch.hours.length === 7) {
      WEEKDAY_ABBRS_FROM_SUNDAY.forEach((_, jsDay) => {
        const d1Day = (jsDay + 6) % 7;
        const entry = patch.hours![jsDay];
        const displayText = entry.closed
          ? "Closed"
          : `${formatTime(entry.start)} - ${formatTime(entry.end)}`;
        const opensAt = hourToTimeString(entry.start);
        const closesAt = hourToTimeString(entry.end);
        const isClosed = entry.closed ? 1 : 0;

        stmts.push(
          prepare(
            `UPDATE business_hours
               SET display_text = ?1, opens_at = ?2, closes_at = ?3, is_closed = ?4
             WHERE day_of_week = ?5`
          ).bind(displayText, opensAt, closesAt, isClosed, d1Day)
        );
      });
    }

    if (patch.socialLinks) {
      stmts.push(prepare(`DELETE FROM site_link WHERE link_group = 'social'`));
      for (let i = 0; i < patch.socialLinks.length; i++) {
        const link = patch.socialLinks[i];
        if (!link.id || !link.url) continue;
        stmts.push(
          prepare(
            `INSERT INTO site_link (key, link_group, label, url, sort_order, is_active)
             VALUES (?1, 'social', ?2, ?3, ?4, ?5)`
          ).bind(link.id, link.label || link.id, link.url, i + 1, link.enabled ? 1 : 0)
        );
      }
    }

    if (patch.holidays) {
      stmts.push(prepare(`DELETE FROM hours_exception`));
      for (const holiday of patch.holidays) {
        if (!holiday.date) continue;
        const displayText = holiday.closed
          ? "Closed"
          : holiday.start && holiday.end
          ? `${formatTime(holiday.start)} - ${formatTime(holiday.end)}`
          : "Closed";
        stmts.push(
          prepare(
            `INSERT INTO hours_exception (date, is_closed, display_text, note)
             VALUES (?1, ?2, ?3, ?4)`
          ).bind(
            holiday.date,
            holiday.closed ? 1 : 0,
            displayText,
            holiday.name || "Holiday"
          )
        );
      }
    }

    if (stmts.length > 0) {
      await batch(stmts);
    }
  } catch {
    // If D1 is unconfigured or unreachable, memory state still updates.
  }

  return currentWebsiteContent;
}

/**
 * Returns formatted ContactContent preserving the exact shape expected by the frontend contact route.
 */
export async function getContactContent(): Promise<ContactContent> {
  const content = await getWebsiteContent();

  // Convert DayHours (Sun-first) to ContactHour (Mon-first)
  const hours: ContactHour[] = WEEKDAY_NAMES_FROM_MONDAY.map((dayName, monIdx) => {
    // monIdx 0 = Mon -> jsDay 1; monIdx 6 = Sun -> jsDay 0
    const jsDay = (monIdx + 1) % 7;
    const entry = content.hours[jsDay];
    const hoursText = entry?.closed
      ? "Closed"
      : entry
      ? `${formatTime(entry.start)} - ${formatTime(entry.end)}`
      : "11:00 AM - 8:00 PM";
    return {
      day: dayName,
      hours: hoursText,
    };
  });

  return {
    location: {
      businessName: content.address.businessName,
      streetAddress: content.address.streetAddress,
      locality: content.address.locality,
      phone: content.address.phone,
      email: content.address.email,
      mapQuery:
        content.address.mapQuery ||
        `${content.address.streetAddress}, ${content.address.locality}`,
    },
    hours,
    contactFormEnabled: content.contactFormEnabled,
  };
}

/**
 * Retrieves whether the customer-facing Contact Us form is currently enabled.
 */
export async function getContactFormSetting(): Promise<boolean> {
  const content = await getWebsiteContent();
  return content.contactFormEnabled ?? true;
}

/**
 * Updates the Contact Us form enabled/disabled setting.
 */
export async function setContactFormSetting(enabled: boolean): Promise<boolean> {
  const updated = await updateWebsiteContent({ contactFormEnabled: enabled });
  return updated.contactFormEnabled;
}
