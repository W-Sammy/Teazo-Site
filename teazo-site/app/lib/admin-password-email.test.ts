import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prepare } from "./d1";
import { sendEmail } from "./email";
import { createPasswordToken } from "./admin-password-tokens";
import {
  applicationUrl,
  sendAdminPasswordEmail,
  sendAdminPasswordChangedEmail,
} from "./admin-password-email";

vi.mock("server-only", () => ({}));

vi.mock("./d1", () => ({
  prepare: vi.fn(),
}));

vi.mock("./email", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("./admin-password-tokens", () => ({
  createPasswordToken: vi.fn(),
}));

vi.mock("./admin-whitelist", () => ({
  normalizeEmail: vi.fn((email: string) =>
    email.trim().toLowerCase(),
  ),
}));

const first = vi.fn();
const bind = vi.fn();

const VALID_TOKEN = "A".repeat(43);

function admin(needsSetup: 0 | 1) {
  return {
    id: "admin-id",
    email_normalized: "admin@example.com",
    needs_password_setup: needsSetup,
  };
}

describe("Admin password emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "NEXT_PUBLIC_BASE_URL",
      "http://localhost:3000",
    );

    bind.mockImplementation(() => ({ first }));

    vi.mocked(prepare).mockReturnValue({
      bind,
    } as never);

    vi.mocked(createPasswordToken).mockResolvedValue({
      token: VALID_TOKEN,
      expiresAt: 1_800_000_000,
    });

    vi.mocked(sendEmail).mockResolvedValue("sent");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured application URL", () => {
    expect(applicationUrl()).toBe("http://localhost:3000");
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

  it("does not send email for unknown accounts", async () => {
    first.mockResolvedValueOnce(null);

    const result = await sendAdminPasswordEmail(
      "unknown@example.com",
    );

    expect(result).toBeNull();
    expect(createPasswordToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("uses setup tokens for accounts without passwords", async () => {
    first.mockResolvedValueOnce(admin(1));

    await sendAdminPasswordEmail("admin@example.com");

    expect(createPasswordToken).toHaveBeenCalledWith(
      "admin-id",
      "setup",
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "Create your password — TEAZO Admin",
      }),
    );
  });

  it("uses reset tokens for accounts with passwords", async () => {
    first.mockResolvedValueOnce(admin(0));

    await sendAdminPasswordEmail("admin@example.com");

    expect(createPasswordToken).toHaveBeenCalledWith(
      "admin-id",
      "reset",
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Reset your password — TEAZO Admin",
      }),
    );
  });

  it("includes correct expiration information for setup", async () => {
    first.mockResolvedValueOnce(admin(1));

    await sendAdminPasswordEmail("admin@example.com");

    const email = vi.mocked(sendEmail).mock.calls[0][0];

    expect(email.text).toContain("24 hours");
    expect(email.text).toContain("only once");
  });

  it("includes correct expiration information for reset", async () => {
    first.mockResolvedValueOnce(admin(0));

    await sendAdminPasswordEmail("admin@example.com");

    const email = vi.mocked(sendEmail).mock.calls[0][0];

    expect(email.text).toContain("30 minutes");
    expect(email.text).toContain("only once");
  });

  it("builds reset links using the correct action and token", async () => {
    first.mockResolvedValueOnce(admin(0));

    await sendAdminPasswordEmail("admin@example.com");

    const email = vi.mocked(sendEmail).mock.calls[0][0];

    expect(email.text).toContain("passwordAction=reset");
    expect(email.text).toContain(VALID_TOKEN);
  });

  it("does not create email when token generation fails", async () => {
    first.mockResolvedValueOnce(admin(1));

    vi.mocked(createPasswordToken).mockResolvedValueOnce(null);

    const result = await sendAdminPasswordEmail(
      "admin@example.com",
    );

    expect(result).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends a password-change security notification", async () => {
    const result = await sendAdminPasswordChangedEmail(
      "admin@example.com",
    );

    expect(result).toBe("sent");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "Your TEAZO admin password has changed",
      }),
    );
  });

  it("does not include passwords or tokens in confirmation emails", async () => {
    await sendAdminPasswordChangedEmail("admin@example.com");

    const email = vi.mocked(sendEmail).mock.calls[0][0];

    expect(email.text).toContain(
      "Your TEAZO admin password has been changed.",
    );

    expect(email.text).toContain(
      "contact the website owner immediately",
    );

    expect(email.text).not.toContain(VALID_TOKEN);
    expect(email.html).not.toContain(VALID_TOKEN);
  });
});
