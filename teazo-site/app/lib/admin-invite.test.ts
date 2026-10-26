import { describe, expect, it, vi } from "vitest";

// The invitation builder is server-only.
// Mock external dependencies so tests do not send emails
// or create password setup tokens.
vi.mock("server-only", () => ({}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("./admin-password-email", () => ({
  applicationUrl: vi.fn(),
}));

vi.mock("./admin-password-tokens", () => ({
  createPasswordToken: vi.fn(),
}));

import { buildAdminInvite } from "./admin-invite";

describe("Admin invitation messaging", () => {
  const site = "http://localhost:3000";

  const setupUrl =
    "http://localhost:3000/login?passwordAction=setup&token=test-token";

  const adminInvite = {
    adminId: "test-admin-id",
    email: "admin@example.invalid",
    username: "Test Admin",
    role: 2 as const,
    invitedBy: "Test Owner",
  };

  it("uses the Admin role in the invitation", () => {
    const result = buildAdminInvite(
      adminInvite,
      site,
      setupUrl,
    );

    expect(result.subject).toBe(
      "You've been added as an admin of the TEAZO website",
    );

    expect(result.text).toContain(
      "Test Owner added you as an admin of the TEAZO website, with Admin access.",
    );

    expect(result.html).toContain(
      "with Admin access.",
    );
  });

  it("does not include retired role or permission terminology", () => {
    const result = buildAdminInvite(
      adminInvite,
      site,
      setupUrl,
    );

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
    const result = buildAdminInvite(
      adminInvite,
      site,
      setupUrl,
    );

    expect(result.text).toContain(
      "http://localhost:3000/login",
    );

    expect(result.text).toContain(
      'Continue with Google',
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

  it("includes the single-use password setup link", () => {
    const result = buildAdminInvite(
      adminInvite,
      site,
      setupUrl,
    );

    expect(result.text).toContain(
      "Create your password:",
    );

    expect(result.text).toContain(setupUrl);

    // HTML attributes must escape ampersands.
    expect(result.html).toContain(
      'href="http://localhost:3000/login?passwordAction=setup&amp;token=test-token"',
    );

    expect(result.html).toContain(
      "Create your password",
    );
  });

  it("explains password setup expiration and recovery", () => {
    const result = buildAdminInvite(
      adminInvite,
      site,
      setupUrl,
    );

    expect(result.text).toContain(
      "This link expires in 24 hours and can be used only once.",
    );

    expect(result.text).toContain(
      "Set or reset password",
    );

    expect(result.html).toContain(
      "This link expires in 24 hours and can be used only once.",
    );

    expect(result.html).toContain(
      "Set or reset password",
    );
  });

  it("supports invitations without an invitedBy username", () => {
    const result = buildAdminInvite(
      {
        adminId: "test-admin-id",
        email: "admin@example.invalid",
        username: "Test Admin",
        role: 2,
      },
      site,
      setupUrl,
    );

    expect(result.text).toContain(
      "You've been added as an admin of the TEAZO website, with Admin access.",
    );

    expect(result.html).toContain(
      "with Admin access.",
    );
  });

  it("escapes special characters in invitation HTML", () => {
    const result = buildAdminInvite(
      {
        adminId: "test-admin-id",
        email: "admin@example.invalid",
        username: 'Test <Admin> & "Team"',
        role: 2,
        invitedBy: "Owner <script>alert(1)</script>",
      },
      site,
      setupUrl,
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
        adminId: "test-owner-id",
        email: "owner@example.invalid",
        username: "Test Owner",
        role: 1,
      },
      site,
      setupUrl,
    );

    expect(result.text).toContain(
      "Owner access.",
    );

    expect(result.html).toContain(
      "Owner access.",
    );

    expect(result.text).not.toContain(
      "Can Edit",
    );

    expect(result.text).not.toContain(
      "Can View",
    );
  });
});
