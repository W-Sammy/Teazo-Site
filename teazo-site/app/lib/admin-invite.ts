/**
 * The email sent when an Owner adds an administrator in Settings.
 *
 * Newly invited administrators receive the Admin role.
 * The invitation explains how to sign in with the invited Google account.
 *
 * The Owner is responsible for adding and removing administrators.
 * Regular Admins do not receive administrator-management privileges.
 *
 * A password login can be used separately when credentials have
 * already been configured for an administrator account.
 *
 * Call this after the admin_user row is saved, using after()
 * when invitation delivery is connected to the creation route.
 *
 * A failed email must not revoke an otherwise successful invitation.
 *
 * SERVER ONLY.
 */

import "server-only";

import type { AdminRole } from "@/app/types/admin-perms";
import { sendEmail, type SendOutcome } from "./email";

export type AdminInvite = {
  /** The email address authorized to access the site. */
  email: string;
  username: string;
  role: AdminRole;

  /** Username of the Owner who added this administrator. */
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

/** Where the site lives, for the sign-in link. */
function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (production) {
    return `https://${production}`;
  }

  return "http://localhost:3000";
}

/** Build the text and HTML invitation without sending it. */
export function buildAdminInvite(
  invite: AdminInvite,
  site: string,
) {
  const loginUrl = `${site}/login`;

  const who = invite.invitedBy
    ? `${invite.invitedBy} added you`
    : "You've been added";

  const access = ROLE_LABELS[invite.role];

  const text = [
    `Hi ${invite.username},`,
    "",
    `${who} to the TEAZO website with ${access} access.`,
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
    `<p>${escapeHtml(who)} to the TEAZO website with <strong>${access}</strong> access.</p>`,
    "<p>To sign in:</p>",
    "<ol>",
    `<li>Go to <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>`,
    `<li>Choose <strong>Continue with Google</strong> and use this email address: <strong>${escapeHtml(invite.email)}</strong></li>`,
    "</ol>",
    `<p>If ${escapeHtml(invite.email)} isn't a Google account yet, you can make it one at <a href="https://accounts.google.com/signup">accounts.google.com/signup</a> by choosing to use your existing email address.</p>`,
    '<p style="color:#6b5f58">If you weren\'t expecting this, you can ignore this email.</p>',
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
    return await sendEmail({
      to: invite.email,
      ...buildAdminInvite(invite, siteUrl()),
    });
  } catch (error) {
    console.error(
      "An admin was added, but the invite email failed:",
      error,
    );

    return "failed";
  }
}
