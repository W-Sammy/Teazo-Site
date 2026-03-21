export type ContactHour = {
  day: string;
  hours: string;
};

// Route-local content shape for the contact page. If this route later moves to
// an admin dashboard or CMS, this type is the contract to preserve.
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
};

// Keep the page content in one route-local module so it can later be swapped
// for admin-dashboard or CMS data without rewriting the contact layout.
export const contactContent: ContactContent = {
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
    { day: "Monday", hours: "11:00 AM - 8:00 PM" },
    { day: "Tuesday", hours: "11:00 AM - 6:00 PM" },
    { day: "Wednesday", hours: "11:00 AM - 8:00 PM" },
    { day: "Thursday", hours: "11:00 AM - 8:00 PM" },
    { day: "Friday", hours: "11:00 AM - 10:00 PM" },
    { day: "Saturday", hours: "11:00 AM - 10:00 PM" },
    { day: "Sunday", hours: "11:00 AM - 8:00 PM" },
  ],
};

// Google Maps embed URL for the iframe on the left side of the contact card.
export const mapEmbedSrc = `https://www.google.com/maps?q=${encodeURIComponent(
  contactContent.location.mapQuery,
)}&z=15&output=embed`;

// Direct directions link used by the CTA in the contact details column.
export const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  contactContent.location.mapQuery,
)}`;
