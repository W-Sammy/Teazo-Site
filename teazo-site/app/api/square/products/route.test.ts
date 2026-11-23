import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalogFixture, locationId } from "@/test/catalog-fixtures";

const mocks = vi.hoisted(() => ({ searchItems: vi.fn(), list: vi.fn(), get: vi.fn(), upsert: vi.fn(), delete: vi.fn(), requireAdminApi: vi.fn() }));
vi.mock("@/app/lib/square", () => ({ squareClient: { catalog: {
  searchItems: mocks.searchItems, list: mocks.list, object: { get: mocks.get, upsert: mocks.upsert, delete: mocks.delete },
} } }));
vi.mock("@/app/lib/admin", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/app/lib/square-location", () => ({ resolveSquareLocationId: async () => locationId }));
const { GET, POST } = await import("./route");
const { GET: getOne, PUT, DELETE } = await import("./[id]/route");
let fixture = catalogFixture();

beforeEach(() => {
  fixture = catalogFixture();
  vi.clearAllMocks();
  vi.stubEnv("SQUARE_READ_ONLY", undefined);
  mocks.requireAdminApi.mockResolvedValue({ ok: true });
  mocks.searchItems.mockReset().mockImplementation(async () => ({ items: [fixture.item] }));
  mocks.list.mockImplementation(async ({ types }: { types: string }) => types === "MODIFIER_LIST" ? [fixture.list] : []);
  mocks.get.mockImplementation(async () => ({ object: fixture.item, relatedObjects: [fixture.list] }));
});

afterEach(() => vi.unstubAllEnvs());

describe("Square read-only mode", () => {
  it.each(["POST", "PUT", "DELETE"])("blocks %s before parsing or contacting Square", async (method) => {
    vi.stubEnv("SQUARE_READ_ONLY", "true");
    const request = new Request("http://localhost/api/square/products/ITEM1", { method });
    const context = { params: Promise.resolve({ id: "ITEM1" }) };
    const response = method === "POST" ? await POST(request)
      : method === "PUT" ? await PUT(request, context) : await DELETE(request, context);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "SQUARE_READ_ONLY" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("keeps catalog list and item reads available", async () => {
    vi.stubEnv("SQUARE_READ_ONLY", "true");
    expect((await GET()).status).toBe(200);
    expect((await getOne(new Request("http://localhost/api/square/products/ITEM1"), {
      params: Promise.resolve({ id: "ITEM1" }),
    })).status).toBe(200);
  });

  it.each([undefined, "false"])("allows writes when the setting is %s", async (setting) => {
    vi.stubEnv("SQUARE_READ_ONLY", setting);
    mocks.delete.mockResolvedValue({ deletedObjectIds: ["ITEM1"] });
    const response = await DELETE(new Request("http://localhost/api/square/products/ITEM1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "ITEM1" }),
    });
    expect(response.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({ objectId: "ITEM1" });
  });
});

describe("products availability responses", () => {
  it("uses the same effective rules on list and fresh single-item reads after Dashboard changes", async () => {
    const readOne = async () => (await getOne(new Request("http://localhost/api/square/products/ITEM1"), { params: Promise.resolve({ id: "ITEM1" }) })).json();
    expect((await readOne()).modifiers[0]).toMatchObject({ minSelectedModifiers: 1, maxSelectedModifiers: 1 });
    fixture.item.itemData!.modifierListInfo![0] = {
      modifierListId: "LIST1", minSelectedModifiers: 0, maxSelectedModifiers: 0,
      modifierOverrides: [{ modifierId: "MOD2", onByDefaultOverride: "YES" }],
    };
    const fresh = await readOne();
    const listItem = (await (await GET()).json())[0];
    expect(fresh.modifiers).toEqual(listItem.modifiers);
    expect(fresh.modifiers[0]).toMatchObject({ minSelectedModifiers: 0, maxSelectedModifiers: 0, options: [{ onByDefault: false }, { onByDefault: true }] });
    fixture.option.modifierData!.childModifierListIds = ["CHILD"];
    const unsupported = await readOne();
    expect(unsupported.availability).toMatchObject({ available: false, reasons: [{ code: "UNSUPPORTED_NESTED_MODIFIERS" }] });
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });

  it("queries all archived states and preserves archived items with reasons", async () => {
    fixture.item.itemData!.isArchived = true;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.searchItems).toHaveBeenCalledWith({ archivedState: "ARCHIVED_STATE_ALL", cursor: undefined });
    expect(await response.json()).toMatchObject([{ catalogObjectId: "ITEM1", availability: { available: false, reasons: [{ code: "ARCHIVED" }] } }]);
  });

  it("reads all pages without filtering out location-unavailable items", async () => {
    const archived = catalogFixture().item;
    archived.id = "ARCHIVED";
    archived.itemData!.isArchived = true;
    fixture.item.absentAtLocationIds = [locationId];
    mocks.searchItems.mockResolvedValueOnce({ items: [fixture.item], cursor: "PAGE2" }).mockResolvedValueOnce({ items: [archived] });
    const response = await GET();
    expect((await response.json()).map((item: { catalogObjectId: string }) => item.catalogObjectId)).toEqual(["ITEM1", "ARCHIVED"]);
    expect(mocks.searchItems).toHaveBeenLastCalledWith({ archivedState: "ARCHIVED_STATE_ALL", cursor: "PAGE2" });
  });

  it("reflects the next API-exposed change without an admin save or deployment", async () => {
    expect((await (await GET()).json())[0].variations[0].availability.available).toBe(true);
    fixture.regular.itemVariationData!.locationOverrides = [{ locationId, soldOut: true }];
    const item = (await (await GET()).json())[0];
    expect(item.availability.available).toBe(true);
    expect(item.variations[0].availability).toMatchObject({ available: false, reasons: [{ code: "SOLD_OUT" }] });
    expect(mocks.searchItems).toHaveBeenCalledTimes(2);
  });

  it("returns identical availability on fresh single-item reads for customizer openings", async () => {
    fixture.option.modifierData!.hiddenOnline = true;
    const listItem = (await (await GET()).json())[0];
    const response = await getOne(new Request("http://localhost/api/square/products/ITEM1"), { params: Promise.resolve({ id: "ITEM1" }) });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const item = await response.json();
    expect(item.availability).toEqual(listItem.availability);
    expect(item.modifiers).toEqual(listItem.modifiers);
    fixture.otherOption.modifierData!.locationOverrides = [{ locationId, soldOut: true }];
    const second = await getOne(new Request("http://localhost/api/square/products/ITEM1"), { params: Promise.resolve({ id: "ITEM1" }) });
    expect((await second.json()).availability).toMatchObject({ available: false, reasons: [{ code: "REQUIRED_OPTIONS_UNAVAILABLE" }] });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("never caches a failed availability read", async () => {
    mocks.searchItems.mockRejectedValueOnce(new Error("Square unavailable"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
