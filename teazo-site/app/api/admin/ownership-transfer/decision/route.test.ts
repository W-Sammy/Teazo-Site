import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Replace authentication, D1 operations, and email delivery.
// These tests must not change actual administrator roles
// or send real emails.
const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  decideOwnershipTransfer: vi.fn(),
  sendOwnershipTransferCompleted: vi.fn(),
  sendOwnershipTransferDeclined: vi.fn(),
  D1Error: class D1Error extends Error {},
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: mocks.D1Error,
}));

vi.mock("@/app/lib/ownership-transfer", () => ({
  decideOwnershipTransfer: mocks.decideOwnershipTransfer,
}));

vi.mock("@/app/lib/ownership-transfer-email", () => ({
  sendOwnershipTransferCompleted:
    mocks.sendOwnershipTransferCompleted,
  sendOwnershipTransferDeclined:
    mocks.sendOwnershipTransferDeclined,
}));

import { POST } from "./route";

const ENDPOINT =
  "http://localhost:3000/api/admin/ownership-transfer/decision";

// Synthetic token, never a real ownership-transfer token.
const TEST_TOKEN = Buffer.alloc(32, 9).toString("base64url");

const recipient = {
  id: "recipient-id",
  username: "Test Admin",
  email: "admin@example.invalid",
  role_id: 2,
};

const owner = {
  id: "owner-id",
  username: "Test Owner",
  email: "owner@example.invalid",
  role_id: 1,
};

const transfer = {
  id: "transfer-id",
  expiresAt: 1_800_086_400,
  owner: {
    id: owner.id,
    username: owner.username,
    email: owner.email,
  },
  recipient: {
    id: recipient.id,
    username: recipient.username,
    email: recipient.email,
  },
};

function makeRequest(body: unknown): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function makeMalformedRequest(): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: "{invalid-json",
  });
}

