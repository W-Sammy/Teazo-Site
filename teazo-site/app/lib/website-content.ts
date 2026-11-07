import type {
  DayHours,
  SocialLink,
  DeliveryLink,
  WebsiteContent,
  ContactHour,
  ContactContent,
  CarouselImage,
} from "@/app/types/website-content";
import { getWeeklyCustomerHours, parseDisplayTextRange } from "@/app/lib/store-hours";
import { prepare, batch } from "@/app/lib/d1";
import { toPublicUrl } from "@/app/lib/media";

import { unstable_rethrow } from "next/navigation";
import {
  isValidPhone,
  isValidEmail,
  isNonEmpty,
  formatPhoneNumber,
  validateWebsiteContentPatch,
  parseAndNormalizeDestination,
} from "@/app/lib/website-content-validators";

export type { ContactHour, ContactContent, SocialLink, DeliveryLink };

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  collectionsRevision: 0,
  logo: "/TEAZO_logo.svg",
  story:
    "TEAZO is specializing in bringing you high qualities drink, snack and dessert. We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used. From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!",
  socialLinks: [
    { id: "facebook", label: "Facebook", icon: "/social_icons/social_svg/teazo_fb_icon.svg", url: "https://www.facebook.com/people/TEAZO/100063111166083", enabled: true },
    { id: "instagram", label: "Instagram", icon: "/social_icons/social_svg/teazo_insta_icon.svg", url: "https://www.instagram.com/teazosf/", enabled: true },
    { id: "yelp", label: "Yelp", icon: "/social_icons/social_svg/teazo_yelp_icon.svg", url: "https://www.yelp.com/biz/teazo-san-francisco", enabled: true },
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
  carouselImages: [],
  contactFormEnabled: true,
  onlineOrderingEnabled: true,
};

// content_block row that pauses online ordering. Its value is "off" while
// paused; any other value, or no row, means orders are open.
const ONLINE_ORDERING_KEY = "site.online_ordering";

export class WebsiteContentUnavailableError extends Error {
  constructor(message = "Website content storage is unavailable.", public readonly cause?: unknown) {
    super(message);
    this.name = "WebsiteContentUnavailableError";
    Object.setPrototypeOf(this, WebsiteContentUnavailableError.prototype);
  }
}

export function getOutageFallbackWebsiteContent(): WebsiteContent {
  return {
    collectionsRevision: 0,
    logo: DEFAULT_WEBSITE_CONTENT.logo,
    story: DEFAULT_WEBSITE_CONTENT.story,
    socialLinks: [],
    deliveryLinks: [],
    address: { ...DEFAULT_WEBSITE_CONTENT.address },
    hours: [],
    holidays: [],
    carouselImages: [],
    contactFormEnabled: false,
    onlineOrderingEnabled: false,
  };
}

export function getOutageContactContent(): ContactContent {
  return {
    logo: DEFAULT_WEBSITE_CONTENT.logo,
    location: {
      businessName: DEFAULT_WEBSITE_CONTENT.address.businessName,
      streetAddress: DEFAULT_WEBSITE_CONTENT.address.streetAddress,
      locality: DEFAULT_WEBSITE_CONTENT.address.locality,
      phone: DEFAULT_WEBSITE_CONTENT.address.phone,
      email: DEFAULT_WEBSITE_CONTENT.address.email,
      mapQuery:
        DEFAULT_WEBSITE_CONTENT.address.mapQuery ||
        `${DEFAULT_WEBSITE_CONTENT.address.streetAddress}, ${DEFAULT_WEBSITE_CONTENT.address.locality}`,
    },
    hours: [
      { day: "Monday", hours: "Temporarily unavailable", isHoliday: false },
      { day: "Tuesday", hours: "Temporarily unavailable", isHoliday: false },
      { day: "Wednesday", hours: "Temporarily unavailable", isHoliday: false },
      { day: "Thursday", hours: "Temporarily unavailable", isHoliday: false },
      { day: "Friday", hours: "Temporarily unavailable", isHoliday: false },
      { day: "Saturday", hours: "Temporarily unavailable", isHoliday: false },
      { day: "Sunday", hours: "Temporarily unavailable", isHoliday: false },
    ],
    socialLinks: [],
    contactFormEnabled: false,
  };
}

