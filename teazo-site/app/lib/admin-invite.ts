/**
 * Invitation email sent when an Owner adds an administrator.
 *
 * Newly invited accounts receive the Admin role and a
 * single-use password setup link. Google sign-in remains available.
 *
 * Only call after the account has been saved and the inviting
 * user's permissions have been checked.
 *
 * Delivery failures must not revoke the created account.
 */

import "server-only";

import type { AdminRole } from "@/app/types/admin-perms";
import { sendEmail, type SendOutcome } from "./email";
import { applicationUrl } from "./admin-password-email";
import { createPasswordToken } from "./admin-password-tokens";

export type AdminInvite = {
  adminId: string;
  email: string;
  username: string;
  role: AdminRole;
  invitedBy?: string;
};

const ROLE_LABELS: Record<AdminRole, string> = {
  1: "Owner",
  2: "Admin",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Build the invitation text and HTML without sending an email. */
export function buildAdminInvite(
  invite: AdminInvite,
  site: string,
  setupUrl: string,
) {
  const loginUrl = new URL("/login", site).toString();
  const logoUrl = new URL("/teazo_logo_text.png", site).toString();

  const who = invite.invitedBy
    ? `${invite.invitedBy} added you`
    : "You've been added";

  const access = ROLE_LABELS[invite.role];

  const introduction =
    `${who} as an admin of the TEAZO website, ` +
    `with ${access} access.`;

  const text = [
    `Hi ${invite.username},`,
    "",
    introduction,
    "",
    "Create your password:",
    setupUrl,
    "",
    "This link expires in 24 hours and can be used only once.",
    "",
    `After creating your password, sign in at ${loginUrl}`,
    `using this email address: ${invite.email}`,
    "",
    "Alternatively, if this email is associated with a Google account,",
    'choose "Continue with Google" on the login page.',
    "",
    "If the setup link expires, choose Set or reset password",
    "on the login page to request another link.",
    "",
    "If you weren't expecting this invitation, you can ignore it.",
    "",
    "Please do not reply to this email. This message was automatically generated.",
  ].join("\n");

  // Table layout and inline styles keep the invitation compatible with email clients.
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background-color:#f8f4ef;color:#2b211d;font-family:Arial,Helvetica,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f4ef"><tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e7ddd4;border-radius:16px">',
    '<tr><td align="center" style="padding:32px 24px 24px;border-bottom:1px solid #eee5dc">',
    `<img src="${escapeHtml(logoUrl)}" alt="TEAZO" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0">`,
    '</td></tr><tr><td style="padding:28px 24px;font-size:15px;line-height:1.6">',
    '<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#2b211d">Welcome to TEAZO Admin</h1>',
    `<p style="margin:0 0 16px">Hi ${escapeHtml(invite.username)},</p>`,
    `<p style="margin:0 0 24px">${escapeHtml(introduction)}</p>`,
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#2b211d" style="border-radius:8px;text-align:center">',
    `<a href="${escapeHtml(setupUrl)}" style="display:inline-block;padding:14px 24px;border:1px solid #2b211d;border-radius:8px;background-color:#2b211d;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">Create your password</a>`,
    '</td></tr></table>',
    '<p style="margin:16px 0 24px;font-size:13px;color:#65564c">This link expires in 24 hours and can be used only once.</p>',
    `<p style="margin:0 0 16px">After creating your password, <a href="${escapeHtml(loginUrl)}" style="color:#2b211d;text-decoration:underline">sign in</a> using <strong>${escapeHtml(invite.email)}</strong>.</p>`,
    '<p style="margin:0 0 16px">Alternatively, if this email is associated with a Google account, choose <strong>Continue with Google</strong> on the login page.</p>',
    '<p style="margin:0 0 16px">If the setup link expires, choose <strong>Set or reset password</strong> on the login page to request another link.</p>',
    "<p style=\"margin:0\">If you weren't expecting this invitation, you can ignore it.</p>",
    '</td></tr><tr><td style="padding:20px 24px;border-top:1px solid #eee5dc;font-size:12px;line-height:1.6;color:#65564c;text-align:center">',
    '<p style="margin:0">Please do not reply to this email.<br>This message was automatically generated.</p>',
    '</td></tr></table></td></tr></table></body></html>',
  ].join("");

  return {
    subject: "You've been added as an admin of the TEAZO website",
    text,
    html,
  };
}

export async function sendAdminInvite(
  invite: AdminInvite,
): Promise<SendOutcome | "failed"> {
  try {
    const site = applicationUrl();
    const setupLink = new URL("/login", site);

    // The token helper verifies that the account is eligible
    // and does not already have a password.
    const created = await createPasswordToken(
      invite.adminId,
      "setup",
    );

    if (!created) {
      return "skipped";
    }

    setupLink.searchParams.set("passwordAction", "setup");
    setupLink.searchParams.set("token", created.token);

    return await sendEmail({
      to: invite.email,
      ...buildAdminInvite(
        invite,
        site,
        setupLink.toString(),
      ),
    });
  } catch (error) {
    // Never log setup tokens, email bodies, or provider payloads.
    if (process.env.NODE_ENV === "development") {
      console.error(
        "Admin invitation failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
    } else {
      console.error("Admin invitation failed.");
    }

    return "failed";
  }
}
