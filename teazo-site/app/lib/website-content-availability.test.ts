import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import {
  getWebsiteContent,
  getPublicWebsiteContent,
  getContactContent,
  updateWebsiteContent,
  WebsiteContentUnavailableError,
} from "./website-content";
import Home from "@/app/(site)/page";
import ContactPage from "@/app/(site)/contact/page";
import Delivery from "@/app/(site)/delivery/page";
import AdminWebsiteContentPage from "@/app/admin/website-content/page";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "font" }),
  Cabin_Sketch: () => ({ className: "font" }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }),
}));
vi.mock("@/app/components/bubble-field", () => ({ BubbleField: () => null }));
vi.mock("@/app/(site)/components/image-carousel", () => ({ default: () => null }));
vi.mock("@/app/(site)/components/live-events-sidebar", () => ({ default: () => null }));
vi.mock("@/app/(site)/contact/contact-form", () => ({ default: () => null }));
vi.mock("@/app/lib/queries/events", () => ({ listActiveEvents: async () => [] }));
vi.mock("@/app/lib/admin", () => ({
  requireAdminPage: async () => ({ id: 1, role: 1 }),
}));

beforeEach(() => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  sqliteD1.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Website content availability and storage failure policy (Phase 2)", () => {
  describe("Authoritative loader strictness and outage detection", () => {
    it("throws WebsiteContentUnavailableError when storage is unconfigured", async () => {
      delete process.env.D1_PROXY_URL;
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
      await expect(getWebsiteContent()).rejects.toThrow("storage is unconfigured");
    });

    it("throws WebsiteContentUnavailableError when PROXY_TOKEN is missing", async () => {
      delete process.env.PROXY_TOKEN;
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
    });

    it("throws WebsiteContentUnavailableError when migration 0012 revision row is missing", async () => {
      sqliteD1.db.exec("DELETE FROM website_content_revision WHERE id = 1");
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
      await expect(getWebsiteContent()).rejects.toThrow("revision is unavailable");
    });

    it("throws WebsiteContentUnavailableError when database queries fail", async () => {
      sqliteD1.db.exec("DROP TABLE business_hours");
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
    });

    it("does not fall back to in-memory defaults on a fresh or subsequent read during an outage", async () => {
      // First verify a healthy read works
      const healthy = await getWebsiteContent();
      expect(healthy.collectionsRevision).toBeDefined();

      // Trigger outage
      delete process.env.D1_PROXY_URL;
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
      // Repeated call must also fail, not return a cached or default object
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
    });

    it("preserves stored contact_form_enabled = 0 and does not re-enable contact form", async () => {
      sqliteD1.db.exec("UPDATE business_profile SET contact_form_enabled = 0 WHERE id = 1");
      const content = await getWebsiteContent();
      expect(content.contactFormEnabled).toBe(false);
    });

    it("throws WebsiteContentUnavailableError on business_profile query failure without substituting contact_form_enabled = true", async () => {
      sqliteD1.db.exec("DROP TABLE business_profile");
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
    });
  });

  describe("Distinguishing healthy empty collections from database failures", () => {
    it("preserves empty social and holiday collections as successful healthy content", async () => {
      const before = await getWebsiteContent();
      await updateWebsiteContent({
        socialLinks: [],
        holidays: [],
        collectionsRevision: before.collectionsRevision,
      });

      const healthyEmpty = await getWebsiteContent();
      expect(healthyEmpty.socialLinks).toEqual([]);
      expect(healthyEmpty.holidays).toEqual([]);
      expect(healthyEmpty.collectionsRevision).toBe(before.collectionsRevision! + 1);
    });

    it("distinguishes empty collections from a database failure by throwing on failure", async () => {
      delete process.env.D1_PROXY_URL;
      await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
    });
  });

  describe("Public-facing outage presentation", () => {
    it("omits mutable links (socialLinks, deliveryLinks) when storage is unavailable", async () => {
      delete process.env.D1_PROXY_URL;
      const content = await getPublicWebsiteContent();
      expect(content.socialLinks).toEqual([]);
      expect(content.deliveryLinks).toEqual([]);
      expect(content.onlineOrderingEnabled).toBe(false);
      expect(content.contactFormEnabled).toBe(false);
    });

    it("identifies unavailable hours and omits social links in ContactContent during outage", async () => {
      delete process.env.D1_PROXY_URL;
      const contact = await getContactContent();
      expect(contact.socialLinks).toEqual([]);
      expect(contact.contactFormEnabled).toBe(false);
      expect(contact.hours).toHaveLength(7);
      for (const entry of contact.hours) {
        expect(entry.hours).toBe("Temporarily unavailable");
        expect(entry.isHoliday).toBe(false);
      }
    });

    it("renders Home without mutable social links during a storage outage", async () => {
      delete process.env.D1_PROXY_URL;
      const html = renderToStaticMarkup(await Home());
      expect(html).not.toMatch(/TEAZO on (Facebook|Instagram|Yelp)/);
      expect(html).toContain("Email TEAZO");
    });

    it("renders Contact with 'Temporarily unavailable' hours and without social links during outage", async () => {
      delete process.env.D1_PROXY_URL;
      const html = renderToStaticMarkup(await ContactPage());
      expect(html).not.toMatch(/TEAZO on (Facebook|Instagram|Yelp)/);
      expect(html).toContain("Temporarily unavailable");
      // Form should be omitted during outage
      expect(html).not.toContain('id="contact-us"');
    });

    it("renders Delivery with no delivery partner buttons during an outage", async () => {
      delete process.env.D1_PROXY_URL;
      const html = renderToStaticMarkup(await Delivery());
      expect(html).not.toMatch(/href="https:\/\/www\.(ubereats|doordash)\.com/);
      expect(html).not.toContain('href="https://postmates.com');
    });
  });

  describe("Admin screen unavailable state during outage", () => {
    it("renders the actionable unavailable state with Retry button when storage fails", async () => {
      delete process.env.D1_PROXY_URL;
      const element = await AdminWebsiteContentPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);

      expect(html).toContain("Content Storage Unavailable");
      expect(html).toContain("Retry");
      expect(html).toContain("editing is paused");
      // Ensure the actual editing form/accordion is NOT rendered
      expect(html).not.toContain("Online Ordering");
      expect(html).not.toContain("Holiday Exceptions");
    });

    it("renders the normal editing client when storage is healthy", async () => {
      const element = await AdminWebsiteContentPage({ searchParams: Promise.resolve({}) });
      const html = renderToStaticMarkup(element);

      expect(html).not.toContain("Content Storage Unavailable");
      expect(html).toContain("Website Content");
      expect(html).toContain("Online Ordering");
    });
  });
});