function cloneDefaultWebsiteContent(): WebsiteContent {
  return {
    collectionsRevision: 0,
    logo: DEFAULT_WEBSITE_CONTENT.logo,
    story: DEFAULT_WEBSITE_CONTENT.story,
    socialLinks: DEFAULT_WEBSITE_CONTENT.socialLinks.map((s) => ({ ...s })),
    deliveryLinks: DEFAULT_WEBSITE_CONTENT.deliveryLinks?.map((d) => ({ ...d })),
    address: { ...DEFAULT_WEBSITE_CONTENT.address },
    hours: DEFAULT_WEBSITE_CONTENT.hours.map((h) => ({ ...h })),
    holidays: DEFAULT_WEBSITE_CONTENT.holidays.map((h) => ({ ...h })),
    carouselImages: (DEFAULT_WEBSITE_CONTENT.carouselImages ?? []).map((image) => ({ ...image })),
    contactFormEnabled: DEFAULT_WEBSITE_CONTENT.contactFormEnabled,
    onlineOrderingEnabled: DEFAULT_WEBSITE_CONTENT.onlineOrderingEnabled,
  };
}

function isD1Configured(): boolean {
  return Boolean(process.env.D1_PROXY_URL && process.env.PROXY_TOKEN);
}

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

function isSavedCarouselImage(value: unknown): value is CarouselImage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const image = value as Record<string, unknown>;

  return typeof image.id === "string" && image.id.trim().length > 0 &&
    typeof image.src === "string" &&
    (image.src.startsWith("carousel/") || /^\/carousel_images\/[a-z0-9_.-]+\.(png|jpe?g|webp)$/i.test(image.src)) &&
    typeof image.alt === "string" && typeof image.enabled === "boolean";
}

export async function getPublicWebsiteContent(): Promise<WebsiteContent> {
  try {
    return await getWebsiteContent();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Website content storage is unavailable for public page:", error);
    return getOutageFallbackWebsiteContent();
  }
}

/**
 * Loads authoritative website content directly from D1 storage.
 * Throws WebsiteContentUnavailableError if storage is unconfigured, queries fail,
 * or collection revision is unavailable.
 */
