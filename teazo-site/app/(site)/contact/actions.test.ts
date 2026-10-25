/**
 * Tests the public contact form server action.
 *
 * Coverage includes:
 * - Required fields, validation, and length restrictions.
 * - Honeypot protection and Turnstile verification.
 * - Contact form availability and D1 persistence.
 * - Deferred email notifications.
 * - Hourly and daily owner notification limits.
 * - Recovery from database and email delivery failures.
 *
 * Next.js headers/after(), D1, Turnstile, and email services
 * are mocked. No production records or emails are affected.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { headers } from "next/headers";
import { after } from "next/server";

import { buildContactNotification } from "@/app/lib/contact-notification";
import { sendEmail } from "@/app/lib/email";
import {
  countRecentContactMessages,
  insertContactMessage,
  isContactFormEnabled,
} from "@/app/lib/queries/contact";
import { verifyTurnstile } from "@/app/lib/turnstile";

import {
  submitContactMessage,
  type ContactFormState,
} from "./actions";

// Mock Next.js request information and deferred work.
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

// Return a predictable notification so these tests focus
// on submission behavior rather than HTML construction.
vi.mock("@/app/lib/contact-notification", () => ({
  buildContactNotification: vi.fn(() => ({
    subject: "New contact notification",
    text: "New contact message",
    html: "<p>New contact message</p>",
    replyTo: {
      email: "taylor@example.com",
      name: "Taylor Smith",
    },
  })),
}));

vi.mock("@/app/lib/email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/app/lib/queries/contact", () => ({
  countRecentContactMessages: vi.fn(),
  insertContactMessage: vi.fn(),
  isContactFormEnabled: vi.fn(),
}));

vi.mock("@/app/lib/turnstile", () => ({
  verifyTurnstile: vi.fn(),
}));

const INITIAL_STATE: ContactFormState = {
  status: "idle",
};

// Create a valid contact form submission by default.
// Tests may override any field to exercise validation.
function makeForm(
  overrides: Record<string, string> = {},
): FormData {
  const values = {
    firstName: "Taylor",
    lastName: "Smith",
    email: "taylor@example.com",
    subject: "Catering question",
    message: "Do you offer catering?",
    "cf-turnstile-response": "turnstile-token",
    ...overrides,
  };

  const form = new FormData();

  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }

  return form;
}

// Invoke the server action with its required previous state.
async function submit(form: FormData) {
  return submitContactMessage(INITIAL_STATE, form);
}

// Execute the callback registered with Next.js after().
// This lets tests inspect notification delivery separately
// from the visitor's immediate submission response.
async function runNotification(): Promise<void> {
  const scheduledTask = vi.mocked(after).mock.calls[0]?.[0];

  if (typeof scheduledTask !== "function") {
    throw new Error(
      "Expected after() to receive a notification callback.",
    );
  }

  await scheduledTask();
}

describe("Contact form submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("CONTACT_NOTIFY_TO", "owner@example.com");
    vi.stubEnv("NODE_ENV", "test");

    // Use a valid forwarded visitor IP by default.
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        "x-forwarded-for": "192.0.2.10, 10.0.0.1",
      }) as never,
    );

    vi.mocked(verifyTurnstile).mockResolvedValue({
      ok: true,
    });

    vi.mocked(isContactFormEnabled).mockResolvedValue(true);

    vi.mocked(insertContactMessage).mockResolvedValue(
      undefined,
    );

    // Counts include the message that was just inserted.
    vi.mocked(countRecentContactMessages).mockResolvedValue({
      lastHour: 1,
      lastDay: 1,
    });

    vi.mocked(sendEmail).mockResolvedValue("sent");

    // Suppress logs intentionally produced by failure tests.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ============================================================
  // Successful submissions
  // ============================================================

  it("saves valid contact messages", async () => {
    const result = await submit(makeForm());

    expect(result).toEqual({
      status: "sent",
    });

    expect(insertContactMessage).toHaveBeenCalledWith({
      firstName: "Taylor",
      lastName: "Smith",
      email: "taylor@example.com",
      subject: "Catering question",
      message: "Do you offer catering?",
    });
  });

  it("trims whitespace from submitted values", async () => {
    await submit(
      makeForm({
        firstName: "  Taylor  ",
        lastName: "  Smith  ",
        email: "  taylor@example.com  ",
        subject: "  Catering question  ",
        message: "  Do you offer catering?  ",
      }),
    );

    expect(insertContactMessage).toHaveBeenCalledWith({
      firstName: "Taylor",
      lastName: "Smith",
      email: "taylor@example.com",
      subject: "Catering question",
      message: "Do you offer catering?",
    });
  });

  // Last name and subject are optional fields.
  it("accepts submissions without a last name or subject", async () => {
    const result = await submit(
      makeForm({
        lastName: "",
        subject: "",
      }),
    );

    expect(result).toEqual({
      status: "sent",
    });

    expect(insertContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        lastName: "",
        subject: "",
      }),
    );
  });

  // ============================================================
  // Required fields and input validation
  // ============================================================

  it.each([
    "firstName",
    "email",
    "message",
  ])("rejects missing required field %s", async (field) => {
    const result = await submit(
      makeForm({
        [field]: "",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      message:
        "Please fill in your first name, email and message.",
    });

    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(insertContactMessage).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only required fields", async () => {
    const result = await submit(
      makeForm({
        firstName: "   ",
      }),
    );

    expect(result.status).toBe("error");
    expect(insertContactMessage).not.toHaveBeenCalled();
  });

  it.each([
    "not-an-email",
    "person@",
    "@example.com",
    "person example@example.com",
  ])("rejects invalid email address %s", async (email) => {
    const result = await submit(
      makeForm({ email }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Please enter a valid email address.",
    });

    expect(insertContactMessage).not.toHaveBeenCalled();
  });

  // Form maxLength attributes can be bypassed, so the
  // server action must independently enforce every limit.
  it.each([
    {
      field: "firstName",
      label: "first name",
      max: 100,
      value: "x".repeat(101),
    },
    {
      field: "lastName",
      label: "last name",
      max: 100,
      value: "x".repeat(101),
    },
    {
      field: "email",
      label: "email",
      max: 254,
      value: `${"a".repeat(243)}@example.com`,
    },
    {
      field: "subject",
      label: "subject",
      max: 200,
      value: "x".repeat(201),
    },
    {
      field: "message",
      label: "message",
      max: 5000,
      value: "x".repeat(5001),
    },
  ])(
    "enforces the $field maximum length",
    async ({ field, label, max, value }) => {
      const result = await submit(
        makeForm({
          [field]: value,
        }),
      );

      expect(result).toMatchObject({
        status: "error",
        message: `Please shorten the ${label} to ${max} characters or fewer.`,
      });

      expect(insertContactMessage).not.toHaveBeenCalled();
    },
  );

  it("accepts values exactly at their maximum lengths", async () => {
    const result = await submit(
      makeForm({
        firstName: "T".repeat(100),
        message: "M".repeat(5000),
      }),
    );

    expect(result.status).toBe("sent");
    expect(insertContactMessage).toHaveBeenCalledOnce();
  });

  // Preserve submitted values so visitors can correct an error
  // without having to retype the entire form.
  it("returns the submitted values after validation errors", async () => {
    const result = await submit(
      makeForm({
        firstName: "  Taylor  ",
        email: "invalid-email",
        message: "  Important message  ",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      values: {
        firstName: "Taylor",
        lastName: "Smith",
        email: "invalid-email",
        subject: "Catering question",
        message: "Important message",
      },
    });
  });

  // The server ignores non-string FormData values.
  it("does not treat an uploaded file as a valid first name", async () => {
    const form = makeForm();

    form.set(
      "firstName",
      new File(["Taylor"], "name.txt", {
        type: "text/plain",
      }),
    );

    const result = await submit(form);

    expect(result.status).toBe("error");
    expect(insertContactMessage).not.toHaveBeenCalled();
  });

  // ============================================================
  // Honeypot bot protection
  // ============================================================

  // The hidden company field is meant to catch automated bots.
  // Returning a success-shaped response avoids advertising the trap.
  it("silently ignores honeypot submissions", async () => {
    const form = makeForm({
      firstName: "",
      email: "invalid-email",
      message: "",
    });

    form.set("company", "Automated Bot");

    const result = await submit(form);

    expect(result).toEqual({
      status: "sent",
    });

    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(insertContactMessage).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  // ============================================================
  // Cloudflare Turnstile verification
  // ============================================================

  it("passes the Turnstile token and visitor IP to verification", async () => {
    await submit(makeForm());

    expect(verifyTurnstile).toHaveBeenCalledWith(
      "turnstile-token",
      "192.0.2.10",
    );
  });

  it("omits malformed forwarded IP addresses", async () => {
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({
        "x-forwarded-for": "invalid visitor address",
      }) as never,
    );

    await submit(makeForm());

    expect(verifyTurnstile).toHaveBeenCalledWith(
      "turnstile-token",
      undefined,
    );
  });

  // Turnstile returns different failure reasons so visitors
  // can distinguish a missing check from an unavailable service.
  it.each([
    {
      reason: "missing" as const,
      message:
        "Please wait for the security check above the Submit button to finish, then try again.",
    },
    {
      reason: "rejected" as const,
      message:
        "The security check didn't pass. Please try it again.",
    },
    {
      reason: "unavailable" as const,
      message:
        "The security check isn't working right now. Please try again in a moment.",
    },
  ])(
    "rejects Turnstile result $reason",
    async ({ reason, message }) => {
      vi.mocked(verifyTurnstile).mockResolvedValueOnce({
        ok: false,
        reason,
      });

      const result = await submit(makeForm());

      expect(result).toMatchObject({
        status: "error",
        message,
      });

      expect(isContactFormEnabled).not.toHaveBeenCalled();
      expect(insertContactMessage).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(after).not.toHaveBeenCalled();
    },
  );

  // ============================================================
  // Contact form availability and D1 persistence
  // ============================================================

  // The server action must enforce the disabled setting even
  // if a visitor submits directly without using the UI.
  it("rejects submissions when the contact form is disabled", async () => {
    vi.mocked(isContactFormEnabled).mockResolvedValueOnce(false);

    const result = await submit(makeForm());

    expect(result).toMatchObject({
      status: "error",
      message:
        "The contact form is not accepting messages right now.",
    });

    expect(insertContactMessage).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("reports a database failure when checking form availability", async () => {
    vi.mocked(isContactFormEnabled).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const result = await submit(makeForm());

    expect(result).toMatchObject({
      status: "error",
      message:
        "Your message could not be sent right now. Please try again in a moment.",
    });

    expect(insertContactMessage).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("reports a database failure when saving a message", async () => {
    vi.mocked(insertContactMessage).mockRejectedValueOnce(
      new Error("D1 write failed"),
    );

    const result = await submit(makeForm());

    expect(result).toMatchObject({
      status: "error",
      message:
        "Your message could not be sent right now. Please try again in a moment.",
    });

    expect(after).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // ============================================================
  // Deferred notification scheduling
  // ============================================================

  // The owner email must not delay the immediate response.
  it("schedules notification after saving the message", async () => {
    const result = await submit(makeForm());

    expect(result.status).toBe("sent");
    expect(insertContactMessage).toHaveBeenCalledOnce();
    expect(after).toHaveBeenCalledOnce();

    // Notification is scheduled, not executed immediately.
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("persists the message before scheduling notification", async () => {
    await submit(makeForm());

    const insertOrder = vi.mocked(insertContactMessage)
      .mock.invocationCallOrder[0];

    const afterOrder = vi.mocked(after)
      .mock.invocationCallOrder[0];

    expect(insertOrder).toBeLessThan(afterOrder);
  });

  it("notifies the owner after a successful submission", async () => {
    await submit(makeForm());
    await runNotification();

    expect(countRecentContactMessages).toHaveBeenCalledOnce();

    expect(buildContactNotification).toHaveBeenCalledWith(
      {
        firstName: "Taylor",
        lastName: "Smith",
        email: "taylor@example.com",
        subject: "Catering question",
        message: "Do you offer catering?",
      },
      expect.any(Date),
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "New contact notification",
      }),
    );
  });

  // ============================================================
  // Notification delivery failures
  // ============================================================

  // The message is already safely stored. A Brevo failure
  // must never change the visitor's successful result.
  it("keeps a submission successful when email delivery fails", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(
      new Error("Brevo unavailable"),
    );

    const result = await submit(makeForm());

    expect(result.status).toBe("sent");

    await expect(
      runNotification(),
    ).resolves.toBeUndefined();

    expect(insertContactMessage).toHaveBeenCalledOnce();
  });

  it("keeps a submission successful when notification counts fail", async () => {
    vi.mocked(countRecentContactMessages).mockRejectedValueOnce(
      new Error("D1 count unavailable"),
    );

    const result = await submit(makeForm());

    expect(result.status).toBe("sent");

    await expect(
      runNotification(),
    ).resolves.toBeUndefined();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  // Missing notification configuration should not discard
  // a saved visitor message.
  it("keeps the message when no owner notification address is configured", async () => {
    vi.stubEnv("CONTACT_NOTIFY_TO", "");
    vi.stubEnv("NODE_ENV", "production");

    const result = await submit(makeForm());

    expect(result.status).toBe("sent");

    await runNotification();

    expect(insertContactMessage).toHaveBeenCalledOnce();
    expect(countRecentContactMessages).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // In local development, the placeholder owner address
  // allows the configured email transport to print messages.
  it("uses the development fallback owner address", async () => {
    vi.stubEnv("CONTACT_NOTIFY_TO", "");
    vi.stubEnv("NODE_ENV", "development");

    await submit(makeForm());
    await runNotification();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@teazo.test",
      }),
    );
  });

  // ============================================================
  // Hourly notification limits
  // ============================================================

  // The message at the cap still receives a normal email.
  it("sends a normal notification at the hourly limit", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 20,
      lastDay: 20,
    });

    await submit(makeForm());
    await runNotification();

    expect(buildContactNotification).toHaveBeenCalledOnce();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "New contact notification",
      }),
    );
  });

  // Crossing the hourly limit produces one owner warning.
  it("sends an alerts-paused notice when the hourly cap is exceeded", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 21,
      lastDay: 21,
    });

    await submit(makeForm());
    await runNotification();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "Website contact form: email alerts paused",
      }),
    );

    expect(buildContactNotification).not.toHaveBeenCalled();
  });

  // Later submissions are still stored, but notification
  // emails are suppressed to protect the Brevo allowance.
  it("suppresses further emails above the hourly cap", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 22,
      lastDay: 22,
    });

    const result = await submit(makeForm());

    await runNotification();

    expect(result.status).toBe("sent");
    expect(insertContactMessage).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // ============================================================
  // Daily notification limits
  // ============================================================

  it("sends a normal notification at the daily limit", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 1,
      lastDay: 100,
    });

    await submit(makeForm());
    await runNotification();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "New contact notification",
      }),
    );
  });

  it("sends an alerts-paused notice when the daily cap is exceeded", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 1,
      lastDay: 101,
    });

    await submit(makeForm());
    await runNotification();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Website contact form: email alerts paused",
      }),
    );
  });

  it("suppresses further emails above the daily cap", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 1,
      lastDay: 102,
    });

    const result = await submit(makeForm());

    await runNotification();

    expect(result.status).toBe("sent");
    expect(insertContactMessage).toHaveBeenCalledOnce();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // If both limits are first exceeded together, the
  // current implementation issues only one warning.
  it("sends one warning when both caps are crossed together", async () => {
    vi.mocked(countRecentContactMessages).mockResolvedValueOnce({
      lastHour: 21,
      lastDay: 101,
    });

    await submit(makeForm());
    await runNotification();

    expect(sendEmail).toHaveBeenCalledOnce();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Website contact form: email alerts paused",
      }),
    );
  });

  // ============================================================
  // Notification contents
  // ============================================================

  it("uses trimmed visitor details in owner notifications", async () => {
    await submit(
      makeForm({
        firstName: "  Taylor  ",
        email: "  taylor@example.com  ",
        message: "  Hello from the website  ",
      }),
    );

    await runNotification();

    expect(buildContactNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Taylor",
        email: "taylor@example.com",
        message: "Hello from the website",
      }),
      expect.any(Date),
    );
  });

  // A skipped email outcome should not make the visitor
  // believe their persisted message was lost.
  it("preserves a successful submission when email is skipped", async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce("skipped");

    const result = await submit(makeForm());

    await runNotification();

    expect(result.status).toBe("sent");
    expect(insertContactMessage).toHaveBeenCalledOnce();
  });
});
