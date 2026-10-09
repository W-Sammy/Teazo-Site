
// Script is for automating and simplifying testing of login email/password 
// by creating the argon2 hash associated with the account password.
// This script generates a random password, hashes it, and writes an update into a temporary SQL file.

// Execute from teazo-site: node scripts/create-test-password.mjs <your-email@example.com>
// You will receive a created local test password used to test login functionality. 
// Each run generates a different password.

// Then apply the update locally from teazo-d1-proxy
// npx wrangler d1 execute teazo-db --local --file <FULL_PATH_PRINTED_BY_THE_SCRIPT>

import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { argon2id, hash } from "argon2";

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  throw new Error(
    "Usage: node scripts/create-test-password.mjs <admin-email>",
  );
}

// Generate a temporary password for local testing.
const password = randomBytes(24).toString("base64url");
const passwordHash = await hash(password, { type: argon2id });

// Escape SQL string literals. The plaintext password is never written to SQL.
const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

const sql = `
UPDATE admin_user
SET password_hash = ${sqlString(passwordHash)}
WHERE email_normalized = ${sqlString(email)}
  AND deleted_at IS NULL
  AND status IN ('active', 'invited')
  AND role_id IN (1, 2, 3);

SELECT email_normalized, status, role_id,
       password_hash IS NOT NULL AS has_password
FROM admin_user
WHERE email_normalized = ${sqlString(email)}
  AND deleted_at IS NULL;
`;

const directory = mkdtempSync(join(tmpdir(), "teazo-test-login-"));
const sqlPath = join(directory, "set-password.sql");

writeFileSync(sqlPath, sql, { mode: 0o600 });

console.log(`Email: ${email}`);
console.log(`Local test password: ${password}`);
console.log(`SQL file: ${sqlPath}`);