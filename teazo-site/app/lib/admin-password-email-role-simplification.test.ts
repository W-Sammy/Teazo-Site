// Verify administrator invitation, setup/reset, and password-change
// email content using mocked D1, tokens, and delivery.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock dependencies before importing the server-side email module.
const mocks = vi.hoisted(() => ({
  normalizeEmail: vi.fn(),
  prepare: vi.fn(),
  bind: vi.fn(),
  first: vi.fn(),
  createPasswordToken: vi.fn(),
  sendEmail: vi.fn(),
}));

// The server-only guard is not applicable to these isolated unit tests.
vi.mock("server-only", () => ({}));

vi.mock("./admin-whitelist", () => ({
  normalizeEmail: mocks.normalizeEmail,
}));

vi.mock("./d1", () => ({
  prepare: mocks.prepare,
}));

vi.mock("./admin-password-tokens", () => ({
  createPasswordToken: mocks.createPasswordToken,
}));

vi.mock("./email", () => ({
  sendEmail: mocks.sendEmail,
}));

import {
  sendAdminPasswordEmail,
  sendAdminPasswordChangedEmail,
} from "./admin-password-email";

// Inspect the text and HTML versions passed to the delivery layer.
type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

// Simulate the two supported roles and the setup-versus-reset state.
// The unusual username ensures copy does not depend on a display name.
function makeAdmin(
  role: 1 | 2 = 2,
  needsSetup: 0 | 1 = 1,
) {
  return {
    id: "test-admin-id",
    email_normalized: "test@example.invalid",
    username: "you",
    role_id: role,
    needs_password_setup: needsSetup,
  };
}

// Read the first captured email rather than sending it.
function getEmail(): EmailPayload {
  return mocks.sendEmail.mock.calls[0][0] as EmailPayload;
}

