// Local development only.
//
// Gives Google accounts an admin role in YOUR local database, so you can sign in
// to the site running on your machine. It always passes --local to wrangler and
// has no way to reach the real databases.
//
//   npm run db:seed:local -- you@gmail.com
//   npm run db:seed:local -- teammate@gmail.com --role 3
//
// Without --role, a new address becomes the Owner if your database has none yet,
// and Can Edit otherwise. An address that is already there keeps its role unless
// you pass --role, and never gets a second row. Pending migrations are applied
// first, so after a pull this one command brings your local database up to date.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const ROLES = { 1: "Owner", 2: "Can Edit", 3: "Can View" };

const USAGE = `Usage:
  npm run db:seed:local -- you@gmail.com
  npm run db:seed:local -- teammate@gmail.com --role 2

Roles: 1 Owner, 2 Can Edit, 3 Can View. Without --role, a new address becomes
the Owner if there is none yet, and Can Edit otherwise. An address that is
already there keeps its role.`;

// Must match normalizeEmail() used at sign-in: trim, then lowercase. Admins are
// looked up by this exact form, so a row stored any other way would never match.
const normalize = (email) => email.trim().toLowerCase();

// Deliberately strict. Quotes, spaces and semicolons can never reach the SQL.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// Run wrangler directly with node rather than through a shell, so no argument is
// ever re-parsed, on any operating system.
function wrangler(args) {
  const result = spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

// ---- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes("--remote")) {
  fail("This script only works on your local database. It has no --remote mode.");
}

let role = null;
let persistTo = null;
const emails = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--role") {
    role = Number(args[++i]);
    if (![1, 2, 3].includes(role)) fail("--role must be 1 (Owner), 2 (Can Edit) or 3 (Can View).");
  } else if (arg === "--persist-to") {
    // Same meaning as wrangler's flag. Only needed if you run the Worker with it.
    persistTo = args[++i];
    if (!persistTo) fail("--persist-to needs a directory.");
  } else if (arg === "--help" || arg === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else if (arg.startsWith("-")) {
    fail(`Unknown option ${arg}.\n\n${USAGE}`);
  } else {
    emails.push(normalize(arg));
  }
}

const unique = [...new Set(emails)];
if (unique.length === 0) fail(USAGE);

const invalid = unique.filter((email) => !EMAIL.test(email));
if (invalid.length) fail(`Not a valid email address: ${invalid.join(", ")}`);

if (role === 1 && unique.length > 1) {
  fail("Only one Owner is allowed. Seed the other addresses in a separate run with --role 2 or 3.");
}

if (!existsSync(WRANGLER)) {
  fail("wrangler is not installed. Run `npm install` in teazo-d1-proxy first.");
}

const local = ["--local", ...(persistTo ? ["--persist-to", persistTo] : [])];

// ---- 1. schema up to date ----------------------------------------------------
const migrate = wrangler(["d1", "migrations", "apply", "teazo-db", ...local]);
if (!migrate.ok) fail(`Applying migrations failed:\n\n${migrate.output}`);
console.log("Local database schema is up to date.");

// ---- 2. admin rows -----------------------------------------------------------
// A new address is the Owner only while the database has none. Statements run in
// order, so seeding several addresses at once makes just the first one Owner.
const NEW_ROLE =
  role ?? "(CASE WHEN EXISTS (SELECT 1 FROM admin_user WHERE role_id = 1 AND deleted_at IS NULL) THEN 2 ELSE 1 END)";

// An existing row keeps its role and its Settings label unless --role is given.
// can_invite_users is cleared whenever the role changes, because the schema only
// allows it for Can Edit.
const UPDATE_SET = role ? `role_id = ${role}, can_invite_users = 0, status = 'active'` : "status = 'active'";

const sql = unique
  .map((email) => {
    // The label shown in Settings. The part before the @ is a reasonable default.
    const username = email.split("@")[0].replace(/[^a-z0-9._-]/g, "") || "admin";
    return `
UPDATE admin_user SET ${UPDATE_SET}
 WHERE email_normalized = '${email}' AND deleted_at IS NULL;
INSERT INTO admin_user (email, email_normalized, username, role_id)
SELECT '${email}', '${email}', '${username}', ${NEW_ROLE}
 WHERE NOT EXISTS (
   SELECT 1 FROM admin_user WHERE email_normalized = '${email}' AND deleted_at IS NULL
 );`;
  })
  .join("\n");

const dir = mkdtempSync(join(tmpdir(), "teazo-seed-"));
const file = join(dir, "seed.sql");
writeFileSync(file, sql, "utf8");

let seeded;
try {
  seeded = wrangler(["d1", "execute", "teazo-db", ...local, "--file", file]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (!seeded.ok) {
  if (seeded.output.includes("admin_user.role_id")) {
    fail(
      "Your local database already has a different Owner, and only one is allowed.\n" +
        "Re-run with --role 2, or reset your local database (guide section 2.4).",
    );
  }
  fail(`Seeding failed:\n\n${seeded.output}`);
}

// ---- 3. report ---------------------------------------------------------------
const list = wrangler([
  "d1", "execute", "teazo-db", ...local, "--json", "--command",
  "SELECT email_normalized AS email, role_id, status FROM admin_user WHERE deleted_at IS NULL ORDER BY role_id, email_normalized",
]);

console.log("\nAdmins in your local database:");
try {
  const start = list.output.search(/^\[/m);
  const rows = JSON.parse(list.output.slice(start))[0].results;
  for (const row of rows) {
    const mark = unique.includes(row.email) ? "  <- just seeded" : "";
    console.log(`  ${row.email.padEnd(36)} ${ROLES[row.role_id].padEnd(9)} ${row.status}${mark}`);
  }
} catch {
  console.log(list.output);
}

console.log(`
Sign in at http://localhost:3000/login with one of those Google accounts.
Signing in also needs AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in
teazo-site/.env.local (guide section 2.3).`);
