/**
 * A real SQLite database in memory, built from teazo-site/migrations, behind
 * the same prepare()/batch() interface as app/lib/d1.ts. Use it when a test
 * needs the actual SQL to run, not just to be recorded (see fake-d1.ts).
 *
 *   vi.mock("@/app/lib/d1", async () => (await import("@/test/sqlite-d1")).sqliteD1.module);
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

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
    db.exec("BEGIN");
    try {
      for (const { sql, params } of statements.map((s) => s.toStmt())) {
        db.prepare(sql).run(...(params as SqlValue[]));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return [];
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
    module: { prepare, batch },
  };
}

/** The shared database that tests swap in for app/lib/d1.ts. */
export const sqliteD1 = createSqliteD1();
