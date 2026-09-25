"use server";

import {
  insertContactMessage,
  isContactFormEnabled,
} from "@/app/lib/queries/contact";

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

function read(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
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

  try {
    // Checked here as well as on the page, because hiding the form does not
    // stop someone from posting to this action directly.
    if (!(await isContactFormEnabled())) {
      return fail("The contact form is not accepting messages right now.");
    }

    await insertContactMessage(values);
    return { status: "sent" };
  } catch (error) {
    console.error("Contact form submission failed:", error);
    return fail("Your message could not be sent right now. Please try again in a moment.");
  }
}
