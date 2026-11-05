/**
 * Square webhook SQLite integration tests for Teazo.
 *
 * Exercises the real Square webhook POST handler and catalog
 * revision persistence functions using the actual SQLite
 * schema and migrations.
 *
 * Covers HMAC verification, event persistence, duplicate
 * deliveries, out-of-order events, retry handling, rollback,
 * and preservation of catalog state after failed requests.
 *
 * All webhook events and signing secrets are synthetic.
 * Next.js cache revalidation is mocked.
 *
 * No real Square API calls, external webhook requests,
 * production database writes, or payments occur.
 */

import { createHmac } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { sqliteD1 } from "@/test/sqlite-d1";

// Mock only the Next.js framework dependencies.
const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  unstable_rethrow: vi.fn(),
}));

vi.mock("server-only", () => ({}));

// Execute the actual catalog revision SQL in memory.
vi.mock("@/app/lib/d1", async () => ({
  ...(await import("@/test/sqlite-d1")).sqliteD1.module,
}));

// Revalidation must not contact a running Next.js server.
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: mocks.unstable_rethrow,
}));

import { POST } from "./route";

import {
  getCatalogRevision,
} from "@/app/lib/queries/catalog-revision";

// Use a synthetic webhook endpoint and signing secret.
const NOTIFICATION_URL =
  "https://teazo.example.invalid/api/square/webhooks";

const SIGNATURE_KEY =
  "synthetic-square-webhook-signing-secret";

const EVENT_DATE =
  "2026-11-04T20:00:00.000Z";

type CatalogEventRow = {
  square_env: string;
  event_id: string;
  created_at: string;
  revision: string;
};

// Return the actual persisted webhook events.
function getEvents(): CatalogEventRow[] {
  return sqliteD1.db.prepare(
    `SELECT
       square_env,
       event_id,
       created_at,
       revision
     FROM square_catalog_event
     ORDER BY event_id`,
  ).all() as CatalogEventRow[];
}

// Calculate the Square webhook signature independently
// of the application handler.
function signature(
  body: string,
  key = SIGNATURE_KEY,
  url = NOTIFICATION_URL,
): string {
  return createHmac("sha256", key)
    .update(url + body)
    .digest("base64");
}

// Create a synthetic Square catalog notification.
function catalogEvent(
  eventId = "synthetic-catalog-event",
  createdAt = EVENT_DATE,
) {
  return {
    type: "catalog.version.updated",
    event_id: eventId,
    created_at: createdAt,
    data: {
      object: {
        catalog_version: "123",
      },
    },
  };
}

// Build a real Request object with a valid or intentionally
// incorrect HMAC signature.
function signedRequest(
  body: string,
  options: {
    signedUrl?: string;
    requestUrl?: string;
    key?: string;
    signature?: string;
  } = {},
): Request {
  return new Request(
    options.requestUrl ?? NOTIFICATION_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-square-hmacsha256-signature":
          options.signature ??
          signature(
            body,
            options.key ?? SIGNATURE_KEY,
            options.signedUrl ?? NOTIFICATION_URL,
          ),
      },
      body,
    },
  );
}

// Deliver an event directly to the real route handler.
// No external HTTP request is made.
async function deliver(
  event: unknown,
  options: Parameters<typeof signedRequest>[1] = {},
) {
  return POST(
    signedRequest(
      JSON.stringify(event),
      options,
    ),
  );
}

