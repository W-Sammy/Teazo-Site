import "server-only";

import {
  sendEmail,
  type SendOutcome,
} from "@/app/lib/email";
import { applicationUrl } from "@/app/lib/admin-password-email";
import type {
  CreatedOwnershipTransfer,
  OwnershipTransferDetails,
} from "@/app/lib/ownership-transfer";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function asHtml(lines: string[]): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2b211d">',
    ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    "</div>",
  ].join("");
}

// Send the receiving Admin a secure link to review the offer.
// Merely opening the link cannot complete the transfer.
export async function sendOwnershipTransferOffer(
  transfer: CreatedOwnershipTransfer,
): Promise<SendOutcome> {
  const link = new URL(
    "/ownership-transfer",
    applicationUrl(),
  );

  link.searchParams.set("token", transfer.token);

  const text = [
    `Hi ${transfer.recipient.username},`,
    "",
    `${transfer.owner.username} has offered to transfer ownership of the TEAZO website to your administrator account.`,
    "",
    "Review the ownership transfer:",
    link.toString(),
    "",
    "You must sign in and explicitly accept or decline.",
    "Opening this link will not transfer ownership.",
    "",
    "This link expires in 24 hours and can be used only once.",
    "",
    "If you did not expect this request, you can ignore it.",
  ].join("\n");

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2b211d">',
    `<p>Hi ${escapeHtml(transfer.recipient.username)},</p>`,
    `<p>${escapeHtml(transfer.owner.username)} has offered to transfer ownership of the TEAZO website to your administrator account.</p>`,
    `<p><a href="${escapeHtml(link.toString())}">Review ownership transfer</a></p>`,
    "<p>You must sign in and explicitly accept or decline. Opening this link will not transfer ownership.</p>",
    "<p>This link expires in 24 hours and can be used only once.</p>",
    "<p>If you did not expect this request, you can ignore it.</p>",
    "</div>",
  ].join("");

  return sendEmail({
    to: transfer.recipient.email,
    subject: "TEAZO ownership transfer invitation",
    text,
    html,
  });
}

// Notify the current Owner when the recipient declines.
// Declining does not change either administrator's role.
export async function sendOwnershipTransferDeclined(
  transfer: OwnershipTransferDetails,
): Promise<SendOutcome> {
  const lines = [
    `Hi ${transfer.owner.username},`,
    "",
    `${transfer.recipient.username} declined the TEAZO ownership transfer.`,
    "",
    "Your Owner access is unchanged.",
    "The receiving administrator remains an Admin.",
    "",
    "The previous offer is no longer valid.",
    "You may initiate a new transfer later if needed.",
  ];

  return sendEmail({
    to: transfer.owner.email,
    subject: "TEAZO ownership transfer declined",
    text: lines.join("\n"),
    html: asHtml(lines),
  });
}

// A successful transfer is already committed before these
// notifications are sent. Email failures must never reverse it.
export async function sendOwnershipTransferCompleted(
  transfer: OwnershipTransferDetails,
): Promise<PromiseSettledResult<SendOutcome>[]> {
  const previousOwnerLines = [
    `Hi ${transfer.owner.username},`,
    "",
    `The TEAZO ownership transfer to ${transfer.recipient.username} has been completed.`,
    "",
    "Your account now has Admin access.",
    "You no longer have access to Owner-only Settings.",
    "",
    "Your previous session has been invalidated.",
    "Please sign in again to continue.",
  ];

  const newOwnerLines = [
    `Hi ${transfer.recipient.username},`,
    "",
    "You are now the Owner of the TEAZO website.",
    "",
    "You can manage administrator accounts from Settings.",
    "",
    "Your previous session has been invalidated.",
    "Please sign in again to continue.",
  ];

  // Attempt both emails, even if either delivery fails.
  return Promise.allSettled([
    sendEmail({
      to: transfer.owner.email,
      subject: "TEAZO ownership transfer completed",
      text: previousOwnerLines.join("\n"),
      html: asHtml(previousOwnerLines),
    }),
    sendEmail({
      to: transfer.recipient.email,
      subject: "You are now the TEAZO website Owner",
      text: newOwnerLines.join("\n"),
      html: asHtml(newOwnerLines),
    }),
  ]);
}
