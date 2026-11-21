import { getContactContent as getLiveContactContent } from "@/app/lib/website-content";

import type {
  ContactHour,
  ContactContent,
} from "@/app/types/website-content";

export type { ContactHour, ContactContent };

// Keep the page content in one route-local module so it can later be swapped
// for admin-dashboard or CMS data without rewriting the contact layout.
export const contactContent: ContactContent = {
  logo: "/TEAZO_logo.svg",
  location: {
    // Keep address data split into display-friendly pieces because the layout
    // renders them on separate lines while still deriving links from mapQuery.
    businessName: "TEAZO",
    streetAddress: "1050 Taraval St.",
    locality: "San Francisco, CA 94116-2423",
    phone: "+1 (415) 748-7398",
    email: "teazosf@hotmail.com",
    mapQuery: "1050 Taraval St, San Francisco, CA 94116",
  },
  hours: [
    { day: "Monday", hours: "Temporarily unavailable" },
    { day: "Tuesday", hours: "Temporarily unavailable" },
    { day: "Wednesday", hours: "Temporarily unavailable" },
    { day: "Thursday", hours: "Temporarily unavailable" },
    { day: "Friday", hours: "Temporarily unavailable" },
    { day: "Saturday", hours: "Temporarily unavailable" },
    { day: "Sunday", hours: "Temporarily unavailable" },
  ],
  socialLinks: [],
  contactFormEnabled: false,
};

/**
 * Loads contact content including location, formatted hours, and contactFormEnabled setting.
 * Allows the customer-facing Contact page to retrieve live configuration from D1/admin,
 * or the safe outage presentation if storage cannot be reached.
 */
export async function getContactContent(): Promise<ContactContent> {
  return getLiveContactContent();
}

// Google Maps embed URL for the iframe on the left side of the contact card.
export const mapEmbedSrc = `https://www.google.com/maps?q=${encodeURIComponent(
  contactContent.location.mapQuery,
)}&z=15&output=embed`;

// Direct directions link used by the CTA in the contact details column.
export const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  contactContent.location.mapQuery,
)}`;
