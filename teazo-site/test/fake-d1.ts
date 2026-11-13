/**
 * An in-memory stand-in for app/lib/d1.ts in tests. Reads answer from
 * `tables`, keyed by the table a query reads FROM. Writes sent with batch()
 * are recorded in `batches` so a test can check the SQL and its parameters.
 * Set `state.failReads` to make every read throw, as if D1 were unreachable,
 * or `state.batchError` to make batch() throw it.
 *
 *   vi.mock("@/app/lib/d1", async () => (await import("@/test/fake-d1")).fakeD1.module);
 *   import { fakeD1 } from "@/test/fake-d1";
 */
export type FakeStatement = { sql: string; params: unknown[] };

export function createFakeD1() {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const batches: FakeStatement[][] = [];
  const state = { failReads: false, reads: 0, batchError: null as Error | null };

  const rowsFor = (sql: string) => {
    state.reads += 1;
    if (state.failReads) throw new Error("D1 is unreachable (fake)");
    const table = /FROM\s+(\w+)/i.exec(sql)?.[1] ?? "";
    return tables[table] ?? [];
  };

  function prepare(sql: string) {
    let params: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) {
        params = values;
        return statement;
      },
      async all() {
        return { results: rowsFor(sql), success: true, meta: {} };
      },
      async first() {
        return rowsFor(sql)[0] ?? null;
      },
      async run() {
        return { results: [], success: true, meta: {} };
      },
      toStmt(): FakeStatement {
        return { sql, params };
      },
    };
    return statement;
  }

  async function batch(statements: Array<{ toStmt(): FakeStatement }>) {
    if (state.batchError) throw state.batchError;
    batches.push(statements.map((statement) => statement.toStmt()));
    return [];
  }

  return {
    tables,
    batches,
    state,
    reset() {
      for (const key of Object.keys(tables)) delete tables[key];
      batches.length = 0;
      state.failReads = false;
      state.reads = 0;
      state.batchError = null;
    },
    module: { prepare, batch },
  };
}

/** The shared fake that tests swap in for app/lib/d1.ts. */
export const fakeD1 = createFakeD1();
