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
  closed: boolean; // true = fully closed, false = adjusted hours (see start/end)
  start?: number; // adjusted-hours open time, 24hr scale; only meaningful when closed is false
  end?: number; // adjusted-hours close time, 24hr scale; only meaningful when closed is false
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

export type WebsiteContent = {
  logo: string;
  story: string;
  socialLinks: SocialLink[];
  address: AddressInfo;
  hours: DayHours[];
  holidays: Holiday[];
};
