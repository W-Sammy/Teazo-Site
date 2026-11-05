/**
 * Guarded Square sandbox checkout integration test.
 *
 * Creates one disposable Square sandbox checkout link,
 * retrieves its metadata, and deletes the link to cancel
 * its associated unpaid sandbox order.
 *
 * Requires explicit external, sandbox, and checkout-write
 * opt-in flags. Production Square is never contacted.
 *
 * The test uses a synthetic item, unique description,
 * and unique idempotency key. It does not complete payment.
 *
 * Cleanup targets only the link created by this test.
 * If the creation response is incomplete, cleanup searches
 * for the unique test description before deleting anything.
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
  requireSquareSandbox,
} from "@/test/external-integration-guard";

import { SQUARE_API_VERSION } from "./square-option-rules";

// This suite has an additional write-specific opt-in.
const RUN_CHECKOUT =
  process.env.TEAZO_EXTERNAL_TESTS === "1" &&
  process.env.TEAZO_SQUARE_CHECKOUT_WRITE_TESTS === "1";

const SQUARE_ORIGIN =
  "https://connect.squareupsandbox.com";

type SquareLocation = {
  id?: string;
  status?: string;
};

type PaymentLink = {
  id?: string;
  description?: string;
  order_id?: string;
  url?: string;
};

type PaymentLinkList = {
  payment_links?: PaymentLink[];
  cursor?: string;
};

type DeleteResult = {
  id?: string;
  cancelled_order_id?: string;
};

let token = "";
let testDescription = "";
let creationAttempted = false;
let createdOrderId = "";

const ownedLinkIds = new Set<string>();

// Refuse unsafe or unexpected payment-link identifiers.
function validLinkId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/**
 * Contact Square's fixed sandbox host.
 *
 * Only explicitly approved Checkout and location endpoints
 * are used by this test. Redirects are refused.
 */
async function sandboxRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  // Repeat safety validation immediately before every request.
  requireSquareSandbox();

  if (process.env.SQUARE_ENVIRONMENT !== "sandbox") {
    throw new Error(
      "Checkout tests require explicit sandbox mode.",
    );
  }

  const url = new URL(path, SQUARE_ORIGIN);

  if (url.origin !== SQUARE_ORIGIN) {
    throw new Error(
      "Square checkout target must remain in sandbox.",
    );
  }

  const collection =
    "/v2/online-checkout/payment-links";

  const isLocationRead =
    method === "GET" &&
    url.pathname === "/v2/locations";

  const isListRead =
    method === "GET" &&
    url.pathname === collection;

  const isCreate =
    method === "POST" &&
    url.pathname === collection;

  const isLinkRead =
    method === "GET" &&
    url.pathname.startsWith(`${collection}/`);

  const isLinkDelete =
    method === "DELETE" &&
    url.pathname.startsWith(`${collection}/`);

  if (
    !isLocationRead &&
    !isListRead &&
    !isCreate &&
    !isLinkRead &&
    !isLinkDelete
  ) {
    throw new Error(
      "Unapproved Square sandbox API operation.",
    );
  }

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "Square-Version": SQUARE_API_VERSION,
    accept: "application/json",
  });

  if (body !== undefined) {
    headers.set(
      "content-type",
      "application/json",
    );
  }

  return fetch(url, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Read an active location from the real sandbox account.
 * This does not change the location or merchant settings.
 */
async function getSandboxLocation(): Promise<string> {
  const response = await sandboxRequest(
    "GET",
    "/v2/locations",
  );

  expect(response.status).toBe(200);

  const body = (await response.json()) as {
    locations?: SquareLocation[];
  };

  const location =
    body.locations?.find(
      (item) =>
        item.status === "ACTIVE" &&
        typeof item.id === "string",
    );

  expect(location?.id).toBeTruthy();

  return location?.id ?? "";
}

/**
 * Find links belonging to this test through their exact
 * unique description, without modifying any other links.
 *
 * This also provides recovery when creation succeeded
 * but its response did not contain a usable link ID.
 */
async function recoverOwnedLinkIds(): Promise<void> {
  if (!creationAttempted || !testDescription) {
    return;
  }

  let cursor: string | undefined;

  // Bound pagination to avoid unbounded requests.
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      limit: "1000",
    });

    if (cursor) {
      params.set("cursor", cursor);
    }

    const response = await sandboxRequest(
      "GET",
      `/v2/online-checkout/payment-links?${params}`,
    );

    if (!response.ok) {
      throw new Error(
        "Could not inspect sandbox checkout links for cleanup.",
      );
    }

    const body =
      (await response.json()) as PaymentLinkList;

    for (const link of body.payment_links ?? []) {
      if (
        link.description === testDescription &&
        validLinkId(link.id)
      ) {
        ownedLinkIds.add(link.id);
      }
    }

    if (!body.cursor) {
      return;
    }

    cursor = body.cursor;
  }

  throw new Error(
    "Sandbox checkout cleanup search exceeded five pages.",
  );
}

