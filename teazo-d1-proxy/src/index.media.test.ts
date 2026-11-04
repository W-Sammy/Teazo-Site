/**
 * Vitest coverage for the Teazo Cloudflare Worker's R2 media endpoints.
 *
 * Covers public media reads, HEAD responses, key validation,
 * authenticated uploads, billing hard stops, R2 failures,
 * ledger reconciliation, and authenticated deletion.
 *
 * All Cloudflare D1 and R2 bindings are mocked. No real storage,
 * database records, credentials, or network services are used.
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

// Use synthetic credentials and media keys exclusively.
const TEST_TOKEN = "synthetic-r2-test-token";
const BASE_URL = "https://worker.example.invalid";

const MEDIA_KEY = "gallery/2026/11/synthetic.webp";
const MEDIA_BODY = "synthetic-image-bytes";
const MEDIA_SIZE = new TextEncoder().encode(MEDIA_BODY).byteLength;

type DatabaseState = {
  spendAllowed: boolean;
  reserveAllowed: boolean;
  spendError: Error | null;
  reserveError: Error | null;
  recordError: Error | null;
  forgetError: Error | null;
  storedBytes: number;
};

type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
};

// Simulate the D1 statements used by the Worker's R2 ledger.
// SQL is inspected without connecting to a real database.
function createMockDatabase() {
  const records: PreparedRecord[] = [];

  const state: DatabaseState = {
    spendAllowed: true,
    reserveAllowed: true,
    spendError: null,
    reserveError: null,
    recordError: null,
    forgetError: null,
    storedBytes: 0,
  };

  const prepare = vi.fn((sql: string) => {
    const statement: PreparedRecord = {
      sql,
      params: [],
      bind: vi.fn(),
      run: vi.fn(),
      first: vi.fn(),
    };

    // D1 bind() is chainable and records parameterized values.
    statement.bind.mockImplementation((...params: unknown[]) => {
      statement.params = params;
      return statement;
    });

    // Return the expected change count for each ledger operation.
    statement.run.mockImplementation(async () => {
      if (sql.includes("INSERT INTO r2_class_a_day")) {
        if (state.spendError) {
          throw state.spendError;
        }

        return {
          meta: {
            changes: state.spendAllowed ? 1 : 0,
          },
        };
      }

      if (sql.includes("INSERT INTO r2_object")) {
        if (state.reserveError) {
          throw state.reserveError;
        }

        return {
          meta: {
            changes: state.reserveAllowed ? 1 : 0,
          },
        };
      }

      if (sql.includes("UPDATE r2_object")) {
        if (state.recordError) {
          throw state.recordError;
        }
      }

      if (sql.includes("DELETE FROM r2_object")) {
        if (state.forgetError) {
          throw state.forgetError;
        }
      }

      return {
        meta: {
          changes: 1,
        },
      };
    });

    // The storage-full response queries the current ledger total.
    statement.first.mockImplementation(async () => ({
      bytes: state.storedBytes,
    }));

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

// Produce a real ReadableStream for GET media responses.
// The mock metadata behaves like R2ObjectBody.writeHttpMetadata().
function createStoredObject() {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(MEDIA_BODY),
      );

      controller.close();
    },
  });

  return {
    key: MEDIA_KEY,
    size: MEDIA_SIZE,
    body,
    httpEtag: '"synthetic-r2-etag"',
    writeHttpMetadata(headers: Headers) {
      headers.set("content-type", "image/webp");
    },
  };
}

// Simulate the Cloudflare R2 binding and track each storage operation.
function createMockMedia() {
  return {
    get: vi.fn().mockImplementation(
      async () => createStoredObject(),
    ),
    head: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({
      key: MEDIA_KEY,
      size: MEDIA_SIZE,
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

type MockMedia = ReturnType<typeof createMockMedia>;

// Create a Worker environment using only test bindings and limits.
function createEnvironment(
  db: MockDatabase,
  media: MockMedia,
): Env {
  return {
    DB: {
      prepare: db.prepare,
    } as unknown as D1Database,

    MEDIA: media as unknown as R2Bucket,
    MEDIA_BUCKET_NAME: "synthetic-test-bucket",
    R2_STORAGE_CAP_BYTES: "1000",
    R2_CLASS_A_DAILY_BUDGET: "10",
    PROXY_TOKEN: TEST_TOKEN,
  };
}

// Node's Web Crypto API does not necessarily include the
// Cloudflare-specific timingSafeEqual() method.
//
// Preserve real SHA-256 hashing while supplying a deterministic
// fixed-length byte comparison for the test environment.
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

type MediaRequestOptions = {
  authorization?: "valid" | "missing" | "wrong";
  contentType?: string | null;
  contentLength?: number | null;
  body?: string | null;
};

// Construct real Request objects without performing network requests.
// The body and declared length can be controlled independently to test
// the Worker's explicit Content-Length validation.
function createMediaRequest(
  method: string,
  key = MEDIA_KEY,
  options: MediaRequestOptions = {},
) {
  const headers = new Headers();

  if (options.authorization !== "missing") {
    headers.set(
      "authorization",
      `Bearer ${
        options.authorization === "wrong"
          ? "incorrect-synthetic-token"
          : TEST_TOKEN
      }`,
    );
  }

  const contentType =
    options.contentType === undefined
      ? "image/webp"
      : options.contentType;

  if (contentType !== null) {
    headers.set("content-type", contentType);
  }

  const body =
    method === "PUT"
      ? options.body === undefined
        ? MEDIA_BODY
        : options.body
      : null;

  const contentLength =
    options.contentLength === undefined
      ? body === null
        ? null
        : new TextEncoder().encode(body).byteLength
      : options.contentLength;

  if (contentLength !== null) {
    headers.set(
      "content-length",
      String(contentLength),
    );
  }

  return new Request(
    `${BASE_URL}/media/${key}`,
    {
      method,
      headers,
      body,
    },
  );
}

// Locate a D1 mock statement by the SQL it prepared.
function findStatement(
  db: MockDatabase,
  sqlFragment: string,
) {
  return db.records.find((record) =>
    record.sql.includes(sqlFragment),
  );
}

describe("Cloudflare Worker R2 media endpoints", () => {
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
    vi.restoreAllMocks();
  });

  // Invoke the actual Worker handler using synthetic Request objects.
  async function send(
    method: string,
    key = MEDIA_KEY,
    options: MediaRequestOptions = {},
  ) {
    return worker.fetch(
      createMediaRequest(method, key, options),
      env,
    );
  }

  describe("Public R2 reads", () => {
    it("serves a public image without requiring a bearer token", async () => {
      // Public media must remain readable even without the
      // private proxy token used for database and write operations.
      env.PROXY_TOKEN = "";

      const response = await send(
        "GET",
        MEDIA_KEY,
        { authorization: "missing" },
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(MEDIA_BODY);

      expect(media.get).toHaveBeenCalledOnce();
      expect(media.get).toHaveBeenCalledWith(MEDIA_KEY);

      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("preserves R2 metadata and immutable caching headers", async () => {
      const response = await send(
        "GET",
        MEDIA_KEY,
        { authorization: "missing" },
      );

      expect(response.status).toBe(200);

      expect(
        response.headers.get("content-type"),
      ).toBe("image/webp");

      expect(
        response.headers.get("etag"),
      ).toBe('"synthetic-r2-etag"');

      expect(
        response.headers.get("cache-control"),
      ).toBe(
        "public, max-age=31536000, immutable",
      );
    });

    it("returns headers without a response body for HEAD", async () => {
      const response = await send(
        "HEAD",
        MEDIA_KEY,
        { authorization: "missing" },
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");

      expect(response.headers.get("etag")).toBe(
        '"synthetic-r2-etag"',
      );

      expect(media.get).toHaveBeenCalledWith(MEDIA_KEY);
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("returns 404 when an R2 object does not exist", async () => {
      media.get.mockResolvedValueOnce(null);

      const response = await send(
        "GET",
        MEDIA_KEY,
        { authorization: "missing" },
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not found");

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    // Percent-encoded paths preserve otherwise unsafe characters
    // through URL parsing until the Worker decodes the media key.
    it.each([
      {
        label: "malformed percent encoding",
        key: "%E0%A4%A",
      },
      {
        label: "parent-directory traversal",
        key: "gallery%2F..%2Fsecret.webp",
      },
      {
        label: "duplicate directory separators",
        key: "gallery%2F%2Fsynthetic.webp",
      },
      {
        label: "spaces in an object key",
        key: "gallery%2Fbad%20name.webp",
      },
      {
        label: "keys longer than the maximum length",
        key: "a".repeat(513),
      },
    ])("rejects $label", async ({ key }) => {
      const response = await send(
        "GET",
        key,
        { authorization: "missing" },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "bad_key",
      });

      expect(media.get).not.toHaveBeenCalled();
      expect(media.delete).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });
  });

  describe("Authenticated R2 uploads", () => {
    it("rejects PUT when the proxy token is not configured", async () => {
      env.PROXY_TOKEN = "";

      const response = await send("PUT");

      expect(response.status).toBe(500);

      expect(await response.json()).toEqual({
        error: "proxy_misconfigured",
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects PUT without a bearer token", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { authorization: "missing" },
      );

      expect(response.status).toBe(401);

      expect(await response.json()).toEqual({
        error: "unauthorized",
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects PUT with an incorrect bearer token", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { authorization: "wrong" },
      );

      expect(response.status).toBe(401);
      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects unsupported media content types", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { contentType: "image/svg+xml" },
      );

      expect(response.status).toBe(415);

      expect(await response.json()).toEqual({
        error: "unsupported_type",
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("requires an upload Content-Length header", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { contentLength: null },
      );

      expect(response.status).toBe(411);

      expect(await response.json()).toEqual({
        error: "length_required",
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects a zero-length upload", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { contentLength: 0 },
      );

      expect(response.status).toBe(411);
      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects an upload larger than 10 MiB", async () => {
      // A small synthetic body is sufficient because the Worker
      // validates the declared length before reading the stream.
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { contentLength: 10 * 1024 * 1024 + 1 },
      );

      expect(response.status).toBe(413);

      expect(await response.json()).toEqual({
        error: "payload_too_large",
        max: 10 * 1024 * 1024,
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects a missing upload body", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        {
          body: null,
          contentLength: MEDIA_SIZE,
        },
      );

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error: "empty_body",
      });

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("fails closed when billing limits are not configured", async () => {
      env.R2_STORAGE_CAP_BYTES = "";

      const response = await send("PUT");

      expect(response.status).toBe(503);

      const body = (await response.json()) as {
        error: string;
        message: string;
      };

      expect(body.error).toBe("limits_unavailable");
      expect(body.message).toContain(
        "R2_STORAGE_CAP_BYTES",
      );

      expect(media.put).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("blocks uploads when the Class A daily budget is exhausted", async () => {
      db.state.spendAllowed = false;

      const response = await send("PUT");

      expect(response.status).toBe(429);

      expect(await response.json()).toEqual({
        error: "r2_daily_limit",
        budget: 10,
      });

      expect(
        findStatement(db, "INSERT INTO r2_class_a_day"),
      ).toBeTruthy();

      expect(
        findStatement(db, "INSERT INTO r2_object"),
      ).toBeUndefined();

      expect(media.put).not.toHaveBeenCalled();
    });

    it("blocks uploads when the storage cap is reached", async () => {
      db.state.reserveAllowed = false;
      db.state.storedBytes = 990;

      const response = await send("PUT");

      expect(response.status).toBe(507);

      expect(await response.json()).toEqual({
        error: "storage_full",
        capBytes: 1000,
        usedBytes: 990,
      });

      expect(
        findStatement(db, "INSERT INTO r2_class_a_day"),
      ).toBeTruthy();

      expect(
        findStatement(db, "INSERT INTO r2_object"),
      ).toBeTruthy();

      expect(media.put).not.toHaveBeenCalled();
    });

    it("rejects uploads when the Class A ledger query fails", async () => {
      db.state.spendError = new Error(
        "Synthetic Class A ledger failure.",
      );

      const response = await send("PUT");

      expect(response.status).toBe(503);

      const body = (await response.json()) as {
        error: string;
        message: string;
      };

      expect(body.error).toBe("limits_unavailable");
      expect(body.message).toContain(
        "Synthetic Class A ledger failure.",
      );

      expect(media.put).not.toHaveBeenCalled();
    });

    it("rejects uploads when the storage reservation fails", async () => {
      db.state.reserveError = new Error(
        "Synthetic storage ledger failure.",
      );

      const response = await send("PUT");

      expect(response.status).toBe(503);

      const body = (await response.json()) as {
        error: string;
        message: string;
      };

      expect(body.error).toBe("limits_unavailable");
      expect(body.message).toContain(
        "Synthetic storage ledger failure.",
      );

      expect(media.put).not.toHaveBeenCalled();
    });

    it("uploads approved media in Standard storage class", async () => {
      const response = await send(
        "PUT",
        MEDIA_KEY,
        { contentType: "image/webp; charset=binary" },
      );

      expect(response.status).toBe(201);

      expect(await response.json()).toEqual({
        key: MEDIA_KEY,
        size: MEDIA_SIZE,
        bucket: "synthetic-test-bucket",
      });

      // The budget reservation must precede storage reservation,
      // and both must occur before writing the file to R2.
      const budget = findStatement(
        db,
        "INSERT INTO r2_class_a_day",
      );

      const storage = findStatement(
        db,
        "INSERT INTO r2_object",
      );

      expect(budget?.run).toHaveBeenCalledOnce();
      expect(storage?.run).toHaveBeenCalledOnce();

      expect(budget?.params[0]).toBe(
        "synthetic-test-bucket",
      );

      expect(storage?.params).toEqual([
        "synthetic-test-bucket",
        MEDIA_KEY,
        MEDIA_SIZE,
        1000,
      ]);

      expect(media.put).toHaveBeenCalledOnce();

      const putCall = media.put.mock.calls[0];

      expect(putCall[0]).toBe(MEDIA_KEY);
      expect(putCall[1]).toBeInstanceOf(ReadableStream);

      expect(putCall[2]).toEqual({
        httpMetadata: {
          contentType: "image/webp",
        },
        storageClass: "Standard",
      });
    });

    it("updates the ledger when R2 reports a different stored size", async () => {
      const actualSize = MEDIA_SIZE + 12;

      media.put.mockResolvedValueOnce({
        key: MEDIA_KEY,
        size: actualSize,
      });

      const response = await send("PUT");

      expect(response.status).toBe(201);

      expect(await response.json()).toEqual({
        key: MEDIA_KEY,
        size: actualSize,
        bucket: "synthetic-test-bucket",
      });

      const correction = findStatement(
        db,
        "UPDATE r2_object SET byte_size",
      );

      expect(correction?.run).toHaveBeenCalledOnce();

      expect(correction?.params).toEqual([
        "synthetic-test-bucket",
        MEDIA_KEY,
        actualSize,
      ]);
    });

    it("removes the reserved ledger entry after a failed new upload", async () => {
      media.put.mockRejectedValueOnce(
        new Error("Synthetic R2 upload failure."),
      );

      // No existing R2 object means the failed reservation
      // must be removed from the storage ledger.
      media.head.mockResolvedValueOnce(null);

      const response = await send("PUT");

      expect(response.status).toBe(502);

      expect(await response.json()).toEqual({
        error: "storage_error",
        message: "Synthetic R2 upload failure.",
      });

      expect(media.head).toHaveBeenCalledWith(MEDIA_KEY);

      const correction = findStatement(
        db,
        "DELETE FROM r2_object",
      );

      expect(correction?.run).toHaveBeenCalledOnce();

      expect(correction?.params).toEqual([
        "synthetic-test-bucket",
        MEDIA_KEY,
      ]);
    });

    it("restores the existing object's size after a failed overwrite", async () => {
      media.put.mockRejectedValueOnce(
        new Error("Synthetic overwrite failure."),
      );

      // When an object already exists, the ledger must describe
      // the existing bytes rather than remove the entry.
      media.head.mockResolvedValueOnce({
        key: MEDIA_KEY,
        size: 37,
      });

      const response = await send("PUT");

      expect(response.status).toBe(502);

      const correction = findStatement(
        db,
        "UPDATE r2_object SET byte_size",
      );

      expect(correction?.run).toHaveBeenCalledOnce();

      expect(correction?.params).toEqual([
        "synthetic-test-bucket",
        MEDIA_KEY,
        37,
      ]);

      expect(
        findStatement(db, "DELETE FROM r2_object"),
      ).toBeUndefined();
    });

    it("returns the original storage error when reconciliation also fails", async () => {
      media.put.mockRejectedValueOnce(
        new Error("Synthetic upload failure."),
      );

      media.head.mockRejectedValueOnce(
        new Error("Synthetic R2 HEAD failure."),
      );

      const response = await send("PUT");

      expect(response.status).toBe(502);

      expect(await response.json()).toEqual({
        error: "storage_error",
        message: "Synthetic upload failure.",
      });

      expect(media.head).toHaveBeenCalledOnce();
    });
  });

  describe("Authenticated R2 deletion", () => {
    it("rejects deletion without a bearer token", async () => {
      const response = await send(
        "DELETE",
        MEDIA_KEY,
        { authorization: "missing" },
      );

      expect(response.status).toBe(401);

      expect(await response.json()).toEqual({
        error: "unauthorized",
      });

      expect(media.delete).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("rejects deletion with an incorrect bearer token", async () => {
      const response = await send(
        "DELETE",
        MEDIA_KEY,
        { authorization: "wrong" },
      );

      expect(response.status).toBe(401);

      expect(media.delete).not.toHaveBeenCalled();
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("deletes media and then removes its ledger entry", async () => {
      const response = await send("DELETE");

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");

      expect(media.delete).toHaveBeenCalledOnce();
      expect(media.delete).toHaveBeenCalledWith(MEDIA_KEY);

      const ledger = findStatement(
        db,
        "DELETE FROM r2_object",
      );

      expect(ledger?.run).toHaveBeenCalledOnce();

      expect(ledger?.params).toEqual([
        "synthetic-test-bucket",
        MEDIA_KEY,
      ]);
    });

    it("treats repeated deletion of a missing object as successful", async () => {
      // R2 deletion is idempotent. The mock deliberately returns
      // success even when the same key is deleted twice.
      const first = await send("DELETE");
      const second = await send("DELETE");

      expect(first.status).toBe(204);
      expect(second.status).toBe(204);

      expect(media.delete).toHaveBeenCalledTimes(2);

      const ledgerDeletes = db.records.filter(
        (record) =>
          record.sql.includes("DELETE FROM r2_object"),
      );

      expect(ledgerDeletes).toHaveLength(2);

      for (const operation of ledgerDeletes) {
        expect(operation.run).toHaveBeenCalledOnce();
      }
    });

    it("returns successful deletion when the ledger cleanup fails", async () => {
      db.state.forgetError = new Error(
        "Synthetic ledger delete failure.",
      );

      // The Worker intentionally logs the ledger failure
      // after R2 deletion rather than claiming bytes remain.
      const errorLog = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await send("DELETE");

      expect(response.status).toBe(204);

      expect(media.delete).toHaveBeenCalledOnce();

      expect(errorLog).toHaveBeenCalledWith(
        "ledger delete failed:",
        MEDIA_KEY,
        expect.any(Error),
      );
    });

    it("does not update the ledger when R2 deletion fails", async () => {
      media.delete.mockRejectedValueOnce(
        new Error("Synthetic R2 deletion failure."),
      );

      await expect(
        send("DELETE"),
      ).rejects.toThrow(
        "Synthetic R2 deletion failure.",
      );

      expect(
        findStatement(db, "DELETE FROM r2_object"),
      ).toBeUndefined();
    });

    it("rejects unsupported media HTTP methods", async () => {
      const response = await send("POST");

      expect(response.status).toBe(405);

      expect(await response.json()).toEqual({
        error: "method_not_allowed",
      });

      expect(media.get).not.toHaveBeenCalled();
      expect(media.put).not.toHaveBeenCalled();
      expect(media.delete).not.toHaveBeenCalled();
    });
  });
});
