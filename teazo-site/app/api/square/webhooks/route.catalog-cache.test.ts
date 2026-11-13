import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQUARE_CATALOG_TAG } from "@/app/lib/cache-tags";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  recordCatalogRevision: vi.fn(),
  syncSquareMenuCategories: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/app/lib/queries/catalog-revision", () => ({
  recordCatalogRevision: mocks.recordCatalogRevision,
}));

// Mock category synchronization to prevent real Square API calls or D1 writes.
vi.mock("@/app/lib/sync-menu-categories", () => ({
  syncSquareMenuCategories: mocks.syncSquareMenuCategories,
}));

const { POST } = await import("@/app/api/square/webhooks/route");

const KEY = "test-signature-key";
const URL = "https://www.teazous.com/api/square/webhooks";

function signed(event: unknown, key = KEY) {
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", key)
    .update(URL + body)
    .digest("base64");

  return POST(
    new Request(URL, {
      method: "POST",
      body,
      headers: {
        "x-square-hmacsha256-signature": signature,
      },
    }),
  );
}

const catalogEvent = {
  type: "catalog.version.updated",
  event_id: "evt_1",
  created_at: "2026-10-29T08:00:00Z",
};

beforeEach(() => {
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = KEY;
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = URL;

  mocks.recordCatalogRevision.mockResolvedValue(undefined);
  mocks.syncSquareMenuCategories.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe("POST /api/square/webhooks: menu cache (TZ-515)", () => {
  it("clears the cached Square catalog when the catalog changes", async () => {
    const res = await signed(catalogEvent);

    expect(res.status).toBe(200);

    expect(mocks.syncSquareMenuCategories).toHaveBeenCalledOnce();

    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      SQUARE_CATALOG_TAG,
      { expire: 0 },
    );

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/menu");
  });

  it("leaves the cache alone for other events and for bad signatures", async () => {
    await signed({
      ...catalogEvent,
      type: "inventory.count.updated",
    });

    expect((await signed(catalogEvent, "wrong-key")).status).toBe(403);

    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.syncSquareMenuCategories).not.toHaveBeenCalled();
  });

  it("doesn't clear the cache when recording the revision fails, so Square retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.recordCatalogRevision.mockRejectedValue(
      new Error("D1 down"),
    );

    expect((await signed(catalogEvent)).status).toBe(500);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
