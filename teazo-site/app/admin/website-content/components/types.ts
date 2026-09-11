export type DayHours = {
  day: string;
  start: number;
  end: number;
  closed: boolean;
};

export type Holiday = {
  id: string;
  name: string;
  date: string; // "MM-DD", no year — these repeat annually
};

export type SocialLink = {
  id: string;
  label: string;
  icon: string;
  url: string;
  enabled: boolean;
};

export type AddressInfo = {
  businessName: string;
  streetAddress: string;
  locality: string;
  phone: string;
  email: string;
};

export type SectionId = "logo" | "story" | "social" | "contact" | "hours" | "holidays";

export const INITIAL_LOGO = "/TEAZO_logo.png";

export const INITIAL_HOURS: DayHours[] = [
  { day: "Sun", start: 9, end: 17, closed: true },
  { day: "Mon", start: 9, end: 17, closed: false },
  { day: "Tue", start: 9, end: 17, closed: false },
  { day: "Wed", start: 9, end: 17, closed: false },
  { day: "Thu", start: 9, end: 17, closed: false },
  { day: "Fri", start: 9, end: 17, closed: false },
  { day: "Sat", start: 10, end: 14, closed: false },
];

export const INITIAL_HOLIDAYS: Holiday[] = [
  { id: "christmas", name: "Christmas", date: "12-25" },
  { id: "presidents", name: "Presidents Day", date: "02-16" },
];

export const INITIAL_SOCIAL_LINKS: SocialLink[] = [
  { id: "facebook", label: "Facebook", icon: "/social_icons/teazo_fb_icon.png", url: "", enabled: true },
  { id: "email", label: "Email", icon: "/social_icons/teazo_email_icon.png", url: "", enabled: true },
  { id: "instagram", label: "Instagram", icon: "/social_icons/teazo_insta_icon.png", url: "", enabled: true },
  { id: "yelp", label: "Yelp", icon: "/social_icons/teazo_yelp_icon.png", url: "", enabled: true },
];

export const INITIAL_STORY =
  "TEAZO is specializing in bringing you high qualities drink, snack and dessert. We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used. From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!";

export const INITIAL_ADDRESS: AddressInfo = {
  businessName: "TEAZO",
  streetAddress: "1050 Taraval St.",
  locality: "San Francisco, CA 94116-2423",
  phone: "+1 (415) 748-7398",
  email: "teazosf@hotmail.com",
};
