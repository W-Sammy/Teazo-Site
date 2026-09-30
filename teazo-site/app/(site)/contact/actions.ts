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
  | { status: "error"; message: string; values: ContactFormValues };

// Mirrors the maxLength attributes on the form. Those only help honest
// visitors, so the real limits are enforced here.
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
  missing: "Please wait for the security check above the Submit button to finish, then try again.",
  rejected: "The security check didn't pass. Please try it again.",
  unavailable: "The security check isn't working right now. Please try again in a moment.",
} as const;

function read(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The visitor's IP as Vercel reports it, passed to Turnstile as an extra signal. */
async function visitorIp(): Promise<string | undefined> {
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && /^[0-9a-fA-F:.]{3,45}$/.test(forwarded) ? forwarded : undefined;
}

/**
 * Caps on owner emails. Brevo's free plan sends 300 a day in total, and
 * Turnstile raises the cost of spam without capping it, so a flood of messages
 * must not use up the day's emails. Past a cap, messages are still saved.
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
 * Email the owner about a message that is already saved. Runs after the
 * visitor has their answer, so a slow or failed email never loses the message.
 */
async function notifyOwner(values: ContactFormValues): Promise<void> {
  // In development a placeholder address is used, so the email still prints.
  const to =
    process.env.CONTACT_NOTIFY_TO ||
    (process.env.NODE_ENV === "development" ? "owner@teazo.test" : "");
  if (!to) {
    console.warn("CONTACT_NOTIFY_TO is not set, so nobody was emailed about a new contact message.");
    return;
  }

  try {
    const recent = await countRecentContactMessages();
    const overHour = recent.lastHour - EMAILS_PER_HOUR;
    const overDay = recent.lastDay - EMAILS_PER_DAY;

    if (overHour > 0 || overDay > 0) {
      // The message that takes a count past its cap sends one notice, and the
      // rest are only saved. Nothing is sent at all once the day is past its
      // cap. The Nth message within any 24 hours sees a daily count of at least
      // N, so however a flood is paced, at most EMAILS_PER_DAY + 1 emails go
      // out in any 24 hours.
      if (overDay === 1 || (overHour === 1 && overDay <= 0)) {
        await sendEmail({ to, ...ALERTS_PAUSED_EMAIL });
      } else {
        console.warn("Contact message saved without an email: the hourly or daily email cap was reached.");
      }
      return;
    }

    await sendEmail({ to, ...buildContactNotification(values, new Date()) });
  } catch (error) {
    console.error("A contact message was saved, but the notification email failed:", error);
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

  // Hidden from people and filled in by bots. Report success so they move on.
  if (read(form, "company")) return { status: "sent" };

  const fail = (message: string): ContactFormState => ({
    status: "error",
    message,
    values,
  });

  if (!values.firstName || !values.email || !values.message) {
    return fail("Please fill in your first name, email and message.");
  }

  if (!EMAIL_PATTERN.test(values.email)) {
    return fail("Please enter a valid email address.");
  }

  for (const field of Object.keys(LIMITS) as (keyof ContactFormValues)[]) {
    if (values[field].length > LIMITS[field]) {
      return fail(`Please shorten the ${LABELS[field]} to ${LIMITS[field]} characters or fewer.`);
    }
  }

  // The bot check comes before anything touches the database or sends email.
  const check = await verifyTurnstile(read(form, "cf-turnstile-response"), await visitorIp());
  if (!check.ok) return fail(BOT_CHECK_MESSAGES[check.reason]);

  try {
    // Checked here as well as on the page, because hiding the form does not
    // stop someone from posting to this action directly.
    if (!(await isContactFormEnabled())) {
      return fail("The contact form is not accepting messages right now.");
    }

    await insertContactMessage(values);
  } catch (error) {
    console.error("Contact form submission failed:", error);
    return fail("Your message could not be sent right now. Please try again in a moment.");
  }

  after(() => notifyOwner(values));
  return { status: "sent" };
}
