/**
 * Tests administrator password setup/reset emails and
 * password-change security notifications.
 *
 * Covers application URL security, Owner/Admin roles,
 * account eligibility, token creation, email content,
 * expiration guidance, normalization, and failures.
 *
 * Database queries, token generation, and email delivery
 * are mocked. No production data or email is used.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { normalizeEmail } from "./admin-whitelist";
import { prepare } from "./d1";
import { sendEmail } from "./email";
import { createPasswordToken } from "./admin-password-tokens";
import {
  applicationUrl,
  sendAdminPasswordEmail,
  sendAdminPasswordChangedEmail,
} from "./admin-password-email";

vi.mock("server-only", () => ({}));

vi.mock("./admin-whitelist", () => ({
  normalizeEmail: vi.fn((email: string) =>
    email.trim().toLowerCase(),
  ),
}));

vi.mock("./d1", () => ({
  prepare: vi.fn(),
}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("./admin-password-tokens", () => ({
  createPasswordToken: vi.fn(),
}));

const first = vi.fn();
const bind = vi.fn();

const VALID_TOKEN = "A".repeat(43);
const BASE_URL = "https://teazous.example.invalid";

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function makeAdmin(
  role: 1 | 2 = 2,
  needsSetup: 0 | 1 = 1,
) {
  return {
    id: "admin-id",
    email_normalized: "admin@example.invalid",
    username: "you",
    role_id: role,
    needs_password_setup: needsSetup,
  };
}

function getEmail(): EmailPayload {
  expect(sendEmail).toHaveBeenCalledOnce();

  return vi.mocked(sendEmail).mock.calls[0][0];
}

describe("Administrator password emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", BASE_URL);

    vi.mocked(normalizeEmail).mockImplementation(
      (email: string) => email.trim().toLowerCase(),
    );

    bind.mockImplementation(() => ({ first }));

    vi.mocked(prepare).mockReturnValue({
      bind,
    } as never);

    first.mockResolvedValue(makeAdmin());

    vi.mocked(createPasswordToken).mockResolvedValue({
      token: VALID_TOKEN,
      expiresAt: 1_800_000_000,
    });

    vi.mocked(sendEmail).mockResolvedValue("sent");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Application URL security", () => {
    it("uses the configured application URL", () => {
      expect(applicationUrl()).toBe(BASE_URL);
    });

    it("allows the local development URL", () => {
      vi.stubEnv(
        "NEXT_PUBLIC_BASE_URL",
        "http://localhost:3000",
      );

      expect(applicationUrl()).toBe(
        "http://localhost:3000",
      );
    });

    it("rejects application URLs containing credentials", () => {
      vi.stubEnv(
        "NEXT_PUBLIC_BASE_URL",
        "https://user:password@example.com",
      );

      expect(() => applicationUrl()).toThrow(
        "Invalid application URL.",
      );
    });

    it("rejects insecure nonlocal application URLs", () => {
      vi.stubEnv(
        "NEXT_PUBLIC_BASE_URL",
        "http://example.com",
      );

      expect(() => applicationUrl()).toThrow(
        "Invalid application URL.",
      );
    });

    it("requires a configured URL outside development", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", "");

      expect(() => applicationUrl()).toThrow(
        "NEXT_PUBLIC_BASE_URL is required.",
      );
    });
  });

  describe("Password setup", () => {
    it("uses setup tokens for accounts without passwords", async () => {
      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      expect(createPasswordToken).toHaveBeenCalledWith(
        "admin-id",
        "setup",
      );

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "admin@example.invalid",
          subject:
            "Create your password — TEAZO Admin",
        }),
      );
    });

    it("identifies the Admin role without using the username as a greeting", async () => {
      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      const email = getEmail();

      const expected =
        "Your email address has been added to the TEAZO website with the Admin role.";

      expect(email.text).toContain(expected);
      expect(email.html).toContain(expected);

      expect(email.text).not.toContain("Hi you,");
      expect(email.html).not.toContain("Hi you,");
      expect(email.text).not.toContain(
        "you has been added",
      );
    });

    it("identifies Owner accounts correctly during setup", async () => {
      first.mockResolvedValueOnce(makeAdmin(1, 1));

      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

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

      expect(createPasswordToken).toHaveBeenCalledWith(
        "admin-id",
        "setup",
      );
    });

    it("includes a single-use 24-hour setup link", async () => {
      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      const email = getEmail();

      expect(email.subject).toBe(
        "Create your password — TEAZO Admin",
      );

      expect(email.text).toContain(
        "Create your password:",
      );

      expect(email.text).toContain(
        `${BASE_URL}/login?passwordAction=setup&token=${VALID_TOKEN}`,
      );

      expect(email.html).toContain(
        `passwordAction=setup&amp;token=${VALID_TOKEN}`,
      );

      const expiration =
        "This link expires in 24 hours and can be used only once.";

      expect(email.text).toContain(expiration);
      expect(email.html).toContain(expiration);

      expect(email.text).toContain(
        "If you were not expecting this email, you can ignore it.",
      );
    });
  });

  describe("Password reset", () => {
    it("uses reset tokens for accounts with passwords", async () => {
      first.mockResolvedValueOnce(makeAdmin(2, 0));

      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      expect(createPasswordToken).toHaveBeenCalledWith(
        "admin-id",
        "reset",
      );

      const email = getEmail();

      expect(email.subject).toBe(
        "Reset your password — TEAZO Admin",
      );
    });

    it("includes generic reset wording and a single-use 30-minute link", async () => {
      first.mockResolvedValueOnce(makeAdmin(2, 0));

      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      const email = getEmail();

      const explanation =
        "We received a request to reset your TEAZO admin password.";

      expect(email.text).toContain(explanation);
      expect(email.html).toContain(explanation);

      expect(email.text).toContain(
        `${BASE_URL}/login?passwordAction=reset&token=${VALID_TOKEN}`,
      );

      expect(email.html).toContain(
        `passwordAction=reset&amp;token=${VALID_TOKEN}`,
      );

      const expiration =
        "This link expires in 30 minutes and can be used only once.";

      expect(email.text).toContain(expiration);
      expect(email.html).toContain(expiration);

      expect(email.text).not.toContain(
        "Your email address has been added",
      );

      expect(email.text).not.toContain(
        "with the Admin role.",
      );
    });
  });

  describe("Account eligibility and validation", () => {
    it("restricts eligible accounts to Owner and Admin roles", async () => {
      await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      const sql = vi.mocked(prepare).mock
        .calls[0][0] as string;

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
    });

    it("normalizes recipient email addresses before lookup", async () => {
      await sendAdminPasswordEmail(
        "  ADMIN@Example.Invalid  ",
      );

      expect(normalizeEmail).toHaveBeenCalledWith(
        "  ADMIN@Example.Invalid  ",
      );

      expect(bind).toHaveBeenCalledWith(
        "admin@example.invalid",
      );

      expect(getEmail().to).toBe(
        "admin@example.invalid",
      );
    });

    it.each([
      "",
      "   ",
      "x".repeat(255),
    ])(
      "rejects invalid email input without querying the database: %s",
      async (email) => {
        const result =
          await sendAdminPasswordEmail(email);

        expect(result).toBeNull();

        expect(prepare).not.toHaveBeenCalled();
        expect(createPasswordToken).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
      },
    );

    it("does not send email for unknown or ineligible accounts", async () => {
      first.mockResolvedValueOnce(null);

      const result = await sendAdminPasswordEmail(
        "unknown@example.invalid",
      );

      expect(result).toBeNull();

      expect(createPasswordToken).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("does not send email when token generation fails", async () => {
      vi.mocked(createPasswordToken).mockResolvedValueOnce(
        null,
      );

      const result = await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      expect(result).toBeNull();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("Delivery handling", () => {
    it("returns the email delivery outcome", async () => {
      const result = await sendAdminPasswordEmail(
        "admin@example.invalid",
      );

      expect(result).toBe("sent");
      expect(sendEmail).toHaveBeenCalledOnce();
    });

    it("propagates email delivery errors", async () => {
      vi.mocked(sendEmail).mockRejectedValueOnce(
        new Error("Email service unavailable"),
      );

      await expect(
        sendAdminPasswordEmail("admin@example.invalid"),
      ).rejects.toThrow("Email service unavailable");
    });
  });

  describe("Password-change notifications", () => {
    it("sends a security notification after a password change", async () => {
      const result =
        await sendAdminPasswordChangedEmail(
          "admin@example.invalid",
        );

      expect(result).toBe("sent");

      const email = getEmail();

      expect(email.to).toBe(
        "admin@example.invalid",
      );

      expect(email.subject).toBe(
        "Your TEAZO admin password has changed",
      );

      const message =
        "Your TEAZO admin password has been changed.";

      expect(email.text).toContain(message);
      expect(email.html).toContain(message);

      expect(email.text).toContain(
        "If you did not make this change, contact the website owner immediately.",
      );
    });

    it("does not include passwords or setup tokens in confirmation emails", async () => {
      await sendAdminPasswordChangedEmail(
        "admin@example.invalid",
      );

      const email = getEmail();

      expect(email.text).not.toContain(
        VALID_TOKEN,
      );

      expect(email.html).not.toContain(
        VALID_TOKEN,
      );

      expect(createPasswordToken).not.toHaveBeenCalled();
    });
  });
});
