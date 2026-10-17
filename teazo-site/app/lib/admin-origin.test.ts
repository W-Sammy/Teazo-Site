
import { describe, expect, it } from "vitest";

import { isAllowedAdminWriteOrigin } from "./admin-origin";

const LOCAL_ORIGIN = "http://localhost:3000";
const LAN_ORIGIN = "http://10.0.0.142:3000";
const EXTERNAL_ORIGIN = "http://example.invalid";

function makeRequest(
  requestUrl: string,
  origin?: string,
  host?: string,
): Request {
  const headers = new Headers();

  if (origin !== undefined) {
    headers.set("origin", origin);
  }

  if (host !== undefined) {
    headers.set("host", host);
  }

  return new Request(requestUrl, {
    method: "POST",
    headers,
  });
}

describe("Admin API write origin validation", () => {
  it("allows matching localhost origins", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      LOCAL_ORIGIN,
      "localhost:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(true);
  });

  it("allows the configured LAN origin in development", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      LAN_ORIGIN,
      "10.0.0.142:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(true);
  });

  it("rejects unauthorized external origins", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      EXTERNAL_ORIGIN,
      "localhost:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(false);
  });

  it("rejects requests without an Origin header", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      undefined,
      "localhost:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(false);
  });

  it("rejects the LAN exception in production", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      LAN_ORIGIN,
      "10.0.0.142:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "production"),
    ).toBe(false);
  });

  it("rejects LAN requests with mismatched Host headers", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      LAN_ORIGIN,
      "example.invalid",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(false);
  });

  it("rejects LAN requests without a Host header", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      LAN_ORIGIN,
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(false);
  });

  it("allows matching same-origin requests in production", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      LOCAL_ORIGIN,
      "localhost:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "production"),
    ).toBe(true);
  });

  it("rejects LAN origins using a different port", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      "http://10.0.0.142:3001",
      "10.0.0.142:3001",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(false);
  });

  it("rejects LAN origins using HTTPS instead of HTTP", () => {
    const request = makeRequest(
      `${LOCAL_ORIGIN}/api/admin/gallery`,
      "https://10.0.0.142:3000",
      "10.0.0.142:3000",
    );

    expect(
      isAllowedAdminWriteOrigin(request, "development"),
    ).toBe(false);
  });
});
