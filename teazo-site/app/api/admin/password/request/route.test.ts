/**
 * Tests POST /api/admin/password/request.
 *
 * Email delivery, email normalization, rate limiting, and Next.js after()
 * are mocked. Tests verify input/origin validation, non-enumerating
 * responses, throttling, and deferred email scheduling.
 *
 * No real password emails are sent.
 */

import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { after } from "next/server";
import { normalizeEmail } from "@/app/lib/admin-whitelist";
import { sendAdminPasswordEmail } from "@/app/lib/admin-password-email";
import { consumePasswordRequestLimit } from "@/app/lib/password-request-rate-limit";
import { POST } from "./route";

// Capture deferred email work without actually scheduling it.
vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/app/lib/admin-whitelist", () => ({
  normalizeEmail: vi.fn((email: string) =>
    email.trim().toLowerCase(),
  ),
}));

vi.mock("@/app/lib/admin-password-email", () => ({
  sendAdminPasswordEmail: vi.fn(),
}));

vi.mock("@/app/lib/password-request-rate-limit", () => ({
  consumePasswordRequestLimit: vi.fn(),
  PASSWORD_IP_LIMIT: {
    name: "password-request-ip",
    limit: 10,
    windowMs: 900000,
  },
  PASSWORD_EMAIL_LIMIT: {
    name: "password-request-email",
    limit: 3,
    windowMs: 900000,
  },
}));

// Default to a same-origin JSON request; individual tests override fields.
function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    "http://localhost:3000/api/admin/password/request",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/admin/password/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "NEXT_PUBLIC_BASE_URL",
      "http://localhost:3000",
    );

    vi.mocked(consumePasswordRequestLimit).mockResolvedValue(true);
    vi.mocked(sendAdminPasswordEmail).mockResolvedValue("sent");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Guard the unauthenticated endpoint against cross-origin submissions.
  it("rejects requests from foreign origins", async () => {
    const response = await POST(
      makeRequest(
        { email: "admin@example.com" },
        { Origin: "https://other.example" },
      ),
    );

    expect(response.status).toBe(403);
    expect(sendAdminPasswordEmail).not.toHaveBeenCalled();
  });

  it("rejects requests without an Origin header", async () => {
    const request = makeRequest({ email: "admin@example.com" });
    request.headers.delete("Origin");

    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  // Validate body type, JSON syntax, and the email field before any send.
  it("rejects non-JSON requests", async () => {
    const response = await POST(
      makeRequest(
        { email: "admin@example.com" },
        { "Content-Type": "text/plain" },
      ),
    );

    expect(response.status).toBe(415);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request(
        "http://localhost:3000/api/admin/password/request",
        {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: "{invalid-json",
        },
      ),
    );

    expect(response.status).toBe(400);
  });

  it("rejects missing email addresses", async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(sendAdminPasswordEmail).not.toHaveBeenCalled();
  });

  it("rejects invalid email types", async () => {
    const response = await POST(makeRequest({ email: 12345 }));

    expect(response.status).toBe(400);
  });

  it("rejects malformed email addresses", async () => {
    const response = await POST(
      makeRequest({ email: "not-an-email" }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects email addresses longer than 254 characters", async () => {
    const email = `${"a".repeat(250)}@example.com`;

    const response = await POST(makeRequest({ email }));

    expect(response.status).toBe(400);
  });

  it("normalizes email addresses", async () => {
    await POST(
      makeRequest({ email: "  ADMIN@EXAMPLE.COM  " }),
    );

    expect(normalizeEmail).toHaveBeenCalledWith(
      "  ADMIN@EXAMPLE.COM  ",
    );

    expect(consumePasswordRequestLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "password-request-email",
      }),
      "admin@example.com",
    );
  });

  // Do not reveal whether an email belongs to an admin account.
  it("returns a generic confirmation for eligible requests", async () => {
    const response = await POST(
      makeRequest({ email: "admin@example.com" }),
    );

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      message:
        "If this email is eligible, a password link will be sent shortly.",
    });
  });

  // Email-specific throttling must not enable account enumeration.
  it("does not reveal email-based rate limiting", async () => {
    vi.mocked(consumePasswordRequestLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const response = await POST(
      makeRequest({ email: "admin@example.com" }),
    );

    expect(response.status).toBe(200);
    expect(after).not.toHaveBeenCalled();
  });

  // IP-wide throttling is an explicit HTTP 429 with Retry-After.
  it("rejects requests exceeding the IP rate limit", async () => {
    vi.mocked(consumePasswordRequestLimit).mockResolvedValueOnce(
      false,
    );

    const response = await POST(
      makeRequest({ email: "admin@example.com" }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
  });

  it("fails closed if the rate limiter throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(consumePasswordRequestLimit).mockRejectedValueOnce(
      new Error("D1 failure"),
    );

    const response = await POST(
      makeRequest({ email: "admin@example.com" }),
    );

    expect(response.status).toBe(503);
  });

  // Execute the captured after() callback to verify deferred delivery.
  it("schedules email delivery after returning a response", async () => {
    const response = await POST(
      makeRequest({ email: "admin@example.com" }),
    );

    expect(response.status).toBe(200);
    expect(after).toHaveBeenCalledOnce();
    expect(sendAdminPasswordEmail).not.toHaveBeenCalled();

    const scheduledTask = vi.mocked(after).mock.calls[0]?.[0];

    if (typeof scheduledTask !== "function") {
      throw new Error(
        "Expected after() to receive an email delivery callback.",
      );
    }

    await scheduledTask();

    expect(sendAdminPasswordEmail).toHaveBeenCalledWith(
      "admin@example.com",
    );
  });

  // Use the client address (not the entire proxy chain) for IP limits.
  it("passes a valid forwarded IP to the rate limiter", async () => {
    await POST(
      makeRequest(
        { email: "admin@example.com" },
        { "x-forwarded-for": "192.0.2.10, 10.0.0.1" },
      ),
    );

    expect(consumePasswordRequestLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "password-request-ip",
      }),
      "192.0.2.10",
    );
  });

  it("sets no-store on responses", async () => {
    const response = await POST(
      makeRequest({ email: "admin@example.com" }),
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });
});
