/**
 * Integrated ownership-transfer and authentication tests for Teazo.
 *
 * Exercises the real ownership-transfer service, API decision/review
 * handlers, administrator authorization guard, and SQLite migrations.
 *
 * Verifies atomic role changes, session invalidation, fresh-session
 * permissions, unauthorized decisions, expired or consumed tokens,
 * declines, cancellations, and notification failure handling.
 *
 * Auth.js sessions and notification delivery are mocked.
 * All database operations use disposable in-memory SQLite.
 *
 * No real accounts, emails, or production services are accessed.
 */

import {
  createHash,
} from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { sqliteD1 } from "@/test/sqlite-d1";

// Mock the authentication session and outbound notifications.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  sendOwnershipTransferCompleted: vi.fn(),
  sendOwnershipTransferDeclined: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

// Run production queries against the existing SQLite test adapter.
// D1Error must also be available to the actual API route.
vi.mock("@/app/lib/d1", async () => {
  const { sqliteD1 } = await import("@/test/sqlite-d1");

  class D1Error extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = "D1Error";
      this.status = status;
    }
  }

  return {
    ...sqliteD1.module,
    D1Error,
  };
});

// Reevaluate authorization for every simulated request.
// This replaces React's per-render cache, not the guard logic.
vi.mock("react", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("react")>();

  return {
    ...original,
    cache: (callback: (...args: never[]) => unknown) =>
      callback,
  };
});

// Next.js framework control-flow functions are not needed
// for successful API requests in these tests.
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));

// Do not deliver any real ownership-transfer emails.
vi.mock("@/app/lib/ownership-transfer-email", () => ({
  sendOwnershipTransferCompleted:
    mocks.sendOwnershipTransferCompleted,
  sendOwnershipTransferDeclined:
    mocks.sendOwnershipTransferDeclined,
}));

import { requireAdminApi } from "./admin";

import {
  cancelOwnershipTransfer,
  createOwnershipTransfer,
} from "./ownership-transfer";

import {
  POST as decideTransfer,
} from "@/app/api/admin/ownership-transfer/decision/route";

import {
  POST as reviewTransfer,
} from "@/app/api/admin/ownership-transfer/review/route";

const SITE_ORIGIN = "http://localhost:3000";

const DECISION_URL =
  `${SITE_ORIGIN}/api/admin/ownership-transfer/decision`;

const REVIEW_URL =
  `${SITE_ORIGIN}/api/admin/ownership-transfer/review`;

// Every account is entirely synthetic.
const OWNER = {
  id: "synthetic-owner",
  email: "owner@example.invalid",
  username: "Synthetic Owner",
  role: 1,
  sessionVersion: 3,
};

const RECIPIENT = {
  id: "synthetic-recipient",
  email: "recipient@example.invalid",
  username: "Synthetic Recipient",
  role: 2,
  sessionVersion: 7,
};

const OTHER_ADMIN = {
  id: "synthetic-other-admin",
  email: "other-admin@example.invalid",
  username: "Synthetic Other Admin",
  role: 2,
  sessionVersion: 5,
};

type SyntheticAccount = typeof OWNER;

type AccountRow = {
  id: string;
  role_id: number;
  session_version: number;
  status: string;
  can_invite_users: number;
};

type TransferRow = {
  id: string;
  status: string;
  token_hash: string;
  owner_admin_id: string;
  recipient_admin_id: string;
  expires_at: number;
  resolved_at: number | null;
};

// Insert a synthetic administrator using the actual migrated schema.
function insertAccount(account: SyntheticAccount) {
  sqliteD1.db.prepare(
    `INSERT INTO admin_user (
       id,
       email,
       email_normalized,
       username,
       role_id,
       status,
       session_version
     )
     VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)`,
  ).run(
    account.id,
    account.email,
    account.email.toLowerCase(),
    account.username,
    account.role,
    account.sessionVersion,
  );
}

// Read current permissions from the real in-memory database.
function getAccount(id: string): AccountRow {
  const row = sqliteD1.db.prepare(
    `SELECT
       id,
       role_id,
       session_version,
       status,
       can_invite_users
     FROM admin_user
     WHERE id = ?1`,
  ).get(id) as AccountRow | undefined;

  if (!row) {
    throw new Error("Synthetic administrator not found.");
  }

  return row;
}

