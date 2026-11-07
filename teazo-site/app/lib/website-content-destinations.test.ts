import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { getWebsiteContent, updateWebsiteContent } from "./website-content";
import { PATCH } from "@/app/api/website-content/route";

vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: vi.fn(async () => ({ ok: true, admin: { id: "test-admin", role_id: 1 } })),
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

describe("Phase 3 Social Destinations: Storage and API Write Boundary", () => {
  it("normalizes domain-only destinations to https at the write boundary", async () => {
    const updated = await updateWebsiteContent({
      collectionsRevision: 0,
      socialLinks: [
        {
          id: "instagram",
          label: "Instagram",
          url: "instagram.com/teazosf",
          enabled: true,
          icon: "",
        },
      ],
    });

    expect(updated.socialLinks[0].url).toBe("https://instagram.com/teazosf");

    const row = sqliteD1.db
      .prepare("SELECT url FROM site_link WHERE key = 'instagram'")
      .get() as { url: string };
    expect(row.url).toBe("https://instagram.com/teazosf");

    const readBack = await getWebsiteContent();
    expect(readBack.socialLinks[0].url).toBe("https://instagram.com/teazosf");
  });

  it("normalizes bare email addresses to mailto at the write boundary", async () => {
    const updated = await updateWebsiteContent({
      collectionsRevision: 0,
      socialLinks: [
        {
          id: "custom-email",
          label: "Contact",
          url: "teazosf@hotmail.com",
          enabled: true,
          icon: "",
        },
      ],
    });

    expect(updated.socialLinks[0].url).toBe("mailto:teazosf@hotmail.com");

    const row = sqliteD1.db
      .prepare("SELECT url FROM site_link WHERE key = 'custom-email'")
      .get() as { url: string };
    expect(row.url).toBe("mailto:teazosf@hotmail.com");
  });

  it("trims surrounding whitespace on save", async () => {
    const updated = await updateWebsiteContent({
      collectionsRevision: 0,
      socialLinks: [
        {
          id: "facebook",
          label: "Facebook",
          url: "   https://facebook.com/teazo   ",
          enabled: true,
          icon: "",
        },
      ],
    });

    expect(updated.socialLinks[0].url).toBe("https://facebook.com/teazo");
  });

  it("sanitizes legacy un-normalized database rows on read/hydration", async () => {
    sqliteD1.db.exec("DELETE FROM site_link WHERE link_group = 'social'");
    sqliteD1.db
      .prepare("INSERT INTO site_link (key, link_group, label, url, sort_order, is_active) VALUES (?, 'social', ?, ?, 1, 1)")
      .run("legacy-ig", "Instagram", "instagram.com/teazosf");
    sqliteD1.db
      .prepare("INSERT INTO site_link (key, link_group, label, url, sort_order, is_active) VALUES (?, 'social', ?, ?, 2, 1)")
      .run("legacy-email", "Email", "support@teazo.com");

    const content = await getWebsiteContent();
    const ig = content.socialLinks.find((s) => s.id === "legacy-ig");
    const mail = content.socialLinks.find((s) => s.id === "legacy-email");

    expect(ig?.url).toBe("https://instagram.com/teazosf");
    expect(mail?.url).toBe("mailto:support@teazo.com");
  });

  it("rejects unsupported scheme via PATCH /api/website-content with HTTP 400", async () => {
    const request = new Request("http://localhost:3000/api/website-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionsRevision: 0,
        socialLinks: [
          {
            id: "bad",
            label: "XSS",
            url: "javascript:alert(1)",
            enabled: true,
            icon: "",
          },
        ],
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Unsupported scheme");
    expect(data.error).toContain("javascript:");

    const row = sqliteD1.db
      .prepare("SELECT COUNT(*) as count FROM site_link WHERE key = 'bad'")
      .get() as { count: number };
    expect(row.count).toBe(0);
  });

  it("rejects relative path via PATCH /api/website-content with HTTP 400", async () => {
    const request = new Request("http://localhost:3000/api/website-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionsRevision: 0,
        socialLinks: [
          {
            id: "rel",
            label: "Relative",
            url: "/contact-us",
            enabled: true,
            icon: "",
          },
        ],
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Relative paths are not supported");
  });

  it.each(["https://", "https://.", "https://example..com"])("rejects malformed destination %s via PATCH with HTTP 400", async (url) => {
    const request = new Request("http://localhost:3000/api/website-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionsRevision: 0,
        socialLinks: [
          {
            id: "broken",
            label: "Broken",
            url,
            enabled: true,
            icon: "",
          },
        ],
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    expect((await getWebsiteContent()).collectionsRevision).toBe(0);
  });

  it("keeps numeric email destinations valid after saving and reloading through the API", async () => {
    const save = (url: string, collectionsRevision: number) => PATCH(new Request("http://localhost:3000/api/website-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionsRevision,
        socialLinks: [{ id: "numeric-email", label: "Support", url, enabled: true, icon: "" }],
      }),
    }));

    expect((await save("123support@example.com", 0)).status).toBe(200);
    const reloaded = await getWebsiteContent();
    expect(reloaded.socialLinks[0].url).toBe("mailto:123support@example.com");
    expect((await save(reloaded.socialLinks[0].url, reloaded.collectionsRevision!)).status).toBe(200);
    const row = sqliteD1.db.prepare("SELECT url FROM site_link WHERE key = 'numeric-email'").get() as { url: string };
    expect(row.url).toBe("mailto:123support@example.com");
  });

  it("accepts domain-only destination via PATCH /api/website-content and returns normalized content", async () => {
    const request = new Request("http://localhost:3000/api/website-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collectionsRevision: 0,
        socialLinks: [
          {
            id: "instagram",
            label: "Instagram",
            url: "instagram.com/teazosf",
            enabled: true,
            icon: "",
          },
        ],
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.socialLinks[0].url).toBe("https://instagram.com/teazosf");
  });
});
