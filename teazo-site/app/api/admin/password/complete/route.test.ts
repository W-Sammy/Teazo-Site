import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { after } from "next/server";
import { savePasswordWithToken } from "@/app/lib/admin-password-tokens";
import { sendAdminPasswordChangedEmail } from "@/app/lib/admin-password-email";
import { consumePasswordRequestLimit } from "@/app/lib/password-request-rate-limit";
import { POST } from "./route";

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/app/lib/admin-password-tokens", () => ({
  savePasswordWithToken: vi.fn(),
}));

vi.mock("@/app/lib/admin-password-email", () => ({
  sendAdminPasswordChangedEmail: vi.fn(),
}));

vi.mock("@/app/lib/password-request-rate-limit", () => ({
  consumePasswordRequestLimit: vi.fn(),
}));

const VALID_TOKEN = "A".repeat(43);

function validBody() {
  return {
    token: VALID_TOKEN,
    purpose: "reset",
    password: "NewPassword123",
    confirmPassword: "NewPassword123",
  };
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(
    "http://localhost:3000/api/admin/password/complete",
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

describe("POST /api/admin/password/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "NEXT_PUBLIC_BASE_URL",
      "http://localhost:3000",
    );

    vi.mocked(consumePasswordRequestLimit).mockResolvedValue(true);

    vi.mocked(savePasswordWithToken).mockResolvedValue({
      ok: true,
      adminEmail: "admin@example.com",
    });

    vi.mocked(sendAdminPasswordChangedEmail).mockResolvedValue(
      "sent",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects foreign origins", async () => {
    const response = await POST(
      makeRequest(validBody(), {
        Origin: "https://attacker.example",
      }),
    );

    expect(response.status).toBe(403);
    expect(savePasswordWithToken).not.toHaveBeenCalled();
  });

  it("rejects non-JSON requests", async () => {
    const response = await POST(
      makeRequest(validBody(), {
        "Content-Type": "text/plain",
      }),
    );

    expect(response.status).toBe(415);
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(
      new Request(
        "http://localhost:3000/api/admin/password/complete",
        {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: "{invalid",
        },
      ),
    );

    expect(response.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const response = await POST(
      makeRequest({ token: VALID_TOKEN }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid password purposes", async () => {
    const response = await POST(
      makeRequest({
        ...validBody(),
        purpose: "unknown",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects malformed tokens", async () => {
    const response = await POST(
      makeRequest({
        ...validBody(),
        token: "invalid",
      }),
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toMatchObject({
      code: "INVALID_TOKEN",
    });

    expect(savePasswordWithToken).not.toHaveBeenCalled();
  });

  it("rejects excessively large password submissions", async () => {
    const response = await POST(
      makeRequest({
        ...validBody(),
        password: "A".repeat(257),
        confirmPassword: "A".repeat(257),
      }),
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toMatchObject({
      code: "INVALID_PASSWORD",
    });
  });

  it("reports password length errors consistently", async () => {
    vi.mocked(savePasswordWithToken).mockResolvedValueOnce({
      ok: false,
      reason: "invalid-password",
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Use a password between 6 and 128 characters.",
      code: "INVALID_PASSWORD",
    });
  });

  it("rejects password mismatches", async () => {
    vi.mocked(savePasswordWithToken).mockResolvedValueOnce({
      ok: false,
      reason: "password-mismatch",
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(400);

    expect(await response.json()).toMatchObject({
      code: "PASSWORD_MISMATCH",
    });
  });

  it("rejects expired, consumed, or invalid tokens", async () => {
    vi.mocked(savePasswordWithToken).mockResolvedValueOnce({
      ok: false,
      reason: "invalid-token",
    });

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(400);

    expect(await response.json()).toMatchObject({
      code: "INVALID_TOKEN",
    });
  });

  it("rejects excessive submission attempts", async () => {
    vi.mocked(consumePasswordRequestLimit).mockResolvedValueOnce(
      false,
    );

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");

    expect(savePasswordWithToken).not.toHaveBeenCalled();
  });

  it("fails closed when rate limiting is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(consumePasswordRequestLimit).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(503);
  });

  it("saves valid password submissions", async () => {
    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(200);

    expect(savePasswordWithToken).toHaveBeenCalledWith(
      VALID_TOKEN,
      "reset",
      "NewPassword123",
      "NewPassword123",
    );

    expect(await response.json()).toEqual({
      message: "Your password has been saved. Sign in to continue.",
    });
  });

  it("schedules a password-change confirmation email", async () => {
    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(200);
    expect(after).toHaveBeenCalledOnce();

    const scheduledTask = vi.mocked(after).mock.calls[0]?.[0];

    if (typeof scheduledTask !== "function") {
      throw new Error(
        "Expected after() to receive a confirmation email callback.",
      );
    }

    await scheduledTask();

    expect(sendAdminPasswordChangedEmail).toHaveBeenCalledWith(
      "admin@example.com",
    );
  });

  it("does not send confirmation email on failed updates", async () => {
    vi.mocked(savePasswordWithToken).mockResolvedValueOnce({
      ok: false,
      reason: "invalid-token",
    });

    await POST(makeRequest(validBody()));

    expect(after).not.toHaveBeenCalled();
    expect(sendAdminPasswordChangedEmail).not.toHaveBeenCalled();
  });

  it("does not undo a successful password change if email fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(sendAdminPasswordChangedEmail).mockRejectedValueOnce(
      new Error("Brevo unavailable"),
    );

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(200);

    const scheduledTask = vi.mocked(after).mock.calls[0]?.[0];

    if (typeof scheduledTask !== "function") {
      throw new Error(
        "Expected after() to receive a confirmation email callback.",
      );
    }

    await expect(scheduledTask()).resolves.toBeUndefined();
  });

  it("returns a service error when password storage fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(savePasswordWithToken).mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const response = await POST(makeRequest(validBody()));

    expect(response.status).toBe(503);
    expect(after).not.toHaveBeenCalled();
  });
});