export async function getWebsiteContent(options?: { allowOutageFallback?: boolean }): Promise<WebsiteContent> {
  if (options?.allowOutageFallback) {
    return getPublicWebsiteContent();
  }

  if (!isD1Configured()) {
    throw new WebsiteContentUnavailableError("Website content storage is unconfigured.");
  }

  const content = cloneDefaultWebsiteContent();

  try {
    // Read the revision before the collections. If a concurrent write happens
    // during these reads, subsequent saves safely fail with a conflict.
    const revision = await prepare(
      "SELECT revision FROM website_content_revision WHERE id = 1",
    ).first<{ revision: number }>();
    if (!revision) throw new WebsiteContentUnavailableError("Website content revision is unavailable. Apply migration 0012.");
    content.collectionsRevision = revision.revision;
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
      contact_form_enabled?: number | null;
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
      `SELECT key, value FROM content_block WHERE key IN ('home.story', 'site.logo', 'home.carousel', ?1)`
    ).bind(ONLINE_ORDERING_KEY).all<{ key: string; value: string | null }>();

    const d1Holidays = await prepare(
      `SELECT date, is_closed, display_text, note FROM hours_exception ORDER BY date`
    ).all<{ date: string; is_closed: number; display_text: string | null; note: string | null }>();

    if (profile) {
      content.address = {
        businessName: (profile.business_name && isNonEmpty(profile.business_name))
          ? profile.business_name
          : content.address.businessName,
        streetAddress: (profile.street_address && isNonEmpty(profile.street_address))
          ? profile.street_address
          : content.address.streetAddress,
        locality: (profile.locality && isNonEmpty(profile.locality))
          ? profile.locality
          : content.address.locality,
        phone: (profile.phone && isValidPhone(profile.phone))
          ? formatPhoneNumber(profile.phone)
          : content.address.phone,
        email: (profile.email && isValidEmail(profile.email))
          ? profile.email
          : content.address.email,
        mapQuery: profile.map_query || content.address.mapQuery,
      };
      if (profile.contact_form_enabled !== undefined && profile.contact_form_enabled !== null) {
        content.contactFormEnabled = profile.contact_form_enabled === 1;
      }
    }

    if (d1Hours.results.length === 7) {
      // D1 is 0=Monday .. 6=Sunday. Admin UI expects 0=Sunday .. 6=Saturday.
      const mappedHours: DayHours[] = WEEKDAY_ABBRS_FROM_SUNDAY.map((abbr, jsDay) => {
        const d1Day = (jsDay + 6) % 7;
        const row = d1Hours.results.find((r) => r.day_of_week === d1Day);
        if (!row) return content.hours[jsDay];
        return {
          day: abbr,
          start: parseTimeToHour(row.opens_at),
          end: parseTimeToHour(row.closes_at),
          closed: row.is_closed === 1,
        };
      });
      content.hours = mappedHours;
    }

    if (d1Links.results.length > 0) {
      const socials = d1Links.results
        .filter((l) => l.link_group === "social" && l.key !== "email")
        .map((l) => {
          const parsed = parseAndNormalizeDestination(l.url);
          return {
            id: l.key,
            label: l.label,
            icon: ({ facebook: "/social_icons/social_svg/teazo_fb_icon.svg",
              instagram: "/social_icons/social_svg/teazo_insta_icon.svg",
              yelp: "/social_icons/social_svg/teazo_yelp_icon.svg" } as Record<string, string>)[l.key] || "",
            url: parsed.ok ? parsed.destination : l.url,
            enabled: l.is_active === 1,
          };
        });
      content.socialLinks = socials;
    } else {
      content.socialLinks = [];
    }

    content.deliveryLinks = d1Links.results
      .filter((link) => link.link_group === "delivery")
      .map((link): DeliveryLink => ({
        id: link.key,
        label: link.label,
        icon: "",
        url: link.url,
        enabled: link.is_active === 1,
      }));

    if (d1Copy.results.length > 0) {
      for (const block of d1Copy.results) {
        if (block.key === "home.carousel") {
          try {
            const savedImages: unknown = block.value === null ? [] : JSON.parse(block.value);
            if (!Array.isArray(savedImages)) {
              throw new Error("Saved carousel settings must be an array.");
            }

            const validImages = savedImages.filter(isSavedCarouselImage);
            if (validImages.length !== savedImages.length) {
              console.error("Skipped invalid entries in saved carousel settings.");
            }
            content.carouselImages = validImages.map((image) => ({
              ...image,
              src: image.src.startsWith("/carousel_images/") ? image.src : toPublicUrl(image.src),
            }));

          } catch (error) {
            console.error("Could not load saved carousel images:", error);
          }
        }

        if (block.key === "home.story" && block.value) {
          content.story = block.value;
        } else if (block.key === "site.logo" && block.value) {
          content.logo = block.value.startsWith("data:")
            ? DEFAULT_WEBSITE_CONTENT.logo
            : block.value;
        } else if (block.key === ONLINE_ORDERING_KEY) {
          content.onlineOrderingEnabled = block.value !== "off";
        }
      }
    }

    content.holidays = d1Holidays.results.map((h, i) => {
      const timeRange = parseDisplayTextRange(h.display_text);
      return {
        id: `holiday-${h.date || i}`,
        name: h.note || `Holiday`,
        // "MM-DD" repeats every year, "YYYY-MM-DD" is that day only.
        date: h.date,
        closed: h.is_closed === 1,
        start: timeRange.start,
        end: timeRange.end,
        displayText: h.display_text || undefined,
      };
    });

    return content;
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof WebsiteContentUnavailableError || (error as Error)?.name === "WebsiteContentUnavailableError") {
      throw error;
    }
    console.error("Failed to fetch website content from D1:", error);
    throw new WebsiteContentUnavailableError("Failed to fetch website content from D1.", error);
  }
}

