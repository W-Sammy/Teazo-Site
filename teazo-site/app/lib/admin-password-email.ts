import "server-only";

import { normalizeEmail } from "./admin-whitelist";
import { prepare } from "./d1";
import { sendEmail, type SendOutcome } from "./email";
import {
  createPasswordToken,
  type PasswordTokenPurpose,
} from "./admin-password-tokens";

type PasswordEmailAdmin = {
  id: string;
  email_normalized: string;
  needs_password_setup: 0 | 1;
};

export function applicationUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;

  if (!configured) {
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:3000";
    }

    throw new Error("NEXT_PUBLIC_BASE_URL is required.");
  }

  const url = new URL(configured);

  const localDevelopment =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);

  if (
    (url.protocol !== "https:" &&
      !(localDevelopment && url.protocol === "http:")) ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid application URL.");
  }

  return url.origin;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send a password setup or reset link to an existing admin.
 *
 * Returns null when the account does not qualify.
 * Database and delivery failures propagate to the caller.
 *
 * Call only from a rate-limited request handler or an
 * authorized admin invitation flow.
 */
export async function sendAdminPasswordEmail(
  email: string,
): Promise<SendOutcome | null> {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || normalizedEmail.length > 254) {
    return null;
  }

  // Resolve the account and recipient from the database.
  const admin = await prepare(
    `SELECT id, email_normalized, password_hash IS NULL AS needs_password_setup
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')
        AND role_id IN (1, 2, 3)
      LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<PasswordEmailAdmin>();

  if (!admin) return null;
  const purpose: PasswordTokenPurpose =
    admin.needs_password_setup === 1 ? "setup" : "reset";
  // Validate configuration before creating a token.
  const link = new URL("/login", applicationUrl());

  const created = await createPasswordToken(admin.id, purpose);

  if (!created) return null;

  link.searchParams.set("passwordAction", purpose);
  link.searchParams.set("token", created.token);

  const isSetup = purpose === "setup";

  const action = isSetup ? "Create your password" : "Reset your password";

  const explanation = isSetup
    ? "Your email has been added as an admin of the TEAZO website."
    : "We received a request to reset your TEAZO admin password.";

  const expiration = isSetup ? "24 hours" : "30 minutes";

  const passwordUrl = link.toString();

  const text = [
    explanation,
    "",
    `${action}:`,
    passwordUrl,
    "",
    `This link expires in ${expiration} and can be used only once.`,
    "If you were not expecting this email, you can ignore it.",
  ].join("\n");

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.5">',
    `<p>${explanation}</p>`,
    `<p><a href="${escapeHtml(passwordUrl)}">${action}</a></p>`,
    `<p>This link expires in ${expiration} and can be used only once.</p>`,
    "<p>If you were not expecting this email, you can ignore it.</p>",
    "</div>",
  ].join("");

  return sendEmail({
    to: admin.email_normalized,
    subject: `${action} — TEAZO Admin`,
    text,
    html,
  });
}

/**
 * Notify the registered admin after a successful password change.
 *
 * Contains no password, password hash, or setup/reset token.
 * Delivery errors propagate to the caller.
 */
export async function sendAdminPasswordChangedEmail(
  email: string,
): Promise<SendOutcome> {
  const text = [
    "Your TEAZO admin password has been changed.",
    "",
    "If you made this change, no further action is needed.",
    "",
    "If you did not make this change, contact the website owner immediately.",
  ].join("\n");

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.5">',
    "<p>Your TEAZO admin password has been changed.</p>",
    "<p>If you made this change, no further action is needed.</p>",
    "<p>If you did not make this change, contact the website owner immediately.</p>",
    "</div>",
  ].join("");

  return sendEmail({
    to: email,
    subject: "Your TEAZO admin password has changed",
    text,
    html,
  });
}