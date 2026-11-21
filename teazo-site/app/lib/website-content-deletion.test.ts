import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { DEFAULT_WEBSITE_CONTENT, deleteWebsiteContentEntry, getWebsiteContent, updateWebsiteContent, WebsiteContentConflictError, WebsiteContentUnavailableError } from "./website-content";
import { MAX_SOCIAL_LINKS, MAX_HOLIDAYS } from "./website-content-validators";

vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);

beforeEach(() => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  sqliteD1.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("website content removal (TZ-234, TZ-237, TZ-241, TZ-242)", () => {
  it.each(["holidays", "socialLinks"] as const)("rejects a missing %s target without changing data or revision", async (collection) => {
    const before = await getWebsiteContent();
    await expect(deleteWebsiteContentEntry(collection, "missing", before.collectionsRevision!))
      .rejects.toThrow("no longer exists");
    expect(await getWebsiteContent()).toEqual(before);
  });

  it("keeps a repeated holiday deletion a missing-target no-op, even with a stale revision", async () => {
    await updateWebsiteContent({ collectionsRevision: 0, holidays: [
      { id: "christmas", name: "Christmas", date: "12-25", closed: true },
    ] });
    await deleteWebsiteContentEntry("holidays", "12-25", 1);
    await expect(deleteWebsiteContentEntry("holidays", "12-25", 1)).rejects.toThrow("no longer exists");
    expect((await getWebsiteContent()).collectionsRevision).toBe(2);
    expect((await getWebsiteContent()).holidays).toEqual([]);
  });

  it("rolls back a stale holiday deletion when its target still exists", async () => {
    await updateWebsiteContent({ collectionsRevision: 0, holidays: [
      { id: "christmas", name: "Christmas", date: "12-25", closed: true },
    ] });
    const before = await getWebsiteContent();
    await expect(deleteWebsiteContentEntry("holidays", "12-25", 0)).rejects.toBeInstanceOf(WebsiteContentConflictError);
    expect(await getWebsiteContent()).toEqual(before);
  });

  it("rolls back the holiday revision claim when deletion fails", async () => {
    await updateWebsiteContent({ collectionsRevision: 0, holidays: [
      { id: "christmas", name: "Christmas", date: "12-25", closed: true },
    ] });
    const before = await getWebsiteContent();
    sqliteD1.db.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON hours_exception
      BEGIN SELECT RAISE(ABORT, 'simulated database failure'); END;`);
    await expect(deleteWebsiteContentEntry("holidays", "12-25", 1)).rejects.toThrow("simulated database failure");
    expect(await getWebsiteContent()).toEqual(before);
  });

  it("deletes one social entry from storage and public content, preserving delivery links", async () => {
    const before = await getWebsiteContent();
    await deleteWebsiteContentEntry("socialLinks", "facebook", before.collectionsRevision!);
    expect(sqliteD1.db.prepare("SELECT key FROM site_link WHERE key = 'facebook'").get()).toBeUndefined();
    const after = await getWebsiteContent();
    expect(after.socialLinks.some((link) => link.id === "facebook")).toBe(false);
    expect(after.deliveryLinks).toEqual(before.deliveryLinks);
    expect(after.collectionsRevision).toBe(1);
  });

  it("keeps empty collections empty after the final entries are deleted", async () => {
    const before = await getWebsiteContent();
    await updateWebsiteContent({ socialLinks: [], holidays: [], collectionsRevision: before.collectionsRevision });
    expect(sqliteD1.db.prepare("SELECT count(*) AS n FROM site_link WHERE link_group = 'social'").get()).toEqual({ n: 0 });
    expect(sqliteD1.db.prepare("SELECT count(*) AS n FROM hours_exception").get()).toEqual({ n: 0 });
    const after = await getWebsiteContent();
    expect(after.socialLinks).toEqual([]);
    expect(after.holidays).toEqual([]);
  });

  it("deletes a holiday by date without changing other exceptions", async () => {
    await updateWebsiteContent({ collectionsRevision: 0, holidays: [
      { id: "a", name: "Christmas", date: "12-25", closed: true },
      { id: "b", name: "One time", date: "2026-11-26", closed: true },
    ] });
    await deleteWebsiteContentEntry("holidays", "12-25", 1);
    expect((await getWebsiteContent()).holidays).toEqual([
      expect.objectContaining({ date: "2026-11-26" }),
    ]);
  });

  it("allows only one simultaneous request with the same revision", async () => {
    const results = await Promise.allSettled([
      deleteWebsiteContentEntry("socialLinks", "facebook", 0),
      deleteWebsiteContentEntry("socialLinks", "instagram", 0),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(WebsiteContentConflictError);
    expect((await getWebsiteContent()).socialLinks.some((link) => link.id === "instagram")).toBe(true);
  });

  it("rejects a stale bulk save so a deleted entry cannot be resurrected", async () => {
    const stale = await getWebsiteContent();
    await deleteWebsiteContentEntry("socialLinks", "facebook", 0);
    await expect(updateWebsiteContent({ socialLinks: stale.socialLinks, collectionsRevision: 0 }))
      .rejects.toBeInstanceOf(WebsiteContentConflictError);
    expect((await getWebsiteContent()).socialLinks.some((link) => link.id === "facebook")).toBe(false);
  });

  it("rolls back the revision and deletion when the database rejects the write", async () => {
    sqliteD1.db.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON site_link
      BEGIN SELECT RAISE(ABORT, 'simulated database failure'); END;`);
    await expect(deleteWebsiteContentEntry("socialLinks", "facebook", 0)).rejects.toThrow("simulated database failure");
    expect((await getWebsiteContent()).collectionsRevision).toBe(0);
    expect((await getWebsiteContent()).socialLinks.some((link) => link.id === "facebook")).toBe(true);
  });

  it("does not report a persistent deletion when storage is unconfigured", async () => {
    delete process.env.D1_PROXY_URL;
    await expect(deleteWebsiteContentEntry("socialLinks", "facebook", 0)).rejects.toThrow("storage is unavailable");
  });

  it.each([{ story: "Updated story" }, { address: { ...DEFAULT_WEBSITE_CONTENT.address } }, { socialLinks: [] }, { holidays: [] }])(
    "rejects every content write consistently when storage is unconfigured: %j", async (patch) => {
      delete process.env.D1_PROXY_URL;
      await expect(updateWebsiteContent(patch)).rejects.toThrow("storage is unavailable");
    },
  );

  it("does not publish a failed collection update and throws when storage is unconfigured", async () => {
    const before = await getWebsiteContent();
    sqliteD1.db.exec(`CREATE TRIGGER fail_save BEFORE DELETE ON site_link
      BEGIN SELECT RAISE(ABORT, 'simulated database failure'); END;`);
    await expect(updateWebsiteContent({ socialLinks: [], collectionsRevision: 0 })).rejects.toThrow();
    delete process.env.D1_PROXY_URL;
    await expect(getWebsiteContent()).rejects.toBeInstanceOf(WebsiteContentUnavailableError);
    process.env.D1_PROXY_URL = "http://d1.test";
    expect((await getWebsiteContent()).socialLinks).toEqual(before.socialLinks);
  });
});

