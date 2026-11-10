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
  role_id: 1 | 2;
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

  // Resolve the account, role, and recipient from the database.
  const admin = await prepare(
    `SELECT id, email_normalized, role_id,
            password_hash IS NULL AS needs_password_setup
       FROM admin_user
      WHERE email_normalized = ?1
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')
        AND role_id IN (1, 2)
      LIMIT 1`,
  )
    .bind(normalizedEmail)
    .first<PasswordEmailAdmin>();

  if (!admin) return null;

  const purpose: PasswordTokenPurpose =
    admin.needs_password_setup === 1 ? "setup" : "reset";

  // Validate configuration before creating a token.
  const site = applicationUrl();
  const loginUrl = new URL("/login", site).toString();
  const logoUrl = new URL("/teazo_logo_text.png", site).toString();
  const link = new URL(loginUrl);

  const created = await createPasswordToken(admin.id, purpose);

  if (!created) return null;

  link.searchParams.set("passwordAction", purpose);
  link.searchParams.set("token", created.token);

  const isSetup = purpose === "setup";

  const action = isSetup
    ? "Create your password"
    : "Reset your password";

  const roleLabel = admin.role_id === 1 ? "Owner" : "Admin";

  const explanation = isSetup
    ? `Your email address has been added to the TEAZO website with the ${roleLabel} role.`
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
    "",
    `After ${isSetup ? "creating" : "resetting"} your password, sign in at ${loginUrl}`,
    `using this email address: ${admin.email_normalized}`,
    "",
    `Bookmark or save your admin login page: ${loginUrl}`,
    "There is no link to this page on the public website. Use your saved link",
    "or add /login to the website address whenever you need to sign in.",
    "",
    "If you were not expecting this email, you can ignore it.",
    "",
    "Please do not reply to this email. This message was automatically generated.",
  ].join("\n");

  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background-color:#f8f4ef;color:#2b211d;font-family:Arial,Helvetica,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4ef"><tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e7ddd4;border-radius:16px">',
    '<tr><td align="center" style="padding:32px 24px 24px;border-bottom:1px solid #eee5dc">',
    `<img src="${escapeHtml(logoUrl)}" alt="TEAZO" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0">`,
    '</td></tr><tr><td style="padding:28px 24px;font-size:15px;line-height:1.6">',
    `<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#2b211d">${action}</h1>`,
    `<p style="margin:0 0 24px">${escapeHtml(explanation)}</p>`,
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#2b211d" style="border-radius:8px;text-align:center">',
    `<a href="${escapeHtml(passwordUrl)}" style="display:inline-block;padding:14px 24px;border:1px solid #2b211d;border-radius:8px;background-color:#2b211d;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">${action}</a>`,
    '</td></tr></table>',
    `<p style="margin:16px 0 24px;font-size:13px;color:#65564c">This link expires in ${expiration} and can be used only once.</p>`,
    `<p style="margin:0 0 16px">After ${isSetup ? "creating" : "resetting"} your password, <a href="${escapeHtml(loginUrl)}" style="color:#2b211d;text-decoration:underline">sign in</a> using <strong>${escapeHtml(admin.email_normalized)}</strong>.</p>`,
    `<p style="margin:0 0 16px"><strong>Bookmark or save your admin login page:</strong><br><a href="${escapeHtml(loginUrl)}" style="color:#2b211d;text-decoration:underline">${escapeHtml(loginUrl)}</a><br>There is no link to this page on the public website. Use your saved link or add <strong>/login</strong> to the website address whenever you need to sign in.</p>`,
    '<p style="margin:0">If you were not expecting this email, you can ignore it.</p>',
    '</td></tr><tr><td style="padding:20px 24px;border-top:1px solid #eee5dc;font-size:12px;line-height:1.6;color:#65564c;text-align:center">',
    '<p style="margin:0">Please do not reply to this email.<br>This message was automatically generated.</p>',
    '</td></tr></table></td></tr></table></body></html>',
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
  const site = applicationUrl();
  const loginUrl = new URL("/login", site).toString();
  const logoUrl = new URL("/teazo_logo_text.png", site).toString();

  const text = [
    "Your TEAZO admin password has been changed.",
    "",
    "If you made this change, no further action is needed.",
    "",
    "If you did not make this change, contact the website owner immediately.",
    "",
    `Bookmark or save your admin login page: ${loginUrl}`,
    "There is no link to this page on the public website. Use your saved link",
    "or add /login to the website address whenever you need to sign in.",
    "",
    "Please do not reply to this email. This message was automatically generated.",
  ].join("\n");

  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background-color:#f8f4ef;color:#2b211d;font-family:Arial,Helvetica,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4ef"><tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e7ddd4;border-radius:16px">',
    '<tr><td align="center" style="padding:32px 24px 24px;border-bottom:1px solid #eee5dc">',
    `<img src="${escapeHtml(logoUrl)}" alt="TEAZO" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0">`,
    '</td></tr><tr><td style="padding:28px 24px;font-size:15px;line-height:1.6">',
    '<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#2b211d">Your password has changed</h1>',
    '<p style="margin:0 0 16px">Your TEAZO admin password has been changed.</p>',
    '<p style="margin:0 0 16px">If you made this change, no further action is needed.</p>',
    '<p style="margin:0 0 24px"><strong>If you did not make this change, contact the website owner immediately.</strong></p>',
    `<p style="margin:0"><strong>Bookmark or save your admin login page:</strong><br><a href="${escapeHtml(loginUrl)}" style="color:#2b211d;text-decoration:underline">${escapeHtml(loginUrl)}</a><br>There is no link to this page on the public website. Use your saved link or add <strong>/login</strong> to the website address whenever you need to sign in.</p>`,
    '</td></tr><tr><td style="padding:20px 24px;border-top:1px solid #eee5dc;font-size:12px;line-height:1.6;color:#65564c;text-align:center">',
    '<p style="margin:0">Please do not reply to this email.<br>This message was automatically generated.</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join("");

  return sendEmail({
    to: email,
    subject: "Your TEAZO admin password has changed",
    text,
    html,
  });
}
