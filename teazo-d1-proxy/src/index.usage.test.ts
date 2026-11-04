/**
 * Vitest coverage for the Teazo Cloudflare Worker's /usage endpoint.
 *
 * Tests bearer authentication, storage calculations, configured billing
 * limits, usage verification, R2 pagination, and error responses.
 *
 * All D1 queries and R2 operations use synthetic, in-memory mocks.
 * No local or production Cloudflare resources are accessed.
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

// Never use actual Cloudflare credentials or bucket names in tests.
const TEST_TOKEN = "synthetic-usage-test-token";
const BASE_URL = "https://worker.example.invalid";

const D1_LIMIT_BYTES = 500_000_000;
const ACCOUNT_STORAGE_CAP = 9_600_000_000;
const ACCOUNT_CLASS_A_DAILY_CAP = 30_000;

type DatabaseState = {
  bytes: number;
  objects: number;
  classA: number;
  d1Bytes: number;
  usageError: Error | null;
  spendError: Error | null;
  spendResults: boolean[];
};

type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

// Provide predictable results for the usage and Class A budget queries.
function createMockDatabase() {
  const records: PreparedRecord[] = [];

  const state: DatabaseState = {
    bytes: 250,
    objects: 2,
    classA: 3,
    d1Bytes: 125_000_000,
    usageError: null,
    spendError: null,
    spendResults: [],
  };

  const prepare = vi.fn((sql: string) => {
    const statement: PreparedRecord = {
      sql,
      params: [],
      bind: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };

    // Record parameter values without executing real SQL.
    statement.bind.mockImplementation((...params: unknown[]) => {
      statement.params = params;
      return statement;
    });

    // The Worker reads usage from a single D1 query.
    statement.all.mockImplementation(async () => {
      if (
        sql.includes(
          "SELECT (SELECT coalesce(sum(byte_size)",
        )
      ) {
        if (state.usageError) {
          throw state.usageError;
        }

        return {
          results: [
            {
              bytes: state.bytes,
              objects: state.objects,
              class_a: state.classA,
            },
          ],
          meta: {
            size_after: state.d1Bytes,
          },
        };
      }

      throw new Error(
        `Unexpected synthetic D1 SELECT: ${sql}`,
      );
    });

    // Bucket verification spends one Class A operation per page.
    statement.run.mockImplementation(async () => {
      if (sql.includes("INSERT INTO r2_class_a_day")) {
        if (state.spendError) {
          throw state.spendError;
        }

        const allowed =
          state.spendResults.shift() ?? true;

        return {
          meta: {
            changes: allowed ? 1 : 0,
          },
        };
      }

      throw new Error(
        `Unexpected synthetic D1 write: ${sql}`,
      );
    });

    records.push(statement);
    return statement;
  });

  return {
    state,
    records,
    prepare,
  };
}

type MockDatabase = ReturnType<typeof createMockDatabase>;

// Produce an R2 listing page with synthetic object sizes.
// Cursor values are controlled by each test.
function listingPage(
  sizes: number[],
  cursor?: string,
) {
  return {
    objects: sizes.map((size, index) => ({
      key: `synthetic-object-${index}`,
      size,
    })),
    truncated: cursor !== undefined,
    cursor,
  };
}

// R2 writes must never occur when checking storage usage.
function createMockMedia() {
  return {
    list: vi.fn().mockResolvedValue(listingPage([])),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

type MockMedia = ReturnType<typeof createMockMedia>;

// Build a complete Worker environment with fake D1 and R2 bindings.
function createEnvironment(
  db: MockDatabase,
  media: MockMedia,
): Env {
  return {
    DB: {
      prepare: db.prepare,
    } as unknown as D1Database,

    MEDIA: media as unknown as R2Bucket,
    MEDIA_BUCKET_NAME: "synthetic-usage-bucket",
    R2_STORAGE_CAP_BYTES: "1000",
    R2_CLASS_A_DAILY_BUDGET: "10",
    PROXY_TOKEN: TEST_TOKEN,
  };
}

// Retain SHA-256 hashing while providing Cloudflare's comparison
// method in the Node-based Vitest runtime.
function installCloudflareCryptoCompatibility() {
  const nativeCrypto = crypto;

  vi.stubGlobal("crypto", {
    subtle: {
      digest: nativeCrypto.subtle.digest.bind(
        nativeCrypto.subtle,
      ),

      timingSafeEqual(
        first: ArrayBuffer,
        second: ArrayBuffer,
      ) {
        const left = new Uint8Array(first);
        const right = new Uint8Array(second);

        if (left.length !== right.length) {
          return false;
        }

        let difference = 0;

        for (let index = 0; index < left.length; index++) {
          difference |= left[index] ^ right[index];
        }

        return difference === 0;
      },
    },
  });
}

type UsageRequestOptions = {
  method?: string;
  authorization?: "valid" | "missing" | "wrong" | "raw";
  verify?: string;
};

// Create a real Request, but pass it directly to the Worker.
// No HTTP call is made to the synthetic hostname.
function createUsageRequest(
  options: UsageRequestOptions = {},
) {
  const headers = new Headers();

  const authorization = options.authorization ?? "valid";

  if (authorization !== "missing") {
    headers.set(
      "authorization",
      authorization === "raw"
        ? TEST_TOKEN
        : `Bearer ${
            authorization === "wrong"
              ? "incorrect-synthetic-token"
              : TEST_TOKEN
          }`,
    );
  }

  const query =
    options.verify === undefined
      ? ""
      : `?verify=${encodeURIComponent(options.verify)}`;

  return new Request(`${BASE_URL}/usage${query}`, {
    method: options.method ?? "GET",
    headers,
  });
}

// Identify prepared SQL statements by purpose.
function statementsMatching(
  db: MockDatabase,
  fragment: string,
) {
  return db.records.filter((record) =>
    record.sql.includes(fragment),
  );
}

describe("Cloudflare Worker storage usage endpoint", () => {
  let db: MockDatabase;
  let media: MockMedia;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    installCloudflareCryptoCompatibility();

    db = createMockDatabase();
    media = createMockMedia();
    env = createEnvironment(db, media);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Submit an in-process request to the actual Worker handler.
  async function send(
    options: UsageRequestOptions = {},
  ) {
    return worker.fetch(
      createUsageRequest(options),
      env,
    );
  }

  describe("Authentication and request handling", () => {
    it("rejects POST requests to /usage", async () => {
      const response = await send({
        method: "POST",
      });

      expect(response.status).toBe(405);

      expect(await response.json()).toEqual({
        error: "method_not_allowed",
      });

      expect(db.prepare).not.toHaveBeenCalled();
      expect(media.list).not.toHaveBeenCalled();
    });

    it("rejects requests when the proxy token is missing", async () => {
      env.PROXY_TOKEN = "";

      const response = await send();

      expect(response.status).toBe(500);

      expect(await response.json()).toEqual({
        error: "proxy_misconfigured",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects requests without an Authorization header", async () => {
      const response = await send({
        authorization: "missing",
      });

      expect(response.status).toBe(401);

      expect(await response.json()).toEqual({
        error: "unauthorized",
      });

      expect(db.prepare).not.toHaveBeenCalled();
      expect(media.list).not.toHaveBeenCalled();
    });

    it("rejects an invalid bearer token", async () => {
      const response = await send({
        authorization: "wrong",
      });

      expect(response.status).toBe(401);
      expect(db.prepare).not.toHaveBeenCalled();
      expect(media.list).not.toHaveBeenCalled();
    });

    it("requires the Bearer authorization scheme", async () => {
      const response = await send({
        authorization: "raw",
      });

      expect(response.status).toBe(401);
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("returns JSON with no-store caching", async () => {
      const response = await send();

      expect(response.status).toBe(200);

      expect(response.headers.get("content-type")).toBe(
        "application/json",
      );

      expect(response.headers.get("cache-control")).toBe(
        "no-store",
      );
    });
  });

  describe("Storage and billing calculations", () => {
    it("reports D1 and R2 usage with correct percentages", async () => {
      const response = await send();

      expect(response.status).toBe(200);

      expect(await response.json()).toMatchObject({
        measuredAt: expect.any(String),
        d1: {
          bytes: 125_000_000,
          limitBytes: D1_LIMIT_BYTES,
          percentUsed: 25,
        },
        r2: {
          bucket: "synthetic-usage-bucket",
          bytes: 250,
          objects: 2,
          limitBytes: 1000,
          remainingBytes: 750,
          percentUsed: 25,
          classAToday: {
            used: 3,
            budget: 10,
          },
          uploadsBlocked: false,
        },
      });

      expect(db.prepare).toHaveBeenCalledOnce();

      // Usage requires a D1 read, not an R2 bucket listing.
      expect(media.list).not.toHaveBeenCalled();
      expect(media.put).not.toHaveBeenCalled();
      expect(media.delete).not.toHaveBeenCalled();
    });

    it("uses the configured bucket and UTC day in its D1 query", async () => {
      const response = await send();

      expect(response.status).toBe(200);

      const queries = statementsMatching(
        db,
        "SELECT (SELECT coalesce(sum(byte_size)",
      );

      expect(queries).toHaveLength(1);

      expect(queries[0].params).toEqual([
        "synthetic-usage-bucket",
        new Date().toISOString().slice(0, 10),
      ]);
    });

    it("reports zero storage usage without blocking uploads", async () => {
      db.state.bytes = 0;
      db.state.objects = 0;
      db.state.classA = 0;
      db.state.d1Bytes = 0;

      const response = await send();

      expect(await response.json()).toMatchObject({
        d1: {
          bytes: 0,
          percentUsed: 0,
        },
        r2: {
          bytes: 0,
          objects: 0,
          remainingBytes: 1000,
          percentUsed: 0,
          uploadsBlocked: false,
        },
      });
    });

    it("blocks uploads when the configured storage cap is full", async () => {
      db.state.bytes = 1000;

      const response = await send();

      expect(await response.json()).toMatchObject({
        r2: {
          bytes: 1000,
          remainingBytes: 0,
          percentUsed: 100,
          uploadsBlocked: true,
        },
      });
    });

    it("blocks uploads when the Class A budget is exhausted", async () => {
      db.state.classA = 10;

      const response = await send();

      expect(await response.json()).toMatchObject({
        r2: {
          classAToday: {
            used: 10,
            budget: 10,
          },
          uploadsBlocked: true,
        },
      });
    });

    it("clamps configured limits to the account-wide safety ceilings", async () => {
      env.R2_STORAGE_CAP_BYTES = "20000000000";
      env.R2_CLASS_A_DAILY_BUDGET = "40000";

      const response = await send();

      expect(await response.json()).toMatchObject({
        r2: {
          limitBytes: ACCOUNT_STORAGE_CAP,
          remainingBytes: ACCOUNT_STORAGE_CAP - 250,
          classAToday: {
            used: 3,
            budget: ACCOUNT_CLASS_A_DAILY_CAP,
          },
        },
      });
    });

    it("rounds the configured daily Class A budget down", async () => {
      env.R2_CLASS_A_DAILY_BUDGET = "10.9";

      const response = await send();

      expect(await response.json()).toMatchObject({
        r2: {
          classAToday: {
            used: 3,
            budget: 10,
          },
        },
      });
    });

    it("rejects invalid billing configuration", async () => {
      env.R2_CLASS_A_DAILY_BUDGET = "0";

      const response = await send();

      expect(response.status).toBe(503);

      const body = (await response.json()) as {
        error: string;
        message: string;
      };

      expect(body.error).toBe("usage_unavailable");

      expect(body.message).toContain(
        "R2_STORAGE_CAP_BYTES and R2_CLASS_A_DAILY_BUDGET",
      );

      expect(db.prepare).not.toHaveBeenCalled();
      expect(media.list).not.toHaveBeenCalled();
    });

    it("reports D1 read failures without inventing usage data", async () => {
      db.state.usageError = new Error(
        "Synthetic usage database failure.",
      );

      const response = await send();

      expect(response.status).toBe(503);

      expect(await response.json()).toEqual({
        error: "usage_unavailable",
        message: "Synthetic usage database failure.",
      });

      expect(media.list).not.toHaveBeenCalled();
    });
  });

  describe("R2 bucket verification", () => {
    it("does not list the bucket without verify=1", async () => {
      const response = await send();

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        verify?: unknown;
      };

      expect(body.verify).toBeUndefined();

      expect(media.list).not.toHaveBeenCalled();

      expect(
        statementsMatching(
          db,
          "INSERT INTO r2_class_a_day",
        ),
      ).toHaveLength(0);
    });

    it("requires the exact verify=1 parameter", async () => {
      const response = await send({
        verify: "true",
      });

      expect(response.status).toBe(200);
      expect(media.list).not.toHaveBeenCalled();
    });

    it("verifies a single page and reports positive ledger drift", async () => {
      media.list.mockResolvedValueOnce(
        listingPage([150, 200]),
      );

      const response = await send({
        verify: "1",
      });

      expect(response.status).toBe(200);

      expect(await response.json()).toMatchObject({
        r2: {
          bytes: 250,
          objects: 2,
        },
        verify: {
          bytes: 350,
          objects: 2,
          pages: 1,
          complete: true,
          driftBytes: 100,
          driftObjects: 0,
        },
      });

      expect(media.list).toHaveBeenCalledOnce();

      expect(media.list).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 1000,
      });

      const budget = statementsMatching(
        db,
        "INSERT INTO r2_class_a_day",
      );

      expect(budget).toHaveLength(1);
      expect(budget[0].run).toHaveBeenCalledOnce();

      expect(budget[0].params).toEqual([
        "synthetic-usage-bucket",
        new Date().toISOString().slice(0, 10),
        1,
        10,
      ]);
    });

    it("reports negative drift when the bucket holds fewer objects", async () => {
      db.state.bytes = 500;
      db.state.objects = 4;

      media.list.mockResolvedValueOnce(
        listingPage([100, 150]),
      );

      const response = await send({
        verify: "1",
      });

      expect(await response.json()).toMatchObject({
        verify: {
          bytes: 250,
          objects: 2,
          complete: true,
          driftBytes: -250,
          driftObjects: -2,
        },
      });
    });

    it("follows R2 pagination cursors and accumulates totals", async () => {
      db.state.bytes = 100;
      db.state.objects = 3;

      media.list
        .mockResolvedValueOnce(
          listingPage([10, 20], "next-page"),
        )
        .mockResolvedValueOnce(
          listingPage([30]),
        );

      const response = await send({
        verify: "1",
      });

      expect(await response.json()).toMatchObject({
        verify: {
          bytes: 60,
          objects: 3,
          pages: 2,
          complete: true,
          driftBytes: -40,
          driftObjects: 0,
        },
      });

      expect(media.list).toHaveBeenCalledTimes(2);

      expect(media.list).toHaveBeenNthCalledWith(1, {
        cursor: undefined,
        limit: 1000,
      });

      expect(media.list).toHaveBeenNthCalledWith(2, {
        cursor: "next-page",
        limit: 1000,
      });

      expect(
        statementsMatching(
          db,
          "INSERT INTO r2_class_a_day",
        ),
      ).toHaveLength(2);
    });

    it("stops verification before listing when the Class A budget is exhausted", async () => {
      db.state.spendResults = [false];

      const response = await send({
        verify: "1",
      });

      expect(response.status).toBe(200);

      expect(await response.json()).toMatchObject({
        verify: {
          bytes: 0,
          objects: 0,
          pages: 0,
          complete: false,
          driftBytes: null,
          driftObjects: null,
        },
      });

      expect(media.list).not.toHaveBeenCalled();
    });

    it("reports incomplete verification if the budget runs out between pages", async () => {
      db.state.spendResults = [true, false];

      media.list.mockResolvedValueOnce(
        listingPage([25], "second-page"),
      );

      const response = await send({
        verify: "1",
      });

      expect(await response.json()).toMatchObject({
        verify: {
          bytes: 25,
          objects: 1,
          pages: 1,
          complete: false,
          driftBytes: null,
          driftObjects: null,
        },
      });

      expect(media.list).toHaveBeenCalledOnce();

      expect(
        statementsMatching(
          db,
          "INSERT INTO r2_class_a_day",
        ),
      ).toHaveLength(2);
    });

    it("stops after 20 pages and does not report unverified drift", async () => {
      // Every synthetic page has another cursor.
      // The Worker must enforce its 20-page limit.
      let nextCursor = 0;

      media.list.mockImplementation(async () => {
        nextCursor += 1;

        return listingPage(
          [5],
          `page-${nextCursor}`,
        );
      });

      const response = await send({
        verify: "1",
      });

      expect(await response.json()).toMatchObject({
        verify: {
          bytes: 100,
          objects: 20,
          pages: 20,
          complete: false,
          driftBytes: null,
          driftObjects: null,
        },
      });

      expect(media.list).toHaveBeenCalledTimes(20);

      expect(
        statementsMatching(
          db,
          "INSERT INTO r2_class_a_day",
        ),
      ).toHaveLength(20);
    });

    it("returns an error if the Class A reservation fails", async () => {
      db.state.spendError = new Error(
        "Synthetic budget ledger failure.",
      );

      const response = await send({
        verify: "1",
      });

      expect(response.status).toBe(503);

      expect(await response.json()).toEqual({
        error: "usage_unavailable",
        message: "Synthetic budget ledger failure.",
      });

      expect(media.list).not.toHaveBeenCalled();
    });

    it("reports R2 listing errors without claiming verification completed", async () => {
      media.list.mockRejectedValueOnce(
        new Error("Synthetic bucket listing failure."),
      );

      const response = await send({
        verify: "1",
      });

      expect(response.status).toBe(503);

      expect(await response.json()).toEqual({
        error: "usage_unavailable",
        message: "Synthetic bucket listing failure.",
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(media.delete).not.toHaveBeenCalled();
    });
  });
});
