/**
 * Vitest coverage for the Teazo Cloudflare Worker's D1 endpoints.
 *
 * Covers bearer authentication, /query, /batch, request validation,
 * statement preparation, D1 error propagation, and request limits.
 *
 * The D1 database is fully mocked. These tests verify how the Worker
 * invokes D1, not the transaction implementation inside Cloudflare D1.
 *
 * No real database connections or mutations occur.
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

// Synthetic credentials are intentionally unrelated to real secrets.
const TEST_TOKEN = "synthetic-worker-test-token";
const BASE_URL = "https://worker.example.invalid";

// Record each prepared statement so that tests can inspect SQL binding.
type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
};

// Construct an in-memory mock of the Cloudflare D1 binding.
function createMockDatabase() {
  const statements: PreparedRecord[] = [];

  const prepare = vi.fn((sql: string) => {
    const statement: PreparedRecord = {
      sql,
      params: [],
      bind: vi.fn(),
      all: vi.fn().mockResolvedValue({
        success: true,
        results: [{ id: "synthetic-row" }],
        meta: {},
      }),
    };

    // D1.bind() returns the prepared statement for subsequent execution.
    statement.bind.mockImplementation((...params: unknown[]) => {
      statement.params = params;
      return statement;
    });

    statements.push(statement);
    return statement;
  });

  // Cloudflare handles actual transaction atomicity internally.
  // This mock verifies that the Worker sends one batch request.
  const batch = vi.fn().mockResolvedValue([
    {
      success: true,
      results: [{ id: "synthetic-batch-row" }],
    },
  ]);

  return {
    statements,
    prepare,
    batch,
  };
}

type MockDatabase = ReturnType<typeof createMockDatabase>;

// Build a Worker environment containing only synthetic bindings.
function createEnvironment(db: MockDatabase): Env {
  return {
    DB: {
      prepare: db.prepare,
      batch: db.batch,
    } as unknown as D1Database,

    MEDIA: {} as R2Bucket,
    MEDIA_BUCKET_NAME: "synthetic-test-bucket",
    R2_STORAGE_CAP_BYTES: "1000000",
    R2_CLASS_A_DAILY_BUDGET: "100",
    PROXY_TOKEN: TEST_TOKEN,
  };
}

// Node's Web Crypto implementation may not expose Cloudflare's
// timingSafeEqual() extension. Preserve real SHA-256 digest behavior
// while supplying a fixed-length byte comparison in the test runtime.
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

type RequestOptions = {
  bearer?: string | null;
  declaredLength?: number | null;
  method?: string;
};

// Construct real Request objects while keeping all requests in process.
// Content-Length is supplied explicitly because the Worker requires it.
function createRequest(
  path: string,
  body: unknown,
  options: RequestOptions = {},
) {
  const text =
    typeof body === "string"
      ? body
      : JSON.stringify(body);

  const headers = new Headers({
    "content-type": "application/json",
  });

  const bearer =
    options.bearer === undefined
      ? TEST_TOKEN
      : options.bearer;

  if (bearer !== null) {
    headers.set("authorization", `Bearer ${bearer}`);
  }

  const declaredLength =
    options.declaredLength === undefined
      ? new TextEncoder().encode(text).byteLength
      : options.declaredLength;

  if (declaredLength !== null) {
    headers.set("content-length", String(declaredLength));
  }

  const method = options.method ?? "POST";

  return new Request(`${BASE_URL}${path}`, {
    method,
    headers,
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : text,
  });
}

describe("Cloudflare Worker D1 query and batch endpoints", () => {
  let db: MockDatabase;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    installCloudflareCryptoCompatibility();

    db = createMockDatabase();
    env = createEnvironment(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Submit the synthetic request directly to the real Worker handler.
  async function send(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ) {
    return worker.fetch(
      createRequest(path, body, options),
      env,
    );
  }

  describe("Authentication and routing", () => {
    it("rejects unsupported HTTP methods", async () => {
      const response = await send(
        "/query",
        { sql: "SELECT 1" },
        { method: "GET" },
      );

      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({
        error: "method_not_allowed",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects requests when the proxy token is not configured", async () => {
      env.PROXY_TOKEN = "";

      const response = await send("/query", {
        sql: "SELECT 1",
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "proxy_misconfigured",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects requests without an Authorization header", async () => {
      const response = await send(
        "/query",
        { sql: "SELECT 1" },
        { bearer: null },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "unauthorized",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects an incorrect bearer token", async () => {
      const response = await send(
        "/query",
        { sql: "SELECT 1" },
        { bearer: "incorrect-synthetic-token" },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "unauthorized",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects a token supplied without the Bearer scheme", async () => {
      const request = createRequest("/query", {
        sql: "SELECT 1",
      });

      request.headers.set(
        "authorization",
        TEST_TOKEN,
      );

      const response = await worker.fetch(request, env);

      expect(response.status).toBe(401);
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown authenticated POST endpoint", async () => {
      const response = await send("/unknown", {
        sql: "SELECT 1",
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "not_found",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });
  });

  describe("Request body validation", () => {
    it("requires a declared Content-Length", async () => {
      const response = await send(
        "/query",
        { sql: "SELECT 1" },
        { declaredLength: null },
      );

      expect(response.status).toBe(411);
      expect(await response.json()).toEqual({
        error: "length_required",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects a zero Content-Length", async () => {
      const response = await send(
        "/query",
        { sql: "SELECT 1" },
        { declaredLength: 0 },
      );

      expect(response.status).toBe(411);
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects a declared request body larger than 1 MB", async () => {
      const response = await send(
        "/query",
        { sql: "SELECT 1" },
        { declaredLength: 1_000_001 },
      );

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        error: "payload_too_large",
        max: 1_000_000,
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON", async () => {
      const response = await send(
        "/query",
        '{"sql":',
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "bad_json",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });
  });

  describe("Single D1 queries", () => {
    it("prepares and binds SQL parameters", async () => {
      const response = await send("/query", {
        sql: "SELECT * FROM admin_user WHERE id = ?1",
        params: ["synthetic-admin-id"],
      });

      expect(response.status).toBe(200);

      expect(db.prepare).toHaveBeenCalledOnce();
      expect(db.prepare).toHaveBeenCalledWith(
        "SELECT * FROM admin_user WHERE id = ?1",
      );

      expect(db.statements[0].bind).toHaveBeenCalledWith(
        "synthetic-admin-id",
      );

      expect(db.statements[0].params).toEqual([
        "synthetic-admin-id",
      ]);

      expect(db.statements[0].all).toHaveBeenCalledOnce();

      expect(await response.json()).toEqual({
        success: true,
        results: [{ id: "synthetic-row" }],
        meta: {},
      });
    });

    it("executes a query without calling bind when no parameters exist", async () => {
      const response = await send("/query", {
        sql: "SELECT 1",
      });

      expect(response.status).toBe(200);
      expect(db.prepare).toHaveBeenCalledWith("SELECT 1");

      expect(
        db.statements[0].bind,
      ).not.toHaveBeenCalled();

      expect(
        db.statements[0].all,
      ).toHaveBeenCalledOnce();
    });

    it("rejects an empty SQL statement", async () => {
      const response = await send("/query", {
        sql: "   ",
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error: "d1_error",
        message: "sql required",
      });

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("returns D1 errors without reporting a successful query", async () => {
      db.prepare.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic D1 constraint violation.",
        );
      });

      const response = await send("/query", {
        sql: "INSERT INTO synthetic_table VALUES (1)",
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error: "d1_error",
        message: "Synthetic D1 constraint violation.",
      });
    });

    it("prevents responses from being cached", async () => {
      const response = await send("/query", {
        sql: "SELECT 1",
      });

      expect(response.headers.get("cache-control")).toBe(
        "no-store",
      );

      expect(
        response.headers.get("content-type"),
      ).toBe("application/json");
    });
  });

  describe("D1 batch operations", () => {
    it("rejects an empty batch", async () => {
      const response = await send("/batch", {
        statements: [],
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "statements_required",
      });

      expect(db.batch).not.toHaveBeenCalled();
    });

    it("rejects a batch without a statements array", async () => {
      const response = await send("/batch", {
        statements: "not-an-array",
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "statements_required",
      });

      expect(db.batch).not.toHaveBeenCalled();
    });

    it("rejects more than 40 statements", async () => {
      const statements = Array.from(
        { length: 41 },
        () => ({ sql: "SELECT 1" }),
      );

      const response = await send("/batch", {
        statements,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "too_many_statements",
        max: 40,
      });

      expect(db.prepare).not.toHaveBeenCalled();
      expect(db.batch).not.toHaveBeenCalled();
    });

    it("accepts 40 statements in exactly one D1 batch", async () => {
      const statements = Array.from(
        { length: 40 },
        (_, index) => ({
          sql: "SELECT ?1 AS value",
          params: [index],
        }),
      );

      const response = await send("/batch", {
        statements,
      });

      expect(response.status).toBe(200);

      expect(db.prepare).toHaveBeenCalledTimes(40);
      expect(db.batch).toHaveBeenCalledOnce();

      const prepared = db.batch.mock.calls[0][0] as unknown[];

      expect(prepared).toHaveLength(40);

      expect(db.statements[0].params).toEqual([0]);
      expect(db.statements[39].params).toEqual([39]);

      expect(await response.json()).toEqual({
        results: [
          {
            success: true,
            results: [{ id: "synthetic-batch-row" }],
          },
        ],
      });
    });

    it("does not call D1.batch when a statement is invalid", async () => {
      const response = await send("/batch", {
        statements: [
          { sql: "SELECT 1" },
          { sql: "" },
          { sql: "SELECT 3" },
        ],
      });

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error: "d1_error",
        message: "sql required",
      });

      expect(db.batch).not.toHaveBeenCalled();
    });

    it("reports a rejected D1 batch without returning partial success", async () => {
      db.batch.mockRejectedValueOnce(
        new Error("Synthetic transaction failure."),
      );

      const response = await send("/batch", {
        statements: [
          { sql: "INSERT INTO synthetic_a VALUES (1)" },
          { sql: "INSERT INTO synthetic_b VALUES (2)" },
        ],
      });

      expect(db.batch).toHaveBeenCalledOnce();
      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error: "d1_error",
        message: "Synthetic transaction failure.",
      });
    });
  });
});