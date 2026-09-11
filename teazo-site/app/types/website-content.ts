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

export type WebsiteContent = {
  logo: string;
  story: string;
  socialLinks: SocialLink[];
  address: AddressInfo;
  hours: DayHours[];
  holidays: Holiday[];
};
