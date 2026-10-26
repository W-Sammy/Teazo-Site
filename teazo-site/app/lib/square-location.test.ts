import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedSquareLocationId, resolveSquareLocationId } from "./square-location";

const mocks = vi.hoisted(() => ({ listLocations: vi.fn() }));
vi.mock("@/app/lib/square", () => ({
  squareClient: { locations: { list: mocks.listLocations } },
}));

type LocationResponse = { locations: { id: string; status: string }[] };

function deferredLocations() {
  let resolve!: (response: LocationResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<LocationResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const locations = (id: string): LocationResponse => ({ locations: [{ id, status: "ACTIVE" }] });

beforeEach(() => {
  clearCachedSquareLocationId();
  mocks.listLocations.mockReset();
  vi.stubEnv("SQUARE_LOCATION_ID", undefined);
});

afterEach(() => {
  clearCachedSquareLocationId();
  vi.unstubAllEnvs();
});

describe("Square location discovery", () => {
  it("shares a cold-start lookup across concurrent checkouts and caches the result", async () => {
    const pending = deferredLocations();
    mocks.listLocations.mockReturnValueOnce(pending.promise);
    const requests = Array.from({ length: 10 }, () => resolveSquareLocationId());

    expect(mocks.listLocations).toHaveBeenCalledTimes(1);
    pending.resolve(locations("LOCATION_1"));
    expect(await Promise.all(requests)).toEqual(Array(10).fill("LOCATION_1"));
    expect(await resolveSquareLocationId()).toBe("LOCATION_1");
    expect(mocks.listLocations).toHaveBeenCalledTimes(1);
  });

  it("lets concurrent callers retry after a failed lookup", async () => {
    const pending = deferredLocations();
    mocks.listLocations.mockReturnValueOnce(pending.promise);
    const results = Promise.allSettled([resolveSquareLocationId(), resolveSquareLocationId()]);
    pending.reject(new Error("Square unavailable"));
    expect(await results).toEqual([
      { status: "rejected", reason: expect.objectContaining({ message: "Square unavailable" }) },
      { status: "rejected", reason: expect.objectContaining({ message: "Square unavailable" }) },
    ]);

    mocks.listLocations.mockResolvedValueOnce(locations("RECOVERED"));
    expect(await resolveSquareLocationId()).toBe("RECOVERED");
    expect(mocks.listLocations).toHaveBeenCalledTimes(2);
  });

  it("retries when the account initially has no locations", async () => {
    mocks.listLocations.mockResolvedValueOnce({ locations: [] });
    await expect(resolveSquareLocationId()).rejects.toThrow("No active Square location found");
    mocks.listLocations.mockResolvedValueOnce(locations("NEW_LOCATION"));
    expect(await resolveSquareLocationId()).toBe("NEW_LOCATION");
  });

  it("prefers the configured location even while discovery is pending", async () => {
    const pending = deferredLocations();
    mocks.listLocations.mockReturnValueOnce(pending.promise);
    const request = resolveSquareLocationId();
    vi.stubEnv("SQUARE_LOCATION_ID", " EXPLICIT_LOCATION ");
    expect(await resolveSquareLocationId()).toBe("EXPLICIT_LOCATION");
    pending.resolve(locations("DISCOVERED"));
    await request;
    expect(await resolveSquareLocationId()).toBe("EXPLICIT_LOCATION");
    expect(mocks.listLocations).toHaveBeenCalledTimes(1);
  });

  it("keeps an older lookup from repopulating a cleared cache or clearing a newer lookup", async () => {
    const older = deferredLocations();
    const newer = deferredLocations();
    mocks.listLocations.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const oldRequest = resolveSquareLocationId();
    clearCachedSquareLocationId();
    const newRequest = resolveSquareLocationId();

    older.resolve(locations("OLD_LOCATION"));
    expect(await oldRequest).toBe("OLD_LOCATION");
    const concurrentRequest = resolveSquareLocationId();
    expect(mocks.listLocations).toHaveBeenCalledTimes(2);

    newer.resolve(locations("NEW_LOCATION"));
    expect(await Promise.all([newRequest, concurrentRequest])).toEqual(["NEW_LOCATION", "NEW_LOCATION"]);
    expect(await resolveSquareLocationId()).toBe("NEW_LOCATION");
  });

  it("requires an explicit location ID in production when unset or blank", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "production");
    vi.stubEnv("SQUARE_LOCATION_ID", undefined);

    await expect(resolveSquareLocationId()).rejects.toThrow(
      'SQUARE_LOCATION_ID is required when SQUARE_ENVIRONMENT is "production".',
    );
    expect(mocks.listLocations).not.toHaveBeenCalled();

    vi.stubEnv("SQUARE_LOCATION_ID", "   ");
    await expect(resolveSquareLocationId()).rejects.toThrow(
      'SQUARE_LOCATION_ID is required when SQUARE_ENVIRONMENT is "production".',
    );
    expect(mocks.listLocations).not.toHaveBeenCalled();
  });

  it("uses the explicit location ID in production without invoking discovery", async () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "production");
    vi.stubEnv("SQUARE_LOCATION_ID", " PROD_LOC_1 ");

    expect(await resolveSquareLocationId()).toBe("PROD_LOC_1");
    expect(mocks.listLocations).not.toHaveBeenCalled();
  });
});
