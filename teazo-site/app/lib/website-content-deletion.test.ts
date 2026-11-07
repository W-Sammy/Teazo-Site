import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { DEFAULT_WEBSITE_CONTENT, deleteWebsiteContentEntry, getWebsiteContent, updateWebsiteContent, WebsiteContentConflictError, WebsiteContentUnavailableError } from "./website-content";

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
