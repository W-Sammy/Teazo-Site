/**
 * Regression tests for Website Content notification recipients.
 *
 * Contact notification emails must use the authoritative
 * saved Website Content email rather than an environment
 * recipient. Missing configuration and lookup failures
 * must not discard saved visitor messages.
 *
 * All external services are mocked.
 * No production email or database writes occur.
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
import { sendEmail } from "@/app/lib/email";
import {
  countRecentContactMessages,
  insertContactMessage,
  isContactFormEnabled,
} from "@/app/lib/queries/contact";
import { verifyTurnstile } from "@/app/lib/turnstile";
import { getAuthoritativeWebsiteContent } from "@/app/lib/website-content";

import {
  submitContactMessage,
  type ContactFormState,
} from "./actions";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
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

vi.mock("@/app/lib/website-content", () => ({
  getAuthoritativeWebsiteContent: vi.fn(),
}));

const INITIAL_STATE: ContactFormState = {
  status: "idle",
};

function setRecipient(email: string) {
  vi.mocked(getAuthoritativeWebsiteContent)
    .mockResolvedValue({
      address: { email },
    } as never);
}

function makeForm(message = "Test contact message") {
  const form = new FormData();

  form.set("firstName", "Example");
  form.set("lastName", "Customer");
  form.set("email", "customer@example.com");
  form.set("subject", "Question");
  form.set("message", message);
  form.set("cf-turnstile-response", "test-token");

  return form;
}

async function submit(message?: string) {
  return submitContactMessage(
    INITIAL_STATE,
    makeForm(message),
  );
}

async function runNotification(index = 0) {
  const callback = vi.mocked(after).mock.calls[index]?.[0];

  if (typeof callback !== "function") {
    throw new Error(
      "Expected a deferred notification callback.",
    );
  }

  await callback();
}

describe("Website Content notification recipient", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("NODE_ENV", "test");

    // An environment recipient must not override
    // the email configured in Website Content.
    vi.stubEnv(
      "CONTACT_NOTIFY_TO",
      "outdated@example.com",
    );

    vi.mocked(headers).mockResolvedValue(
      new Headers() as never,
    );

    vi.mocked(verifyTurnstile).mockResolvedValue({
      ok: true,
    });

    vi.mocked(isContactFormEnabled)
      .mockResolvedValue(true);

    vi.mocked(insertContactMessage)
      .mockResolvedValue(undefined);

    vi.mocked(countRecentContactMessages)
      .mockResolvedValue({
        lastHour: 1,
        lastDay: 1,
      });

    vi.mocked(sendEmail)
      .mockResolvedValue("sent");

    setRecipient("configured@example.com");

    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    vi.spyOn(console, "warn")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends notifications to the Website Content email", async () => {
    const result = await submit();

    expect(result.status).toBe("sent");

    await runNotification();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "configured@example.com",
      }),
    );

    expect(sendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({
        to: "outdated@example.com",
      }),
    );
  });

  it("uses an updated Website Content email for subsequent messages", async () => {
    await submit("First message");
    await runNotification(0);

    setRecipient("updated@example.com");

    await submit("Second message");
    await runNotification(1);

    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "configured@example.com",
      }),
    );

    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: "updated@example.com",
      }),
    );
  });

  it.each([
    "",
    "   ",
    "not-an-email",
    "invalid@",
  ])(
    "does not send to an invalid Website Content recipient: %s",
    async (email) => {
      setRecipient(email);

      const result = await submit();

      expect(result.status).toBe("sent");

      await runNotification();

      expect(insertContactMessage)
        .toHaveBeenCalledOnce();

      expect(sendEmail)
        .not.toHaveBeenCalled();

      expect(countRecentContactMessages)
        .not.toHaveBeenCalled();
    },
  );

  it("preserves the message when Website Content is unavailable", async () => {
    vi.mocked(getAuthoritativeWebsiteContent)
      .mockRejectedValueOnce(
        new Error("Website Content unavailable"),
      );

    const result = await submit();

    expect(result.status).toBe("sent");

    await expect(
      runNotification(),
    ).resolves.toBeUndefined();

    expect(insertContactMessage)
      .toHaveBeenCalledOnce();

    expect(sendEmail)
      .not.toHaveBeenCalled();
  });

  it("uses the configured address for the alerts-paused warning", async () => {
    vi.mocked(countRecentContactMessages)
      .mockResolvedValueOnce({
        lastHour: 21,
        lastDay: 21,
      });

    await submit();
    await runNotification();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "configured@example.com",
        subject:
          "Website contact form: email alerts paused",
      }),
    );
  });

  it("does not read the recipient before the message is saved", async () => {
    const result = await submit();

    expect(result.status).toBe("sent");

    expect(insertContactMessage)
      .toHaveBeenCalledOnce();

    expect(getAuthoritativeWebsiteContent)
      .not.toHaveBeenCalled();

    await runNotification();

    expect(getAuthoritativeWebsiteContent)
      .toHaveBeenCalledOnce();
  });
});
