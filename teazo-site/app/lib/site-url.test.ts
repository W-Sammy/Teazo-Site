import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applicationUrl } from "./site-url";

beforeEach(() => {
  for (const name of ["NEXT_PUBLIC_BASE_URL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    vi.stubEnv(name, undefined);
  }
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("application URLs for checkout and admin emails", () => {
  it("uses the preview deployment even though NODE_ENV is production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "branch-123.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "teazous.com");
    expect(applicationUrl()).toBe("https://branch-123.vercel.app");
  });

  it("honors explicit configuration, including an intentionally shared preview origin", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", " https://configured.example/ ");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(applicationUrl()).toBe("https://configured.example");
  });

  it("uses the production fallback only for a production deployment", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(applicationUrl()).toBe("https://teazous.com");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "custom.example");
    expect(applicationUrl()).toBe("https://custom.example");
  });

  it("fails when a preview has no application URL instead of switching environments", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(applicationUrl).toThrow("preview application URL is required");
  });

  it("requires explicit configuration outside Vercel production and development", () => {
    expect(applicationUrl).toThrow("NEXT_PUBLIC_BASE_URL is required");
  });

  it("allows localhost HTTP only during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(applicationUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://127.0.0.1:3001/");
    expect(applicationUrl()).toBe("http://127.0.0.1:3001");
  });

  it.each(["http://example.com", "https://user:password@example.com", "javascript:alert(1)"])("rejects invalid configuration %s", (url) => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", url);
    expect(applicationUrl).toThrow("Invalid application URL");
  });
});