describe.skipIf(!RUN_CHECKOUT)(
  "Square sandbox checkout integration",
  () => {
    beforeAll(() => {
      // Explicitly refuse implicit environment defaults.
      if (
        process.env.SQUARE_ENVIRONMENT !== "sandbox"
      ) {
        throw new Error(
          "Set SQUARE_ENVIRONMENT=sandbox before checkout testing.",
        );
      }

      requireSquareSandbox();

      token =
        process.env.SQUARE_ACCESS_TOKEN ?? "";
    });

    afterEach(async () => {
      const cleanupErrors: string[] = [];

      // Recover a link created with an incomplete response.
      try {
        await recoverOwnedLinkIds();
      } catch {
        cleanupErrors.push(
          "Could not fully search for test-owned checkout links.",
        );
      }

      // Delete only link IDs that belong to this run.
      for (const id of ownedLinkIds) {
        try {
          const response = await sandboxRequest(
            "DELETE",
            `/v2/online-checkout/payment-links/${encodeURIComponent(id)}`,
          );

          if (!response.ok) {
            cleanupErrors.push(
              "Sandbox checkout link deletion failed.",
            );
            continue;
          }

          const result =
            (await response.json()) as DeleteResult;

          expect(result.id).toBe(id);

          // Square cancels the associated unpaid order.
          if (createdOrderId) {
            expect(
              result.cancelled_order_id,
            ).toBe(createdOrderId);
          }
        } catch {
          cleanupErrors.push(
            "Could not confirm test-owned link cleanup.",
          );
        }
      }

      ownedLinkIds.clear();
      testDescription = "";
      createdOrderId = "";
      creationAttempted = false;

      // A failed cleanup is a test failure, not a success.
      expect(cleanupErrors).toEqual([]);
    });

    it("creates, retrieves, and cancels one disposable sandbox checkout", async () => {
      const identifier = randomUUID();

      testDescription =
        `TEAZO_AUTOMATED_SANDBOX_CHECKOUT_${identifier}`;

      const locationId =
        await getSandboxLocation();

      // Quick Pay uses a synthetic item instead of changing
      // anything in the team's shared sandbox catalog.
      const requestBody = {
        idempotency_key: identifier,
        description: testDescription,
        quick_pay: {
          name:
            `TEAZO Automated Sandbox Test ${identifier}`,
          price_money: {
            amount: 100,
            currency: "USD",
          },
          location_id: locationId,
        },
      };

      // Creation is explicitly tracked so cleanup runs even
      // if the response is incomplete or assertions fail.
      creationAttempted = true;

      const response = await sandboxRequest(
        "POST",
        "/v2/online-checkout/payment-links",
        requestBody,
      );

      expect(response.ok).toBe(true);

      const body = (await response.json()) as {
        payment_link?: PaymentLink;
      };

      const link = body.payment_link;

      expect(validLinkId(link?.id)).toBe(true);

      if (!validLinkId(link?.id)) {
        throw new Error(
          "Square returned no usable test checkout link ID.",
        );
      }

      // Track the returned ID before further assertions.
      ownedLinkIds.add(link.id);

      expect(typeof link.order_id).toBe(
        "string",
      );

      expect(link.order_id).toBeTruthy();

      createdOrderId = link.order_id ?? "";

      expect(typeof link.url).toBe(
        "string",
      );

      expect(link.url).toMatch(/^https:\/\//);

      // Never navigate to the hosted payment page
      // or submit any payment information.
      const details = await sandboxRequest(
        "GET",
        `/v2/online-checkout/payment-links/${encodeURIComponent(link.id)}`,
      );

      expect(details.status).toBe(200);

      const saved = (await details.json()) as {
        payment_link?: PaymentLink;
      };

      expect(saved.payment_link).toMatchObject({
        id: link.id,
        order_id: link.order_id,
        description: testDescription,
      });

      // afterEach deletes the test link and verifies that
      // Square canceled its associated sandbox order.
    });
  },
);
