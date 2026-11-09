import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeD1 } from "@/test/fake-d1";
import {
  getWebsiteContent,
  updateWebsiteContent,
  WEBSITE_CONTENT_TAG,
} from "@/app/lib/website-content";

vi.mock("@/app/lib/d1", async () => (await import("@/test/fake-d1")).fakeD1.module);

// Next's cache only exists inside a Next server. Here unstable_cache passes
// straight through, unless a test sets `staleCopy` to stand in for a cached
// value from before a save.
const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  staleCopy: null as unknown,
}));
vi.mock("next/cache", () => ({
  revalidateTag: cacheMocks.revalidateTag,
  revalidatePath: vi.fn(),
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>) =>
    (...args: unknown[]) =>
      cacheMocks.staleCopy !== null ? Promise.resolve(cacheMocks.staleCopy) : fn(...args),
}));

const db = () => fakeD1;

beforeEach(() => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  db().reset();
  cacheMocks.revalidateTag.mockClear();
  cacheMocks.staleCopy = null;
});

describe("caching (TZ-515)", () => {
  it("clears the cached content right after a save, with no stale window", async () => {
    await updateWebsiteContent({ onlineOrderingEnabled: false });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(WEBSITE_CONTENT_TAG, { expire: 0 });
  });

  it("keeps the cache when a save fails", async () => {
    db().state.batchError = new Error("D1 refused the write");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(updateWebsiteContent({ onlineOrderingEnabled: false })).rejects.toThrow("refused");
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("builds a save on what is in D1 now, not on a cached copy", async () => {
    db().tables.content_block = [{ key: "home.story", value: "Story saved in D1" }];
    cacheMocks.staleCopy = { ...(await getWebsiteContent()), story: "Stale cached story" };
    const saved = await updateWebsiteContent({ onlineOrderingEnabled: false });
    expect(saved.story).toBe("Story saved in D1");
  });

  it("serves the fallback when D1 fails, then the real content once D1 is back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db().tables.content_block = [{ key: "home.story", value: "From D1" }];
    db().state.failReads = true;
    const duringOutage = await getWebsiteContent();
    expect(duringOutage.story).not.toBe("From D1");

    db().state.failReads = false;
    expect((await getWebsiteContent()).story).toBe("From D1");
  });

  it("reads all five tables for one load", async () => {
    await getWebsiteContent();
    expect(db().state.reads).toBe(5);
  });
});

describe("online ordering switch", () => {
  it("is on when no setting has been saved", async () => {
    expect((await getWebsiteContent()).onlineOrderingEnabled).toBe(true);
  });

  it("reads off and on from content_block", async () => {
    db().tables.content_block = [{ key: "site.online_ordering", value: "off" }];
    expect((await getWebsiteContent()).onlineOrderingEnabled).toBe(false);
    db().tables.content_block = [{ key: "site.online_ordering", value: "on" }];
    expect((await getWebsiteContent()).onlineOrderingEnabled).toBe(true);
  });

  it("saves the switch as a content_block row", async () => {
    await updateWebsiteContent({ onlineOrderingEnabled: false });
    const writes = db().batches.flat();
    const row = writes.find((w) => w.sql.includes("INSERT INTO content_block"));
    expect(row?.params).toEqual(["site.online_ordering", "off"]);
  });

  it("refuses a value that is not true or false", async () => {
    await expect(
      updateWebsiteContent({ onlineOrderingEnabled: "no" as unknown as boolean }),
    ).rejects.toThrow("onlineOrderingEnabled");
  });
});

describe("holiday dates from D1", () => {
  it("keep the year on one-time holidays and leave yearly ones as MM-DD", async () => {
    db().tables.hours_exception = [
      { date: "12-25", is_closed: 1, display_text: "Closed", note: "Christmas" },
      { date: "2026-11-26", is_closed: 0, display_text: "11:00 AM - 2:00 PM", note: "Thanksgiving" },
    ];
    const { holidays } = await getWebsiteContent();
    expect(holidays).toEqual([
      expect.objectContaining({ date: "12-25", closed: true, name: "Christmas" }),
      expect.objectContaining({ date: "2026-11-26", closed: false, start: 11, end: 14 }),
    ]);
  });

  it("save one-time dates with their year", async () => {
    await updateWebsiteContent({
      holidays: [{ id: "t", name: "Thanksgiving", date: "2026-11-26", closed: true }],
    });
    const insert = db().batches.flat().find((w) => w.sql.includes("INSERT INTO hours_exception"));
    expect(insert?.params[0]).toBe("2026-11-26");
  });
});
