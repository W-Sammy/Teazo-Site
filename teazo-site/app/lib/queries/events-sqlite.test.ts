import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { listEvents, updateEvent, type EventInput } from "./events";

vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);

const input: EventInput = {
  name: "Updated event",
  description: "",
  startAt: "2026-10-01T00:00:00.000Z",
  endAt: "2026-11-01T00:00:00.000Z",
  appliesToAll: false,
  categoryIds: ["new-category"],
  itemIds: ["new-item"],
};

beforeEach(() => {
  sqliteD1.reset();
  for (const id of ["event-1", "event-2"]) {
    sqliteD1.db.prepare(
      "INSERT INTO event (id, name, start_at, end_at) VALUES (?, ?, ?, ?)",
    ).run(id, id, input.startAt, input.endAt);
    for (const environment of ["sandbox", "production"]) {
      sqliteD1.db.prepare(
        "INSERT INTO event_item (event_id, square_catalog_object_id, square_env) VALUES (?, ?, ?)",
      ).run(id, `${environment}-item`, environment);
      sqliteD1.db.prepare(
        "INSERT INTO event_category (event_id, square_category_id, square_env) VALUES (?, ?, ?)",
      ).run(id, `${environment}-category`, environment);
    }
  }
});

afterEach(() => vi.unstubAllEnvs());

describe.each(["sandbox", "production"] as const)("event targets in %s", (environment) => {
  it.each([false, true])("preserves the other environment when appliesToAll is %s", async (appliesToAll) => {
    vi.stubEnv("SQUARE_ENVIRONMENT", environment);
    const otherEnvironment = environment === "sandbox" ? "production" : "sandbox";

    expect(await updateEvent("event-1", { ...input, appliesToAll })).toBe(true);

    const activeEvents = await listEvents();
    expect(activeEvents.find((event) => event.id === "event-1")).toMatchObject({
      appliesToAll,
      itemIds: appliesToAll ? [] : ["new-item"],
      categoryIds: appliesToAll ? [] : ["new-category"],
    });
    expect(activeEvents.find((event) => event.id === "event-2")).toMatchObject({
      itemIds: [`${environment}-item`],
      categoryIds: [`${environment}-category`],
    });

    vi.stubEnv("SQUARE_ENVIRONMENT", otherEnvironment);
    for (const event of await listEvents()) {
      expect(event.itemIds).toEqual([`${otherEnvironment}-item`]);
      expect(event.categoryIds).toEqual([`${otherEnvironment}-category`]);
    }
  });
});
