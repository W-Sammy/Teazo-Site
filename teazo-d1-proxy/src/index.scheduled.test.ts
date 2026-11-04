/**
 * Vitest coverage for the Teazo Cloudflare Worker's scheduled R2 cleanup.
 *
 * Tests the 24-hour deletion grace period, bucket isolation,
 * oldest-first ordering, the 20-object cleanup limit, successful
 * reaping, retries, and D1/R2 failure recovery.
 *
 * A synthetic pending-deletion queue simulates the SQL results.
 * The tests also inspect the actual SQL issued by the Worker.
 *
 * No Cloudflare service, database, or real R2 object is accessed.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import worker, { type Env } from "./index";

// Keep time fixed so deletion eligibility is deterministic.
const FIXED_NOW = new Date("2026-11-04T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const TEST_BUCKET = "synthetic-cleanup-bucket";
const OTHER_BUCKET = "synthetic-other-bucket";

// Model only the columns used by the cleanup handler.
type QueueRow = {
  id: string;
  r2Bucket: string;
  r2Key: string;
  queuedAt: string;
  deletedAt: string | null;
  lastError: string | null;
};

type QueueOptions = {
  ageHours?: number;
  bucket?: string;
  key?: string;
  deletedAt?: string | null;
  lastError?: string | null;
};

// Create synthetic queued deletions with configurable ages.
function queuedRow(
  id: string,
  options: QueueOptions = {},
): QueueRow {
  const ageHours = options.ageHours ?? 25;

  return {
    id,
    r2Bucket: options.bucket ?? TEST_BUCKET,
    r2Key: options.key ?? `gallery/${id}.webp`,
    queuedAt: new Date(
      FIXED_NOW.getTime() - ageHours * HOUR_MS,
    ).toISOString(),
    deletedAt: options.deletedAt ?? null,
    lastError: options.lastError ?? null,
  };
}

type DatabaseState = {
  rows: QueueRow[];
  failDueSelect: boolean;
  failStrayCount: boolean;
  failMarkIds: Set<string>;
  failNoteIds: Set<string>;
  operations: string[];
};

type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

// Create an in-memory representation of pending_r2_deletion.
// The mock interprets only the specific SQL operations the
// scheduled Worker currently performs.
function createMockDatabase() {
  const statements: PreparedRecord[] = [];

  const state: DatabaseState = {
    rows: [],
    failDueSelect: false,
    failStrayCount: false,
    failMarkIds: new Set(),
    failNoteIds: new Set(),
    operations: [],
  };

  // Only records older than the 24-hour cutoff are eligible.
  // Exactly 24 hours old is not eligible because the SQL uses <.
  function isDue(row: QueueRow) {
    const cutoff = Date.now() - 24 * HOUR_MS;

    return (
      row.deletedAt === null &&
      new Date(row.queuedAt).getTime() < cutoff
    );
  }

  const prepare = vi.fn((sql: string) => {
    const statement: PreparedRecord = {
      sql,
      params: [],
      bind: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };

    // Cloudflare D1 statement binding returns the statement.
    statement.bind.mockImplementation((...params: unknown[]) => {
      statement.params = params;
      return statement;
    });

    statement.all.mockImplementation(async () => {
      const bucket = String(statement.params[0]);

      if (
        sql.includes("SELECT id, r2_bucket, r2_key") &&
        sql.includes("FROM pending_r2_deletion")
      ) {
        if (state.failDueSelect) {
          throw new Error(
            "Synthetic pending-deletion query failure.",
          );
        }

        // Simulate filtering, ordering, and LIMIT 20.
        const eligible = state.rows
          .filter(
            (row) =>
              isDue(row) &&
              row.r2Bucket === bucket,
          )
          .sort((left, right) =>
            left.queuedAt.localeCompare(right.queuedAt),
          )
          .slice(0, 20);

        return {
          results: eligible.map((row) => ({
            id: row.id,
            r2_bucket: row.r2Bucket,
            r2_key: row.r2Key,
          })),
        };
      }

      if (sql.includes("SELECT count(*) AS n")) {
        if (state.failStrayCount) {
          throw new Error(
            "Synthetic cross-bucket count failure.",
          );
        }

        const count = state.rows.filter(
          (row) =>
            isDue(row) &&
            row.r2Bucket !== bucket,
        ).length;

        return {
          results: [{ n: count }],
        };
      }

      throw new Error(
        `Unexpected scheduled D1 SELECT: ${sql}`,
      );
    });

    statement.run.mockImplementation(async () => {
      if (
        sql.includes("UPDATE pending_r2_deletion") &&
        sql.includes("SET deleted_at =")
      ) {
        const id = String(statement.params[0]);

        if (state.failMarkIds.has(id)) {
          throw new Error(
            `Synthetic completion failure for ${id}.`,
          );
        }

        state.operations.push(`mark:${id}`);

        const row = state.rows.find(
          (candidate) => candidate.id === id,
        );

        if (row) {
          row.deletedAt = new Date().toISOString();
          row.lastError = null;
        }

        return {
          meta: { changes: row ? 1 : 0 },
        };
      }

      if (
        sql.includes("UPDATE pending_r2_deletion") &&
        sql.includes("SET last_error = ?2")
      ) {
        const id = String(statement.params[0]);
        const message = String(statement.params[1]);

        if (state.failNoteIds.has(id)) {
          throw new Error(
            `Synthetic error-recording failure for ${id}.`,
          );
        }

        state.operations.push(`note:${id}`);

        const row = state.rows.find(
          (candidate) => candidate.id === id,
        );

        if (row) {
          row.lastError = message;
        }

        return {
          meta: { changes: row ? 1 : 0 },
        };
      }

      throw new Error(
        `Unexpected scheduled D1 write: ${sql}`,
      );
    });

    statements.push(statement);
    return statement;
  });

  return {
    state,
    statements,
    prepare,
  };
}

type MockDatabase = ReturnType<typeof createMockDatabase>;

// Track R2 deletions and allow individual keys to fail.
// Successful R2 deletion is treated as idempotent.
function createMockMedia(db: MockDatabase) {
  const deletedKeys: string[] = [];
  const failures = new Map<string, Error>();

  const deleteObject = vi.fn(async (key: string) => {
    const failure = failures.get(key);

    if (failure) {
      throw failure;
    }

    deletedKeys.push(key);
    db.state.operations.push(`r2:${key}`);
  });

  return {
    deletedKeys,
    failures,
    delete: deleteObject,
  };
}

type MockMedia = ReturnType<typeof createMockMedia>;

// Construct a Worker environment containing no real bindings.
function createEnvironment(
  db: MockDatabase,
  media: MockMedia,
): Env {
  return {
    DB: {
      prepare: db.prepare,
    } as unknown as D1Database,

    MEDIA: {
      delete: media.delete,
    } as unknown as R2Bucket,

    MEDIA_BUCKET_NAME: TEST_BUCKET,
    R2_STORAGE_CAP_BYTES: "1000000",
    R2_CLASS_A_DAILY_BUDGET: "100",
    PROXY_TOKEN: "synthetic-scheduled-test-token",
  };
}

// Identify the SQL used to select due objects.
function dueSelection(db: MockDatabase) {
  return db.statements.find(
    (record) =>
      record.sql.includes(
        "SELECT id, r2_bucket, r2_key",
      ),
  );
}

// Identify SQL used to mark an R2 deletion completed.
function completedUpdates(db: MockDatabase) {
  return db.statements.filter(
    (record) =>
      record.sql.includes(
        "UPDATE pending_r2_deletion",
      ) &&
      record.sql.includes("SET deleted_at ="),
  );
}

// Identify SQL used to record a recoverable cleanup error.
function errorUpdates(db: MockDatabase) {
  return db.statements.filter(
    (record) =>
      record.sql.includes(
        "UPDATE pending_r2_deletion",
      ) &&
      record.sql.includes("SET last_error = ?2"),
  );
}

describe("Cloudflare Worker scheduled R2 cleanup", () => {
  let db: MockDatabase;
  let media: MockMedia;
  let env: Env;

  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Use one fixed UTC time for both eligibility and update timestamps.
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    db = createMockDatabase();
    media = createMockMedia(db);
    env = createEnvironment(db, media);

    // Capture operational logging rather than printing it
    // during every successful or failed synthetic cleanup.
    logSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Invoke the real scheduled handler with synthetic runtime arguments.
  async function runSweep() {
    await worker.scheduled(
      {} as ScheduledController,
      env,
      {} as ExecutionContext,
    );
  }

  // Check the final summary written by the scheduled handler.
  function expectSummary(
    reaped: number,
    scanned: number,
    otherBucket: number,
  ) {
    expect(logSpy).toHaveBeenCalledWith(
      "sweep ok:",
      JSON.stringify({
        reaped,
        scanned,
        otherBucket,
      }),
    );
  }

  describe("Queue selection and grace period", () => {
    it("handles an empty deletion queue", async () => {
      await runSweep();

      expect(media.delete).not.toHaveBeenCalled();

      expect(completedUpdates(db)).toHaveLength(0);
      expect(errorUpdates(db)).toHaveLength(0);

      expectSummary(0, 0, 0);
    });

    it("uses bucket filtering, the 24-hour cutoff, and LIMIT 20 in SQL", async () => {
      await runSweep();

      const selection = dueSelection(db);

      expect(selection).toBeTruthy();

      expect(selection?.sql).toContain(
        "FROM pending_r2_deletion",
      );

      expect(selection?.sql).toContain(
        "deleted_at IS NULL",
      );

      expect(selection?.sql).toContain(
        "r2_bucket = ?1",
      );

      expect(selection?.sql).toContain(
        "'-24 hours'",
      );

      expect(selection?.sql).toContain(
        "ORDER BY queued_at",
      );

      expect(selection?.sql).toContain(
        "LIMIT 20",
      );

      expect(selection?.params).toEqual([
        TEST_BUCKET,
      ]);
    });

    it("reaps an object older than 24 hours", async () => {
      const row = queuedRow("expired", {
        ageHours: 25,
      });

      db.state.rows.push(row);

      await runSweep();

      expect(media.deletedKeys).toEqual([
        row.r2Key,
      ]);

      expect(row.deletedAt).toBe(
        FIXED_NOW.toISOString(),
      );

      expect(row.lastError).toBeNull();

      expectSummary(1, 1, 0);
    });

    it("does not reap an object exactly 24 hours old", async () => {
      const row = queuedRow("boundary", {
        ageHours: 24,
      });

      db.state.rows.push(row);

      await runSweep();

      expect(media.delete).not.toHaveBeenCalled();
      expect(row.deletedAt).toBeNull();

      expectSummary(0, 0, 0);
    });

    it("preserves objects still inside the grace period", async () => {
      db.state.rows.push(
        queuedRow("recent", {
          ageHours: 23,
        }),
        queuedRow("very-recent", {
          ageHours: 1,
        }),
      );

      await runSweep();

      expect(media.delete).not.toHaveBeenCalled();
      expect(completedUpdates(db)).toHaveLength(0);

      expectSummary(0, 0, 0);
    });

    it("ignores objects already marked as deleted", async () => {
      const row = queuedRow("completed", {
        ageHours: 48,
        deletedAt: new Date(
          FIXED_NOW.getTime() - HOUR_MS,
        ).toISOString(),
      });

      db.state.rows.push(row);

      await runSweep();

      expect(media.delete).not.toHaveBeenCalled();
      expect(completedUpdates(db)).toHaveLength(0);

      expectSummary(0, 0, 0);
    });

    it("processes eligible objects from oldest to newest", async () => {
      const newest = queuedRow("newest", {
        ageHours: 25,
      });

      const oldest = queuedRow("oldest", {
        ageHours: 72,
      });

      const middle = queuedRow("middle", {
        ageHours: 48,
      });

      // Deliberately insert the queue in the wrong order.
      db.state.rows.push(newest, oldest, middle);

      await runSweep();

      expect(media.deletedKeys).toEqual([
        oldest.r2Key,
        middle.r2Key,
        newest.r2Key,
      ]);

      expectSummary(3, 3, 0);
    });

    it("reaps no more than 20 objects in one run", async () => {
      for (let index = 0; index < 25; index++) {
        db.state.rows.push(
          queuedRow(`object-${index}`, {
            ageHours: 30,
          }),
        );
      }

      await runSweep();

      expect(media.delete).toHaveBeenCalledTimes(20);
      expect(completedUpdates(db)).toHaveLength(20);

      expect(
        db.state.rows.filter(
          (row) => row.deletedAt === null,
        ),
      ).toHaveLength(5);

      expectSummary(20, 20, 0);

      // A second scheduled invocation drains the remaining queue.
      await runSweep();

      expect(media.delete).toHaveBeenCalledTimes(25);

      expect(
        db.state.rows.every(
          (row) => row.deletedAt !== null,
        ),
      ).toBe(true);

      expectSummary(5, 5, 0);
    });

    it("deletes R2 bytes before marking D1 deletion complete", async () => {
      const row = queuedRow("ordered");

      db.state.rows.push(row);

      await runSweep();

      expect(db.state.operations).toEqual([
        `r2:${row.r2Key}`,
        `mark:${row.id}`,
      ]);

      expectSummary(1, 1, 0);
    });
  });

  describe("R2 bucket isolation", () => {
    it("never deletes objects queued for another bucket", async () => {
      const own = queuedRow("own");
      const foreign = queuedRow("foreign", {
        bucket: OTHER_BUCKET,
      });

      db.state.rows.push(foreign, own);

      await runSweep();

      expect(media.deletedKeys).toEqual([
        own.r2Key,
      ]);

      expect(own.deletedAt).not.toBeNull();
      expect(foreign.deletedAt).toBeNull();

      expectSummary(1, 1, 1);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "1 row(s) are queued against a bucket",
        ),
      );
    });

    it("does not let foreign-bucket rows block local cleanup", async () => {
      // Foreign rows should be excluded by the SQL WHERE clause,
      // rather than consuming the Worker's 20-row selection limit.
      for (let index = 0; index < 30; index++) {
        db.state.rows.push(
          queuedRow(`foreign-${index}`, {
            bucket: OTHER_BUCKET,
            ageHours: 72,
          }),
        );
      }

      const local = queuedRow("local", {
        ageHours: 25,
      });

      db.state.rows.push(local);

      await runSweep();

      expect(media.deletedKeys).toEqual([
        local.r2Key,
      ]);

      expectSummary(1, 1, 30);
    });

    it("keeps buckets isolated even when object keys match", async () => {
      const sharedKey = "gallery/shared-key.webp";

      const own = queuedRow("own-shared", {
        key: sharedKey,
      });

      const foreign = queuedRow("foreign-shared", {
        bucket: OTHER_BUCKET,
        key: sharedKey,
      });

      db.state.rows.push(foreign, own);

      await runSweep();

      expect(media.delete).toHaveBeenCalledTimes(1);
      expect(media.delete).toHaveBeenCalledWith(
        sharedKey,
      );

      expect(own.deletedAt).not.toBeNull();
      expect(foreign.deletedAt).toBeNull();

      expectSummary(1, 1, 1);
    });

    it("does not warn when all due records belong to the correct bucket", async () => {
      db.state.rows.push(
        queuedRow("local-one"),
        queuedRow("local-two"),
      );

      await runSweep();

      expect(warnSpy).not.toHaveBeenCalled();
      expectSummary(2, 2, 0);
    });
  });

  describe("Error handling and retries", () => {
    it("records an R2 deletion failure without completing the row", async () => {
      const row = queuedRow("r2-failure");

      db.state.rows.push(row);

      media.failures.set(
        row.r2Key,
        new Error("Synthetic R2 deletion failure."),
      );

      await runSweep();

      expect(media.delete).toHaveBeenCalledWith(
        row.r2Key,
      );

      expect(row.deletedAt).toBeNull();

      expect(row.lastError).toContain(
        "Synthetic R2 deletion failure.",
      );

      expect(errorUpdates(db)).toHaveLength(1);
      expect(completedUpdates(db)).toHaveLength(0);

      expectSummary(0, 1, 0);
    });

    it("continues processing later objects after an R2 failure", async () => {
      const failed = queuedRow("failed", {
        ageHours: 48,
      });

      const successful = queuedRow("successful", {
        ageHours: 25,
      });

      db.state.rows.push(failed, successful);

      media.failures.set(
        failed.r2Key,
        new Error("Synthetic R2 failure."),
      );

      await runSweep();

      expect(media.delete).toHaveBeenCalledTimes(2);

      expect(failed.deletedAt).toBeNull();
      expect(failed.lastError).toContain(
        "Synthetic R2 failure.",
      );

      expect(successful.deletedAt).not.toBeNull();

      expectSummary(1, 2, 0);
    });

    it("records D1 completion failures after R2 deletion", async () => {
      const row = queuedRow("d1-failure");

      db.state.rows.push(row);
      db.state.failMarkIds.add(row.id);

      await runSweep();

      // R2 completed first, but the D1 completion failed.
      expect(media.deletedKeys).toEqual([
        row.r2Key,
      ]);

      expect(row.deletedAt).toBeNull();

      expect(row.lastError).toContain(
        "Synthetic completion failure",
      );

      expect(db.state.operations).toEqual([
        `r2:${row.r2Key}`,
        `note:${row.id}`,
      ]);

      expectSummary(0, 1, 0);
    });

    it("retries cleanup after a previous D1 completion failure", async () => {
      const row = queuedRow("retry");

      db.state.rows.push(row);
      db.state.failMarkIds.add(row.id);

      await runSweep();

      expect(row.deletedAt).toBeNull();
      expect(row.lastError).not.toBeNull();

      // Simulate D1 recovering before the next cron invocation.
      db.state.failMarkIds.delete(row.id);

      await runSweep();

      // Repeating R2 deletion is safe because deletion is idempotent.
      expect(media.delete).toHaveBeenCalledTimes(2);

      expect(row.deletedAt).toBe(
        FIXED_NOW.toISOString(),
      );

      expect(row.lastError).toBeNull();

      expectSummary(1, 1, 0);
    });

    it("continues when recording a cleanup error also fails", async () => {
      const failed = queuedRow("note-failure", {
        ageHours: 48,
      });

      const successful = queuedRow("later-success", {
        ageHours: 25,
      });

      db.state.rows.push(failed, successful);

      media.failures.set(
        failed.r2Key,
        new Error("Synthetic R2 failure."),
      );

      db.state.failNoteIds.add(failed.id);

      await runSweep();

      expect(errorSpy).toHaveBeenCalledWith(
        "sweep: could not record error for",
        failed.id,
        expect.any(Error),
        expect.any(Error),
      );

      expect(failed.deletedAt).toBeNull();
      expect(successful.deletedAt).not.toBeNull();

      expectSummary(1, 2, 0);
    });

    it("truncates recorded cleanup errors to 500 characters", async () => {
      const row = queuedRow("long-error");

      db.state.rows.push(row);

      media.failures.set(
        row.r2Key,
        new Error("X".repeat(600)),
      );

      await runSweep();

      expect(row.deletedAt).toBeNull();
      expect(row.lastError).not.toBeNull();

      expect(row.lastError?.length).toBe(500);

      const note = errorUpdates(db)[0];

      expect(note.params[0]).toBe(row.id);
      expect(String(note.params[1]).length).toBe(500);
    });

    it("clears a previous error after successful cleanup", async () => {
      const row = queuedRow("recovered", {
        lastError: "Previous synthetic failure.",
      });

      db.state.rows.push(row);

      await runSweep();

      expect(row.deletedAt).not.toBeNull();
      expect(row.lastError).toBeNull();

      expect(errorUpdates(db)).toHaveLength(0);
      expectSummary(1, 1, 0);
    });

    it("does not delete R2 objects when the initial D1 query fails", async () => {
      db.state.rows.push(
        queuedRow("not-selected"),
      );

      db.state.failDueSelect = true;

      await expect(runSweep()).rejects.toThrow(
        "Synthetic pending-deletion query failure.",
      );

      expect(media.delete).not.toHaveBeenCalled();
      expect(completedUpdates(db)).toHaveLength(0);

      expect(logSpy).not.toHaveBeenCalled();
    });

    it("reports an error when the cross-bucket count cannot be read", async () => {
      db.state.failStrayCount = true;

      await expect(runSweep()).rejects.toThrow(
        "Synthetic cross-bucket count failure.",
      );

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
