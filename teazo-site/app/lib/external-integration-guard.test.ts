/**
 * Tests for external integration safety gates.
 *
 * All configuration values are synthetic.
 * These tests never make network requests.
 */

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  requireExternalTestOptIn,
  requireLocalCloudflare,
  requireLocalMailpit,
  requireSquareSandbox,
} from "@/test/external-integration-guard";

const enabled = {
  TEAZO_EXTERNAL_TESTS: "1",
};

describe("External integration safety", () => {
  it("disables external tests by default", () => {
    expect(() =>
      requireExternalTestOptIn({}),
    ).toThrow("disabled");
  });

  it("requires explicit opt-in", () => {
    expect(() =>
      requireExternalTestOptIn(enabled),
    ).not.toThrow();
  });

  it("rejects Square production mode", () => {
    expect(() =>
      requireSquareSandbox({
        ...enabled,
        SQUARE_ENVIRONMENT: "production",
        SQUARE_ACCESS_TOKEN: "synthetic",
      }),
    ).toThrow("sandbox");
  });

  it("requires a Square access token", () => {
    expect(() =>
      requireSquareSandbox({
        ...enabled,
        SQUARE_ENVIRONMENT: "sandbox",
      }),
    ).toThrow("token");
  });

  it("accepts explicitly configured Square sandbox", () => {
    expect(() =>
      requireSquareSandbox({
        ...enabled,
        SQUARE_ENVIRONMENT: "sandbox",
        SQUARE_ACCESS_TOKEN: "synthetic",
      }),
    ).not.toThrow();
  });

  it("rejects remote Cloudflare targets", () => {
    expect(() =>
      requireLocalCloudflare({
        ...enabled,
        D1_PROXY_URL:
          "https://example.workers.dev",
        PROXY_TOKEN: "synthetic",
      }),
    ).toThrow("local Wrangler");
  });

  it("accepts local Wrangler configuration", () => {
    expect(() =>
      requireLocalCloudflare({
        ...enabled,
        D1_PROXY_URL:
          "http://127.0.0.1:8787",
        PROXY_TOKEN: "synthetic",
      }),
    ).not.toThrow();
  });

  it("rejects Mailpit tests when Brevo is configured", () => {
    expect(() =>
      requireLocalMailpit({
        ...enabled,
        MAILPIT_URL:
          "http://127.0.0.1:8025",
        BREVO_API_KEY: "synthetic",
      }),
    ).toThrow("Brevo API key");
  });

  it("rejects remote email endpoints", () => {
    expect(() =>
      requireLocalMailpit({
        ...enabled,
        MAILPIT_URL:
          "https://mail.example.invalid",
      }),
    ).toThrow("local Mailpit");
  });

  it("accepts local Mailpit without Brevo", () => {
    expect(() =>
      requireLocalMailpit({
        ...enabled,
        MAILPIT_URL:
          "http://127.0.0.1:8025",
      }),
    ).not.toThrow();
  });
});
