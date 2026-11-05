/**
 * Guarded integration tests for the local Cloudflare Worker.
 *
 * Exercises the real local Wrangler HTTP endpoints for D1 and R2:
 * - Authenticated /query requests
 * - Atomic /batch updates and transaction rollback
 * - R2 upload, GET, HEAD, deletion, and ledger cleanup
 *
 * These tests are skipped unless all local-test flags are enabled.
 * Run Wrangler with --local, never --remote.
 *
 * All writable resources use unique, test-owned identifiers.
 * Cleanup runs after each test, including failed tests.
 *
 * Never direct this suite at production or preview resources.
 */

import { randomUUID } from "node:crypto";

import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  requireLocalCloudflare,
} from "@/test/external-integration-guard";

// Require both the general external-test opt-in and the
// specific local Wrangler test opt-in.
const RUN_LOCAL =
  process.env.TEAZO_EXTERNAL_TESTS === "1" &&
  process.env.TEAZO_LOCAL_WRANGLER_TESTS === "1";

type QueryResult<T> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

type MediaUploadResult = {
  key: string;
  size: number;
  bucket: string;
};

// A small, valid PNG used only for the local R2 lifecycle test.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ" +
    "AAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
  "base64",
);

// These collections contain only keys created by this suite.
const contentKeys = new Set<string>();
const mediaKeys = new Set<string>();

let workerUrl = "";
let proxyToken = "";
let preflightPassed = false;

