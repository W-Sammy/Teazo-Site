
import { describe, expect, it, vi } from "vitest";

// The invitation builder is server-only.
// Mock its external dependencies so no emails are sent.
vi.mock("server-only", () => ({}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(),
}));

import { buildAdminInvite } from "./admin-invite";

describe("Admin invitation messaging", () => {
  const site = "http://localhost:3000";

  const adminInvite = {
    email: "admin@example.invalid",
    username: "Test Admin",
    role: 2 as const,
    invitedBy: "Test Owner",
  };

  it("uses the Admin role in the invitation", () => {
    const result = buildAdminInvite(adminInvite, site);

    expect(result.subject).toBe(
      "You've been added as an admin of the TEAZO website",
    );

    expect(result.text).toContain(
      "Test Owner added you to the TEAZO website with Admin access.",
    );

    expect(result.html).toContain(
      "<strong>Admin</strong> access.",
    );
  });

  it("does not include retired role or permission terminology", () => {
    const result = buildAdminInvite(adminInvite, site);

    const content = [
      result.subject,
      result.text,
      result.html,
    ].join("\n");

    expect(content).not.toMatch(
      /\bCan Edit\b|\bCan View\b|\bManage Admins\b/i,
    );

    expect(content).not.toContain(
      "You can also add and remove other admins.",
    );
  });

  it("includes the correct Google SSO instructions", () => {
    const result = buildAdminInvite(adminInvite, site);

    expect(result.text).toContain(
      "http://localhost:3000/login",
    );

    expect(result.text).toContain(
      'Choose "Continue with Google"',
    );

    expect(result.text).toContain(
      "admin@example.invalid",
    );

    expect(result.html).toContain(
      'href="http://localhost:3000/login"',
    );

    expect(result.html).toContain(
      "Continue with Google",
    );

    expect(result.html).toContain(
      "admin@example.invalid",
    );
  });

  it("supports invitations without an invitedBy username", () => {
    const result = buildAdminInvite(
      {
        email: "admin@example.invalid",
        username: "Test Admin",
        role: 2,
      },
      site,
    );

    expect(result.text).toContain(
      "You've been added to the TEAZO website with Admin access.",
    );

    expect(result.html).toContain(
      "<strong>Admin</strong> access.",
    );
  });

  it("escapes special characters in invitation HTML", () => {
    const result = buildAdminInvite(
      {
        email: "admin@example.invalid",
        username: 'Test <Admin> & "Team"',
        role: 2,
        invitedBy: "Owner <script>alert(1)</script>",
      },
      site,
    );

    expect(result.html).toContain(
      "Test &lt;Admin&gt; &amp; &quot;Team&quot;",
    );

    expect(result.html).toContain(
      "Owner &lt;script&gt;alert(1)&lt;/script&gt;",
    );

    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("</script>");
  });

  it("preserves the Owner role label when building an Owner invitation", () => {
    const result = buildAdminInvite(
      {
        email: "owner@example.invalid",
        username: "Test Owner",
        role: 1,
      },
      site,
    );

    expect(result.text).toContain(
      "Owner access.",
    );

    expect(result.html).toContain(
      "<strong>Owner</strong> access.",
    );
  });
});
