/**
 * A real SQLite database in memory, built from teazo-site/migrations, behind
 * the same prepare()/batch() interface as app/lib/d1.ts. Use it when a test
 * needs the actual SQL to run, not just to be recorded (see fake-d1.ts).
 *
 *   vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Tests run from teazo-site; jsdom rewrites import.meta.url to a browser URL.
const MIGRATIONS = existsSync(resolve("migrations"))
  ? resolve("migrations")
  : resolve("teazo-site/migrations");

type Stmt = { sql: string; params: unknown[] };
type SqlValue = string | number | bigint | null | Uint8Array;

export function createSqliteD1() {
  let db = open();

  function open() {
    const database = new DatabaseSync(":memory:");
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      database.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    }
    return database;
  }

  function prepare(sql: string) {
    let params: SqlValue[] = [];
    const statement = {
      bind(...values: unknown[]) {
        params = values as SqlValue[];
        return statement;
      },
      async all() {
        return { results: db.prepare(sql).all(...params), success: true, meta: {} };
      },
      async first() {
        return db.prepare(sql).get(...params) ?? null;
      },
      async run() {
        const info = db.prepare(sql).run(...params);
        return { results: [], success: true, meta: { changes: Number(info.changes) } };
      },
      toStmt(): Stmt {
        return { sql, params };
      },
    };
    return statement;
  }

  async function batch(statements: Array<{ toStmt(): Stmt }>) {
    const results = [];
    db.exec("BEGIN");
    try {
      for (const { sql, params } of statements.map((s) => s.toStmt())) {
        const info = db.prepare(sql).run(...(params as SqlValue[]));
        results.push({ results: [], success: true, meta: { changes: Number(info.changes) } });
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { results };
  }

  return {
    get db() {
      return db;
    },
    /** A fresh, empty database with every migration applied. */
    reset() {
      db.close();
      db = open();
    },
    module: { prepare, batch, MAX_STATEMENTS: 40 },
  };
}

/** The shared database that tests swap in for app/lib/d1.ts. */
export const sqliteD1 = createSqliteD1();