// Send an HTTP request to the explicitly validated local Worker.
async function workerRequest(
  path: string,
  options: {
    method?: string;
    body?: string | Buffer;
    contentType?: string;
    authorized?: boolean;
  } = {},
): Promise<Response> {
  if (!preflightPassed) {
    throw new Error(
      "Local Wrangler preflight has not passed.",
    );
  }

  const headers = new Headers();

  if (options.authorized !== false) {
    headers.set(
      "authorization",
      `Bearer ${proxyToken}`,
    );
  }

  if (options.contentType) {
    headers.set(
      "content-type",
      options.contentType,
    );
  }

  if (options.body !== undefined) {
    headers.set(
      "content-length",
      String(
        Buffer.byteLength(options.body),
      ),
    );
  }

  // Convert Node.js Buffer data into an ArrayBuffer.
  // This satisfies the fetch BodyInit type while preserving
  // the original bytes sent to the local R2 Worker.
  let requestBody: BodyInit | undefined;

  if (typeof options.body === "string") {
    requestBody = options.body;
  } else if (options.body !== undefined) {
    const bytes = new Uint8Array(
      new ArrayBuffer(options.body.byteLength),
    );

    bytes.set(options.body);

    requestBody = bytes.buffer;
  }

  return fetch(`${workerUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: requestBody,
    signal: AbortSignal.timeout(10_000),
  });
}

// Execute the real Worker's /query endpoint.
async function query(
  sql: string,
  params: Array<string | number | null> = [],
) {
  const payload = JSON.stringify({
    sql,
    params,
  });

  return workerRequest("/query", {
    method: "POST",
    contentType: "application/json",
    body: payload,
  });
}

// Execute multiple D1 statements as one transaction.
async function batch(
  statements: Array<{
    sql: string;
    params: Array<string | number | null>;
  }>,
) {
  return workerRequest("/batch", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      statements,
    }),
  });
}

// Create a unique key inside the actual content_block schema.
// The page/slot values satisfy the database's key constraint.
function newContentKey() {
  const slot = randomUUID().replaceAll("-", "");
  const key = `external_probe.${slot}`;

  contentKeys.add(key);

  return {
    key,
    slot,
  };
}

// Restrict media operations to this test suite's namespace.
function newMediaKey() {
  const key =
    `external_test/${randomUUID()}.png`;

  mediaKeys.add(key);

  return key;
}

// Read a single test-owned content block through the Worker.
async function readContent(key: string) {
  const response = await query(
    "SELECT value FROM content_block WHERE key = ?1",
    [key],
  );

  expect(response.status).toBe(200);

  const result =
    (await response.json()) as QueryResult<{
      value: string;
    }>;

  return result.results;
}

describe.skipIf(!RUN_LOCAL)(
  "Local Wrangler D1/R2 integration",
  () => {
    beforeAll(() => {
      // Require an explicit confirmation that Wrangler was
      // started in local mode, not remote mode.
      if (
        process.env.TEAZO_LOCAL_WRANGLER_CONFIRMED !==
        "1"
      ) {
        throw new Error(
          "Confirm Wrangler is running with --local " +
            "and set TEAZO_LOCAL_WRANGLER_CONFIRMED=1.",
        );
      }

      // The shared guard rejects external URLs, missing
      // credentials, and unapproved test execution.
      requireLocalCloudflare();

      workerUrl = new URL(
        process.env.D1_PROXY_URL ?? "",
      ).origin;

      proxyToken = process.env.PROXY_TOKEN ?? "";
      preflightPassed = true;
    });

    afterEach(async () => {
      if (!preflightPassed) {
        return;
      }

      const cleanupErrors: string[] = [];

      // Delete any test-owned R2 objects, including uploads
      // that might have failed after storing their bytes.
      for (const key of mediaKeys) {
        try {
          const response = await workerRequest(
            `/media/${key}`,
            { method: "DELETE" },
          );

          if (response.status !== 204) {
            cleanupErrors.push(
              `Media cleanup returned HTTP ${response.status}.`,
            );
          }
        } catch {
          cleanupErrors.push(
            "Media cleanup could not reach local Wrangler.",
          );
        }
      }

      // Remove only content blocks created by these tests.
      for (const key of contentKeys) {
        try {
          const response = await query(
            "DELETE FROM content_block WHERE key = ?1",
            [key],
          );

          if (response.status !== 200) {
            cleanupErrors.push(
              `D1 cleanup returned HTTP ${response.status}.`,
            );
          }
        } catch {
          cleanupErrors.push(
            "D1 cleanup could not reach local Wrangler.",
          );
        }
      }

      mediaKeys.clear();
      contentKeys.clear();

      // Report cleanup problems instead of silently leaving
      // artifacts in the local test environment.
      expect(cleanupErrors).toEqual([]);
    });

    it("rejects unauthenticated D1 requests", async () => {
      const response = await workerRequest("/query", {
        method: "POST",
        authorized: false,
        contentType: "application/json",
        body: JSON.stringify({
          sql: "SELECT 1 AS probe",
          params: [],
        }),
      });

      expect(response.status).toBe(401);

      expect(await response.json()).toMatchObject({
        error: "unauthorized",
      });
    });

    it("executes an authenticated D1 SELECT query", async () => {
      const response = await query(
        "SELECT 42 AS probe",
      );

      expect(response.status).toBe(200);

      const body =
        (await response.json()) as QueryResult<{
          probe: number;
        }>;

      expect(body.success).toBe(true);

      expect(body.results).toEqual([
        { probe: 42 },
      ]);
    });

    it("persists an atomic D1 batch with ordered updates", async () => {
      const { key, slot } = newContentKey();

      const response = await batch([
        {
          sql: `
            INSERT INTO content_block
              (key, page_key, slot_key, block_type, value)
            VALUES
              (?1, 'external_probe', ?2, 'text', 'created')
          `,
          params: [key, slot],
        },
        {
          sql: `
            UPDATE content_block
            SET value = 'updated'
            WHERE key = ?1
          `,
          params: [key],
        },
      ]);

      expect(response.status).toBe(200);

      expect(await readContent(key)).toEqual([
        {
          value: "updated",
        },
      ]);
    });

    it("rolls back an entire D1 batch after a constraint failure", async () => {
      const { key, slot } = newContentKey();

      // Both INSERTs use the same unique key.
      // The second must fail, rolling back the first.
      const response = await batch([
        {
          sql: `
            INSERT INTO content_block
              (key, page_key, slot_key, block_type, value)
            VALUES
              (?1, 'external_probe', ?2, 'text', 'first')
          `,
          params: [key, slot],
        },
        {
          sql: `
            INSERT INTO content_block
              (key, page_key, slot_key, block_type, value)
            VALUES
              (?1, 'external_probe', ?2, 'text', 'second')
          `,
          params: [key, slot],
        },
      ]);

      expect(response.status).toBe(400);

      const body = await response.json();

      expect(body).toMatchObject({
        error: "d1_error",
      });

      // If the batch were not atomic, the first row would
      // remain after the second INSERT failed.
      expect(await readContent(key)).toEqual([]);
    });

    it("uploads, reads, and deletes a test-owned local R2 object", async () => {
      const key = newMediaKey();

      const uploaded = await workerRequest(
        `/media/${key}`,
        {
          method: "PUT",
          contentType: "image/png",
          body: PNG_BYTES,
        },
      );

      expect(uploaded.status).toBe(201);

      const metadata =
        (await uploaded.json()) as MediaUploadResult;

      expect(metadata.key).toBe(key);
      expect(metadata.size).toBe(
        PNG_BYTES.byteLength,
      );

      expect(metadata.bucket).toBeTruthy();

      // Read the stored bytes from the local R2 simulation.
      const downloaded = await workerRequest(
        `/media/${key}`,
        { authorized: false },
      );

      expect(downloaded.status).toBe(200);

      expect(
        Buffer.from(await downloaded.arrayBuffer()),
      ).toEqual(PNG_BYTES);

      expect(
        downloaded.headers.get("cache-control"),
      ).toContain("immutable");

      // HEAD verifies metadata without downloading the bytes.
      const head = await workerRequest(
        `/media/${key}`,
        {
          method: "HEAD",
          authorized: false,
        },
      );

      expect(head.status).toBe(200);

      expect(
        head.headers.get("etag"),
      ).toBeTruthy();

      // Verify that the Worker wrote a matching D1 ledger row.
      const ledger = await query(
        "SELECT r2_key FROM r2_object WHERE r2_key = ?1",
        [key],
      );

      expect(ledger.status).toBe(200);

      const ledgerBody =
        (await ledger.json()) as QueryResult<{
          r2_key: string;
        }>;

      expect(ledgerBody.results).toEqual([
        { r2_key: key },
      ]);

      // Remove only our own generated object.
      const removed = await workerRequest(
        `/media/${key}`,
        { method: "DELETE" },
      );

      expect(removed.status).toBe(204);

      const missing = await workerRequest(
        `/media/${key}`,
        { authorized: false },
      );

      expect(missing.status).toBe(404);

      // The Worker should remove its storage ledger entry too.
      const afterDelete = await query(
        "SELECT r2_key FROM r2_object WHERE r2_key = ?1",
        [key],
      );

      expect(afterDelete.status).toBe(200);

      const afterBody =
        (await afterDelete.json()) as QueryResult<{
          r2_key: string;
        }>;

      expect(afterBody.results).toEqual([]);

      // Keep the key in the cleanup set. The subsequent
      // idempotent DELETE confirms cleanup remains safe.
    });
  },
);