describe("Square webhook SQLite integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Reapply the real migrations to a fresh in-memory DB.
    sqliteD1.reset();

    // Force synthetic sandbox-only event storage.
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");

    vi.stubEnv(
      "SQUARE_WEBHOOK_SIGNATURE_KEY",
      SIGNATURE_KEY,
    );

    vi.stubEnv(
      "SQUARE_WEBHOOK_NOTIFICATION_URL",
      NOTIFICATION_URL,
    );

    // Suppress expected diagnostic logs.
    vi.spyOn(console, "error")
      .mockImplementation(() => undefined);

    vi.spyOn(console, "info")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  describe("Signed catalog event persistence", () => {
    it("persists a valid signed event and updates the sandbox revision", async () => {
      const response = await deliver(
        catalogEvent(),
      );

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual({
        received: true,
      });

      const events = getEvents();

      expect(events).toHaveLength(1);

      expect(events[0]).toMatchObject({
        square_env: "sandbox",
        event_id: "synthetic-catalog-event",
        created_at: EVENT_DATE,
      });

      // Both tables must reference the same revision.
      const currentRevision =
        await getCatalogRevision();

      expect(currentRevision).toBe(
        events[0].revision,
      );

      expect(currentRevision).toBeTruthy();

      expect(
        mocks.revalidatePath,
      ).toHaveBeenCalledTimes(2);

      expect(
        mocks.revalidatePath,
      ).toHaveBeenNthCalledWith(
        1,
        "/menu",
      );

      expect(
        mocks.revalidatePath,
      ).toHaveBeenNthCalledWith(
        2,
        "/admin/menu",
      );
    });

    it("preserves the original revision when the same event is delivered twice", async () => {
      const event = catalogEvent(
        "synthetic-duplicate",
      );

      expect(
        (await deliver(event)).status,
      ).toBe(200);

      const firstRevision =
        await getCatalogRevision();

      expect(
        (await deliver(event)).status,
      ).toBe(200);

      // The database's unique event ID and conditional
      // revision update prevent a repeated event from
      // creating another revision.
      expect(getEvents()).toHaveLength(1);

      expect(
        await getCatalogRevision(),
      ).toBe(firstRevision);

      // The endpoint still invalidates the cache for
      // both deliveries, as expected for safe retries.
      expect(
        mocks.revalidatePath,
      ).toHaveBeenCalledTimes(4);
    });

    it("records distinct out-of-order events without duplicating their identities", async () => {
      const newer = catalogEvent(
        "newer-event",
        "2026-11-04T22:00:00.000Z",
      );

      const older = catalogEvent(
        "older-event",
        "2026-11-04T19:00:00.000Z",
      );

      expect(
        (await deliver(newer)).status,
      ).toBe(200);

      const newerRevision =
        await getCatalogRevision();

      expect(
        (await deliver(older)).status,
      ).toBe(200);

      expect(getEvents()).toHaveLength(2);

      // The implementation publishes the most recently
      // processed distinct event, not necessarily the
      // event with the newest created_at timestamp.
      const currentRevision =
        await getCatalogRevision();

      expect(currentRevision).toBeTruthy();
      expect(currentRevision).not.toBe(
        newerRevision,
      );

      expect(
        getEvents().map((event) => event.event_id),
      ).toEqual([
        "newer-event",
        "older-event",
      ]);
    });
  });

  describe("Webhook authentication and validation", () => {
    it("rejects unsigned requests without writing database records", async () => {
      const response = await POST(
        new Request(NOTIFICATION_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(
            catalogEvent(),
          ),
        }),
      );

      expect(response.status).toBe(403);

      expect(getEvents()).toEqual([]);

      expect(
        await getCatalogRevision(),
      ).toBe("");

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();
    });

    it("rejects an event signed with the wrong secret", async () => {
      const response = await deliver(
        catalogEvent(),
        {
          key: "incorrect-synthetic-secret",
        },
      );

      expect(response.status).toBe(403);
      expect(getEvents()).toEqual([]);
    });

    it("rejects modifications to the signed event payload", async () => {
      const original = JSON.stringify(
        catalogEvent("original-event"),
      );

      const modified = JSON.stringify(
        catalogEvent("modified-event"),
      );

      const response = await POST(
        signedRequest(modified, {
          signature: signature(original),
        }),
      );

      expect(response.status).toBe(403);

      expect(getEvents()).toEqual([]);
      expect(
        await getCatalogRevision(),
      ).toBe("");
    });

    it("rejects a signature created for a different notification URL", async () => {
      const response = await deliver(
        catalogEvent(),
        {
          signedUrl:
            "https://attacker.example.invalid/webhook",
        },
      );

      expect(response.status).toBe(403);
      expect(getEvents()).toEqual([]);
    });

    it("uses the configured notification URL rather than an untrusted request host", async () => {
      const response = await deliver(
        catalogEvent(),
        {
          requestUrl:
            "https://untrusted.example.invalid/api/square/webhooks",
        },
      );

      // The valid signature was calculated from the
      // configured URL, not the incoming request host.
      expect(response.status).toBe(200);

      expect(getEvents()).toHaveLength(1);
    });

    it("rejects signed malformed JSON before persistence", async () => {
      const response = await POST(
        signedRequest("{not-valid-json"),
      );

      expect(response.status).toBe(400);

      expect(await response.json()).toEqual({
        error: "Invalid JSON.",
      });

      expect(getEvents()).toEqual([]);
    });

    it("acknowledges signed payment notifications without changing catalog state", async () => {
      const response = await deliver({
        type: "payment.updated",
        event_id: "synthetic-payment-event",
        created_at: EVENT_DATE,
      });

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual({
        received: true,
        ignored: true,
      });

      // Payment events are not catalog revision updates.
      expect(getEvents()).toEqual([]);

      expect(
        await getCatalogRevision(),
      ).toBe("");

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Persistence failure and retry behavior", () => {
    it("rolls back revision changes when event insertion fails", async () => {
      // Trigger a deliberate failure inside the actual
      // SQLite batch. No production database is involved.
      sqliteD1.db.exec(`
        CREATE TRIGGER synthetic_webhook_failure
        BEFORE INSERT ON square_catalog_event
        BEGIN
          SELECT RAISE(
            ABORT,
            'synthetic webhook persistence failure'
          );
        END;
      `);

      const response = await deliver(
        catalogEvent(),
      );

      expect(response.status).toBe(500);

      expect(await response.json()).toEqual({
        error: "Catalog refresh failed.",
      });

      expect(getEvents()).toEqual([]);

      expect(
        await getCatalogRevision(),
      ).toBe("");

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();
    });

    it("preserves committed revision data when cache invalidation fails and safely accepts retry", async () => {
      mocks.revalidatePath.mockImplementationOnce(
        () => {
          throw new Error(
            "Synthetic cache revalidation failure.",
          );
        },
      );

      const event = catalogEvent(
        "synthetic-retry-event",
      );

      const failedResponse =
        await deliver(event);

      // The revision was saved, but the route signals
      // failure so Square could retry the event.
      expect(failedResponse.status).toBe(500);

      expect(getEvents()).toHaveLength(1);

      const savedRevision =
        await getCatalogRevision();

      expect(savedRevision).toBeTruthy();

      mocks.revalidatePath.mockReset();

      const retriedResponse =
        await deliver(event);

      expect(retriedResponse.status).toBe(200);

      // Retrying must not create a duplicate event or
      // replace the existing revision token.
      expect(getEvents()).toHaveLength(1);

      expect(
        await getCatalogRevision(),
      ).toBe(savedRevision);

      expect(
        mocks.revalidatePath,
      ).toHaveBeenCalledWith(
        "/menu",
      );

      expect(
        mocks.revalidatePath,
      ).toHaveBeenCalledWith(
        "/admin/menu",
      );
    });
  });
});
