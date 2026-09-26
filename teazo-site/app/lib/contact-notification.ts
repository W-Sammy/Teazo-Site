/**
 * The email the shop owner gets when someone sends a message through the
 * contact form. Pure, so it can be tested without a server.
 *
 * Everything the visitor typed is untrusted: it is escaped in the HTML body,
 * and sendEmail() keeps the subject and names on one line.
 */

export type ContactNotificationInput = {
  firstName: string;
  lastName: string;
  email: string;
  subject: string;
  message: string;
};

const SHOP_TIME_ZONE = "America/Los_Angeles";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildContactNotification(input: ContactNotificationInput, receivedAt: Date) {
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
  const received = `${new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(receivedAt)} Pacific`;

  const subject = `New website message from ${name}${input.subject ? `: ${input.subject}` : ""}`;

  const text = [
    "New message from the contact form on the TEAZO website.",
    "",
    `Name: ${name}`,
    `Email: ${input.email}`,
    `Subject: ${input.subject || "(none)"}`,
    `Received: ${received}`,
    "",
    "Message:",
    input.message,
    "",
    "Reply to this email to answer them directly.",
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#6b5f58">${label}</td><td style="padding:2px 0">${escapeHtml(value)}</td></tr>`;

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2b211d">',
    "<p>New message from the contact form on the TEAZO website.</p>",
    '<table style="border-collapse:collapse">',
    row("Name", name),
    row("Email", input.email),
    row("Subject", input.subject || "(none)"),
    row("Received", received),
    "</table>",
    `<p style="white-space:pre-wrap;border-left:3px solid #dbb082;padding-left:12px">${escapeHtml(input.message)}</p>`,
    '<p style="color:#6b5f58">Reply to this email to answer them directly.</p>',
    "</div>",
  ].join("");

  return {
    subject,
    text,
    html,
    replyTo: { email: input.email, name },
  };
}