describe("Phase 5 collection capacity and atomic transaction budgets in storage", () => {
  it("commits the largest supported combined save atomically", async () => {
    const maxSocial = Array.from({ length: MAX_SOCIAL_LINKS }, (_, i) => ({
      id: `social-${i + 1}`,
      label: `Social ${i + 1}`,
      icon: "",
      url: `https://example.com/social-${i + 1}`,
      enabled: true,
    }));

    const maxHolidays = Array.from({ length: MAX_HOLIDAYS }, (_, i) => ({
      id: `holiday-${i + 1}`,
      name: `Holiday ${i + 1}`,
      date: `08-${String(i + 1).padStart(2, "0")}`,
      closed: true,
    }));

    const fullPatch = {
      collectionsRevision: 0,
      story: "Authoritative story from combined save",
      logo: "/images/custom-logo.webp",
      onlineOrderingEnabled: false,
      contactFormEnabled: true,
      address: {
        businessName: "TEAZO Sunset",
        streetAddress: "1050 Taraval St.",
        locality: "San Francisco, CA 94116",
        phone: "+1 (415) 748-7398",
        email: "sunset@teazo.com",
        mapQuery: "1050 Taraval St, San Francisco, CA 94116",
      },
      hours: [
        { day: "Sun", start: 10, end: 21, closed: false },
        { day: "Mon", start: 10, end: 21, closed: false },
        { day: "Tue", start: 10, end: 21, closed: false },
        { day: "Wed", start: 10, end: 21, closed: false },
        { day: "Thu", start: 10, end: 21, closed: false },
        { day: "Fri", start: 10, end: 22, closed: false },
        { day: "Sat", start: 10, end: 22, closed: false },
      ],
      socialLinks: maxSocial,
      holidays: maxHolidays,
    };

    const updated = await updateWebsiteContent(fullPatch);
    expect(updated.collectionsRevision).toBe(1);
    expect(updated.story).toBe("Authoritative story from combined save");
    expect(updated.logo).toBe("/images/custom-logo.webp");
    expect(updated.onlineOrderingEnabled).toBe(false);
    expect(updated.socialLinks).toHaveLength(MAX_SOCIAL_LINKS);
    expect(updated.holidays).toHaveLength(MAX_HOLIDAYS);

    const reloaded = await getWebsiteContent();
    expect(reloaded.collectionsRevision).toBe(1);
    expect(reloaded.story).toBe("Authoritative story from combined save");
    expect(reloaded.logo).toBe("/images/custom-logo.webp");
    expect(reloaded.onlineOrderingEnabled).toBe(false);
    expect(reloaded.address.businessName).toBe("TEAZO Sunset");
    expect(reloaded.socialLinks).toHaveLength(MAX_SOCIAL_LINKS);
    expect(reloaded.holidays).toHaveLength(MAX_HOLIDAYS);
  });

  it("fails atomically when a patch exceeds collection limits and leaves storage untouched", async () => {
    const before = await getWebsiteContent();

    const oversizedSocial = Array.from({ length: MAX_SOCIAL_LINKS + 1 }, (_, i) => ({
      id: `social-${i + 1}`,
      label: `Social ${i + 1}`,
      icon: "",
      url: `https://example.com/social-${i + 1}`,
      enabled: true,
    }));

    await expect(
      updateWebsiteContent({
        collectionsRevision: before.collectionsRevision,
        socialLinks: oversizedSocial,
        story: "Should not be saved",
      }),
    ).rejects.toThrow(`You can add up to ${MAX_SOCIAL_LINKS} social links.`);

    const after = await getWebsiteContent();
    expect(after.collectionsRevision).toBe(before.collectionsRevision);
    expect(after.story).toBe(before.story);
    expect(after.socialLinks).toEqual(before.socialLinks);
  });

  it("preserves legacy stored rows without silent truncation on read", async () => {
    // Directly insert 12 social links into SQLite database to simulate legacy data
    sqliteD1.db.exec("DELETE FROM site_link WHERE link_group = 'social'");
    for (let i = 1; i <= 12; i++) {
      sqliteD1.db.exec(
        `INSERT INTO site_link (key, link_group, label, url, sort_order, is_active)
         VALUES ('legacy-${i}', 'social', 'Platform ${i}', 'https://example.com/${i}', ${i}, 1)`,
      );
    }

    const content = await getWebsiteContent();
    expect(content.socialLinks).toHaveLength(12);
    expect(content.socialLinks.map((l) => l.id)).toContain("legacy-12");
  });
});
