/**
 * Tests event display helpers used by Admin Events.
 *
 * Covers event status boundaries, Pacific-time formatting,
 * and category/item targeting labels.
 *
 * No database, network, or storage operations are performed.
 */

import { describe, expect, it } from "vitest";

import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
} from "@/app/types/admin-event";

import {
  formatEventDate,
  getEventStatus,
  getTargetLabel,
} from "./event-display";

const event: AdminEvent = {
  id: "event-1",
  name: "Test Event",
  description: "Test description",
  imageUrl: "",
  startAt: "2026-10-30T17:00:00.000Z",
  endAt: "2026-10-30T20:00:00.000Z",
  appliesToAll: false,
  categoryIds: [],
  itemIds: [],
};

const categories: EventCategory[] = [
  { id: "category-1", name: "Milk Tea" },
  { id: "category-2", name: "Fruit Tea" },
];

const items: EventCatalogItem[] = [
  {
    id: "item-1",
    name: "Classic Milk Tea",
    categoryIds: ["category-1"],
  },
  {
    id: "item-2",
    name: "Mango Tea",
    categoryIds: ["category-2"],
  },
];

describe("Admin Events display helpers", () => {
  describe("Event status", () => {
    const start = Date.parse(event.startAt);
    const end = Date.parse(event.endAt);

    it("classifies events before their start as upcoming", () => {
      expect(getEventStatus(event, start - 1)).toBe(
        "upcoming",
      );
    });

    it("classifies events at their exact start as active", () => {
      expect(getEventStatus(event, start)).toBe(
        "active",
      );
    });

    it("classifies events between start and end as active", () => {
      expect(
        getEventStatus(event, start + 60_000),
      ).toBe("active");
    });

    it("classifies events at their exact end as active", () => {
      expect(getEventStatus(event, end)).toBe(
        "active",
      );
    });

    it("classifies events after their end as ended", () => {
      expect(getEventStatus(event, end + 1)).toBe(
        "ended",
      );
    });
  });

  describe("Event date formatting", () => {
    it("formats UTC timestamps in Pacific daylight time", () => {
      expect(
        formatEventDate("2026-07-15T19:30:00.000Z"),
      ).toBe("Jul 15, 2026 at 12:30 PM");
    });

    it("formats UTC timestamps in Pacific standard time", () => {
      expect(
        formatEventDate("2026-01-15T20:30:00.000Z"),
      ).toBe("Jan 15, 2026 at 12:30 PM");
    });

    it("handles dates crossing midnight in Pacific time", () => {
      expect(
        formatEventDate("2026-10-31T06:30:00.000Z"),
      ).toBe("Oct 30, 2026 at 11:30 PM");
    });

    it("formats midnight correctly", () => {
      expect(
        formatEventDate("2026-07-15T07:00:00.000Z"),
      ).toBe("Jul 15, 2026 at 12:00 AM");
    });

    it("returns Unknown for invalid dates", () => {
      expect(formatEventDate("invalid-date")).toBe(
        "Unknown",
      );
    });

    it("returns Unknown for empty dates", () => {
      expect(formatEventDate("")).toBe("Unknown");
    });
  });

  describe("Event targeting labels", () => {
    it("labels events applying to all items", () => {
      expect(
        getTargetLabel(
          { ...event, appliesToAll: true },
          categories,
          items,
        ),
      ).toBe("All items");
    });

    it("labels one selected category", () => {
      expect(
        getTargetLabel(
          { ...event, categoryIds: ["category-1"] },
          categories,
          items,
        ),
      ).toBe("1 category");
    });

    it("labels multiple selected categories", () => {
      expect(
        getTargetLabel(
          {
            ...event,
            categoryIds: ["category-1", "category-2"],
          },
          categories,
          items,
        ),
      ).toBe("2 categories");
    });

    it("labels one selected item", () => {
      expect(
        getTargetLabel(
          { ...event, itemIds: ["item-1"] },
          categories,
          items,
        ),
      ).toBe("1 item");
    });

    it("labels multiple selected items", () => {
      expect(
        getTargetLabel(
          {
            ...event,
            itemIds: ["item-1", "item-2"],
          },
          categories,
          items,
        ),
      ).toBe("2 items");
    });

    it("combines category and item selection counts", () => {
      expect(
        getTargetLabel(
          {
            ...event,
            categoryIds: ["category-1"],
            itemIds: ["item-1", "item-2"],
          },
          categories,
          items,
        ),
      ).toBe("1 category + 2 items");
    });

    it("reports no targets when a catalog is available", () => {
      expect(
        getTargetLabel(event, categories, items),
      ).toBe("Nothing selected");
    });

    it("reports an unavailable catalog when no targets exist", () => {
      expect(
        getTargetLabel(event, [], []),
      ).toBe("Catalog unavailable");
    });
  });
});
