/**
 * Contact notification recovery and duplicate-attempt tests.
 *
 * Covers deferred notification delivery, message persistence,
 * email transport failures, skipped delivery, and missing
 * notification configuration.
 *
 * Also characterizes repeated and concurrent submissions,
 * callback re-execution, missing automatic retries, and
 * hourly/daily notification limits across multiple messages.
 *
 * Next.js after(), Turnstile, D1, and email delivery are
 * mocked. No production records or emails are created.
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

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/app/lib/contact-notification", () => ({
  buildContactNotification: vi.fn(
    (values: {
      firstName: string;
      email: string;
      message: string;
    }) => ({
      subject: `New contact message from ${values.firstName}`,
      text: values.message,
      html: `<p>${values.message}</p>`,
      replyTo: {
        email: values.email,
        name: values.firstName,
      },
    }),
  ),
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

function makeForm(
  overrides: Record<string, string> = {},
): FormData {
  const values = {
    firstName: "Taylor",
    lastName: "Smith",
    email: "taylor@example.com",
    subject: "Catering",
    message: "Do you offer catering?",
    "cf-turnstile-response": "test-token",
    ...overrides,
  };

  const form = new FormData();

  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }

  return form;
}

function submit(
  overrides: Record<string, string> = {},
) {
  return submitContactMessage(
    INITIAL_STATE,
    makeForm(overrides),
  );
}

async function runNotification(
  index: number,
): Promise<void> {
  const callback = vi.mocked(after).mock.calls[index]?.[0];

  if (typeof callback !== "function") {
    throw new Error(
      `Expected deferred notification callback ${index}.`,
    );
  }

  await callback();
}

function setCounts(
  counts: Array<{
    lastHour: number;
    lastDay: number;
  }>,
) {
  for (const count of counts) {
    vi.mocked(
      countRecentContactMessages,
    ).mockResolvedValueOnce(count);
  }
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.stubEnv(
    "CONTACT_NOTIFY_TO",
    "owner@example.com",
  );

  vi.stubEnv("NODE_ENV", "test");

  vi.mocked(headers).mockResolvedValue(
    new Headers({
      "x-forwarded-for": "192.0.2.10",
    }) as never,
  );

  vi.mocked(verifyTurnstile).mockResolvedValue({
    ok: true,
  });

  vi.mocked(isContactFormEnabled).mockResolvedValue(
    true,
  );

  vi.mocked(insertContactMessage).mockResolvedValue(
    undefined,
  );

  vi.mocked(
    countRecentContactMessages,
  ).mockResolvedValue({
    lastHour: 1,
    lastDay: 1,
  });

  vi.mocked(sendEmail).mockResolvedValue("sent");

  vi.spyOn(console, "error").mockImplementation(
    () => {},
  );

  vi.spyOn(console, "warn").mockImplementation(
    () => {},
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Contact notification recovery", () => {
  describe("Persistence and deferred delivery", () => {
    it("does not schedule owner notification until message persistence completes", async () => {
      let finishInsert: () => void = () => {};

      const pendingInsert = new Promise<void>(
        (resolve) => {
          finishInsert = resolve;
        },
      );

      vi.mocked(
        insertContactMessage,
      ).mockReturnValueOnce(pendingInsert);

      const pendingSubmission = submit();

      await vi.waitFor(() => {
        expect(
          insertContactMessage,
        ).toHaveBeenCalledOnce();
      });

      expect(after).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();

      finishInsert();

      const result = await pendingSubmission;

      expect(result.status).toBe("sent");
      expect(after).toHaveBeenCalledOnce();
    });

    it("preserves the saved message and does not automatically retry a failed email", async () => {
      vi.mocked(sendEmail).mockRejectedValueOnce(
        new Error("Brevo unavailable"),
      );

      const result = await submit();

      expect(result.status).toBe("sent");
      expect(insertContactMessage).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();

      await expect(
        runNotification(0),
      ).resolves.toBeUndefined();

      expect(sendEmail).toHaveBeenCalledOnce();

      expect(
        countRecentContactMessages,
      ).toHaveBeenCalledOnce();

      expect(console.error).toHaveBeenCalledWith(
        "A contact message was saved, but the notification email failed:",
        expect.any(Error),
      );
    });

    it("does not automatically retry when notification-count retrieval fails", async () => {
      vi.mocked(
        countRecentContactMessages,
      ).mockRejectedValueOnce(
        new Error("D1 count unavailable"),
      );

      const result = await submit();

      expect(result.status).toBe("sent");

      await runNotification(0);

      expect(
        insertContactMessage,
      ).toHaveBeenCalledOnce();

      expect(
        countRecentContactMessages,
      ).toHaveBeenCalledOnce();

      expect(sendEmail).not.toHaveBeenCalled();
      expect(after).toHaveBeenCalledOnce();
    });

    it("does not retry when the email provider reports skipped delivery", async () => {
      vi.mocked(sendEmail).mockResolvedValueOnce(
        "skipped",
      );

      const result = await submit();

      await runNotification(0);

      expect(result.status).toBe("sent");

      expect(
        insertContactMessage,
      ).toHaveBeenCalledOnce();

      expect(sendEmail).toHaveBeenCalledOnce();
      expect(after).toHaveBeenCalledOnce();
    });

    it("does not retroactively deliver a message after missing notification configuration is corrected", async () => {
      vi.stubEnv("CONTACT_NOTIFY_TO", "");

      const first = await submit({
        message: "First message",
      });

      await runNotification(0);

      expect(first.status).toBe("sent");
      expect(sendEmail).not.toHaveBeenCalled();

      vi.stubEnv(
        "CONTACT_NOTIFY_TO",
        "owner@example.com",
      );

      const second = await submit({
        message: "Second message",
      });

      await runNotification(1);

      expect(second.status).toBe("sent");

      expect(
        insertContactMessage,
      ).toHaveBeenCalledTimes(2);

      expect(sendEmail).toHaveBeenCalledOnce();

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Second message",
        }),
      );
    });
  });

  describe("Repeated and concurrent accepted submissions", () => {
    it("handles two separately accepted identical submissions as two saved messages", async () => {
      const first = await submit();
      const second = await submit();

      expect(first.status).toBe("sent");
      expect(second.status).toBe("sent");

      expect(
        insertContactMessage,
      ).toHaveBeenCalledTimes(2);

      expect(after).toHaveBeenCalledTimes(2);

      await runNotification(0);
      await runNotification(1);

      expect(sendEmail).toHaveBeenCalledTimes(2);

      // This documents accepted server-action calls.
      // The test does not claim Turnstile would accept
      // a reused token in production.
      expect(verifyTurnstile).toHaveBeenCalledTimes(
        2,
      );
    });

    it("handles concurrent accepted submissions without merging their notification callbacks", async () => {
      const results = await Promise.all([
        submit(),
        submit(),
      ]);

      expect(
        results.map((result) => result.status),
      ).toEqual(["sent", "sent"]);

      expect(
        insertContactMessage,
      ).toHaveBeenCalledTimes(2);

      expect(after).toHaveBeenCalledTimes(2);

      await Promise.all([
        runNotification(0),
        runNotification(1),
      ]);

      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("characterizes duplicate notifications if the same deferred callback is executed twice", async () => {
      await submit();

      expect(
        insertContactMessage,
      ).toHaveBeenCalledOnce();

      await runNotification(0);
      await runNotification(0);

      expect(sendEmail).toHaveBeenCalledTimes(2);

      expect(
        buildContactNotification,
      ).toHaveBeenCalledTimes(2);

      expect(
        insertContactMessage,
      ).toHaveBeenCalledOnce();

      // This is a test-controlled repeated invocation,
      // not a claim that Next.js normally invokes
      // a scheduled callback more than once.
    });

    it("does not replay a failed notification during a later successful submission", async () => {
      vi.mocked(sendEmail)
        .mockRejectedValueOnce(
          new Error("First delivery failed"),
        )
        .mockResolvedValueOnce("sent");

      const first = await submit({
        message: "First message",
      });

      await runNotification(0);

      const second = await submit({
        message: "Second message",
      });

      await runNotification(1);

      expect(first.status).toBe("sent");
      expect(second.status).toBe("sent");

      expect(
        insertContactMessage,
      ).toHaveBeenCalledTimes(2);

      expect(sendEmail).toHaveBeenCalledTimes(2);

      expect(sendEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          text: "First message",
        }),
      );

      expect(sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          text: "Second message",
        }),
      );

      // The first message is saved, but its failed
      // notification is not placed into a retry queue.
    });
  });

  describe("Notification limits across multiple submissions", () => {
    it("sends one hourly-cap warning and suppresses later notifications as counts rise", async () => {
      setCounts([
        { lastHour: 20, lastDay: 20 },
        { lastHour: 21, lastDay: 21 },
        { lastHour: 22, lastDay: 22 },
      ]);

      for (let index = 0; index < 3; index++) {
        const result = await submit({
          message: `Message ${index + 1}`,
        });

        expect(result.status).toBe("sent");

        await runNotification(index);
      }

      expect(
        insertContactMessage,
      ).toHaveBeenCalledTimes(3);

      expect(sendEmail).toHaveBeenCalledTimes(2);

      expect(sendEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          subject: "New contact message from Taylor",
        }),
      );

      expect(sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          subject:
            "Website contact form: email alerts paused",
        }),
      );

      expect(
        buildContactNotification,
      ).toHaveBeenCalledOnce();
    });

    it("sends one daily-cap warning and suppresses later notifications as counts rise", async () => {
      setCounts([
        { lastHour: 1, lastDay: 100 },
        { lastHour: 1, lastDay: 101 },
        { lastHour: 1, lastDay: 102 },
      ]);

      for (let index = 0; index < 3; index++) {
        const result = await submit({
          message: `Daily message ${index + 1}`,
        });

        expect(result.status).toBe("sent");

        await runNotification(index);
      }

      expect(
        insertContactMessage,
      ).toHaveBeenCalledTimes(3);

      expect(sendEmail).toHaveBeenCalledTimes(2);

      expect(sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          subject:
            "Website contact form: email alerts paused",
        }),
      );
    });

    it("characterizes repeated cap-warning delivery if the same callback is executed twice", async () => {
      vi.mocked(
        countRecentContactMessages,
      ).mockResolvedValue({
        lastHour: 21,
        lastDay: 21,
      });

      await submit();

      await runNotification(0);
      await runNotification(0);

      expect(
        insertContactMessage,
      ).toHaveBeenCalledOnce();

      expect(sendEmail).toHaveBeenCalledTimes(2);

      expect(sendEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          subject:
            "Website contact form: email alerts paused",
        }),
      );

      expect(sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          subject:
            "Website contact form: email alerts paused",
        }),
      );

      // No callback-level idempotency guard exists.
      // Database counts alone do not prevent this
      // deliberately repeated callback invocation.
    });
  });
});
