import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prepare } from "./d1";

export type PasswordTokenPurpose = "setup" | "reset";

type CreatedPasswordToken = {
  token: string;
  expiresAt: number;
};

type ValidPasswordToken = {
  id: string;
  admin_user_id: string;
  purpose: PasswordTokenPurpose;
};

// Expiration durations in seconds.
const TOKEN_LIFETIME: Record<PasswordTokenPurpose, number> = {
  setup: 24 * 60 * 60,
  reset: 30 * 60,
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a password token for an eligible admin.
 *
 * Setup requires an account without a password.
 * Reset requires an account with a password.
 *
 * Returns the original token for the email link.
 * Only its hash is stored in D1.
 */
export async function createPasswordToken(
  adminId: string,
  purpose: PasswordTokenPurpose,
): Promise<CreatedPasswordToken | null> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_LIFETIME[purpose];

  const inserted = await prepare(
    `INSERT INTO admin_password_token (
       id,
       admin_user_id,
       token_hash,
       purpose,
       created_at,
       expires_at
     )
     SELECT ?1, id, ?2, ?3, ?4, ?5
       FROM admin_user
      WHERE id = ?6
        AND deleted_at IS NULL
        AND status IN ('active', 'invited')
        AND role_id IN (1, 2, 3)
        AND (
          (?3 = 'setup' AND password_hash IS NULL)
          OR
          (?3 = 'reset' AND password_hash IS NOT NULL)
        )
     RETURNING id`,
  )
    .bind(randomUUID(), tokenHash, purpose, now, expiresAt, adminId)
    .first<{ id: string }>();

  if (!inserted) return null;

  return { token, expiresAt };
}

/**
 * Check a token without consuming it.
 *
 * Opening an email link must not use up the token.
 * Consumption happens only when a new password is saved.
 */
export async function findValidPasswordToken(
  token: string,
  purpose: PasswordTokenPurpose,
): Promise<ValidPasswordToken | null> {
  // A 32-byte base64url token has 43 characters.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  return prepare(
    `SELECT t.id, t.admin_user_id, t.purpose
       FROM admin_password_token AS t
       JOIN admin_user AS a ON a.id = t.admin_user_id
      WHERE t.token_hash = ?1
        AND t.purpose = ?2
        AND t.used_at IS NULL
        AND t.expires_at > ?3
        AND a.deleted_at IS NULL
        AND a.status IN ('active', 'invited')
        AND a.role_id IN (1, 2, 3)
        AND (
          (t.purpose = 'setup' AND a.password_hash IS NULL)
          OR
          (t.purpose = 'reset' AND a.password_hash IS NOT NULL)
        )
      LIMIT 1`,
  )
    .bind(hashToken(token), purpose, now)
    .first<ValidPasswordToken>();
}
