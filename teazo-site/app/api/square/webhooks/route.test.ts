/**
 * Square webhook validation and lifecycle behavior tests.
 *
 * Covers webhook configuration, HMAC signature verification,
 * malformed payloads, catalog updates, duplicate deliveries,
 * out-of-order events, and failure/retry handling.
 *
 * Also characterizes the current handling of signed payment,
 * order, and other non-catalog events, which are acknowledged
 * without updating payment or fulfillment state.
 *
 * Catalog revision storage and Next.js cache operations are
 * mocked. No production Square, database, or storage services
 * are accessed.
 */

import { createHmac } from "node:crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  recordCatalogRevision: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/queries/catalog-revision", () => ({
  recordCatalogRevision: mocks.recordCatalogRevision,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

const { POST } = await import("./route");

const SIGNATURE_KEY = "teazo-test-webhook-key";

const NOTIFICATION_URL =
  "https://teazo.example/api/square/webhooks";

const EVENT_TIME = "2026-10-30T20:00:00.000Z";

function catalogEvent(
  eventId = "catalog-event-1",
  createdAt = EVENT_TIME,
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

function sign(
  body: string,
  key = SIGNATURE_KEY,
  notificationUrl = NOTIFICATION_URL,
) {
  return createHmac("sha256", key)
    .update(notificationUrl + body)
    .digest("base64");
}

function signedRequest(
  body: string,
  options: {
    signature?: string;
    requestUrl?: string;
  } = {},
) {
  return new Request(
    options.requestUrl ?? NOTIFICATION_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-square-hmacsha256-signature":
          options.signature ?? sign(body),
      },
      body,
    },
  );
}

function unsignedRequest(body: string) {
  return new Request(NOTIFICATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}

async function deliver(payload: unknown) {
  return POST(
    signedRequest(JSON.stringify(payload)),
  );
}

async function result(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

beforeEach(() => {
  mocks.recordCatalogRevision.mockReset();
  mocks.revalidatePath.mockReset();

  vi.stubEnv(
    "SQUARE_WEBHOOK_SIGNATURE_KEY",
    SIGNATURE_KEY,
  );

  vi.stubEnv(
    "SQUARE_WEBHOOK_NOTIFICATION_URL",
    NOTIFICATION_URL,
  );

  // Suppress expected error logging from negative-path tests.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Square webhook endpoint", () => {
  describe("Configuration and HMAC signatures", () => {
    it("returns 503 when the signature key is missing", async () => {
      vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "");

      const response = await deliver(catalogEvent());

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Webhook is not configured.",
      });

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("returns 503 when the notification URL is missing", async () => {
      vi.stubEnv("SQUARE_WEBHOOK_NOTIFICATION_URL", "");

      const response = await deliver(catalogEvent());

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Webhook is not configured.",
      });

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("rejects requests without a signature header", async () => {
      const body = JSON.stringify(catalogEvent());

      const response = await POST(
        unsignedRequest(body),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Invalid signature.",
      });

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("rejects a signature generated with the wrong key", async () => {
      const body = JSON.stringify(catalogEvent());

      const response = await POST(
        signedRequest(body, {
          signature: sign(body, "wrong-secret"),
        }),
      );

      expect(response.status).toBe(403);

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("rejects a signature when the signed body has been modified", async () => {
      const original = JSON.stringify(
        catalogEvent("original-event"),
      );

      const modified = JSON.stringify(
        catalogEvent("modified-event"),
      );

      const response = await POST(
        signedRequest(modified, {
          signature: sign(original),
        }),
      );

      expect(response.status).toBe(403);

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("rejects a signature generated for another notification URL", async () => {
      const body = JSON.stringify(catalogEvent());

      const response = await POST(
        signedRequest(body, {
          signature: sign(
            body,
            SIGNATURE_KEY,
            "https://another.example/webhook",
          ),
        }),
      );

      expect(response.status).toBe(403);

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("rejects a malformed signature with a different length", async () => {
      const body = JSON.stringify(catalogEvent());

      const response = await POST(
        signedRequest(body, {
          signature: "invalid-signature",
        }),
      );

      expect(response.status).toBe(403);

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("uses the configured notification URL rather than the incoming request URL", async () => {
      const body = JSON.stringify(catalogEvent());

      const response = await POST(
        signedRequest(body, {
          requestUrl:
            "https://unexpected.example/api/square/webhooks",
        }),
      );

      expect(response.status).toBe(200);

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenCalledWith(
        EVENT_TIME,
        "catalog-event-1",
      );
    });
  });

  describe("Signed payload validation", () => {
    it("rejects malformed JSON even with a valid HMAC signature", async () => {
      const response = await POST(
        signedRequest("{invalid-json"),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid JSON.",
      });

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it.each([
      null,
      [],
      {},
      { type: 123 },
    ])(
      "rejects invalid event structure %#",
      async (payload) => {
        const response = await deliver(payload);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "Invalid event.",
        });

        expect(
          mocks.recordCatalogRevision,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      undefined,
      "",
      123,
    ])(
      "rejects invalid catalog event ID %#",
      async (eventId) => {
        const response = await deliver({
          ...catalogEvent(),
          event_id: eventId,
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "Missing event ID.",
        });

        expect(
          mocks.recordCatalogRevision,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      undefined,
      "",
      "not-a-date",
      123,
    ])(
      "rejects invalid catalog timestamp %#",
      async (createdAt) => {
        const response = await deliver({
          ...catalogEvent(),
          created_at: createdAt,
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error:
            "Missing or invalid event timestamp.",
        });

        expect(
          mocks.recordCatalogRevision,
        ).not.toHaveBeenCalled();
      },
    );
  });

  describe("Catalog update processing", () => {
    it("records a valid catalog event and revalidates public and admin Menu pages", async () => {
      const response = await deliver(catalogEvent());

      expect(await result(response)).toEqual({
        status: 200,
        body: { received: true },
      });

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenCalledExactlyOnceWith(
        EVENT_TIME,
        "catalog-event-1",
      );

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

    it("characterizes duplicate catalog-event delivery without claiming endpoint-level deduplication", async () => {
      const event = catalogEvent("repeated-event");

      const first = await deliver(event);
      const second = await deliver(event);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      // The endpoint passes both deliveries to the revision
      // recorder. Database-level idempotency is separate.
      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenCalledTimes(2);

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenNthCalledWith(
        1,
        EVENT_TIME,
        "repeated-event",
      );

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenNthCalledWith(
        2,
        EVENT_TIME,
        "repeated-event",
      );

      expect(
        mocks.revalidatePath,
      ).toHaveBeenCalledTimes(4);
    });

    it("accepts out-of-order catalog events without inventing an event-ordering check", async () => {
      const newer = catalogEvent(
        "newer-event",
        "2026-10-30T21:00:00.000Z",
      );

      const older = catalogEvent(
        "older-event",
        "2026-10-30T19:00:00.000Z",
      );

      expect((await deliver(newer)).status).toBe(
        200,
      );

      expect((await deliver(older)).status).toBe(
        200,
      );

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenNthCalledWith(
        1,
        newer.created_at,
        newer.event_id,
      );

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenNthCalledWith(
        2,
        older.created_at,
        older.event_id,
      );
    });

    it("returns 500 on revision-storage failure and accepts a later retry", async () => {
      mocks.recordCatalogRevision
        .mockRejectedValueOnce(
          new Error("Database unavailable"),
        )
        .mockResolvedValueOnce(undefined);

      const event = catalogEvent("retry-event");

      const first = await deliver(event);

      expect(await result(first)).toEqual({
        status: 500,
        body: {
          error: "Catalog refresh failed.",
        },
      });

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();

      const second = await deliver(event);

      expect(await result(second)).toEqual({
        status: 200,
        body: { received: true },
      });

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenCalledTimes(2);

      expect(
        mocks.revalidatePath,
      ).toHaveBeenCalledTimes(2);
    });

    it("returns 500 when cache revalidation fails", async () => {
      mocks.revalidatePath.mockImplementationOnce(
        () => {
          throw new Error("Revalidation unavailable");
        },
      );

      const response = await deliver(
        catalogEvent("revalidation-error"),
      );

      expect(response.status).toBe(500);

      expect(await response.json()).toEqual({
        error: "Catalog refresh failed.",
      });

      expect(
        mocks.recordCatalogRevision,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe("Non-catalog order and payment events", () => {
    it.each([
      "payment.updated",
      "order.updated",
      "unrecognized.event",
    ])(
      "acknowledges signed %s without processing an order-state transition",
      async (eventType) => {
        const response = await deliver({
          type: eventType,
          event_id: `${eventType}-1`,
          created_at: EVENT_TIME,
          data: {
            object: {
              order_id: "test-order",
            },
          },
        });

        expect(await result(response)).toEqual({
          status: 200,
          body: {
            received: true,
            ignored: true,
          },
        });

        expect(
          mocks.recordCatalogRevision,
        ).not.toHaveBeenCalled();

        expect(
          mocks.revalidatePath,
        ).not.toHaveBeenCalled();
      },
    );

    it("acknowledges a signed non-catalog event without catalog-specific fields", async () => {
      const response = await deliver({
        type: "payment.updated",
      });

      expect(await result(response)).toEqual({
        status: 200,
        body: {
          received: true,
          ignored: true,
        },
      });

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();
    });

    it("acknowledges duplicate signed payment notifications without modifying catalog state", async () => {
      const event = {
        type: "payment.updated",
        event_id: "payment-duplicate-1",
        created_at: EVENT_TIME,
      };

      const first = await deliver(event);
      const second = await deliver(event);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      expect(
        mocks.recordCatalogRevision,
      ).not.toHaveBeenCalled();

      expect(
        mocks.revalidatePath,
      ).not.toHaveBeenCalled();
    });
  });
});