export const getAuthoritativeWebsiteContent = getWebsiteContent;

/**
 * Updates website content with the provided partial values and persists to D1.
 */
export async function updateWebsiteContent(
  patch: Partial<WebsiteContent>,
): Promise<WebsiteContent> {
  const validation = validateWebsiteContentPatch(patch);
  if (!validation.valid) {
    throw new Error(`Invalid website content: ${validation.errors.join("; ")}`);
  }

  // Reads may use a fallback, but an admin write must never report a
  // successful save that disappears when the server restarts.
  if (!isD1Configured()) throw new WebsiteContentUnavailableError("Website content storage is unavailable.");
  const current = await getWebsiteContent();
  const changesCollections = patch.socialLinks !== undefined || patch.holidays !== undefined;
  if (changesCollections) assertCollectionWrite(patch.collectionsRevision);

  const formattedAddress = patch.address
    ? {
        ...patch.address,
        phone: patch.address.phone ? formatPhoneNumber(patch.address.phone) : patch.address.phone,
      }
    : undefined;

  const normalizedSocialLinks = patch.socialLinks?.map((link) => {
    const parsed = parseAndNormalizeDestination(link.url);
    return {
      ...link,
      url: parsed.ok ? parsed.destination : link.url.trim(),
    };
  });

  const nextContent: WebsiteContent = {
    ...current,
    ...patch,
    ...(normalizedSocialLinks ? { socialLinks: normalizedSocialLinks } : {}),
    address: {
      ...current.address,
      ...(formattedAddress ?? {}),
    },
  };

  try {
    const stmts: Array<{ toStmt(): { sql: string; params: unknown[] } }> = [];
    if (changesCollections) {
      stmts.push(claimCollectionsRevision(patch.collectionsRevision!));
      nextContent.collectionsRevision = patch.collectionsRevision! + 1;
    }
    const hasAddressUpdate = patch.address !== undefined;
    const hasFormToggleUpdate = patch.contactFormEnabled !== undefined;

    if (hasAddressUpdate || hasFormToggleUpdate) {
      const addr = nextContent.address;
      const formEnabled = nextContent.contactFormEnabled ? 1 : 0;
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

    if (patch.onlineOrderingEnabled !== undefined) {
      stmts.push(
        prepare(
          `INSERT INTO content_block (key, page_key, slot_key, block_type, value)
           VALUES (?1, 'site', 'online_ordering', 'text', ?2)
           ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
        ).bind(ONLINE_ORDERING_KEY, patch.onlineOrderingEnabled ? "on" : "off")
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

    if (normalizedSocialLinks) {
      stmts.push(prepare(`DELETE FROM site_link WHERE link_group = 'social'`));
      for (let i = 0; i < normalizedSocialLinks.length; i++) {
        const link = normalizedSocialLinks[i];
        if (!link.id || !link.url) continue;
        stmts.push(
          prepare(
            `INSERT INTO site_link (key, link_group, label, url, sort_order, is_active)
             VALUES (?1, 'social', ?2, ?3, ?4, ?5)`
          ).bind(link.id, link.label || link.id, link.url, i + 1, link.enabled ? 1 : 0)
        );
      }
    }

    if (patch.deliveryLinks !== undefined) {
      stmts.push(prepare(`DELETE FROM site_link WHERE link_group = 'delivery'`));
      for (let i = 0; i < patch.deliveryLinks.length; i++) {
        const link = patch.deliveryLinks[i];
        if (!link.id || !link.url) 
          continue;
        stmts.push(
          prepare(
            `INSERT INTO site_link (key, link_group, label, url, sort_order, is_active)
             VALUES (?1, 'delivery', ?2, ?3, ?4, ?5)`
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
          : holiday.start !== undefined && holiday.end !== undefined
          ? `${formatTime(holiday.start)} - ${formatTime(holiday.end)}`
          : holiday.displayText || "Closed";
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
      try {
        await batch(stmts);
      } catch (err: unknown) {
        unstable_rethrow(err);
        const errMsg = String(err);
        // If contact_form_enabled column does not exist yet, retry updating business_profile without it
        if (errMsg.includes("contact_form_enabled") && (hasAddressUpdate || hasFormToggleUpdate)) {
          const addr = nextContent.address;
          const fallbackStmts = stmts.map((s) => {
            const stmtObj = s.toStmt();
            if (stmtObj.sql.includes("contact_form_enabled")) {
              return prepare(
                `UPDATE business_profile
                   SET business_name = ?1, street_address = ?2, locality = ?3,
                       phone = ?4, email = ?5, map_query = ?6,
                       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = 1`
              ).bind(
                addr.businessName,
                addr.streetAddress,
                addr.locality,
                addr.phone,
                addr.email,
                addr.mapQuery || `${addr.streetAddress}, ${addr.locality}`,
              );
            }
            return s;
          });
          await batch(fallbackStmts);
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    unstable_rethrow(err);
    if (String(err).includes("website_content_conflict")) throw new WebsiteContentConflictError();
    console.error("Failed to update website content in D1:", err);
    throw err;
  }

  return nextContent;
}

export class WebsiteContentConflictError extends Error {
  constructor() {
    super("Website content changed in another session. Reload this page before making more changes.");
  }
}

export class WebsiteContentNotFoundError extends Error {
  constructor() {
    super("This entry no longer exists. Reload this page before making more changes.");
  }
}

function assertCollectionWrite(revision: unknown): asserts revision is number {
  if (!isD1Configured()) throw new WebsiteContentUnavailableError("Website content storage is unavailable.");
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) {
    throw new WebsiteContentConflictError();
  }
}

function claimCollectionsRevision(revision: number) {
  return prepare(
    "UPDATE website_content_revision SET revision = ?1 WHERE id = 1",
  ).bind(revision + 1);
}

/** Claim only if the target exists; the revision trigger rejects stale writers.
 * D1's batch is atomic and returns each statement's meta.changes through the proxy.
 * A missing target changes neither the revision nor the collection.
 */
export async function deleteWebsiteContentEntry(
  collection: "socialLinks" | "holidays",
  id: string,
  revision: number,
): Promise<number> {
  assertCollectionWrite(revision);
  const target = collection === "socialLinks"
    ? "site_link WHERE link_group = 'social' AND key = ?2"
    : "hours_exception WHERE date = ?2";
  const claim = prepare(
    `UPDATE website_content_revision SET revision = ?1
     WHERE id = 1 AND EXISTS (SELECT 1 FROM ${target})`,
  ).bind(revision + 1, id);
  const statement = prepare(
    `DELETE FROM ${target}
     AND EXISTS (SELECT 1 FROM website_content_revision WHERE id = 1 AND revision = ?1)`,
  ).bind(revision + 1, id);
  try {
    const { results } = await batch([claim, statement]);
    const [claimed, deleted] = results;
    if (results.length !== 2 || claimed?.success !== true || deleted?.success !== true) {
      throw new Error("Deletion result is unavailable.");
    }
    if (claimed.meta.changes === 0 && deleted.meta.changes === 0) throw new WebsiteContentNotFoundError();
    if (claimed.meta.changes !== 1 || deleted.meta.changes !== 1) {
      throw new Error("Deletion could not be confirmed.");
    }
  } catch (error) {
    if (String(error).includes("website_content_conflict")) throw new WebsiteContentConflictError();
    throw error;
  }
  return revision + 1;
}

/**
 * Returns formatted ContactContent preserving the exact shape expected by the frontend contact route.
 */
export async function getContactContent(): Promise<ContactContent> {
  try {
    const content = await getWebsiteContent();
    const hours = getWeeklyCustomerHours(content);

    return {
      logo: content.logo,
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
      socialLinks: content.socialLinks,
      contactFormEnabled: content.contactFormEnabled,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Website content storage is unavailable for contact page:", error);
    return getOutageContactContent();
  }
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
