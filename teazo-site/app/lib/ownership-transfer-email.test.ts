import { beforeEach, describe, expect, it, vi } from "vitest";

// Verify ownership-transfer email copy without sending real messages.
// Covers invitations, declines, completions, and unusual usernames.

// Hoist dependencies so Vitest can replace them before importing the module.
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  applicationUrl: vi.fn(),
}));

// Allow the server-only email module to be imported in the test environment.
vi.mock("server-only", () => ({}));

vi.mock("@/app/lib/email", () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock("@/app/lib/admin-password-email", () => ({
  applicationUrl: mocks.applicationUrl,
}));

import {
  sendOwnershipTransferOffer,
  sendOwnershipTransferDeclined,
  sendOwnershipTransferCompleted,
} from "./ownership-transfer-email";

// Shape of the messages passed to our mocked email sender.
type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

// Deliberately awkward names catch copy that interpolates usernames
// directly into greetings or grammatically dependent sentences.
function makeTransfer() {
  return {
    token: "test-transfer-token",
    owner: {
      id: "test-owner-id",
      username: "you",
      email: "owner@example.invalid",
    },
    recipient: {
      id: "test-admin-id",
      username: "Admin.",
      email: "recipient@example.invalid",
    },
  };
}

// Inspect the generated payload without performing external delivery.
function getEmail(index = 0): EmailPayload {
  return mocks.sendEmail.mock.calls[index][0] as EmailPayload;
}

describe("Ownership transfer email wording", () => {
  // Give every test a clean mock and predictable, nonproduction URL.
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.applicationUrl.mockReturnValue(
      "https://teazous.example.invalid",
    );

    mocks.sendEmail.mockResolvedValue("sent");
  });

  // Invitation wording must be neutral and explain explicit acceptance.
  describe("Ownership transfer invitation", () => {
    // Check both plain text and HTML, plus the intended recipient.
    it("uses neutral wording without inserting usernames into sentences", async () => {
      await sendOwnershipTransferOffer(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferOffer
        >[0],
      );

      expect(mocks.sendEmail).toHaveBeenCalledOnce();

      const email = getEmail();

      expect(email.to).toBe("recipient@example.invalid");

      expect(email.subject).toBe(
        "TEAZO ownership transfer invitation",
      );

      expect(email.text).toContain(
        "The TEAZO Owner has offered to transfer ownership",
      );

      expect(email.html).toContain(
        "The TEAZO Owner has offered to transfer ownership",
      );

      expect(email.text).not.toContain("Hi Admin.,");
      expect(email.text).not.toContain(
        "you has offered",
      );

      expect(email.html).not.toContain("Hi Admin.,");
      expect(email.html).not.toContain(
        "you has offered",
      );
    });

    // Preserve the single-use link and expiration instructions.
    it("includes the secure review link and 24-hour expiration", async () => {
      await sendOwnershipTransferOffer(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferOffer
        >[0],
      );

      const email = getEmail();

      expect(email.text).toContain(
        "https://teazous.example.invalid/ownership-transfer?token=test-transfer-token",
      );

      expect(email.html).toContain(
        "Review ownership transfer",
      );

      expect(email.text).toContain("24 hours");
      expect(email.html).toContain("24 hours");

      expect(email.text).toContain("used only once");
      expect(email.html).toContain("used only once");
    });

    // Reviewing an offer must not be described as automatic acceptance.
    it("explains that opening the link does not transfer ownership", async () => {
      await sendOwnershipTransferOffer(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferOffer
        >[0],
      );

      const email = getEmail();

      expect(email.text).toContain(
        "Opening this link will not transfer ownership.",
      );

      expect(email.html).toContain(
        "Opening this link will not transfer ownership.",
      );

      expect(email.text).toContain(
        "explicitly accept or decline",
      );
    });
  });

  // Declining keeps both accounts in their original roles.
  describe("Ownership transfer declined notification", () => {
    it("uses neutral wording and preserves existing roles", async () => {
      await sendOwnershipTransferDeclined(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferDeclined
        >[0],
      );

      expect(mocks.sendEmail).toHaveBeenCalledOnce();

      const email = getEmail();

      expect(email.to).toBe("owner@example.invalid");

      expect(email.subject).toBe(
        "TEAZO ownership transfer declined",
      );

      expect(email.text).toContain(
        "The receiving Admin has declined",
      );

      expect(email.text).toContain(
        "Your account remains the Owner.",
      );

      expect(email.text).toContain(
        "The receiving administrator remains an Admin.",
      );

      expect(email.html).toContain(
        "Your account remains the Owner.",
      );

      expect(email.html).toContain(
        "remains an Admin.",
      );

      expect(email.text).not.toContain("Hi you,");
      expect(email.text).not.toContain(
        "Admin. declined",
      );
    });
  });

  // Completion sends distinct messages for the former and new Owner.
  describe("Ownership transfer completion notifications", () => {
    // The former Owner loses privileges; the recipient gains them.
    it("notifies both accounts with their correct resulting permissions", async () => {
      const results = await sendOwnershipTransferCompleted(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferCompleted
        >[0],
      );

      expect(mocks.sendEmail).toHaveBeenCalledTimes(2);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("fulfilled");

      const previousOwnerEmail = getEmail(0);
      const newOwnerEmail = getEmail(1);

      expect(previousOwnerEmail.to).toBe(
        "owner@example.invalid",
      );

      expect(newOwnerEmail.to).toBe(
        "recipient@example.invalid",
      );

      expect(previousOwnerEmail.text).toContain(
        "Your account now has Admin access.",
      );

      expect(previousOwnerEmail.text).toContain(
        "You no longer have Owner privileges",
      );

      expect(previousOwnerEmail.text).toContain(
        "Owner-only Admin page",
      );

      expect(newOwnerEmail.text).toContain(
        "Your account is now the Owner",
      );

      expect(newOwnerEmail.text).toContain(
        "Owner-only Admin page",
      );

      expect(previousOwnerEmail.html).toContain(
        "Your account now has Admin access.",
      );

      expect(newOwnerEmail.html).toContain(
        "Your account is now the Owner",
      );
    });

    // Both formats must use the approved Owner-only Admin page name.
    it("does not use outdated Settings terminology or username-dependent greetings", async () => {
      await sendOwnershipTransferCompleted(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferCompleted
        >[0],
      );

      for (let index = 0; index < 2; index++) {
        const email = getEmail(index);

        expect(email.text).not.toContain(
          "Owner-only Settings",
        );

        expect(email.html).not.toContain(
          "Owner-only Settings",
        );

        expect(email.text).not.toContain("Hi you,");
        expect(email.text).not.toContain("Hi Admin.,");
        expect(email.html).not.toContain("Hi you,");
        expect(email.html).not.toContain("Hi Admin.,");
      }
    });

    // One send failure must not prevent the other notification attempt.
    it("attempts both notifications even when the first delivery fails", async () => {
      mocks.sendEmail
        .mockRejectedValueOnce(
          new Error("Simulated email delivery failure"),
        )
        .mockResolvedValueOnce("sent");

      const results = await sendOwnershipTransferCompleted(
        makeTransfer() as unknown as Parameters<
          typeof sendOwnershipTransferCompleted
        >[0],
      );

      expect(mocks.sendEmail).toHaveBeenCalledTimes(2);

      expect(results[0].status).toBe("rejected");
      expect(results[1].status).toBe("fulfilled");

      expect(getEmail(0).to).toBe(
        "owner@example.invalid",
      );

      expect(getEmail(1).to).toBe(
        "recipient@example.invalid",
      );
    });
  });
});