// Read the current persisted transfer request.
function getTransfer(id: string): TransferRow {
  const row = sqliteD1.db.prepare(
    `SELECT
       id,
       status,
       token_hash,
       owner_admin_id,
       recipient_admin_id,
       expires_at,
       resolved_at
     FROM ownership_transfer_request
     WHERE id = ?1`,
  ).get(id) as TransferRow | undefined;

  if (!row) {
    throw new Error("Synthetic transfer not found.");
  }

  return row;
}

// Check that the database contains exactly one Owner.
function ownerCount() {
  const row = sqliteD1.db.prepare(
    `SELECT COUNT(*) AS count
     FROM admin_user
     WHERE role_id = 1
       AND deleted_at IS NULL`,
  ).get() as { count: number };

  return row.count;
}

// Supply a synthetic Auth.js session.
// The default version is the one originally issued at sign-in.
function signInAs(
  account: SyntheticAccount,
  version = account.sessionVersion,
) {
  mocks.auth.mockResolvedValue({
    user: {
      email: account.email,
    },
    adminId: account.id,
    sessionVersion: version,
  });
}

// Simulate a new sign-in with the account's current version.
function signInAgainAs(account: SyntheticAccount) {
  signInAs(
    account,
    getAccount(account.id).session_version,
  );
}

// Check permissions through the production authorization guard.
async function accessStatus(
  minRole: 1 | 2,
): Promise<number> {
  const result = await requireAdminApi(
    new Request(
      `${SITE_ORIGIN}/api/admin/settings/admins`,
      { method: "GET" },
    ),
    minRole,
  );

  return result.ok
    ? 200
    : result.response.status;
}

// Create a real pending transfer using the application service.
async function createOffer() {
  const offer = await createOwnershipTransfer(
    OWNER.id,
    RECIPIENT.id,
  );

  if (!offer) {
    throw new Error(
      "Could not create synthetic ownership offer.",
    );
  }

  return offer;
}

// Send a simulated decision to the real API handler.
function decisionRequest(
  token: string,
  decision: "accepted" | "declined",
  origin = SITE_ORIGIN,
): Request {
  return new Request(DECISION_URL, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token,
      decision,
    }),
  });
}

// Send a simulated review to the real API handler.
function reviewRequest(
  token: string,
): Request {
  return new Request(REVIEW_URL, {
    method: "POST",
    headers: {
      origin: SITE_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      token,
    }),
  });
}

// Verify both accounts' roles and versions before acceptance.
function expectOriginalPermissions() {
  expect(getAccount(OWNER.id)).toMatchObject({
    role_id: 1,
    session_version: OWNER.sessionVersion,
  });

  expect(getAccount(RECIPIENT.id)).toMatchObject({
    role_id: 2,
    session_version: RECIPIENT.sessionVersion,
  });

  expect(ownerCount()).toBe(1);
}

// Verify the SQLite trigger's complete role exchange.
function expectAcceptedPermissions() {
  expect(getAccount(OWNER.id)).toMatchObject({
    role_id: 2,
    session_version: OWNER.sessionVersion + 1,
    can_invite_users: 0,
  });

  expect(getAccount(RECIPIENT.id)).toMatchObject({
    role_id: 1,
    session_version: RECIPIENT.sessionVersion + 1,
    can_invite_users: 0,
  });

  expect(ownerCount()).toBe(1);
}

