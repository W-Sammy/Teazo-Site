import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sqliteD1 } from "@/test/sqlite-d1";
import { deleteWebsiteContentEntry, getWebsiteContent, updateWebsiteContent } from "@/app/lib/website-content";
import Home from "./page";
import ContactPage from "./contact/page";
import Delivery from "./delivery/page";

vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "font" }), Cabin_Sketch: () => ({ className: "font" }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/app/components/bubble-field", () => ({ BubbleField: () => null }));
vi.mock("./components/image-carousel", () => ({ default: () => null }));
vi.mock("./components/live-events-sidebar", () => ({ default: () => null }));
vi.mock("./contact/contact-form", () => ({ default: () => null }));
vi.mock("@/app/lib/queries/events", () => ({ listActiveEvents: async () => [] }));

beforeEach(() => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  sqliteD1.reset();
});
afterEach(() => vi.restoreAllMocks());

describe("deleted entries on public pages (TZ-242)", () => {
  it.each([Home, ContactPage])("removes a deleted social link from rendered %s", async (Page) => {
    expect(renderToStaticMarkup(await Page())).toContain("TEAZO on Facebook");
    await deleteWebsiteContentEntry("socialLinks", "facebook", 0);
    const html = renderToStaticMarkup(await Page());
    expect(html).not.toContain("TEAZO on Facebook");
    expect(html).not.toContain("https://www.facebook.com/people/TEAZO/");
    expect(html).toContain("TEAZO on Instagram");
  });

  it("renders no social buttons after deleting the last social link", async () => {
    for (const link of (await getWebsiteContent()).socialLinks) {
      const revision = (await getWebsiteContent()).collectionsRevision!;
      await deleteWebsiteContentEntry("socialLinks", link.id, revision);
    }
    for (const Page of [Home, ContactPage]) {
      const html = renderToStaticMarkup(await Page());
      expect(html).not.toMatch(/TEAZO on (Facebook|Instagram|Yelp)/);
      expect(html).toContain("Email TEAZO");
    }
  });

  it.each([Home, ContactPage])("hides enabled social entries with empty destinations in %s", async (Page) => {
    sqliteD1.db.exec("UPDATE site_link SET url = '   ' WHERE key = 'facebook'");
    const html = renderToStaticMarkup(await Page());
    expect(html).not.toContain("TEAZO on Facebook");
    expect(html).toContain("TEAZO on Instagram");
  });

  it.each([Home, ContactPage])("renders newly added social platforms in %s", async (Page) => {
    sqliteD1.db.prepare("INSERT INTO site_link (key, link_group, label, url) VALUES (?, 'social', ?, ?)")
      .run("social-custom-id", "TikTok", "https://tiktok.com/@teazo");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("TEAZO on TikTok");
    expect(html).toContain('href="https://tiktok.com/@teazo"');
    expect(html).not.toContain("teazo_social-custom-id_icon.svg");
  });

  it.each([Home, ContactPage])("safely navigates legacy domain-only social links to external https URL without broken relative paths", async (Page) => {
    sqliteD1.db.exec("UPDATE site_link SET url = 'instagram.com/teazosf' WHERE key = 'instagram'");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('href="https://instagram.com/teazosf"');
    expect(html).not.toMatch(/href="instagram\.com\/teazosf"/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it.each([Home, ContactPage])("sanitizes legacy unsupported schemes and omits them from rendered HTML", async (Page) => {
    sqliteD1.db.prepare("INSERT INTO site_link (key, link_group, label, url) VALUES (?, 'social', ?, ?)")
      .run("xss-link", "Malicious", "javascript:alert(1)");
    const html = renderToStaticMarkup(await Page());
    expect(html).not.toContain("TEAZO on Malicious");
    expect(html).not.toContain("javascript:alert(1)");
  });

  it.each([Home, ContactPage])("renders email social destinations without opening a blank target", async (Page) => {
    sqliteD1.db.prepare("INSERT INTO site_link (key, link_group, label, url) VALUES (?, 'social', ?, ?)")
      .run("email-link", "Customer Support", "mailto:support@teazo.com");
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('href="mailto:support@teazo.com"');
    const mailtoAnchor = html.match(/<a[^>]*href="mailto:support@teazo\.com"[^>]*>/)?.[0];
    expect(mailtoAnchor).toBeDefined();
    expect(mailtoAnchor).not.toContain('target="_blank"');
  });

  it.each([Home, ContactPage])("renders a saved numeric email destination after reloading", async (Page) => {
    await updateWebsiteContent({
      collectionsRevision: 0,
      socialLinks: [{ id: "numeric-email", label: "Support", url: "123support@example.com", enabled: true, icon: "" }],
    });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain('href="mailto:123support@example.com"');
    expect(html).toContain("TEAZO on Support");
  });

  it.each(["https://.", "https://example..com"])("omits legacy malformed destination %s from public pages", async (url) => {
    sqliteD1.db.prepare("INSERT INTO site_link (key, link_group, label, url) VALUES (?, 'social', ?, ?)")
      .run("broken-host", "Broken Host", url);
    for (const Page of [Home, ContactPage]) {
      const html = renderToStaticMarkup(await Page());
      expect(html).not.toContain("TEAZO on Broken Host");
    }
  });

  it("does not resurrect removed delivery links in the loader or rendered page", async () => {
    sqliteD1.db.exec("DELETE FROM site_link WHERE link_group = 'delivery'");
    expect((await getWebsiteContent()).deliveryLinks).toEqual([]);
    const html = renderToStaticMarkup(await Delivery());
    expect(html).not.toMatch(/href="https:\/\/www\.(ubereats|doordash)\.com/);
    expect(html).not.toContain('href="https://postmates.com');
  });

  it("reads the homepage's website content once", async () => {
    const read = vi.spyOn(sqliteD1.module, "prepare");
    await Home();
    expect(read.mock.calls.filter(([sql]) => sql.includes("FROM website_content_revision"))).toHaveLength(1);
  });
});
