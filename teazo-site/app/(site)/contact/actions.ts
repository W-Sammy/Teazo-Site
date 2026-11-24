"use server";

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
import { getAuthoritativeWebsiteContent } from "@/app/lib/website-content";
import { isValidEmail } from "@/app/lib/website-content-validators";

export type ContactFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
};

export type ContactFormState =
  | { status: "idle" }
  | { status: "sent" }
  | {
      status: "error";
      message: string;
      values: ContactFormValues;
    };

// Enforce the same limits on the server that the form
// provides through its maxLength attributes.
const LIMITS: Record<keyof ContactFormValues, number> = {
  firstName: 100,
  lastName: 100,
  email: 254,
  subject: 200,
  message: 5000,
};

const LABELS: Record<keyof ContactFormValues, string> = {
  firstName: "first name",
  lastName: "last name",
  email: "email",
  subject: "subject",
  message: "message",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BOT_CHECK_MESSAGES = {
  missing:
    "Please wait for the security check above the Submit button to finish, then try again.",
  rejected:
    "The security check didn't pass. Please try it again.",
  unavailable:
    "The security check isn't working right now. Please try again in a moment.",
} as const;

function read(
  form: FormData,
  name: string,
): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Obtain the visitor IP from Vercel's forwarding headers.
 * Turnstile uses this as an additional verification signal.
 */
async function visitorIp(): Promise<
  string | undefined
> {
  const forwarded = (await headers())
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  return forwarded &&
    /^[0-9a-fA-F:.]{3,45}$/.test(forwarded)
    ? forwarded
    : undefined;
}

/**
 * Limits on contact notification emails.
 *
 * Messages continue to be saved when these limits are
 * exceeded, but notification delivery is restricted.
 */
const EMAILS_PER_HOUR = 20;
const EMAILS_PER_DAY = 100;

const ALERTS_PAUSED_EMAIL = {
  subject: "Website contact form: email alerts paused",
  text: [
    `More than ${EMAILS_PER_HOUR} messages in an hour, or ${EMAILS_PER_DAY} in a day, arrived through the contact form on the TEAZO website. That usually means spam.`,
    "",
    "To protect the free email allowance, you won't get an email for each new message until the rate drops. Every message is still saved on the website.",
  ].join("\n"),
  html:
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2b211d">' +
    `<p>More than ${EMAILS_PER_HOUR} messages in an hour, or ${EMAILS_PER_DAY} in a day, arrived through the contact form on the TEAZO website. That usually means spam.</p>` +
    "<p>To protect the free email allowance, you won't get an email for each new message until the rate drops. Every message is still saved on the website.</p>" +
    "</div>",
};

/**
 * Read the notification recipient from stored Website Content.
 *
 * An invalid or unavailable recipient must not cause a
 * message to be delivered to an outdated environment address.
 *
 * Do not use the public contact-page outage fallback here:
 * the recipient must come from authoritative stored content.
 */
async function getContactNotificationRecipient(): Promise<
  string | null
> {
  const content = await getAuthoritativeWebsiteContent();
  const recipient = content.address.email.trim();

  if (!isValidEmail(recipient)) {
    console.warn(
      "Contact notification skipped: Website Content has no valid notification email address.",
    );
    return null;
  }

  return recipient;
}

/**
 * Notify the configured recipient about an already-saved
 * contact message.
 *
 * Recipient lookup, rate-limit checks, and email sending
 * occur after the visitor receives a successful response.
 * Failures must not discard the submitted message.
 */
async function notifyOwner(
  values: ContactFormValues,
): Promise<void> {
  try {
    const to = await getContactNotificationRecipient();

    if (!to) {
      return;
    }

    const recent = await countRecentContactMessages();

    const overHour =
      recent.lastHour - EMAILS_PER_HOUR;
    const overDay =
      recent.lastDay - EMAILS_PER_DAY;

    if (overHour > 0 || overDay > 0) {
      // Send one warning when a cap is first exceeded.
      // Subsequent messages remain saved without sending
      // additional notifications above the limit.
      if (
        overDay === 1 ||
        (overHour === 1 && overDay <= 0)
      ) {
        await sendEmail({
          to,
          ...ALERTS_PAUSED_EMAIL,
        });
      } else {
        console.warn(
          "Contact message saved without an email: the hourly or daily email cap was reached.",
        );
      }

      return;
    }

    await sendEmail({
      to,
      ...buildContactNotification(values, new Date()),
    });
  } catch (error) {
    console.error(
      "A contact message was saved, but the notification email failed:",
      error,
    );
  }
}

export async function submitContactMessage(
  _previous: ContactFormState,
  form: FormData,
): Promise<ContactFormState> {
  const values: ContactFormValues = {
    firstName: read(form, "firstName"),
    lastName: read(form, "lastName"),
    email: read(form, "email"),
    subject: read(form, "subject"),
    message: read(form, "message"),
  };

  // Honeypot submissions receive a success-shaped
  // response without storing or sending anything.
  if (read(form, "company")) {
    return { status: "sent" };
  }

  const fail = (
    message: string,
  ): ContactFormState => ({
    status: "error",
    message,
    values,
  });

  if (
    !values.firstName ||
    !values.email ||
    !values.message
  ) {
    return fail(
      "Please fill in your first name, email and message.",
    );
  }

  if (!EMAIL_PATTERN.test(values.email)) {
    return fail(
      "Please enter a valid email address.",
    );
  }

  for (
    const field of Object.keys(LIMITS) as (
      keyof ContactFormValues
    )[]
  ) {
    if (values[field].length > LIMITS[field]) {
      return fail(
        `Please shorten the ${LABELS[field]} to ${LIMITS[field]} characters or fewer.`,
      );
    }
  }

  // Verify the bot check before touching the database.
  const check = await verifyTurnstile(
    read(form, "cf-turnstile-response"),
    await visitorIp(),
  );

  if (!check.ok) {
    return fail(
      BOT_CHECK_MESSAGES[check.reason],
    );
  }

  try {
    // Also enforce the form's enabled state server-side.
    if (!(await isContactFormEnabled())) {
      return fail(
        "The contact form is not accepting messages right now.",
      );
    }

    await insertContactMessage(values);
  } catch (error) {
    console.error(
      "Contact form submission failed:",
      error,
    );

    return fail(
      "Your message could not be sent right now. Please try again in a moment.",
    );
  }

  // Notification failures never change the stored message
  // or the successful visitor response.
  after(() => notifyOwner(values));

  return { status: "sent" };
}