function allowRecipient(admin = recipient) {
  mocks.requireAdminApi.mockResolvedValue({
    ok: true,
    admin,
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

const acceptInput = {
  token: TEST_TOKEN,
  decision: "accepted",
};

const declineInput = {
  token: TEST_TOKEN,
  decision: "declined",
};

describe("Ownership transfer decision API", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    allowRecipient();

    mocks.decideOwnershipTransfer.mockResolvedValue(transfer);

    mocks.sendOwnershipTransferDeclined.mockResolvedValue(
      "sent",
    );

    mocks.sendOwnershipTransferCompleted.mockResolvedValue([
      { status: "fulfilled", value: "sent" },
      { status: "fulfilled", value: "sent" },
    ]);

    // Suppress expected server logs for simulated failures.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Authentication and authorization", () => {
    it.each([401, 403] as const)(
      "rejects unauthorized requests with HTTP %i",
      async (status) => {
        deny(status);

        const response = await POST(
          makeRequest(acceptInput),
        );

        expect(response.status).toBe(status);

        expect(mocks.requireAdminApi).toHaveBeenCalledWith(
          expect.any(Request),
          2,
        );

        expect(
          mocks.decideOwnershipTransfer,
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendOwnershipTransferCompleted,
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendOwnershipTransferDeclined,
        ).not.toHaveBeenCalled();
      },
    );

    it("rejects the current Owner as an offer recipient", async () => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: true,
        admin: owner,
      });

      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(403);

      expect(
        mocks.decideOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it("uses the authenticated Admin ID rather than a client-supplied ID", async () => {
      const response = await POST(
        makeRequest({
          ...acceptInput,
          recipientAdminId: "attacker-selected-id",
          adminId: "another-admin",
        }),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.decideOwnershipTransfer,
      ).toHaveBeenCalledWith(
        TEST_TOKEN,
        "recipient-id",
        "accepted",
      );
    });

    it("does not permit another Admin to use the recipient's identity", async () => {
      allowRecipient({
        ...recipient,
        id: "different-admin-id",
      });

      // The database helper rejects a transfer that does
      // not belong to the authenticated account.
      mocks.decideOwnershipTransfer.mockResolvedValue(null);

      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(409);

      expect(
        mocks.decideOwnershipTransfer,
      ).toHaveBeenCalledWith(
        TEST_TOKEN,
        "different-admin-id",
        "accepted",
      );

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Request validation", () => {
    it("rejects malformed JSON", async () => {
      const response = await POST(
        makeMalformedRequest(),
      );

      expect(response.status).toBe(400);

      expect(
        mocks.decideOwnershipTransfer,
      ).not.toHaveBeenCalled();
    });

    it.each([
      null,
      [],
      {},
      { token: TEST_TOKEN },
      { decision: "accepted" },
      { token: 123, decision: "accepted" },
      { token: null, decision: "accepted" },
      { token: TEST_TOKEN, decision: null },
      { token: TEST_TOKEN, decision: "approve" },
      { token: TEST_TOKEN, decision: "cancel" },
      { token: TEST_TOKEN, decision: true },
    ])("rejects invalid decision input: %j", async (body) => {
      const response = await POST(
        makeRequest(body),
      );

      expect(response.status).toBe(400);

      expect(
        mocks.decideOwnershipTransfer,
      ).not.toHaveBeenCalled();

      expect(
        mocks.sendOwnershipTransferDeclined,
      ).not.toHaveBeenCalled();

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });

    it("rejects a token that the database cannot validate", async () => {
      mocks.decideOwnershipTransfer.mockResolvedValue(null);

      const response = await POST(
        makeRequest({
          token: "invalid-token",
          decision: "accepted",
        }),
      );

      expect(response.status).toBe(409);

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Accepting ownership", () => {
    it("accepts a valid offer and sends completion notifications", async () => {
      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.requireAdminApi,
      ).toHaveBeenCalledWith(
        expect.any(Request),
        2,
      );

      expect(
        mocks.decideOwnershipTransfer,
      ).toHaveBeenCalledWith(
        TEST_TOKEN,
        "recipient-id",
        "accepted",
      );

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).toHaveBeenCalledWith(transfer);

      expect(
        mocks.sendOwnershipTransferDeclined,
      ).not.toHaveBeenCalled();

      const body = await response.json();

      expect(body.status).toBe("accepted");
      expect(body.message).toContain(
        "Ownership transfer completed",
      );

      expect(response.headers.get("Cache-Control")).toBe(
        "no-store",
      );

      // Never return the secret token or account emails.
      expect(JSON.stringify(body)).not.toContain(TEST_TOKEN);
      expect(JSON.stringify(body)).not.toContain(
        "owner@example.invalid",
      );
      expect(JSON.stringify(body)).not.toContain(
        "admin@example.invalid",
      );
    });

    it("rejects an offer already accepted or otherwise resolved", async () => {
      mocks.decideOwnershipTransfer.mockResolvedValue(null);

      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(409);

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });

    it.each([
      "Ownership transfer link expired",
      "Ownership transfer accounts are no longer eligible",
      "Invalid ownership transfer status transition",
    ])(
      "rejects a database-enforced transfer condition: %s",
      async (message) => {
        mocks.decideOwnershipTransfer.mockRejectedValue(
          new mocks.D1Error(message),
        );

        const response = await POST(
          makeRequest(acceptInput),
        );

        expect(response.status).toBe(409);

        expect(
          mocks.sendOwnershipTransferCompleted,
        ).not.toHaveBeenCalled();

        expect(
          mocks.sendOwnershipTransferDeclined,
        ).not.toHaveBeenCalled();
      },
    );

    it("does not send duplicate notifications for a repeated decision", async () => {
      mocks.decideOwnershipTransfer
        .mockResolvedValueOnce(transfer)
        .mockResolvedValueOnce(null);

      const firstResponse = await POST(
        makeRequest(acceptInput),
      );

      const secondResponse = await POST(
        makeRequest(acceptInput),
      );

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(409);

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).toHaveBeenCalledOnce();
    });

    it("does not reverse an accepted transfer when one notification fails", async () => {
      mocks.sendOwnershipTransferCompleted.mockResolvedValue([
        {
          status: "rejected",
          reason: new Error("Email unavailable"),
        },
        {
          status: "fulfilled",
          value: "sent",
        },
      ]);

      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.status).toBe("accepted");

      expect(console.error).toHaveBeenCalled();
    });

    it("preserves the accepted result when notification delivery throws", async () => {
      mocks.sendOwnershipTransferCompleted.mockRejectedValue(
        new Error("Notification service unavailable"),
      );

      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.decideOwnershipTransfer,
      ).toHaveBeenCalledOnce();

      expect(console.error).toHaveBeenCalled();
    });

    it("returns a service error when the ownership decision fails unexpectedly", async () => {
      mocks.decideOwnershipTransfer.mockRejectedValue(
        new Error("Database unavailable"),
      );

      const response = await POST(
        makeRequest(acceptInput),
      );

      expect(response.status).toBe(503);

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();

      expect(
        mocks.sendOwnershipTransferDeclined,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Declining ownership", () => {
    it("records a decline and notifies the current Owner", async () => {
      const response = await POST(
        makeRequest(declineInput),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.decideOwnershipTransfer,
      ).toHaveBeenCalledWith(
        TEST_TOKEN,
        "recipient-id",
        "declined",
      );

      expect(
        mocks.sendOwnershipTransferDeclined,
      ).toHaveBeenCalledWith(transfer);

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();

      const body = await response.json();

      expect(body.status).toBe("declined");
      expect(body.message).toContain(
        "Both accounts retain their existing permissions",
      );
    });

    it("rejects a repeated decline", async () => {
      mocks.decideOwnershipTransfer
        .mockResolvedValueOnce(transfer)
        .mockResolvedValueOnce(null);

      const firstResponse = await POST(
        makeRequest(declineInput),
      );

      const secondResponse = await POST(
        makeRequest(declineInput),
      );

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(409);

      expect(
        mocks.sendOwnershipTransferDeclined,
      ).toHaveBeenCalledOnce();
    });

    it("does not reverse a decline when notification delivery fails", async () => {
      mocks.sendOwnershipTransferDeclined.mockRejectedValue(
        new Error("Email service unavailable"),
      );

      const response = await POST(
        makeRequest(declineInput),
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.status).toBe("declined");

      expect(console.error).toHaveBeenCalled();
    });
  });
});