describe("Administrator password and invitation email wording", () => {
  // Reset mocks and supply a safe application origin for generated links.
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv(
      "NEXT_PUBLIC_BASE_URL",
      "https://teazous.example.invalid",
    );

    mocks.normalizeEmail.mockImplementation(
      (email: string) => email.trim().toLowerCase(),
    );

    mocks.prepare.mockReturnValue({
      bind: mocks.bind,
    });

    mocks.bind.mockReturnValue({
      first: mocks.first,
    });

    mocks.first.mockResolvedValue(makeAdmin());

    mocks.createPasswordToken.mockResolvedValue({
      token: "test-password-token",
    });

    mocks.sendEmail.mockResolvedValue("sent");
  });

  // Restore environment variables after every test.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // New regular administrators should be named by role, not username.
  it("identifies the Admin role without using a username-dependent greeting", async () => {
    await sendAdminPasswordEmail("test@example.invalid");

    expect(mocks.sendEmail).toHaveBeenCalledOnce();

    const email = getEmail();

    expect(email.to).toBe("test@example.invalid");

    expect(email.text).toContain(
      "Your email address has been added to the TEAZO website with the Admin role.",
    );

    expect(email.html).toContain(
      "Your email address has been added to the TEAZO website with the Admin role.",
    );

    expect(email.text).not.toContain("Hi you,");
    expect(email.html).not.toContain("Hi you,");

    expect(email.text).not.toContain(
      "you has been added",
    );
  });

  // The same setup flow also supports existing Owner accounts.
  it("correctly identifies an Owner account during password setup", async () => {
    mocks.first.mockResolvedValue(makeAdmin(1, 1));

    await sendAdminPasswordEmail("test@example.invalid");

    const email = getEmail();

    expect(email.text).toContain(
      "with the Owner role.",
    );

    expect(email.html).toContain(
      "with the Owner role.",
    );

    expect(email.text).not.toContain(
      "with the Admin role.",
    );

    expect(mocks.createPasswordToken).toHaveBeenCalledWith(
      "test-admin-id",
      "setup",
    );
  });

  // Check instructions, URL parameters, HTML escaping, and token lifetime.
  it("includes password setup instructions and a single-use 24-hour link", async () => {
    await sendAdminPasswordEmail("test@example.invalid");

    const email = getEmail();

    expect(email.subject).toBe(
      "Create your password — TEAZO Admin",
    );

    expect(email.text).toContain(
      "Create your password:",
    );

    expect(email.text).toContain(
      "https://teazous.example.invalid/login?passwordAction=setup&token=test-password-token",
    );

    expect(email.html).toContain(
      "passwordAction=setup&amp;token=test-password-token",
    );

    expect(email.text).toContain(
      "This link expires in 24 hours and can be used only once.",
    );

    expect(email.html).toContain(
      "This link expires in 24 hours and can be used only once.",
    );

    expect(email.text).toContain(
      "If you were not expecting this email, you can ignore it.",
    );

    expect(mocks.createPasswordToken).toHaveBeenCalledWith(
      "test-admin-id",
      "setup",
    );
  });

  // Accounts with passwords use the reset flow, not invitation copy.
  it("preserves generic password-reset wording and the 30-minute expiration", async () => {
    mocks.first.mockResolvedValue(makeAdmin(2, 0));

    await sendAdminPasswordEmail("test@example.invalid");

    const email = getEmail();

    expect(email.subject).toBe(
      "Reset your password — TEAZO Admin",
    );

    expect(email.text).toContain(
      "We received a request to reset your TEAZO admin password.",
    );

    expect(email.html).toContain(
      "We received a request to reset your TEAZO admin password.",
    );

    expect(email.text).toContain(
      "This link expires in 30 minutes and can be used only once.",
    );

    expect(email.html).toContain(
      "This link expires in 30 minutes and can be used only once.",
    );

    expect(email.text).not.toContain(
      "Your email address has been added",
    );

    expect(email.text).not.toContain(
      "with the Admin role.",
    );

    expect(email.text).toContain(
      "passwordAction=reset",
    );

    expect(mocks.createPasswordToken).toHaveBeenCalledWith(
      "test-admin-id",
      "reset",
    );
  });

  // The account query must exclude retired roles and deleted users.
  it("restricts eligible password-email accounts to roles 1 and 2", async () => {
    await sendAdminPasswordEmail("test@example.invalid");

    const sql = mocks.prepare.mock.calls[0][0] as string;

    expect(sql).toMatch(
      /role_id\s+IN\s*\(\s*1\s*,\s*2\s*\)/i,
    );

    expect(sql).not.toMatch(
      /role_id\s+IN\s*\(\s*1\s*,\s*2\s*,\s*3\s*\)/i,
    );

    expect(sql).toContain(
      "deleted_at IS NULL",
    );

    expect(sql).toMatch(
      /status\s+IN\s*\(\s*'active'\s*,\s*'invited'\s*\)/i,
    );

    expect(mocks.bind).toHaveBeenCalledWith(
      "test@example.invalid",
    );
  });

  // Lookups use canonical email addresses regardless of input casing.
  it("normalizes the recipient email before looking up the account", async () => {
    await sendAdminPasswordEmail(
      "  TEST@Example.Invalid  ",
    );

    expect(mocks.normalizeEmail).toHaveBeenCalledWith(
      "  TEST@Example.Invalid  ",
    );

    expect(mocks.bind).toHaveBeenCalledWith(
      "test@example.invalid",
    );

    expect(getEmail().to).toBe(
      "test@example.invalid",
    );
  });

  // Invalid email input should stop before any database or email work.
  it.each([
    "",
    "   ",
    "x".repeat(255),
  ])(
    "rejects invalid email input without querying D1",
    async (email) => {
      const result = await sendAdminPasswordEmail(email);

      expect(result).toBeNull();
      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.sendEmail).not.toHaveBeenCalled();
    },
  );

  // Unknown or ineligible accounts must not receive setup links.
  it("does not create a token or send email for an ineligible account", async () => {
    mocks.first.mockResolvedValue(null);

    const result = await sendAdminPasswordEmail(
      "missing@example.invalid",
    );

    expect(result).toBeNull();

    expect(mocks.createPasswordToken).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  // A missing token cannot result in a misleading invitation email.
  it("does not send an email if token creation fails", async () => {
    mocks.createPasswordToken.mockResolvedValue(null);

    const result = await sendAdminPasswordEmail(
      "test@example.invalid",
    );

    expect(result).toBeNull();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  // Confirmation emails must not disclose credentials or setup tokens.
  it("sends a neutral password-change notification without sensitive credentials", async () => {
    await sendAdminPasswordChangedEmail(
      "test@example.invalid",
    );

    expect(mocks.sendEmail).toHaveBeenCalledOnce();

    const email = getEmail();

    expect(email.to).toBe("test@example.invalid");

    expect(email.subject).toBe(
      "Your TEAZO admin password has changed",
    );

    expect(email.text).toContain(
      "Your TEAZO admin password has been changed.",
    );

    expect(email.html).toContain(
      "Your TEAZO admin password has been changed.",
    );

    expect(email.text).toContain(
      "If you did not make this change, contact the website owner immediately.",
    );

    expect(email.text).not.toContain(
      "test-password-token",
    );

    expect(email.html).not.toContain(
      "test-password-token",
    );

    expect(mocks.createPasswordToken).not.toHaveBeenCalled();
  });
});
