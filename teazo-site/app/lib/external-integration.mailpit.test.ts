/**
 * Guarded local Mailpit integration tests for Teazo email.
 *
 * Exercises the real sendEmail() function against a locally
 * running Mailpit instance through its HTTP API.
 *
 * Verifies connectivity, captured recipient information,
 * sender, subject, text, HTML, and reply-to metadata.
 *
 * The suite is skipped unless explicitly enabled.
 * Brevo credentials and nonlocal Mailpit endpoints are rejected.
 *
 * Every message uses a unique synthetic subject and recipient.
 * Only messages owned by these tests may be deleted.
 *
 * No real customer emails or external delivery services are used.
 */

import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  requireLocalMailpit,
} from "@/test/external-integration-guard";

import { sendEmail } from "./email";

// Require separate permission for the local email test suite.
const RUN_MAILPIT =
  process.env.TEAZO_EXTERNAL_TESTS === "1" &&
  process.env.TEAZO_MAILPIT_TESTS === "1";

// Mailpit's stored-message API uses Address rather than Email.
// Its Send API uses Email, but that is a different request format.
type MailpitAddress = {
  Address: string;
  Name?: string;
};

type MailpitSummary = {
  ID: string;
  Subject: string;
  To: MailpitAddress[];
};

type MailpitMessages = {
  messages: MailpitSummary[];
};

type MailpitMessage = {
  ID: string;
  Subject: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  ReplyTo: MailpitAddress[];
  Text: string;
  HTML: string;
};

// Use only unique synthetic recipients and message subjects.
const TEST_SENDER =
  "teazo-test-sender@example.invalid";

const TEST_REPLY_TO =
  "teazo-test-reply@example.invalid";

// Remember only subjects created by this test suite.
const testSubjects = new Set<string>();

let mailpitOrigin = "";
let preflightPassed = false;

/**
 * Contact the validated local Mailpit API.
 *
 * Redirects are disabled to ensure API requests cannot
 * follow an unexpected redirect to another host.
 */
