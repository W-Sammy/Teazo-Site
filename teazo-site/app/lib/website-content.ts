import type { WebsiteContent } from "@/app/types/website-content";

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  logo: "/TEAZO_logo.png",
  story:
    "TEAZO is specializing in bringing you high qualities drink, snack and dessert. We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used. From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!",
  socialLinks: [
    { id: "facebook", label: "Facebook", icon: "/social_icons/teazo_fb_icon.png", url: "", enabled: true },
    { id: "email", label: "Email", icon: "/social_icons/teazo_email_icon.png", url: "", enabled: true },
    { id: "instagram", label: "Instagram", icon: "/social_icons/teazo_insta_icon.png", url: "", enabled: true },
    { id: "yelp", label: "Yelp", icon: "/social_icons/teazo_yelp_icon.png", url: "", enabled: true },
  ],
  address: {
    businessName: "TEAZO",
    streetAddress: "1050 Taraval St.",
    locality: "San Francisco, CA 94116-2423",
    phone: "+1 (415) 748-7398",
    email: "teazosf@hotmail.com",
  },
  hours: [
    { day: "Sun", start: 9, end: 17, closed: true },
    { day: "Mon", start: 9, end: 17, closed: false },
    { day: "Tue", start: 9, end: 17, closed: false },
    { day: "Wed", start: 9, end: 17, closed: false },
    { day: "Thu", start: 9, end: 17, closed: false },
    { day: "Fri", start: 9, end: 17, closed: false },
    { day: "Sat", start: 10, end: 14, closed: false },
  ],
  holidays: [
    { id: "christmas", name: "Christmas", date: "12-25", closed: true },
    { id: "presidents", name: "Presidents Day", date: "02-16", closed: false, start: 10, end: 14 },
  ],
  contactFormEnabled: true,
};

let currentWebsiteContent: WebsiteContent = { ...DEFAULT_WEBSITE_CONTENT };

/**
 * Loads current website content.
 * Replace in-memory store with database/API request once persistent storage (D1) is wired.
 */
export async function getWebsiteContent(): Promise<WebsiteContent> {
  return currentWebsiteContent;
}

/**
 * Updates website content with the provided partial values.
 */
export async function updateWebsiteContent(
  patch: Partial<WebsiteContent>,
): Promise<WebsiteContent> {
  currentWebsiteContent = {
    ...currentWebsiteContent,
    ...patch,
  };
  return currentWebsiteContent;
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
