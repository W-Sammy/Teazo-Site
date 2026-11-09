/**
 * Tests the notification sent to the shop owner when a visitor
 * submits the public Teazo contact form.
 *
 * The notification builder is pure, so no database, email,
 * network, or authentication mocks are required.
 *
 * Tests focus on message content, HTML escaping, reply-to
 * information, optional fields, and Pacific time formatting.
 */

import { describe, expect, it } from "vitest";

import {
  buildContactNotification,
  type ContactNotificationInput,
} from "./contact-notification";

const RECEIVED_AT = new Date("2026-10-25T00:30:00.000Z");

function contact(
  overrides: Partial<ContactNotificationInput> = {},
): ContactNotificationInput {
  return {
    firstName: "Taylor",
    lastName: "Smith",
    email: "taylor@example.com",
    subject: "Catering question",
    message: "Do you offer catering for events?",
    ...overrides,
  };
}

describe("Contact notification generation", () => {
  // ============================================================
  // Email subject and reply-to metadata
  // ============================================================

  it("includes the visitor name and subject in the email subject", () => {
    const notification = buildContactNotification(
      contact(),
      RECEIVED_AT,
    );

    expect(notification.subject).toBe(
      "New website message from Taylor Smith: Catering question",
    );
  });

  it("omits the subject suffix when the visitor leaves it blank", () => {
    const notification = buildContactNotification(
      contact({ subject: "" }),
      RECEIVED_AT,
    );

    expect(notification.subject).toBe(
      "New website message from Taylor Smith",
    );
  });

  it("handles an omitted optional last name", () => {
    const notification = buildContactNotification(
      contact({ lastName: "" }),
      RECEIVED_AT,
    );

    expect(notification.subject).toBe(
      "New website message from Taylor: Catering question",
    );

    expect(notification.replyTo.name).toBe("Taylor");
  });

  // Reply-to enables the owner to respond directly to the visitor.
  it("uses the visitor email as the reply-to address", () => {
    const notification = buildContactNotification(
      contact(),
      RECEIVED_AT,
    );

    expect(notification.replyTo).toEqual({
      email: "taylor@example.com",
      name: "Taylor Smith",
    });
  });

  // ============================================================
  // Plain-text message content
  // ============================================================

  it("includes the visitor details in the plain-text body", () => {
    const notification = buildContactNotification(
      contact(),
      RECEIVED_AT,
    );

    expect(notification.text).toContain(
      "Name: Taylor Smith",
    );

    expect(notification.text).toContain(
      "Email: taylor@example.com",
    );

    expect(notification.text).toContain(
      "Subject: Catering question",
    );

    expect(notification.text).toContain(
      "Message:\nDo you offer catering for events?",
    );
  });

  it("shows a fallback for an optional empty subject", () => {
    const notification = buildContactNotification(
      contact({ subject: "" }),
      RECEIVED_AT,
    );

    expect(notification.text).toContain("Subject: (none)");
    expect(notification.html).toContain("(none)");
  });

  it("preserves multiline visitor messages", () => {
    const message = "First line\nSecond line\nThird line";

    const notification = buildContactNotification(
      contact({ message }),
      RECEIVED_AT,
    );

    expect(notification.text).toContain(message);
    expect(notification.html).toContain(message);
    expect(notification.html).toContain("white-space:pre-wrap");
  });

  // ============================================================
  // HTML escaping
  // ============================================================

  // User-provided HTML must appear as text, not executable markup.
  it("escapes HTML tags in the visitor message", () => {
    const notification = buildContactNotification(
      contact({
        message: "<script>alert('test')</script>",
      }),
      RECEIVED_AT,
    );

    expect(notification.html).toContain("&lt;script&gt;");
    expect(notification.html).toContain("&lt;/script&gt;");
    expect(notification.html).not.toContain("<script>");
  });

  it("escapes special HTML characters in visitor details", () => {
    const notification = buildContactNotification(
      contact({
        firstName: 'A&B"',
        lastName: "<Visitor>",
        subject: "Tea > Coffee",
        message: "Would you serve tea & pastries?",
      }),
      RECEIVED_AT,
    );

    expect(notification.html).toContain("A&amp;B&quot;");
    expect(notification.html).toContain("&lt;Visitor&gt;");
    expect(notification.html).toContain("Tea &gt; Coffee");
    expect(notification.html).toContain("tea &amp; pastries");
  });

  it("escapes single quotes in the HTML body", () => {
    const notification = buildContactNotification(
      contact({
        message: "It's a question about today's menu.",
      }),
      RECEIVED_AT,
    );

    expect(notification.html).toContain("It&#39;s");
    expect(notification.html).toContain("today&#39;s");
  });

  // ============================================================
  // Timestamp formatting and owner guidance
  // ============================================================

  // The shop uses Los Angeles time regardless of server timezone.
  it("displays the received date in Pacific time", () => {
    const notification = buildContactNotification(
      contact(),
      RECEIVED_AT,
    );

    expect(notification.text).toContain("Oct 24, 2026");
    expect(notification.text).toContain("5:30 PM");
    expect(notification.text).toContain("Pacific");
  });

  it("includes guidance to reply directly to the visitor", () => {
    const notification = buildContactNotification(
      contact(),
      RECEIVED_AT,
    );

    expect(notification.text).toContain(
      "Reply to this email to answer them directly.",
    );

    expect(notification.html).toContain(
      "Reply to this email to answer them directly.",
    );
  });
});
