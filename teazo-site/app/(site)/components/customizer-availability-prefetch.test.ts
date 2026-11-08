/**
 * Deep-link availability prefetch tests.
 *
 * Covers one-shot consumption, no-store requests, per-item matching,
 * the freshness TTL, and failed early requests.
 * fetch is stubbed; no Square requests are made.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  prefetchItemAvailability,
  takePrefetchedAvailability,
} from "./customizer-availability-prefetch";

describe("customizer availability prefetch", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    // Drain anything a test left behind so state does not leak between tests.
    takePrefetchedAvailability("item-1");
    takePrefetchedAvailability("item-2");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests the encoded product URL without caching", () => {
    prefetchItemAvailability("item/1");

    expect(fetchMock).toHaveBeenCalledWith("/api/square/products/item%2F1", { cache: "no-store" });
    takePrefetchedAvailability("item/1");
  });

  it("hands the early request over exactly once", async () => {
    prefetchItemAvailability("item-1");

    const first = takePrefetchedAvailability("item-1");
    expect(first).not.toBeNull();
    await expect(first).resolves.toBeInstanceOf(Response);
    expect(takePrefetchedAvailability("item-1")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores the early request for a different item", () => {
    prefetchItemAvailability("item-1");

    expect(takePrefetchedAvailability("item-2")).toBeNull();
    expect(takePrefetchedAvailability("item-1")).not.toBeNull();
  });

  it("drops an early request older than the freshness window", () => {
    prefetchItemAvailability("item-1");
    vi.advanceTimersByTime(10_001);

    expect(takePrefetchedAvailability("item-1")).toBeNull();
  });

  it("passes a failed early request to the consumer instead of hiding it", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    prefetchItemAvailability("item-1");

    const taken = takePrefetchedAvailability("item-1");
    expect(taken).not.toBeNull();
    await expect(taken).rejects.toThrow("offline");
  });

  it("discards a failed request nobody consumed", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    prefetchItemAvailability("item-1");
    await vi.advanceTimersByTimeAsync(0);

    expect(takePrefetchedAvailability("item-1")).toBeNull();
  });
});
