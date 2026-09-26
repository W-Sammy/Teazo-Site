/**
 * Outgoing email. Production sends through Brevo's transactional API. Local
 * development never sends real mail:
 *
 *   BREVO_API_KEY set   sent through Brevo
 *   MAILPIT_URL set     delivered to a local Mailpit inbox (optional, development)
 *   neither             printed in the terminal in development, skipped elsewhere
 *
 * Setup for each case is in docs/DEV-GUIDE.md (sections 2.2 and 8.1).
 *
 * SERVER ONLY. BREVO_API_KEY can send mail as the shop, so it is never named
 * NEXT_PUBLIC_ and must never reach the browser.
 */
import "server-only";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: { email: string; name?: string };
};

/** What happened to the email: really sent, caught by Mailpit, printed, or skipped. */
export type SendOutcome = "sent" | "captured" | "printed" | "skipped";

export class EmailError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "EmailError";
    this.status = status;
  }
}

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_FROM_NAME = "TEAZO website";
const DEV_FROM = "website@teazo.test";

/** Names and subjects end up in email headers, which must stay on one line. */
const oneLine = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();

/** Brevo allows at most 70 characters in a sender or reply-to name. */
const shortName = (value: string) => oneLine(value).slice(0, 70);

export async function sendEmail(email: OutgoingEmail): Promise<SendOutcome> {
  const subject = oneLine(email.subject);
  const fromName = shortName(process.env.EMAIL_FROM_NAME || DEFAULT_FROM_NAME);
  const replyName = email.replyTo?.name ? shortName(email.replyTo.name) : "";
  const apiKey = process.env.BREVO_API_KEY;

  if (apiKey) {
    const fromEmail = process.env.EMAIL_FROM;
    if (!fromEmail) {
      throw new EmailError("EMAIL_FROM must be set to a sender address verified in Brevo.");
    }

    const body = {
      sender: { email: fromEmail, name: fromName },
      to: [{ email: email.to }],
      ...(email.replyTo && {
        replyTo: { email: email.replyTo.email, ...(replyName && { name: replyName }) },
      }),
      subject,
      // Both bodies: Brevo's docs disagree on whether text alone is accepted.
      htmlContent: email.html,
      textContent: email.text,
      // Sandbox: Brevo checks the request but delivers nothing and keeps no log.
      ...(process.env.BREVO_SANDBOX === "1" && { headers: { "X-Sib-Sandbox": "drop" } }),
    };

    let res: Response;
    try {
      res = await fetch(BREVO_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new EmailError(`could not reach Brevo: ${String(cause)}`);
    }

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
      const detail = [payload.code, payload.message ?? res.statusText].filter(Boolean).join(": ");
      throw new EmailError(`Brevo refused the email (${res.status}) ${detail}`, res.status);
    }
    return "sent";
  }

  const mailpit = process.env.MAILPIT_URL;
  if (mailpit) {
    let res: Response;
    try {
      res = await fetch(`${mailpit.replace(/\/+$/, "")}/api/v1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: { Email: process.env.EMAIL_FROM || DEV_FROM, Name: fromName },
          To: [{ Email: email.to }],
          ReplyTo: email.replyTo ? [{ Email: email.replyTo.email, Name: replyName }] : [],
          Subject: subject,
          Text: email.text,
          HTML: email.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (cause) {
      throw new EmailError(`could not reach Mailpit at ${mailpit}: ${String(cause)}`);
    }
    if (!res.ok) throw new EmailError(`Mailpit refused the email (${res.status})`, res.status);
    return "captured";
  }

  if (process.env.NODE_ENV === "development") {
    console.info(
      `\n[email] Not sent (no BREVO_API_KEY or MAILPIT_URL). This is what would go out:\n` +
        `To: ${email.to}\nReply-To: ${email.replyTo?.email ?? "(none)"}\nSubject: ${subject}\n\n${email.text}\n`,
    );
    return "printed";
  }

  // A deployment with no key, such as a preview, sends nothing. Nothing the
  // visitor typed is logged.
  console.warn("[email] Not sent because BREVO_API_KEY is not set.");
  return "skipped";
}