describe("Ownership transfer and authentication integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Each test uses a newly migrated in-memory database.
    sqliteD1.reset();

    insertAccount(OWNER);
    insertAccount(RECIPIENT);
    insertAccount(OTHER_ADMIN);

    signInAs(OWNER);

    mocks.sendOwnershipTransferCompleted.mockResolvedValue([
      { status: "fulfilled", value: "sent" },
      { status: "fulfilled", value: "sent" },
    ]);

    mocks.sendOwnershipTransferDeclined.mockResolvedValue(
      "sent",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  describe("Pending transfer creation and review", () => {
    it("creates an offer without changing either administrator's role", async () => {
      const offer = await createOffer();

      expect(offer.owner.id).toBe(OWNER.id);
      expect(offer.recipient.id).toBe(RECIPIENT.id);

      const saved = getTransfer(offer.id);

      expect(saved.status).toBe("pending");
      expect(saved.resolved_at).toBeNull();

      // Only the hash is persisted, never the acceptance token.
      expect(saved.token_hash).toBe(
        createHash("sha256")
          .update(offer.token)
          .digest("hex"),
      );

      expect(saved.token_hash).not.toBe(offer.token);

      expectOriginalPermissions();

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });

    it("allows the receiving Admin to review without accepting", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      const response = await reviewTransfer(
        reviewRequest(offer.token),
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.transfer).toMatchObject({
        id: offer.id,
        ownerUsername: OWNER.username,
        recipientUsername: RECIPIENT.username,
      });

      expect(JSON.stringify(body)).not.toContain(
        offer.token,
      );

      // Opening the link must not exchange permissions.
      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );

      expectOriginalPermissions();
    });

    it("does not allow the Owner or another Admin to review the recipient's offer", async () => {
      const offer = await createOffer();

      signInAs(OWNER);

      const ownerResponse = await reviewTransfer(
        reviewRequest(offer.token),
      );

      expect(ownerResponse.status).toBe(403);

      signInAs(OTHER_ADMIN);

      const otherResponse = await reviewTransfer(
        reviewRequest(offer.token),
      );

      expect(otherResponse.status).toBe(404);

      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );

      expectOriginalPermissions();
    });
  });

  describe("Acceptance and session invalidation", () => {
    it("atomically exchanges roles through the actual decision API", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.status).toBe("accepted");
      expect(body.message).toContain(
        "Both accounts must sign in again",
      );

      expect(getTransfer(offer.id).status).toBe(
        "accepted",
      );

      expect(getTransfer(offer.id).resolved_at).not.toBeNull();

      expectAcceptedPermissions();

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).toHaveBeenCalledOnce();
    });

    it("rejects both previously issued sessions after acceptance", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      expect(await accessStatus(2)).toBe(200);

      signInAs(OWNER);

      expect(await accessStatus(1)).toBe(200);

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(200);

      expectAcceptedPermissions();

      // Both original JWTs now carry outdated session versions.
      signInAs(OWNER);

      expect(await accessStatus(2)).toBe(401);

      signInAs(RECIPIENT);

      expect(await accessStatus(2)).toBe(401);
    });

    it("grants updated permissions only after new sessions are issued", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      expect(
        (
          await decideTransfer(
            decisionRequest(
              offer.token,
              "accepted",
            ),
          )
        ).status,
      ).toBe(200);

      expectAcceptedPermissions();

      // The former Owner is now an Admin.
      signInAgainAs(OWNER);

      expect(await accessStatus(2)).toBe(200);
      expect(await accessStatus(1)).toBe(403);

      // The former Admin is now the Owner.
      signInAgainAs(RECIPIENT);

      expect(await accessStatus(1)).toBe(200);
      expect(await accessStatus(2)).toBe(200);
    });

    it("rejects attempts to accept an already completed transfer", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      expect(
        (
          await decideTransfer(
            decisionRequest(
              offer.token,
              "accepted",
            ),
          )
        ).status,
      ).toBe(200);

      // The old Owner is now a regular Admin with a fresh session.
      // They still cannot use an already consumed offer.
      signInAgainAs(OWNER);

      const retry = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(retry.status).toBe(409);

      expectAcceptedPermissions();

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).toHaveBeenCalledOnce();
    });

    it("does not reverse an accepted transfer when notifications fail", async () => {
      const offer = await createOffer();

      mocks.sendOwnershipTransferCompleted.mockRejectedValueOnce(
        new Error("Synthetic notification failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      // The transaction already committed; email failure
      // must not roll back the updated ownership.
      expect(response.status).toBe(200);

      expect(getTransfer(offer.id).status).toBe(
        "accepted",
      );

      expectAcceptedPermissions();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("Unauthorized and stale decisions", () => {
    it("rejects the current Owner attempting to accept as recipient", async () => {
      const offer = await createOffer();

      signInAs(OWNER);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(403);

      expectOriginalPermissions();
      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );
    });

    it("rejects another Admin attempting to accept the offer", async () => {
      const offer = await createOffer();

      signInAs(OTHER_ADMIN);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(409);

      expectOriginalPermissions();

      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );
    });

    it("rejects an incorrect acceptance token", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          "not-a-valid-acceptance-token",
          "accepted",
        ),
      );

      expect(response.status).toBe(409);

      expectOriginalPermissions();

      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );
    });

    it("rejects an expired ownership offer without changing roles", async () => {
      const offer = await createOffer();

      // Simulate an offer that was created one hour ago and
      // expired one second ago. Keep expires_at > created_at
      // to satisfy the database's timestamp constraint.
      const now = Math.floor(Date.now() / 1000);

      sqliteD1.db.prepare(
        `UPDATE ownership_transfer_request
         SET created_at = ?1,
             expires_at = ?2
         WHERE id = ?3`,
      ).run(
        now - 3600,
        now - 1,
        offer.id,
      );

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(409);

      expectOriginalPermissions();
      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );
    });

    it("rejects an acceptance using an outdated recipient session", async () => {
      const offer = await createOffer();

      // A password change invalidates the original session.
      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET session_version = session_version + 1
         WHERE id = ?1`,
      ).run(RECIPIENT.id);

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(401);

      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );

      expect(getAccount(OWNER.id).role_id).toBe(1);
      expect(getAccount(RECIPIENT.id).role_id).toBe(2);
    });

    it("rejects a suspended recipient before processing a decision", async () => {
      const offer = await createOffer();

      sqliteD1.db.prepare(
        `UPDATE admin_user
         SET status = 'suspended'
         WHERE id = ?1`,
      ).run(RECIPIENT.id);

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(403);

      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );

      expect(getAccount(OWNER.id).role_id).toBe(1);
      expect(getAccount(RECIPIENT.id).role_id).toBe(2);
    });

    it("rejects a cross-origin ownership decision", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
          "https://attacker.example.invalid",
        ),
      );

      expect(response.status).toBe(403);

      expect(getTransfer(offer.id).status).toBe(
        "pending",
      );

      expectOriginalPermissions();
    });
  });

  describe("Declined and canceled ownership transfers", () => {
    it("preserves both accounts when the recipient declines", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "declined",
        ),
      );

      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.status).toBe("declined");

      expect(getTransfer(offer.id).status).toBe(
        "declined",
      );

      expectOriginalPermissions();

      // Declining must not invalidate otherwise valid sessions.
      expect(await accessStatus(2)).toBe(200);

      signInAs(OWNER);

      expect(await accessStatus(1)).toBe(200);

      expect(
        mocks.sendOwnershipTransferDeclined,
      ).toHaveBeenCalledOnce();
    });

    it("does not allow a declined offer to be accepted afterward", async () => {
      const offer = await createOffer();

      signInAs(RECIPIENT);

      expect(
        (
          await decideTransfer(
            decisionRequest(
              offer.token,
              "declined",
            ),
          )
        ).status,
      ).toBe(200);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(409);

      expect(getTransfer(offer.id).status).toBe(
        "declined",
      );

      expectOriginalPermissions();

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });

    it("rejects acceptance after the Owner cancels the offer", async () => {
      const offer = await createOffer();

      // Use the real cancellation service against SQLite.
      const canceled = await cancelOwnershipTransfer(
        offer.id,
        OWNER.id,
      );

      expect(canceled).toBe(true);

      expect(getTransfer(offer.id).status).toBe(
        "canceled",
      );

      signInAs(RECIPIENT);

      const response = await decideTransfer(
        decisionRequest(
          offer.token,
          "accepted",
        ),
      );

      expect(response.status).toBe(409);

      expectOriginalPermissions();

      expect(
        mocks.sendOwnershipTransferCompleted,
      ).not.toHaveBeenCalled();
    });
  });
});
