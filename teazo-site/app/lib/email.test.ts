/**
 * Tests Teazo's outgoing email transport.
 *
 * Coverage includes:
 * - Brevo transactional API requests.
 * - Sender and reply-to header sanitization.
 * - Brevo sandbox mode and delivery errors.
 * - Mailpit local capture and failures.
 * - Development printing and preview skipping.
 *
 * Global fetch is mocked. No real Brevo or Mailpit request
 * is made and no email is delivered.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  EmailError,
  sendEmail,
  type OutgoingEmail,
} from "./email";

vi.mock("server-only", () => ({}));

const mockFetch = vi.fn();

function email(
  overrides: Partial<OutgoingEmail> = {},
): OutgoingEmail {
  return {
    to: "owner@example.com",
    subject: "New website contact",
    text: "Visitor message in plain text.",
    html: "<p>Visitor message in HTML.</p>",
    replyTo: {
      email: "visitor@example.com",
      name: "Taylor Smith",
    },
    ...overrides,
  };
}

function requestBody(): Record<string, unknown> {
  const options = mockFetch.mock.calls[0]?.[1] as
    | RequestInit
    | undefined;

  if (!options || typeof options.body !== "string") {
    throw new Error("Expected a JSON email request.");
  }

  return JSON.parse(options.body) as Record<string, unknown>;
}

describe("Outgoing email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Explicitly configure every transport variable so
    // tests do not use credentials from the local environment.
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("MAILPIT_URL", "");
    vi.stubEnv("BREVO_SANDBOX", "");
    vi.stubEnv("EMAIL_FROM", "website@example.com");
    vi.stubEnv("EMAIL_FROM_NAME", "TEAZO website");
    vi.stubEnv("NODE_ENV", "test");

    mockFetch.mockResolvedValue(
      new Response("{}", { status: 201 }),
    );

    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ============================================================
  // Brevo delivery
  // ============================================================

  it("sends email through Brevo when an API key is configured", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    const result = await sendEmail(email());

    expect(result).toBe("sent");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("includes the Brevo API key in request headers", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    await sendEmail(email());

    const options = mockFetch.mock.calls[0][1] as RequestInit;

    expect(options.headers).toEqual(
      expect.objectContaining({
        "api-key": "test-api-key",
        "content-type": "application/json",
        accept: "application/json",
      }),
    );
  });

  it("includes sender, recipient, and message content", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    await sendEmail(email());

    const body = requestBody();

    expect(body).toMatchObject({
      sender: {
        email: "website@example.com",
        name: "TEAZO website",
      },
      to: [{ email: "owner@example.com" }],
      replyTo: {
        email: "visitor@example.com",
        name: "Taylor Smith",
      },
      subject: "New website contact",
      textContent: "Visitor message in plain text.",
      htmlContent: "<p>Visitor message in HTML.</p>",
    });
  });

  // Email header fields must not contain injected line breaks.
  it("normalizes newline and tab characters in email headers", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("EMAIL_FROM_NAME", "TEAZO\nWebsite");

    await sendEmail(
      email({
        subject: "Contact\nMessage\tToday",
        replyTo: {
          email: "visitor@example.com",
          name: "Taylor\r\nSmith",
        },
      }),
    );

    const body = requestBody();

    expect(body.subject).toBe("Contact Message Today");

    expect(body.sender).toEqual({
      email: "website@example.com",
      name: "TEAZO Website",
    });

    expect(body.replyTo).toEqual({
      email: "visitor@example.com",
      name: "Taylor Smith",
    });
  });

  it("limits sender and reply-to names to 70 characters", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("EMAIL_FROM_NAME", "A".repeat(90));

    await sendEmail(
      email({
        replyTo: {
          email: "visitor@example.com",
          name: "B".repeat(90),
        },
      }),
    );

    const body = requestBody();

    expect(body.sender).toEqual({
      email: "website@example.com",
      name: "A".repeat(70),
    });

    expect(body.replyTo).toEqual({
      email: "visitor@example.com",
      name: "B".repeat(70),
    });
  });

  it("omits reply-to when one is not provided", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    await sendEmail(
      email({ replyTo: undefined }),
    );

    expect(requestBody()).not.toHaveProperty("replyTo");
  });

  // Sandbox mode validates the Brevo request without delivery.
  it("enables the Brevo sandbox header when configured", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("BREVO_SANDBOX", "1");

    await sendEmail(email());

    expect(requestBody()).toMatchObject({
      headers: {
        "X-Sib-Sandbox": "drop",
      },
    });
  });

  it("does not include the sandbox header during normal delivery", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    await sendEmail(email());

    expect(requestBody()).not.toHaveProperty("headers");
  });

  // ============================================================
  // Brevo configuration and failures
  // ============================================================

  it("rejects Brevo delivery without a verified sender address", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(
      sendEmail(email()),
    ).rejects.toThrow(
      "EMAIL_FROM must be set to a sender address verified in Brevo.",
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports Brevo API rejection with its HTTP status", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    mockFetch.mockResolvedValueOnce(
      Response.json(
        {
          code: "invalid_parameter",
          message: "Invalid recipient",
        },
        { status: 400 },
      ),
    );

    await expect(
      sendEmail(email()),
    ).rejects.toMatchObject({
      name: "EmailError",
      status: 400,
      message: expect.stringContaining("Invalid recipient"),
    });
  });

  it("reports Brevo network failures", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");

    mockFetch.mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    await expect(
      sendEmail(email()),
    ).rejects.toThrow("could not reach Brevo");
  });

  // Brevo takes priority when both delivery systems are configured.
  it("prefers Brevo over Mailpit when both are configured", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-api-key");
    vi.stubEnv("MAILPIT_URL", "http://localhost:8025");

    await sendEmail(email());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.any(Object),
    );

    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // ============================================================
  // Mailpit local email capture
  // ============================================================

  it("captures messages through Mailpit without Brevo credentials", async () => {
    vi.stubEnv("MAILPIT_URL", "http://localhost:8025");

    const result = await sendEmail(email());

    expect(result).toBe("captured");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8025/api/v1/send",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("removes trailing slashes from the Mailpit URL", async () => {
    vi.stubEnv("MAILPIT_URL", "http://localhost:8025///");

    await sendEmail(email());

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8025/api/v1/send",
      expect.any(Object),
    );
  });

  it("sends the correct Mailpit message fields", async () => {
    vi.stubEnv("MAILPIT_URL", "http://localhost:8025");

    await sendEmail(email());

    expect(requestBody()).toMatchObject({
      From: {
        Email: "website@example.com",
        Name: "TEAZO website",
      },
      To: [{ Email: "owner@example.com" }],
      ReplyTo: [
        {
          Email: "visitor@example.com",
          Name: "Taylor Smith",
        },
      ],
      Subject: "New website contact",
      Text: "Visitor message in plain text.",
      HTML: "<p>Visitor message in HTML.</p>",
    });
  });

  it("reports Mailpit HTTP failures", async () => {
    vi.stubEnv("MAILPIT_URL", "http://localhost:8025");

    mockFetch.mockResolvedValueOnce(
      new Response("Unavailable", { status: 503 }),
    );

    await expect(
      sendEmail(email()),
    ).rejects.toMatchObject({
      name: "EmailError",
      status: 503,
    });
  });

  it("reports Mailpit connection failures", async () => {
    vi.stubEnv("MAILPIT_URL", "http://localhost:8025");

    mockFetch.mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    await expect(
      sendEmail(email()),
    ).rejects.toThrow("could not reach Mailpit");
  });

  // ============================================================
  // Development and deployment fallback behavior
  // ============================================================

  // Local development can display email contents in the terminal.
  it("prints email locally when no delivery system is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendEmail(email());

    expect(result).toBe("printed");
    expect(mockFetch).not.toHaveBeenCalled();

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining("owner@example.com"),
    );
  });

  // Preview or production deployments without a key send nothing.
  it("skips email outside development when no transport is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail(email());

    expect(result).toBe("skipped");
    expect(mockFetch).not.toHaveBeenCalled();

    expect(warn).toHaveBeenCalledWith(
      "[email] Not sent because BREVO_API_KEY is not set.",
    );
  });

  it("creates EmailError instances with optional status codes", () => {
    const error = new EmailError("Delivery failed", 422);

    expect(error.name).toBe("EmailError");
    expect(error.status).toBe(422);
    expect(error.message).toBe("Delivery failed");
  });
});
