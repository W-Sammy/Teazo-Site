/**
 * The email someone gets when an admin adds them in Settings (TZ-367).
 *
 * Sign-in is Google only, so the invite says where to sign in and to use
 * exactly this address. When password login exists, the set-password link
 * belongs in this email.
 *
 * Call it once the admin_user row is saved, inside after() so the admin panel
 * doesn't wait on the email provider:
 *
 *   after(() => sendAdminInvite({ email, username, role, invitedBy: viewer.username }));
 *
 * It never throws. A failed email is logged, and the new admin can still sign
 * in, so a person can always be told the same thing another way.
 *
 * SERVER ONLY.
 */
import "server-only";
import type { AdminRole } from "./admin-whitelist";
import { sendEmail, type SendOutcome } from "./email";

export type AdminInvite = {
  /** The address that was added. It must be the Google account they sign in with. */
  email: string;
  username: string;
  role: AdminRole;
  /** Whether a Can Edit admin may also add and remove other admins. */
  canManageAdmins?: boolean;
  /** The username of the admin who added them. */
  invitedBy?: string;
};

const ROLE_LABELS: Record<AdminRole, string> = { 1: "Owner", 2: "Can Edit", 3: "Can View" };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Where the site lives, for the sign-in link. */
function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return "http://localhost:3000";
}

/** The email itself. Pure, so it can be tested without a server. */
export function buildAdminInvite(invite: AdminInvite, site: string) {
  const loginUrl = `${site}/login`;
  const who = invite.invitedBy ? `${invite.invitedBy} added you` : "You've been added";
  const access = ROLE_LABELS[invite.role];
  const manages = invite.role === 2 && invite.canManageAdmins ? " You can also add and remove other admins." : "";

  const text = [
    `Hi ${invite.username},`,
    "",
    `${who} as an admin of the TEAZO website, with ${access} access.${manages}`,
    "",
    "To sign in:",
    `1. Go to ${loginUrl}`,
    `2. Choose "Continue with Google" and use this email address: ${invite.email}`,
    "",
    `If ${invite.email} isn't a Google account yet, you can make it one at https://accounts.google.com/signup by choosing to use your existing email address.`,
    "",
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n");

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2b211d">',
    `<p>Hi ${escapeHtml(invite.username)},</p>`,
    `<p>${escapeHtml(who)} as an admin of the TEAZO website, with <strong>${access}</strong> access.${manages}</p>`,
    "<p>To sign in:</p>",
    "<ol>",
    `<li>Go to <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>`,
    `<li>Choose <strong>Continue with Google</strong> and use this email address: <strong>${escapeHtml(invite.email)}</strong></li>`,
    "</ol>",
    `<p>If ${escapeHtml(invite.email)} isn't a Google account yet, you can make it one at <a href="https://accounts.google.com/signup">accounts.google.com/signup</a> by choosing to use your existing email address.</p>`,
    '<p style="color:#6b5f58">If you weren\'t expecting this, you can ignore this email.</p>',
    "</div>",
  ].join("");

  return { subject: "You've been added as an admin of the TEAZO website", text, html };
}

export async function sendAdminInvite(invite: AdminInvite): Promise<SendOutcome | "failed"> {
  try {
    return await sendEmail({ to: invite.email, ...buildAdminInvite(invite, siteUrl()) });
  } catch (error) {
    console.error("An admin was added, but the invite email failed:", error);
    return "failed";
  }
}
