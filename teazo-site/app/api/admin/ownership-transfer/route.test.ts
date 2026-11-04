import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock every external dependency. These tests must not
// access real D1 records or send ownership emails.
const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  findPendingOwnershipTransfer: vi.fn(),
  createOwnershipTransfer: vi.fn(),
  cancelOwnershipTransfer: vi.fn(),
  sendOwnershipTransferOffer: vi.fn(),
  consumePasswordRequestLimit: vi.fn(),
  D1Error: class D1Error extends Error {},
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: mocks.D1Error,
}));

vi.mock("@/app/lib/ownership-transfer", () => ({
  findPendingOwnershipTransfer:
    mocks.findPendingOwnershipTransfer,
  createOwnershipTransfer: mocks.createOwnershipTransfer,
  cancelOwnershipTransfer: mocks.cancelOwnershipTransfer,
}));

vi.mock("@/app/lib/ownership-transfer-email", () => ({
  sendOwnershipTransferOffer: mocks.sendOwnershipTransferOffer,
}));

vi.mock("@/app/lib/password-request-rate-limit", () => ({
  consumePasswordRequestLimit:
    mocks.consumePasswordRequestLimit,
}));

import { DELETE, GET, POST } from "./route";

const ENDPOINT =
  "http://localhost:3000/api/admin/ownership-transfer";

const owner = {
  id: "owner-id",
  username: "Test Owner",
  role_id: 1,
};

const createdTransfer = {
  id: "transfer-id",
  token: "synthetic-secret-token-not-for-real-use",
  expiresAt: 1_800_086_400,
  owner: {
    id: "owner-id",
    username: "Test Owner",
    email: "owner@example.invalid",
  },
  recipient: {
    id: "recipient-id",
    username: "Test Admin",
    email: "admin@example.invalid",
  },
};

const pendingTransfer = {
  id: "transfer-id",
  recipientAdminId: "recipient-id",
  recipientUsername: "Test Admin",
  recipientEmail: "admin@example.invalid",
  createdAt: 1_800_000_000,
  expiresAt: 1_800_086_400,
  status: "pending" as const,
};

function makeGetRequest(): Request {
  return new Request(ENDPOINT, {
    method: "GET",
  });
}

function makeWriteRequest(
  method: "POST" | "DELETE",
  body: unknown,
): Request {
  return new Request(ENDPOINT, {
    method,
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest(): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: "{invalid-json",
  });
}

function allowOwner() {
  mocks.requireAdminApi.mockResolvedValue({
    ok: true,
    admin: owner,
  });
}

function deny(status: 401 | 403) {
  mocks.requireAdminApi.mockResolvedValue({
    ok: false,
    response: Response.json(
      { error: "Access denied." },
      { status },
    ),
  });
}

