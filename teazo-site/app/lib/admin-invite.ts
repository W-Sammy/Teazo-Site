/**
 * Invitation email for newly added admins.
 *
 * Includes a single-use password setup link, assigned access,
 * and Google sign-in as an alternative.
 *
 * Call only after the admin account has been saved and
 * the inviting user's permissions have been checked.
 *
 * Delivery failures preserve the newly created account.
 */
import "server-only";
import type { AdminRole } from "./admin-whitelist";
import { sendEmail, type SendOutcome } from "./email";
import { applicationUrl } from "./admin-password-email";
import { createPasswordToken } from "./admin-password-tokens";

export type AdminInvite = {
  /** ID of the account that was successfully saved. */
  adminId: string;
  /** The address that was added. It must be the Google account they sign in with. */
  email: string;
  username: string;
  role: AdminRole;
  /** Whether a Can Edit admin may also add and remove other admins. */
  canManageAdmins?: boolean;
  /** The username of the admin who added them. */
  invitedBy?: string;
};

const ROLE_LABELS: Record<AdminRole, string> = {
  1: "Owner",
  2: "Can Edit",
  3: "Can View",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");


/** The email itself. Pure, so it can be tested without a server. */
export function buildAdminInvite(invite: AdminInvite, site: string, setupUrl: string,) {
  const loginUrl = new URL("/login", site).toString();

  const who = invite.invitedBy
    ? `${invite.invitedBy} added you`
    : "You've been added";

  const access = ROLE_LABELS[invite.role];

  const manages =
    invite.role === 2 && invite.canManageAdmins
      ? " You can also add and remove other admins."
      : "";

  const introduction =
    `${who} as an admin of the TEAZO website, ` +
    `with ${access} access.${manages}`;

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

    // This helper verifies that the account is eligible
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
      ...buildAdminInvite(invite, site, setupLink.toString()),
    });
  } catch (error) {
    // // Do not log tokens, email contents, or provider payloads.
    // console.error("An admin was added, but the invite email failed.");

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
