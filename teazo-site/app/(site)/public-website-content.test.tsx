/**
 * Tests customer-facing website content rendering.
 *
 * Verifies that Home, Contact, and Delivery pages use
 * administrator-managed content correctly.
 *
 * Data queries and child components are mocked.
 * No production data or external services are accessed.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";

import type {
  CarouselImage,
  ContactContent,
  WebsiteContent,
} from "@/app/types/website-content";

const mocks = vi.hoisted(() => ({
  getWebsiteContent: vi.fn(),
  getContactContent: vi.fn(),
  listActiveEvents: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
  Cabin_Sketch: () => ({ className: "test-cabin" }),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      role="img"
      aria-label={alt}
      data-src={src}
    />
  ),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/app/components/bubble-field", () => ({
  BubbleField: () => null,
}));

vi.mock("@/app/(site)/components/sub-title", () => ({
  default: ({ text }: { text: string }) => (
    <span>{text}</span>
  ),
}));

vi.mock("@/app/components/general-button", () => ({
  default: ({
    text,
    href,
  }: {
    text: string;
    href: string;
  }) => (
    <a href={href}>{text}</a>
  ),
}));

vi.mock("@/app/(site)/components/image-carousel", () => ({
  default: ({
    images,
  }: {
    images: CarouselImage[];
  }) => (
    <div data-testid="public-carousel">
      {images.map((image) => (
        <span key={image.id}>{image.alt}</span>
      ))}
    </div>
  ),
}));

vi.mock(
  "@/app/(site)/components/live-events-sidebar",
  () => ({
    default: ({ events }: { events: unknown[] }) => (
      <div
        data-testid="live-events"
        data-count={events.length}
      />
    ),
  }),
);

vi.mock("@/app/(site)/contact/contact-form", () => ({
  default: ({
    fallbackEmail,
  }: {
    fallbackEmail: string;
  }) => (
    <div data-testid="public-contact-form">
      {fallbackEmail}
    </div>
  ),
}));

vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: mocks.getWebsiteContent,
}));

vi.mock(
  "@/app/(site)/contact/contact-content",
  () => ({
    getContactContent: mocks.getContactContent,
  }),
);

vi.mock("@/app/lib/queries/events", () => ({
  listActiveEvents: mocks.listActiveEvents,
}));

import HomePage from "./page";
import ContactPage from "./contact/page";
import DeliveryPage from "./delivery/page";

function makeWebsiteContent(): WebsiteContent {
  return {
    logo: "/TEAZO_logo.svg",
    story: "Original TEAZO story",
    socialLinks: [
      {
        id: "facebook",
        label: "Facebook",
        icon: "",
        url: "https://facebook.com/example",
        enabled: true,
      },
      {
        id: "instagram",
        label: "Instagram",
        icon: "",
        url: "https://instagram.com/example",
        enabled: true,
      },
      {
        id: "yelp",
        label: "Yelp",
        icon: "",
        url: "https://yelp.com/biz/example",
        enabled: true,
      },
    ],
    deliveryLinks: [
      {
        id: "ubereats",
        label: "Uber Eats",
        icon: "",
        url: "https://ubereats.com/store/updated",
        enabled: true,
      },
      {
        id: "doordash",
        label: "DoorDash",
        icon: "",
        url: "https://doordash.com/store/updated",
        enabled: true,
      },
      {
        id: "postmates",
        label: "Postmates",
        icon: "",
        url: "https://postmates.com/store/updated",
        enabled: true,
      },
    ],
    address: {
      businessName: "TEAZO",
      streetAddress: "1050 Taraval St",
      locality: "San Francisco, CA 94116",
      phone: "+1 (415) 748-7398",
      email: "original@example.invalid",
      mapQuery: "1050 Taraval St, San Francisco",
    },
    hours: [],
    holidays: [],
    carouselImages: [],
    contactFormEnabled: true,
    onlineOrderingEnabled: true,
  };
}

function makeContactContent(): ContactContent {
  return {
    logo: "/TEAZO_logo.svg",
    location: {
      businessName: "TEAZO",
      streetAddress: "1050 Taraval St",
      locality: "San Francisco, CA 94116",
      phone: "+1 (415) 748-7398",
      email: "contact@example.invalid",
      mapQuery: "1050 Taraval St, San Francisco",
    },
    hours: [
      {
        day: "Monday",
        hours: "11:00 AM - 8:00 PM",
      },
    ],
    socialLinks: makeWebsiteContent().socialLinks,
    contactFormEnabled: true,
  };
}

async function renderHome() {
  return render(await HomePage());
}

async function renderContact() {
  return render(await ContactPage());
}

async function renderDelivery() {
  return render(await DeliveryPage());
}

describe("Public website content rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getWebsiteContent.mockResolvedValue(
      makeWebsiteContent(),
    );

    mocks.getContactContent.mockResolvedValue(
      makeContactContent(),
    );

    mocks.listActiveEvents.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("Home page", () => {
    it("renders updated story paragraphs and logo", async () => {
      const content = makeWebsiteContent();

      content.story =
        "Freshly brewed tea.\nMade with care.";

      content.logo =
        "https://images.example.invalid/new-logo.webp";

      mocks.getWebsiteContent.mockResolvedValueOnce(
        content,
      );

      await renderHome();

      expect(
        screen.getByText("Freshly brewed tea."),
      ).toBeTruthy();

      expect(
        screen.getByText("Made with care."),
      ).toBeTruthy();

      expect(
        screen.getByRole("img", {
          name: "TEAZO logo",
        }).getAttribute("data-src"),
      ).toBe(content.logo);
    });

    it("renders the updated homepage carousel", async () => {
      const content = makeWebsiteContent();

      content.carouselImages = [
        {
          id: "carousel-1",
          src: "/carousel_images/test-one.jpg",
          alt: "Fresh tea leaves",
          enabled: true,
        },
        {
          id: "carousel-2",
          src: "/carousel_images/test-two.jpg",
          alt: "Prepared milk tea",
          enabled: true,
        },
      ];

      mocks.getWebsiteContent.mockResolvedValueOnce(
        content,
      );

      await renderHome();

      const carousel = screen.getByTestId(
        "public-carousel",
      );

      expect(
        within(carousel).getByText(
          "Fresh tea leaves",
        ),
      ).toBeTruthy();

      expect(
        within(carousel).getByText(
          "Prepared milk tea",
        ),
      ).toBeTruthy();
    });

    it("uses administrator-managed social links and email", async () => {
      await renderHome();

      expect(
        screen.getByRole("link", {
          name: "TEAZO on Instagram",
        }).getAttribute("href"),
      ).toBe("https://instagram.com/example");

      expect(
        screen.getByRole("link", {
          name: "TEAZO on Facebook",
        }).getAttribute("href"),
      ).toBe("https://facebook.com/example");

      expect(
        screen.getByRole("link", {
          name: "Email TEAZO",
        }).getAttribute("href"),
      ).toBe("mailto:original@example.invalid");
    });

    it("hides social links disabled in contact settings", async () => {
      const contact = makeContactContent();

      contact.socialLinks =
        contact.socialLinks?.map((link) => ({
          ...link,
          enabled: false,
        }));

      mocks.getContactContent.mockResolvedValueOnce(
        contact,
      );

      await renderHome();

      expect(
        screen.queryByRole("link", {
          name: "TEAZO on Instagram",
        }),
      ).toBeNull();

      expect(
        screen.queryByRole("link", {
          name: "TEAZO on Facebook",
        }),
      ).toBeNull();

      expect(
        screen.queryByRole("link", {
          name: "TEAZO on Yelp",
        }),
      ).toBeNull();
    });

    it("remains available if optional events cannot load", async () => {
      mocks.listActiveEvents.mockRejectedValueOnce(
        new Error("Events unavailable"),
      );

      await renderHome();

      expect(
        screen.getByText("Original TEAZO story"),
      ).toBeTruthy();

      expect(
        screen.getByTestId(
          "live-events",
        ).getAttribute("data-count"),
      ).toBe("0");
    });
  });

  describe("Contact page", () => {
    it("displays updated location and business hours", async () => {
      const contact = makeContactContent();

      contact.location.streetAddress =
        "123 Updated Street";

      contact.hours = [
        {
          day: "Monday",
          hours: "10:00 AM - 6:00 PM",
        },
      ];

      contact.logo =
        "https://images.example.invalid/contact-logo.webp";

      mocks.getContactContent.mockResolvedValueOnce(
        contact,
      );

      await renderContact();

      expect(
        screen.getByText("123 Updated Street"),
      ).toBeTruthy();

      expect(
        screen.getByText("10:00 AM - 6:00 PM"),
      ).toBeTruthy();

      expect(
        screen.getByRole("img", {
          name: "TEAZO logo",
        }).getAttribute("data-src"),
      ).toBe(contact.logo);
    });

    it("uses updated map directions and contact information", async () => {
      const contact = makeContactContent();

      contact.location.mapQuery =
        "123 Updated Street, San Francisco";

      contact.location.email =
        "updated@example.invalid";

      mocks.getContactContent.mockResolvedValueOnce(
        contact,
      );

      await renderContact();

      expect(
        screen.getByRole("link", {
          name: "Get Directions",
        }).getAttribute("href"),
      ).toContain(
        encodeURIComponent(
          "123 Updated Street, San Francisco",
        ),
      );

      expect(
        screen.getByRole("link", {
          name: "updated@example.invalid",
        }).getAttribute("href"),
      ).toBe("mailto:updated@example.invalid");
    });

    it("hides the public contact form when disabled", async () => {
      const contact = makeContactContent();

      contact.contactFormEnabled = false;

      mocks.getContactContent.mockResolvedValueOnce(
        contact,
      );

      await renderContact();

      expect(
        screen.queryByTestId("public-contact-form"),
      ).toBeNull();
    });

    it("shows the public contact form when enabled", async () => {
      await renderContact();

      expect(
        screen.getByTestId(
          "public-contact-form",
        ).textContent,
      ).toBe("contact@example.invalid");
    });
  });

  describe("Delivery page", () => {
    it("displays updated delivery links and logo", async () => {
      const content = makeWebsiteContent();

      content.logo =
        "https://images.example.invalid/delivery-logo.webp";

      mocks.getWebsiteContent.mockResolvedValueOnce(
        content,
      );

      await renderDelivery();

      expect(
        screen.getByRole("img", {
          name: "TEAZO logo",
        }).getAttribute("data-src"),
      ).toBe(content.logo);

      expect(
        screen.getByRole("link", {
          name: "UBER EATS",
        }).getAttribute("href"),
      ).toBe(
        "https://ubereats.com/store/updated",
      );

      expect(
        screen.getByRole("link", {
          name: "DOORDASH",
        }).getAttribute("href"),
      ).toBe(
        "https://doordash.com/store/updated",
      );

      expect(
        screen.getByRole("link", {
          name: "POSTMATES",
        }).getAttribute("href"),
      ).toBe(
        "https://postmates.com/store/updated",
      );
    });

    it("uses the existing fallback links when delivery settings are missing", async () => {
      const content = makeWebsiteContent();

      content.deliveryLinks = [];

      mocks.getWebsiteContent.mockResolvedValueOnce(
        content,
      );

      await renderDelivery();

      expect(
        screen.getByRole("link", {
          name: "UBER EATS",
        }).getAttribute("href"),
      ).toContain("ubereats.com");

      expect(
        screen.getByRole("link", {
          name: "DOORDASH",
        }).getAttribute("href"),
      ).toContain("doordash.com");

      expect(
        screen.getByRole("link", {
          name: "POSTMATES",
        }).getAttribute("href"),
      ).toContain("postmates.com");
    });
  });
});