async function mailpitRequest(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  if (!preflightPassed) {
    throw new Error(
      "Local Mailpit preflight has not passed.",
    );
  }

  // Recheck environment safety before every request.
  requireLocalMailpit();

  // Never allow the email test to run with Brevo configured.
  if (process.env.BREVO_API_KEY) {
    throw new Error(
      "Brevo must be disabled for local Mailpit tests.",
    );
  }

  return fetch(`${mailpitOrigin}${path}`, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Retrieve recent messages without changing or clearing
 * the existing Mailpit inbox.
 */
async function listMessages(): Promise<MailpitSummary[]> {
  const response = await mailpitRequest(
    "/api/v1/messages?start=0&limit=100",
  );

  expect(response.status).toBe(200);

  const result =
    (await response.json()) as MailpitMessages;

  expect(
    Array.isArray(result.messages),
  ).toBe(true);

  return result.messages;
}

/**
 * Find one test-owned message using its exact unique subject.
 *
 * Poll briefly because message storage and listing may not
 * complete at precisely the same instant.
 */
async function findTestMessage(
  subject: string,
): Promise<MailpitSummary> {
  return vi.waitFor(
    async () => {
      const messages = await listMessages();

      const found = messages.find(
        (message) => message.Subject === subject,
      );

      expect(found).toBeDefined();

      return found as MailpitSummary;
    },
    {
      timeout: 5_000,
      interval: 150,
    },
  );
}

/**
 * Retrieve the full captured email by its Mailpit ID.
 */
async function getMessage(
  id: string,
): Promise<MailpitMessage> {
  const response = await mailpitRequest(
    `/api/v1/message/${encodeURIComponent(id)}`,
  );

  expect(response.status).toBe(200);

  return response.json() as Promise<MailpitMessage>;
}

describe.skipIf(!RUN_MAILPIT)(
  "Local Mailpit email integration",
  () => {
    beforeAll(() => {
      // Require explicit opt-in, a local Mailpit URL,
      // and the absence of usable Brevo credentials.
      requireLocalMailpit();

      if (process.env.BREVO_API_KEY) {
        throw new Error(
          "Remove Brevo configuration before running Mailpit tests.",
        );
      }

      mailpitOrigin = new URL(
        process.env.MAILPIT_URL ?? "",
      ).origin;

      preflightPassed = true;
    });

    beforeEach(() => {
      // Use a synthetic sender rather than a real business
      // email address in the captured test messages.
      vi.stubEnv(
        "EMAIL_FROM",
        TEST_SENDER,
      );

      vi.stubEnv(
        "EMAIL_FROM_NAME",
        "Teazo Integration Test",
      );
    });

    afterEach(async () => {
      // Restore only environment changes made by this test.
      vi.unstubAllEnvs();

      if (!preflightPassed) {
        return;
      }

      if (testSubjects.size === 0) {
        return;
      }

      // Find only messages with subjects created by this suite.
      const messages = await listMessages();

      const ownedIds = messages
        .filter(
          (message) =>
            testSubjects.has(message.Subject) &&
            typeof message.ID === "string" &&
            message.ID.length > 0,
        )
        .map((message) => message.ID);

      // Never send an empty IDs array: Mailpit interprets
      // that as a request to delete the entire mailbox.
      if (ownedIds.length > 0) {
        const response = await mailpitRequest(
          "/api/v1/messages",
          {
            method: "DELETE",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              IDs: ownedIds,
            }),
          },
        );

        expect(response.status).toBe(200);
      }

      // Clear the test-owned identifiers only after
      // cleanup has completed successfully.
      testSubjects.clear();
    });

    it("connects to the local Mailpit HTTP API", async () => {
      const response = await mailpitRequest(
        "/api/v1/info",
      );

      expect(response.status).toBe(200);

      const result = await response.json();

      expect(result).toBeTruthy();
      expect(typeof result).toBe("object");
    });

    it("captures a synthetic email through the real Teazo email service", async () => {
      const identifier = randomUUID();

      const recipient =
        `teazo-test-${identifier}@example.invalid`;

      const subject =
        `TEAZO Local Email Test ${identifier}`;

      const text =
        `Synthetic Mailpit verification message ${identifier}`;

      const html =
        `<p>Synthetic Mailpit verification message ` +
        `${identifier}</p>`;

      // Register the subject before sending, so a failure
      // after message storage can still be cleaned up.
      testSubjects.add(subject);

      // Use the actual application email sender.
      // The safety guard ensures this goes to local Mailpit.
      const outcome = await sendEmail({
        to: recipient,
        subject,
        text,
        html,
        replyTo: {
          email: TEST_REPLY_TO,
          name: "Synthetic Reply Contact",
        },
      });

      expect(outcome).toBe("captured");

      // Confirm the message actually reached Mailpit,
      // rather than trusting the send result alone.
      const summary = await findTestMessage(subject);

      expect(summary.Subject).toBe(subject);

      // Mailpit's retrieval API uses Address, not Email.
      expect(summary.To).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Address: recipient,
          }),
        ]),
      );

      const message = await getMessage(summary.ID);

      expect(message.Subject).toBe(subject);

      // Verify the recipient returned by the full message API.
      expect(message.To).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Address: recipient,
          }),
        ]),
      );

      // Verify the actual sender address and display name.
      expect(message.From.Address).toBe(
        TEST_SENDER,
      );

      expect(message.From.Name).toBe(
        "Teazo Integration Test",
      );

      // Both text and HTML message bodies must be preserved.
      expect(message.Text).toContain(text);
      expect(message.HTML).toContain(identifier);

      // Verify the reply-to address and display name.
      expect(message.ReplyTo).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Address: TEST_REPLY_TO,
            Name: "Synthetic Reply Contact",
          }),
        ]),
      );
    });
  },
);