describe("Ownership transfer API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("BREVO_SANDBOX", "0");

    allowOwner();

    mocks.findPendingOwnershipTransfer.mockResolvedValue(null);
    mocks.createOwnershipTransfer.mockResolvedValue(
      createdTransfer,
    );
    mocks.cancelOwnershipTransfer.mockResolvedValue(true);
    mocks.sendOwnershipTransferOffer.mockResolvedValue("sent");
    mocks.consumePasswordRequestLimit.mockResolvedValue(true);

    // Suppress expected server logs from simulated failures.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("GET — Pending ownership transfer", () => {
    it("returns an empty state when nothing is pending", async () => {
      const response = await GET(makeGetRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        transfer: null,
      });

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        1,
      );

      expect(
        mocks.findPendingOwnershipTransfer,
      ).toHaveBeenCalledWith("owner-id");
    });

    it("returns pending details without exposing the token", async () => {
      mocks.findPendingOwnershipTransfer.mockResolvedValue(
        pendingTransfer,
      );

      const response = await GET(makeGetRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.transfer).toEqual(pendingTransfer);

      expect(JSON.stringify(body)).not.toContain(
        createdTransfer.token,
      );

      expect(body.transfer).not.toHaveProperty("token");
      expect(body.transfer).not.toHaveProperty("tokenHash");

      expect(response.headers.get("Cache-Control")).toBe(
        "no-store",
      );
    });

    it.each([401, 403] as const)(
      "rejects unauthorized GET with %i",
      async (status) => {
        deny(status);

        const response = await GET(makeGetRequest());

        expect(response.status).toBe(status);
        expect(
          mocks.findPendingOwnershipTransfer,
        ).not.toHaveBeenCalled();
      },
    );

    it("fails safely when the database lookup fails", async () => {
      mocks.findPendingOwnershipTransfer.mockRejectedValue(
        new Error("Database unavailable"),
      );

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(503);
      expect(await response.json()).toHaveProperty("error");
    });
  });

  describe("POST — Ownership transfer initiation", () => {
    const validInput = {
      recipientAdminId: "recipient-id",
    };

    it.each([401, 403] as const)(
      "rejects unauthorized initiation with %i",
      async (status) => {
        deny(status);

        const response = await POST(
          makeWriteRequest("POST", validInput),
        );

        expect(response.status).toBe(status);
        expect(
          mocks.consumePasswordRequestLimit,
        ).not.toHaveBeenCalled();
        expect(
          mocks.createOwnershipTransfer,
        ).not.toHaveBeenCalled();
        expect(
          mocks.sendOwnershipTransferOffer,
        ).not.toHaveBeenCalled();
      },
    );

    it("rejects malformed JSON", async () => {
      const response = await POST(
        makeInvalidJsonRequest(),
      );

      expect(response.status).toBe(400);
      expect(
        mocks.createOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it.each([
      {},
      null,
      [],
      { recipientAdminId: "" },
      { recipientAdminId: "   " },
      { recipientAdminId: 123 },
      { recipientAdminId: null },
    ])("rejects invalid recipient input: %j", async (input) => {
      const response = await POST(
        makeWriteRequest("POST", input),
      );

      expect(response.status).toBe(400);
      expect(
        mocks.createOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it("enforces the Owner's request rate limit", async () => {
      mocks.consumePasswordRequestLimit.mockResolvedValue(false);

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(
        "3600",
      );

      expect(
        mocks.consumePasswordRequestLimit,
      ).toHaveBeenCalledWith(
        {
          name: "ownership-transfer-request",
          limit: 5,
          windowMs: 60 * 60 * 1000,
        },
        "owner-id",
      );

      expect(
        mocks.createOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it("fails closed if the rate-limit database is unavailable", async () => {
      mocks.consumePasswordRequestLimit.mockRejectedValue(
        new Error("Rate-limit database unavailable"),
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(503);
      expect(
        mocks.createOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it("creates a transfer and submits the email", async () => {
      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(201);

      expect(
        mocks.createOwnershipTransfer,
      ).toHaveBeenCalledWith(
        "owner-id",
        "recipient-id",
      );

      expect(
        mocks.sendOwnershipTransferOffer,
      ).toHaveBeenCalledWith(createdTransfer);

      const body = await response.json();

      expect(body).toEqual({
        transfer: {
          id: "transfer-id",
          recipientUsername: "Test Admin",
          expiresAt: 1_800_086_400,
        },
        invitation: {
          submitted: true,
          message:
            "The ownership transfer invitation was submitted for delivery.",
        },
      });

      // The Owner must never receive the email token.
      expect(JSON.stringify(body)).not.toContain(
        createdTransfer.token,
      );
    });

    it("does not claim delivery in Brevo sandbox mode", async () => {
      vi.stubEnv("BREVO_SANDBOX", "1");

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      expect(body.invitation.submitted).toBe(false);
      expect(body.invitation.message).toContain(
        "sandbox mode",
      );
    });

    it.each([
      ["printed", "server terminal"],
      ["captured", "Mailpit"],
    ])("reports %s delivery accurately", async (outcome, text) => {
      mocks.sendOwnershipTransferOffer.mockResolvedValue(
        outcome,
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(201);

      const body = await response.json();

      expect(body.invitation.submitted).toBe(false);
      expect(body.invitation.message).toContain(text);
    });

    it("rejects an ineligible recipient or existing pending offer", async () => {
      mocks.createOwnershipTransfer.mockResolvedValue(null);

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(409);
      expect(
        mocks.sendOwnershipTransferOffer,
      ).not.toHaveBeenCalled();
    });

    it("reports a pending-request unique constraint conflict", async () => {
      mocks.createOwnershipTransfer.mockRejectedValue(
        new mocks.D1Error(
          "UNIQUE constraint failed: ownership_transfer_request.status",
        ),
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(409);
      expect(
        mocks.sendOwnershipTransferOffer,
      ).not.toHaveBeenCalled();
    });

    it("handles unexpected database failures", async () => {
      mocks.createOwnershipTransfer.mockRejectedValue(
        new Error("Database unavailable"),
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(503);
      expect(
        mocks.sendOwnershipTransferOffer,
      ).not.toHaveBeenCalled();
    });

    it("cancels the offer when email generation is skipped", async () => {
      mocks.sendOwnershipTransferOffer.mockResolvedValue(
        "skipped",
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(503);

      expect(
        mocks.cancelOwnershipTransfer,
      ).toHaveBeenCalledWith(
        "transfer-id",
        "owner-id",
      );

      const body = await response.json();

      expect(body.error).toContain("canceled");
    });

    it("does not falsely report cancellation if cancellation returns false", async () => {
      mocks.sendOwnershipTransferOffer.mockResolvedValue(
        "skipped",
      );
      mocks.cancelOwnershipTransfer.mockResolvedValue(false);

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(503);

      const body = await response.json();

      expect(body.requiresStatusRefresh).toBe(true);
      expect(body.error).toContain(
        "could not be confirmed canceled",
      );
    });

    it("reports uncertain cancellation when cancellation throws", async () => {
      mocks.sendOwnershipTransferOffer.mockResolvedValue(
        "skipped",
      );
      mocks.cancelOwnershipTransfer.mockRejectedValue(
        new Error("Cancellation database unavailable"),
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(503);

      const body = await response.json();

      expect(body.requiresStatusRefresh).toBe(true);
    });

    it("handles an email service exception without exposing tokens", async () => {
      mocks.sendOwnershipTransferOffer.mockRejectedValue(
        new Error("Email service unavailable"),
      );

      const response = await POST(
        makeWriteRequest("POST", validInput),
      );

      expect(response.status).toBe(503);
      expect(
        mocks.cancelOwnershipTransfer,
      ).toHaveBeenCalledWith(
        "transfer-id",
        "owner-id",
      );

      const body = await response.json();

      expect(JSON.stringify(body)).not.toContain(
        createdTransfer.token,
      );
    });
  });

  describe("DELETE — Cancel a pending ownership transfer", () => {
    const validInput = {
      transferId: "transfer-id",
    };

    it.each([401, 403] as const)(
      "rejects unauthorized cancellation with %i",
      async (status) => {
        deny(status);

        const response = await DELETE(
          makeWriteRequest("DELETE", validInput),
        );

        expect(response.status).toBe(status);
        expect(
          mocks.cancelOwnershipTransfer,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      {},
      null,
      [],
      { transferId: "" },
      { transferId: "   " },
      { transferId: 123 },
    ])("rejects invalid cancellation input: %j", async (input) => {
      const response = await DELETE(
        makeWriteRequest("DELETE", input),
      );

      expect(response.status).toBe(400);
      expect(
        mocks.cancelOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it("allows the Owner to cancel an outstanding offer", async () => {
      const response = await DELETE(
        makeWriteRequest("DELETE", validInput),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.cancelOwnershipTransfer,
      ).toHaveBeenCalledWith(
        "transfer-id",
        "owner-id",
      );

      expect(await response.json()).toEqual({
        message: "Ownership transfer canceled.",
      });
    });

    it("rejects cancellation when no eligible request exists", async () => {
      mocks.cancelOwnershipTransfer.mockResolvedValue(false);

      const response = await DELETE(
        makeWriteRequest("DELETE", validInput),
      );

      expect(response.status).toBe(409);
    });

    it("handles cancellation database failures", async () => {
      mocks.cancelOwnershipTransfer.mockRejectedValue(
        new Error("Database unavailable"),
      );

      const response = await DELETE(
        makeWriteRequest("DELETE", validInput),
      );

      expect(response.status).toBe(503);

      const body = await response.json();

      expect(body.error).toContain(
        "Refresh the pending transfer status",
      );
    });
  });
});
