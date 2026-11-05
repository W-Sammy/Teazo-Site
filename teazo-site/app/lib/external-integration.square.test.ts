/**
 * Guarded, read-only tests for Square sandbox connectivity.
 *
 * Calls only the fixed Square sandbox API endpoint.
 * Verifies location discovery and catalog item reads.
 *
 * Requires explicit external-test and Square read-only flags.
 * Production Square configuration is rejected.
 *
 * No orders, checkout links, payments, or catalog changes
 * are created. Credentials are never logged.
 */

import {
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { SQUARE_API_VERSION } from "./square-option-rules";

import {
  requireSquareSandbox,
} from "@/test/external-integration-guard";

// Enable this suite only for explicitly requested sandbox reads.
const RUN_SANDBOX =
  process.env.TEAZO_EXTERNAL_TESTS === "1" &&
  process.env.TEAZO_SQUARE_READONLY_TESTS === "1";

// A fixed endpoint prevents a configuration variable from
// redirecting these tests to the production Square API.
const SQUARE_SANDBOX_URL =
  "https://connect.squareupsandbox.com";

let sandboxToken = "";

// Only GET requests are supported by this test helper.
async function sandboxGet(path: string): Promise<Response> {
  const target = new URL(path, SQUARE_SANDBOX_URL);

  // Refuse any URL outside the designated sandbox host.
  if (target.origin !== SQUARE_SANDBOX_URL) {
    throw new Error("Square test target is not the sandbox.");
  }

  return fetch(target, {
    method: "GET",
    headers: {
      authorization: `Bearer ${sandboxToken}`,
      "Square-Version": SQUARE_API_VERSION,
      accept: "application/json",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

describe.skipIf(!RUN_SANDBOX)(
  "Square sandbox read-only integration",
  () => {
    beforeAll(() => {
      // Require an explicit sandbox selection for live tests,
      // even though the application normally defaults to sandbox.
      if (process.env.SQUARE_ENVIRONMENT !== "sandbox") {
        throw new Error(
          "Live Square tests require SQUARE_ENVIRONMENT=sandbox.",
        );
      }

      requireSquareSandbox();

      sandboxToken =
        process.env.SQUARE_ACCESS_TOKEN ?? "";
    });

    it("retrieves available Square sandbox locations", async () => {
      const response = await sandboxGet("/v2/locations");

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        locations?: Array<{
          id?: string;
          status?: string;
        }>;
      };

      expect(Array.isArray(body.locations)).toBe(true);

      expect(
        body.locations?.some(
          (location) => typeof location.id === "string",
        ),
      ).toBe(true);
    });

    it("retrieves sandbox catalog items without modifying them", async () => {
      const response = await sandboxGet(
        "/v2/catalog/list?types=ITEM",
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        objects?: Array<{
          id?: string;
          type?: string;
        }>;
      };

      // An empty catalog is valid for a new sandbox.
      expect(
        body.objects === undefined ||
        Array.isArray(body.objects),
      ).toBe(true);

      for (const item of body.objects ?? []) {
        expect(item.type).toBe("ITEM");
        expect(typeof item.id).toBe("string");
      }
    });
  },
);
