/**
 * Isolated local D1 transaction atomicity tests for the Teazo Worker.
 *
 * The existing Worker request tests verify that /batch forwards a
 * collection of prepared statements to D1Database.batch() once.
 *
 * These tests complement that coverage by exercising the real D1
 * batch implementation through Wrangler's local workerd emulator.
 *
 * A temporary Wrangler configuration uses a synthetic database ID.
 * Remote bindings are disabled and persistence is turned off.
 *
 * No production database, development database, Cloudflare account,
 * credentials, or network service is accessed.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import { getPlatformProxy } from "wrangler";

// The test database deliberately has no production identifier.
const TEST_DATABASE_ID =
  "00000000-0000-4000-8000-000000000572";

const TABLE_NAME = "atomicity_probe";

type TestBindings = {
  DB: D1Database;
};

// Access the real local D1 binding only after Wrangler initializes.
// The cleanup function closes its underlying local workerd process.
let db: D1Database;
let disposeProxy: (() => Promise<void>) | undefined;
let temporaryDirectory: string | undefined;

// Create a temporary Wrangler configuration outside the repository.
// No existing wrangler.jsonc or development database is reused.
async function createTestConfiguration() {
  const directory = await mkdtemp(
    join(tmpdir(), "teazo-d1-atomicity-"),
  );

  const configPath = join(
    directory,
    "wrangler.json",
  );

  const configuration = {
    name: "teazo-d1-atomicity-test",
    compatibility_date: "2026-09-01",

    // This UUID only identifies the disposable local binding.
    d1_databases: [
      {
        binding: "DB",
        database_name: "teazo-d1-atomicity-test",
        database_id: TEST_DATABASE_ID,
      },
    ],
  };

  await writeFile(
    configPath,
    JSON.stringify(configuration, null, 2),
    "utf8",
  );

  return {
    directory,
    configPath,
  };
}

// Read back every row in a predictable order.
// This checks committed data instead of trusting response metadata.
async function readRows() {
  const result = await db.prepare(
    `SELECT id, amount
       FROM ${TABLE_NAME}
      ORDER BY id`,
  ).all<{
    id: string;
    amount: number;
  }>();

  return result.results;
}

// Create a known committed row before a deliberately failing batch.
// Its continued existence proves that an unsuccessful transaction
// did not erase data committed by an earlier transaction.
async function seedExistingRow() {
  await db.prepare(
    `INSERT INTO ${TABLE_NAME} (id, amount)
     VALUES (?1, ?2)`,
  ).bind("existing", 100).run();
}

describe("Cloudflare D1 local transaction atomicity", () => {
  beforeAll(async () => {
    const configuration =
      await createTestConfiguration();

    temporaryDirectory = configuration.directory;

    // remoteBindings=false prevents remote Cloudflare access.
    // persist=false creates disposable binding state rather than
    // loading or modifying .wrangler/state.
    const platform = await getPlatformProxy<TestBindings>({
      configPath: configuration.configPath,
      remoteBindings: false,
      persist: false,
    });

    db = platform.env.DB;
    disposeProxy = () => platform.dispose();
  }, 60_000);

  afterAll(async () => {
    // Release workerd before deleting its temporary configuration.
    try {
      if (disposeProxy) {
        await disposeProxy();
      }
    } finally {
      if (temporaryDirectory) {
        await rm(temporaryDirectory, {
          recursive: true,
          force: true,
        });
      }
    }
  }, 30_000);

  beforeEach(async () => {
    // Each test receives an empty table in the isolated database.
    // Neither the project's real schema nor migrations are used.
    await db.prepare(
      `DROP TABLE IF EXISTS ${TABLE_NAME}`,
    ).run();

    await db.prepare(
      `CREATE TABLE ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        amount INTEGER NOT NULL CHECK (amount >= 0)
      )`,
    ).run();
  });

  it("commits all statements in a successful batch", async () => {
    // The second statement depends on the first statement's
    // committed-in-transaction data.
    const results = await db.batch([
      db.prepare(
        `INSERT INTO ${TABLE_NAME} (id, amount)
         VALUES (?1, ?2)`,
      ).bind("first", 10),

      db.prepare(
        `UPDATE ${TABLE_NAME}
            SET amount = amount + ?1
          WHERE id = ?2`,
      ).bind(5, "first"),

      db.prepare(
        `INSERT INTO ${TABLE_NAME} (id, amount)
         VALUES (?1, ?2)`,
      ).bind("second", 20),
    ]);

    expect(results).toHaveLength(3);

    expect(await readRows()).toEqual([
      {
        id: "first",
        amount: 15,
      },
      {
        id: "second",
        amount: 20,
      },
    ]);
  });

  it("rolls back earlier inserts when a later statement violates a unique constraint", async () => {
    await seedExistingRow();

    // The first insert is valid, but the second duplicates
    // a key that was committed before this batch started.
    // The third insert must not execute or remain committed.
    await expect(
      db.batch([
        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("before-failure", 10),

        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("existing", 200),

        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("after-failure", 30),
      ]),
    ).rejects.toThrow(/unique|constraint/i);

    // Only the previously committed record may survive.
    expect(await readRows()).toEqual([
      {
        id: "existing",
        amount: 100,
      },
    ]);
  });

  it("rolls back updates and inserts after a CHECK constraint failure", async () => {
    await seedExistingRow();

    // A successful update must also be undone if a later
    // statement tries to insert a negative amount.
    await expect(
      db.batch([
        db.prepare(
          `UPDATE ${TABLE_NAME}
              SET amount = ?1
            WHERE id = ?2`,
        ).bind(150, "existing"),

        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("invalid", -1),

        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("never-committed", 25),
      ]),
    ).rejects.toThrow(/check|constraint/i);

    // The original value must be preserved.
    expect(await readRows()).toEqual([
      {
        id: "existing",
        amount: 100,
      },
    ]);
  });

  it("rolls back a transaction containing both reads and writes", async () => {
    await seedExistingRow();

    // Include an intermediate SELECT to verify that adding a
    // read does not split the batch into separate transactions.
    await expect(
      db.batch([
        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("temporary", 10),

        db.prepare(
          `SELECT amount
             FROM ${TABLE_NAME}
            WHERE id = ?1`,
        ).bind("temporary"),

        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("existing", 999),
      ]),
    ).rejects.toThrow(/unique|constraint/i);

    expect(await readRows()).toEqual([
      {
        id: "existing",
        amount: 100,
      },
    ]);
  });

  it("allows a successful transaction after a failed batch", async () => {
    // A failed transaction must leave the connection and
    // database usable for subsequent requests.
    await expect(
      db.batch([
        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("temporary", 10),

        db.prepare(
          `INSERT INTO ${TABLE_NAME} (id, amount)
           VALUES (?1, ?2)`,
        ).bind("invalid", -50),
      ]),
    ).rejects.toThrow(/check|constraint/i);

    expect(await readRows()).toEqual([]);

    const results = await db.batch([
      db.prepare(
        `INSERT INTO ${TABLE_NAME} (id, amount)
         VALUES (?1, ?2)`,
      ).bind("recovered", 75),

      db.prepare(
        `UPDATE ${TABLE_NAME}
            SET amount = amount + ?1
          WHERE id = ?2`,
      ).bind(25, "recovered"),
    ]);

    expect(results).toHaveLength(2);

    expect(await readRows()).toEqual([
      {
        id: "recovered",
        amount: 100,
      },
    ]);
  });
});
