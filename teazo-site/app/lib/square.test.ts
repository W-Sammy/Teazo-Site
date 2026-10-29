import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedHosts } from "./imageHosts";

// Capture cleanup from the tested module instance without initializing the
// Square client before tests that intentionally use invalid configuration.
let clearCachedSquareLocationId: (() => void) | undefined;

beforeEach(() => {
  clearCachedSquareLocationId?.();
  clearCachedSquareLocationId = undefined;
  vi.resetModules();
  vi.stubEnv("SQUARE_ACCESS_TOKEN", "test-square-token");
  vi.stubEnv("SQUARE_LOCATION_ID", undefined);
  // A production Next.js build must still default to Square's sandbox.
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  clearCachedSquareLocationId?.();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Square environment", () => {
  it("requests an API version that exposes nesting and preserves nested relationships through the SDK", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      object: { type: "ITEM", id: "ITEM1", item_data: { variations: [], modifier_list_info: [{ modifier_list_id: "LIST1" }] } },
      related_objects: [{ type: "MODIFIER_LIST", id: "LIST1", modifier_list_data: {
        name: "Toppings", modifiers: [{ type: "MODIFIER", id: "MOD1", modifier_data: { child_modifier_list_ids: ["CHILD"] } }],
      } }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { squareClient } = await import("./square");
    const { buildMenuItemFromGetResponse } = await import("./square-helpers");
    const response = await squareClient.catalog.object.get({ objectId: "ITEM1", includeRelatedObjects: true });
    const options = fetchMock.mock.calls[0][1];
    expect(new Headers(options.headers).get("square-version")).toBe("2026-08-19");
    expect(options.cache).toBe("no-store");
    const item = buildMenuItemFromGetResponse(response, "LOCATION_1");
    expect(item?.modifiers[0].configurationIssues).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_NESTED_MODIFIERS" }));
    expect(item?.availability?.available).toBe(false);
  });

  it("allows catalog images from both Square environments", () => {
    expect(allowedHosts).toEqual(expect.arrayContaining([
      "items-images-sandbox.s3.us-west-2.amazonaws.com",
      "items-images-production.s3.us-west-2.amazonaws.com",
    ]));
  });

  it.each([
    [undefined, "https://connect.squareupsandbox.com"],
    ["sandbox", "https://connect.squareupsandbox.com"],
  ])("uses %s for sandbox location discovery and checkout", async (environment, baseUrl) => {
    vi.stubEnv("SQUARE_ENVIRONMENT", environment);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        locations: [{ id: "LOCATION_1", status: "ACTIVE" }],
      }))
      .mockResolvedValueOnce(Response.json({
        payment_link: { id: "LINK_1", order_id: "ORDER_1", url: "https://square.link/u/test" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const { squareClient } = await import("./square");
    const locationModule = await import("./square-location");
    clearCachedSquareLocationId = locationModule.clearCachedSquareLocationId;
    const { resolveSquareLocationId } = locationModule;
    const locationId = await resolveSquareLocationId();
    const result = await squareClient.checkout.paymentLinks.create({
      idempotencyKey: "test-checkout-key",
      order: { locationId, lineItems: [{ catalogObjectId: "VAR_1", quantity: "1" }] },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${baseUrl}/v2/locations`, expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${baseUrl}/v2/online-checkout/payment-links`, expect.objectContaining({
      method: "POST",
    }));
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
    const options = fetchMock.mock.calls[1][1];
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer test-square-token");
    expect(JSON.parse(options.body).order.location_id).toBe("LOCATION_1");
    expect(result.paymentLink?.orderId).toBe("ORDER_1");
    // Discovery remains cached when no explicit location is configured.
    expect(await resolveSquareLocationId()).toBe("LOCATION_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires an explicit location ID in production", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "production");
    vi.stubEnv("SQUARE_LOCATION_ID", undefined);
    const { resolveSquareLocationId } = await import("./square-location");
    await expect(resolveSquareLocationId()).rejects.toThrow(
      'SQUARE_LOCATION_ID is required when SQUARE_ENVIRONMENT is "production"',
    );
  });

  it("uses production endpoint and configured location ID for checkout", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "production");
    vi.stubEnv("SQUARE_LOCATION_ID", "PROD_LOCATION_1");
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      payment_link: { id: "LINK_1", order_id: "ORDER_1", url: "https://square.link/u/test" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { squareClient } = await import("./square");
    const locationModule = await import("./square-location");
    clearCachedSquareLocationId = locationModule.clearCachedSquareLocationId;
    const { resolveSquareLocationId } = locationModule;
    const locationId = await resolveSquareLocationId();
    expect(locationId).toBe("PROD_LOCATION_1");

    const result = await squareClient.checkout.paymentLinks.create({
      idempotencyKey: "test-checkout-key",
      order: { locationId, lineItems: [{ catalogObjectId: "VAR_1", quantity: "1" }] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://connect.squareup.com/v2/online-checkout/payment-links",
      expect.objectContaining({ method: "POST" }),
    );
    const options = fetchMock.mock.calls[0][1];
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer test-square-token");
    expect(JSON.parse(options.body).order.location_id).toBe("PROD_LOCATION_1");
    expect(result.paymentLink?.orderId).toBe("ORDER_1");
  });

  it.each(["", "   ", "staging", "Sandbox", "PRODUCTION", " sandbox ", "https://connect.squareup.com"])(
    "rejects invalid environment %j at startup, client initialization and database configuration",
    async (environment) => {
      vi.stubEnv("SQUARE_ENVIRONMENT", environment);
      await expect(import("../../next.config")).rejects.toThrow(
        'SQUARE_ENVIRONMENT must be "sandbox" or "production"',
      );
      await expect(import("./square")).rejects.toThrow(
        'SQUARE_ENVIRONMENT must be "sandbox" or "production"',
      );
      const { getSquareEnvironment } = await import("./square-config");
      expect(() => getSquareEnvironment()).toThrow(
        'SQUARE_ENVIRONMENT must be "sandbox" or "production"',
      );
    },
  );

  it("still requires an access token", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", undefined);
    vi.stubEnv("SQUARE_ACCESS_TOKEN", undefined);
    await expect(import("./square")).rejects.toThrow("SQUARE_ACCESS_TOKEN is not set");
  });
});
