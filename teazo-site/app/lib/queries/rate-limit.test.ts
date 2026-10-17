import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { CHECKOUT_RATE_LIMIT, consumeRateLimit, rateLimitKey } from "@/app/lib/queries/rate-limit";

vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);

const start = new Date("2026-10-14T22:00:00.000Z");
const minutesLater = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

beforeEach(() => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  sqliteD1.reset();
});

afterEach(() => vi.restoreAllMocks());

describe("checkout rate limit (TZ-445)", () => {
  it("allows 10 attempts in 10 minutes and refuses the 11th", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", minutesLater(i * 0.5))).toBe(true);
    }
    expect(await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", minutesLater(6))).toBe(false);
  });

  it("counts each visitor separately", async () => {
    for (let i = 0; i < 11; i++) await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", start);
    expect(await consumeRateLimit(CHECKOUT_RATE_LIMIT, "198.51.100.2", start)).toBe(true);
  });

  it("starts a new window once 10 minutes have passed", async () => {
    for (let i = 0; i < 11; i++) await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", start);
    expect(await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", minutesLater(11))).toBe(true);
  });

  it("stores a hash, never the IP itself", async () => {
    await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", start);
    const rows = sqliteD1.db.prepare("SELECT identifier FROM analytics_rate_limit").all() as { identifier: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier).toBe(rateLimitKey(CHECKOUT_RATE_LIMIT, "203.0.113.7"));
    expect(rows[0].identifier).toMatch(/^checkout:[0-9a-f]{64}$/);
    expect(rows[0].identifier).not.toContain("203.0.113.7");
  });

  it("allows the request when D1 is not configured or fails", async () => {
    delete process.env.D1_PROXY_URL;
    expect(await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", start)).toBe(true);

    process.env.D1_PROXY_URL = "http://d1.test";
    sqliteD1.db.exec("DROP TABLE analytics_rate_limit");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await consumeRateLimit(CHECKOUT_RATE_LIMIT, "203.0.113.7", start)).toBe(true);
  });
});
