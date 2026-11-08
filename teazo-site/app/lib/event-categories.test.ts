/**
 * Event category and item name lookup tests.
 *
 * Covers fetching only the selected IDs, skipping Square when nothing is
 * selected, filtering deleted/unnamed/wrong-type objects, sorting, and
 * batching past Square's per-call ID limit.
 * The Square client is mocked; no Square requests are made.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminEvent } from "@/app/types/admin-event";

vi.mock("server-only", () => ({}));

// Run the cached function directly, and record how it was configured.
const unstableCache = vi.hoisted(() =>
  vi.fn((...args: [fn: unknown, keyParts: string[], options: { revalidate: number }]) => args[0]),
);
vi.mock("next/cache", () => ({ unstable_cache: unstableCache }));

const batchGet = vi.fn();
const list = vi.fn();

vi.mock("@/app/lib/square", () => ({
  squareClient: { catalog: { batchGet, list } },
}));

import { getEventCategories, getEventItems } from "./event-categories";

// Captured at import time, before any test clears mock history.
const cacheConfig = unstableCache.mock.calls[0];

function makeEvent(overrides: Partial<AdminEvent>): AdminEvent {
  return {
    id: "event-1",
    name: "Event",
    description: "",
    imageUrl: "/TEAZO_logo.svg",
    startAt: "2026-11-01T00:00:00.000Z",
    endAt: "2026-12-01T00:00:00.000Z",
    appliesToAll: false,
    categoryIds: [],
    itemIds: [],
    ...overrides,
  };
}

describe("event category and item lookup", () => {
  beforeEach(() => {
    batchGet.mockReset();
    list.mockReset();
    batchGet.mockResolvedValue({ objects: [] });
  });

  it("caches name lookups for a minute under a stable key", () => {
    expect(cacheConfig[1]).toEqual(["event-catalog-names"]);
    expect(cacheConfig[2]).toEqual({ revalidate: 60 });
  });

  it("does not call Square when no targets are selected", async () => {
    const events = [makeEvent({ appliesToAll: true, categoryIds: ["c1"], itemIds: ["i1"] }), makeEvent({})];

    expect(await getEventCategories(events)).toEqual([]);
    expect(await getEventItems(events)).toEqual([]);
    expect(batchGet).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it("requests only the unique selected IDs and never lists the catalog", async () => {
    const events = [
      makeEvent({ categoryIds: ["c1", "c2"] }),
      makeEvent({ id: "event-2", categoryIds: ["c2"] }),
      makeEvent({ id: "event-3", appliesToAll: true, categoryIds: ["ignored"] }),
    ];

    await getEventCategories(events);

    expect(batchGet).toHaveBeenCalledTimes(1);
    expect(batchGet).toHaveBeenCalledWith({ objectIds: ["c1", "c2"] });
    expect(list).not.toHaveBeenCalled();
  });

  it("returns trimmed category names sorted, skipping deleted, unnamed and other types", async () => {
    batchGet.mockResolvedValue({
      objects: [
        { type: "CATEGORY", id: "c2", categoryData: { name: " Matcha " } },
        { type: "CATEGORY", id: "c1", categoryData: { name: "Fruit Tea" } },
        { type: "CATEGORY", id: "c3", isDeleted: true, categoryData: { name: "Deleted" } },
        { type: "CATEGORY", id: "c4", categoryData: { name: "   " } },
        { type: "ITEM", id: "c5", itemData: { name: "Not a category" } },
        { type: "CATEGORY", id: "unrequested", categoryData: { name: "Extra" } },
      ],
    });

    const categories = await getEventCategories([makeEvent({ categoryIds: ["c1", "c2", "c3", "c4", "c5"] })]);

    expect(categories).toEqual([
      { id: "c1", name: "Fruit Tea" },
      { id: "c2", name: "Matcha" },
    ]);
  });

  it("returns item names sorted, skipping deleted, unnamed and other types", async () => {
    batchGet.mockResolvedValue({
      objects: [
        { type: "ITEM", id: "i2", itemData: { name: "Taro Milk Tea" } },
        { type: "ITEM", id: "i1", itemData: { name: "Brown Sugar Milk Tea" } },
        { type: "ITEM", id: "i3", isDeleted: true, itemData: { name: "Deleted" } },
        { type: "ITEM", id: "i4", itemData: {} },
        { type: "CATEGORY", id: "i5", categoryData: { name: "Not an item" } },
      ],
    });

    const items = await getEventItems([makeEvent({ itemIds: ["i1", "i2", "i3", "i4", "i5"] })]);

    expect(items).toEqual([
      { id: "i1", name: "Brown Sugar Milk Tea" },
      { id: "i2", name: "Taro Milk Tea" },
    ]);
  });

  it("treats a response without objects as no matches", async () => {
    batchGet.mockResolvedValue({});

    expect(await getEventItems([makeEvent({ itemIds: ["i1"] })])).toEqual([]);
  });

  it("splits more than 1,000 IDs across calls and merges the results", async () => {
    const ids = Array.from({ length: 1001 }, (_, index) => `i${index}`);
    batchGet.mockImplementation(async ({ objectIds }: { objectIds: string[] }) => ({
      objects: objectIds.map((id) => ({ type: "ITEM", id, itemData: { name: `Item ${id}` } })),
    }));

    const items = await getEventItems([makeEvent({ itemIds: ids })]);

    expect(batchGet).toHaveBeenCalledTimes(2);
    expect(batchGet.mock.calls[0][0].objectIds).toHaveLength(1000);
    expect(batchGet.mock.calls[1][0].objectIds).toHaveLength(1);
    expect(items.map((item) => item.id).sort()).toEqual([...ids].sort());
  });

  it("propagates Square failures so the page can fall back", async () => {
    batchGet.mockRejectedValue(new Error("Square unavailable"));

    await expect(getEventItems([makeEvent({ itemIds: ["i1"] })])).rejects.toThrow("Square unavailable");
  });
});
