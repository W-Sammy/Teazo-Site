import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeD1 } from "@/test/fake-d1";
import { getWebsiteContent, updateWebsiteContent } from "@/app/lib/website-content";

vi.mock("@/app/lib/d1", async () => (await import("@/test/fake-d1")).fakeD1.module);

const db = () => fakeD1;

beforeEach(() => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  db().reset();
});

describe("online ordering switch (TZ-446)", () => {
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

describe("holiday dates from D1 (TZ-447)", () => {
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
