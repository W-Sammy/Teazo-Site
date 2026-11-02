import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { prepare } from "@/app/lib/d1";

const TRANSFER_LIFETIME_SECONDS = 24 * 60 * 60;

type TransferParty = {
  id: string;
  username: string;
  email: string;
};

type TransferParties = {
  owner: TransferParty;
  recipient: TransferParty;
};

export type OwnershipTransferDetails = TransferParties & {
  id: string;
  expiresAt: number;
};

export type CreatedOwnershipTransfer =
  OwnershipTransferDetails & {
    // Secret only for the server-side email sender.
    // Never include this token in an API response.
    token: string;
  };

export type PendingOwnershipTransfer = {
  id: string;
  recipientAdminId: string;
  recipientUsername: string;
  recipientEmail: string;
  createdAt: number;
  expiresAt: number;
  status: "pending";
};

export type TransferDecision = "accepted" | "declined";

function hashToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function validTokenFormat(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function currentTime(): number {
  return Math.floor(Date.now() / 1000);
}

type PartyRow = {
  owner_id: string;
  owner_username: string;
  owner_email: string;
  recipient_id: string;
  recipient_username: string;
  recipient_email: string;
};

function mapParties(row: PartyRow): TransferParties {
  return {
    owner: {
      id: row.owner_id,
      username: row.owner_username,
      email: row.owner_email,
    },
    recipient: {
      id: row.recipient_id,
      username: row.recipient_username,
      email: row.recipient_email,
    },
  };
}

// Expiration is enforced by timestamps even if this cleanup
// has not run. Cleanup also releases the single-pending index.
export async function expireOwnershipTransfers(): Promise<void> {
  const now = currentTime();

  await prepare(
    `UPDATE ownership_transfer_request
        SET status = 'expired',
            resolved_at = ?1
      WHERE status = 'pending'
        AND expires_at <= ?1`,
  )
    .bind(now)
    .run();
}

// Show the current Owner an existing pending offer without
// exposing its secret token. Expire old requests first so a
// new offer can be created after the 24-hour window.
export async function findPendingOwnershipTransfer(
  ownerId: string,
): Promise<PendingOwnershipTransfer | null> {
  if (!ownerId) {
    return null;
  }

  await expireOwnershipTransfers();

  const row = await prepare(
    `SELECT t.id,
            t.recipient_admin_id,
            r.username AS recipient_username,
            r.email AS recipient_email,
            t.created_at,
            t.expires_at
       FROM ownership_transfer_request AS t
       JOIN admin_user AS o ON o.id = t.owner_admin_id
       JOIN admin_user AS r ON r.id = t.recipient_admin_id
      WHERE t.owner_admin_id = ?1
        AND t.status = 'pending'
        AND t.expires_at > ?2
        AND o.role_id = 1
        AND o.status = 'active'
        AND o.deleted_at IS NULL
      LIMIT 1`,
  )
    .bind(ownerId, currentTime())
    .first<{
      id: string;
      recipient_admin_id: string;
      recipient_username: string;
      recipient_email: string;
      created_at: number;
      expires_at: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    recipientAdminId: row.recipient_admin_id,
    recipientUsername: row.recipient_username,
    recipientEmail: row.recipient_email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: "pending",
  };
}

// Only call after authenticating and authorizing the Owner.
// The SQL independently checks both accounts' current roles.
export async function createOwnershipTransfer(
  ownerId: string,
  recipientId: string,
): Promise<CreatedOwnershipTransfer | null> {
  if (
    !ownerId ||
    !recipientId ||
    ownerId === recipientId
  ) {
    return null;
  }

  await expireOwnershipTransfers();

  const row = await prepare(
    `SELECT
       o.id AS owner_id,
       o.username AS owner_username,
       o.email AS owner_email,
       r.id AS recipient_id,
       r.username AS recipient_username,
       r.email AS recipient_email
     FROM admin_user AS o
     JOIN admin_user AS r ON r.id = ?2
     WHERE o.id = ?1
       AND o.role_id = 1
       AND r.role_id = 2
       AND o.status = 'active'
       AND r.status = 'active'
       AND o.deleted_at IS NULL
       AND r.deleted_at IS NULL`,
  )
    .bind(ownerId, recipientId)
    .first<PartyRow>();

  if (!row) {
    return null;
  }

  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const now = currentTime();
  const expiresAt = now + TRANSFER_LIFETIME_SECONDS;

  // Recheck eligibility within the INSERT, and do not create
  // another request while an existing one is pending.
  // The database's unique index also prevents concurrent
  // requests from producing multiple pending transfers.
  const inserted = await prepare(
    `INSERT INTO ownership_transfer_request (
       id,
       owner_admin_id,
       recipient_admin_id,
       token_hash,
       status,
       created_at,
       expires_at
     )
     SELECT ?1, o.id, r.id, ?4, 'pending', ?5, ?6
       FROM admin_user AS o
       JOIN admin_user AS r ON r.id = ?3
      WHERE o.id = ?2
        AND o.role_id = 1
        AND r.role_id = 2
        AND o.status = 'active'
        AND r.status = 'active'
        AND o.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
            FROM ownership_transfer_request
           WHERE status = 'pending'
        )
     RETURNING id`,
  )
    .bind(
      id,
      ownerId,
      recipientId,
      hashToken(token),
      now,
      expiresAt,
    )
    .first<{ id: string }>();

  if (!inserted) {
    return null;
  }

  return {
    id,
    token,
    expiresAt,
    ...mapParties(row),
  };
}

// Validate an unconsumed acceptance link for the signed-in
// receiving Admin. Merely opening the link changes nothing.
export async function findOwnershipTransfer(
  token: string,
  recipientId: string,
): Promise<OwnershipTransferDetails | null> {
  if (
    !validTokenFormat(token) ||
    !recipientId
  ) {
    return null;
  }

  const row = await prepare(
    `SELECT
       t.id,
       t.expires_at,
       o.id AS owner_id,
       o.username AS owner_username,
       o.email AS owner_email,
       r.id AS recipient_id,
       r.username AS recipient_username,
       r.email AS recipient_email
     FROM ownership_transfer_request AS t
     JOIN admin_user AS o
       ON o.id = t.owner_admin_id
     JOIN admin_user AS r
       ON r.id = t.recipient_admin_id
     WHERE t.token_hash = ?1
       AND t.recipient_admin_id = ?2
       AND t.status = 'pending'
       AND t.expires_at > ?3
       AND o.role_id = 1
       AND r.role_id = 2
       AND o.status = 'active'
       AND r.status = 'active'
       AND o.deleted_at IS NULL
       AND r.deleted_at IS NULL
     LIMIT 1`,
  )
    .bind(hashToken(token), recipientId, currentTime())
    .first<PartyRow & {
      id: string;
      expires_at: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    expiresAt: row.expires_at,
    ...mapParties(row),
  };
}

// Only call after verifying that the signed-in account is
// the receiving Admin. The final UPDATE checks eligibility,
// the token, and expiration again to prevent stale approvals.
//
// The database trigger exchanges the roles and increments
// both session versions within the same atomic statement.
export async function decideOwnershipTransfer(
  token: string,
  recipientId: string,
  decision: TransferDecision,
): Promise<OwnershipTransferDetails | null> {
  if (
    !validTokenFormat(token) ||
    !recipientId ||
    !["accepted", "declined"].includes(decision)
  ) {
    return null;
  }

  const details = await findOwnershipTransfer(
    token,
    recipientId,
  );

  if (!details) {
    return null;
  }

  const now = currentTime();

  const updated = await prepare(
    `UPDATE ownership_transfer_request
        SET status = ?1,
            resolved_at = ?2
      WHERE token_hash = ?3
        AND recipient_admin_id = ?4
        AND status = 'pending'
        AND expires_at > ?2
        AND EXISTS (
          SELECT 1
            FROM admin_user
           WHERE id = ownership_transfer_request.owner_admin_id
             AND role_id = 1
             AND status = 'active'
             AND deleted_at IS NULL
        )
        AND EXISTS (
          SELECT 1
            FROM admin_user
           WHERE id = ownership_transfer_request.recipient_admin_id
             AND role_id = 2
             AND status = 'active'
             AND deleted_at IS NULL
        )
     RETURNING id`,
  )
    .bind(
      decision,
      now,
      hashToken(token),
      recipientId,
    )
    .first<{ id: string }>();

  return updated ? details : null;
}

// The current Owner may revoke a pending request.
// Also useful if sending the acceptance email fails.
export async function cancelOwnershipTransfer(
  transferId: string,
  ownerId: string,
): Promise<boolean> {
  const updated = await prepare(
    `UPDATE ownership_transfer_request
        SET status = 'canceled',
            resolved_at = ?1
      WHERE id = ?2
        AND owner_admin_id = ?3
        AND status = 'pending'
        AND EXISTS (
          SELECT 1
            FROM admin_user
           WHERE id = ?3
             AND role_id = 1
             AND status = 'active'
             AND deleted_at IS NULL
        )
     RETURNING id`,
  )
    .bind(currentTime(), transferId, ownerId)
    .first<{ id: string }>();

  return Boolean(updated);
}
