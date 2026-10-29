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
  ].join("\n");

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2b211d">',
    `<p>Hi ${escapeHtml(invite.username)},</p>`,
    `<p>${escapeHtml(introduction)}</p>`,
    `<p><a href="${escapeHtml(setupUrl)}">Create your password</a></p>`,
    "<p>This link expires in 24 hours and can be used only once.</p>",
    `<p>After creating your password, <a href="${escapeHtml(loginUrl)}">sign in</a> using <strong>${escapeHtml(invite.email)}</strong>.</p>`,
    "<p>Alternatively, if this email is associated with a Google account, choose <strong>Continue with Google</strong> on the login page.</p>",
    "<p>If the setup link expires, choose <strong>Set or reset password</strong> on the login page to request another link.</p>",
    "<p>If you weren't expecting this invitation, you can ignore it.</p>",
    "</div>",
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
