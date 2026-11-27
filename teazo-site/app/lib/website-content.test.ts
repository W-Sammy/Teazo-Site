import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // afterEach restores console spies used by error tests
import { fakeD1 } from "@/test/fake-d1";
import {
  getPublicWebsiteContent,
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
  db().tables.website_content_revision = [{ revision: 0 }];
  cacheMocks.revalidateTag.mockClear();
  cacheMocks.staleCopy = null;
});

describe("caching", () => {
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

  it("serves the fallback on public pages when D1 fails, then the real content once D1 is back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db().tables.content_block = [{ key: "home.story", value: "From D1" }];
    db().state.failReads = true;
    const duringOutage = await getPublicWebsiteContent();
    expect(duringOutage.story).not.toBe("From D1");

    db().state.failReads = false;
    expect((await getPublicWebsiteContent()).story).toBe("From D1");
  });

  it("reads all tables for one load", async () => {
    await getWebsiteContent();
    expect(db().state.reads).toBe(6);
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
      collectionsRevision: 0,
      holidays: [{ id: "t", name: "Thanksgiving", date: "2026-11-26", closed: true }],
    });
    const insert = db().batches.flat().find((w) => w.sql.includes("INSERT INTO hours_exception"));
    expect(insert?.params[0]).toBe("2026-11-26");
  });
});

// delivery tests
afterEach(() => vi.restoreAllMocks());

describe("delivery links with fake D1", () => {
    const first = {
        id: "delivery-test-one", label: "First Delivery", icon: "",
        url: "https://example.com/first", enabled: true,
    };
    const second = {
        ...first, id: "delivery-test-two", label: "Second Delivery",
        url: "https://example.com/second", enabled: false,
    };

    // inspect the values sent for delivery inserts without pretending the database saved them
    function deliveryInserts() {
        return db().batches.flat().filter((statement) =>
            statement.sql.includes("INSERT INTO site_link") && statement.sql.includes("'delivery'"),
        );
    }

    it("reads visible and hidden delivery entries without including social links", async () => {
        // these rows stand in for the response from the database's site_link query
        db().tables.site_link = [
            { key: first.id, link_group: "delivery", label: first.label, url: first.url, aria_label: null, sort_order: 1, is_active: 1 },
            { key: second.id, link_group: "delivery", label: second.label, url: second.url, aria_label: null, sort_order: 2, is_active: 0 },
            { key: "delivery-test-social", link_group: "social", label: "Social", url: "https://example.com/social", aria_label: null, sort_order: 3, is_active: 1 },
        ];

        const content = await getWebsiteContent();
        expect(content.deliveryLinks).toEqual([first, second]);
        expect(db().batches).toHaveLength(0);
    });

    it("submits each platform's name, URL, order, and visibility when saving", async () => {
        await updateWebsiteContent({ deliveryLinks: [first, second] });

        // is_active uses 1 for shown and 0 for hidden; sort_order follows the list order
        expect(deliveryInserts().map((statement) => statement.params)).toEqual([
            [first.id, first.label, first.url, 1, 1],
            [second.id, second.label, second.url, 2, 0],
        ]);
    });

    it("limits the replacement delete to delivery links and groups it with the inserts", async () => {
        await updateWebsiteContent({ deliveryLinks: [first, second] });

        // one batch keeps the replacement statements together; actual transaction behavior needs a SQL test
        expect(db().batches).toHaveLength(1);
        const deletes = db().batches[0].filter((statement) => /DELETE\s+FROM\s+site_link/i.test(statement.sql));
        expect(deletes).toHaveLength(1);
        expect(deletes[0].sql).toContain("WHERE link_group = 'delivery'");
        expect(db().batches[0].filter((statement) => statement.sql.includes("INSERT INTO site_link"))).toHaveLength(2);
    });

    it("submits an edited platform while keeping the other platform's values", async () => {
        const edited = { ...first, label: "Updated", url: "https://example.com/updated" };
        await updateWebsiteContent({ deliveryLinks: [edited, second] });

        expect(deliveryInserts().map((statement) => statement.params)).toEqual([
            [edited.id, edited.label, edited.url, 1, 1],
            [second.id, second.label, second.url, 2, 0],
        ]);
    });

    it("submits a delivery-only delete with no inserts when the final platform is removed", async () => {
        const content = await updateWebsiteContent({ deliveryLinks: [] });
        const deletes = db().batches.flat().filter((statement) => /DELETE\s+FROM\s+site_link/i.test(statement.sql));

        expect(deletes).toHaveLength(1);
        expect(deletes[0].sql).toContain("WHERE link_group = 'delivery'");
        expect(deliveryInserts()).toHaveLength(0);
        expect(content.deliveryLinks).toEqual([]);
    });

    it("does not submit site_link changes when only the story is edited", async () => {
        await updateWebsiteContent({ story: "A different section was edited." });

        // save for another section must not replace either delivery or social links
        const linkWrites = db().batches.flat().filter((statement) => statement.sql.includes("site_link"));
        expect(linkWrites).toEqual([]);
    });

    it("rejects an invalid delivery URL without submitting writes or clearing the cache", async () => {
        await expect(updateWebsiteContent({ deliveryLinks: [{ ...first, url: "tea@example.com" }] }))
            .rejects.toThrow("Invalid website content");

        expect(db().batches).toHaveLength(0);
        expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
    });

    it("reports a failed delivery batch without clearing the cache", async () => {
        db().state.batchError = new Error("Delivery save refused");
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(updateWebsiteContent({ deliveryLinks: [first] })).rejects.toThrow("Delivery save refused");
        // this fake failure checks error handling
        expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
    });

    it("clears the content cache after the fake database accepts a delivery save", async () => {
        await updateWebsiteContent({ deliveryLinks: [first] });
        expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(WEBSITE_CONTENT_TAG, { expire: 0 });
    });
});