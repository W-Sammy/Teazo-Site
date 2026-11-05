/**
 * Browser regressions for Teazo ownership-transfer invitation links.
 *
 * Tests the real ownership-transfer server page and login handoff
 * using a fresh, unauthenticated Chromium browser context.
 *
 * Covers malformed and duplicate tokens, safe login redirects,
 * destination preservation, no automatic acceptance, privacy
 * metadata, and mobile entry.
 *
 * All tokens are synthetic. No valid administrator account is
 * authenticated, and no ownership-transfer decision is submitted.
 */

import {
  expect,
  test,
} from "@playwright/test";

// Synthetic base64url tokens matching the expected 43-character format.
const VALID_TOKEN = "A".repeat(43);
const OTHER_TOKEN = "B".repeat(43);

const TRANSFER_PATH =
  `/ownership-transfer?token=${VALID_TOKEN}`;

const EXPECTED_DESTINATION =
  `/ownership-transfer?token=${VALID_TOKEN}`;

// Read the validated login destination after a server redirect.
function loginDestination(url: string): string | null {
  return new URL(url).searchParams.get("next");
}

test.describe("Ownership-transfer browser entry", () => {
  // Invalid tokens must be rejected before authentication or
  // any ownership-transfer review/decision becomes available.
  const invalidLinks = [
    {
      label: "missing token",
      path: "/ownership-transfer",
    },
    {
      label: "empty token",
      path: "/ownership-transfer?token=",
    },
    {
      label: "short token",
      path: "/ownership-transfer?token=short",
    },
    {
      label: "oversized token",
      path:
        `/ownership-transfer?token=${"A".repeat(44)}`,
    },
    {
      label: "invalid token characters",
      path: "/ownership-transfer?token=invalid%2Ftoken",
    },
    {
      label: "multiple token parameters",
      path:
        `/ownership-transfer?token=${VALID_TOKEN}&token=${OTHER_TOKEN}`,
    },
  ];

  for (const entry of invalidLinks) {
    test(`rejects ${entry.label} before authentication`, async ({
      page,
    }) => {
      await page.goto(entry.path);

      await expect(
        page.getByRole("heading", {
          name: "Invalid ownership transfer link",
        }),
      ).toBeVisible();

      await expect(
        page.getByText(
          /This link is missing or invalid/,
        ),
      ).toBeVisible();

      // Invalid links must not expose decision controls.
      await expect(
        page.getByRole("button", {
          name: "Accept Ownership",
        }),
      ).toHaveCount(0);

      // Invalid links stay on the explanatory page instead
      // of redirecting to a login or exposing transfer data.
      expect(
        new URL(page.url()).pathname,
      ).toBe("/ownership-transfer");
    });
  }

  test("redirects a logged-out recipient to login with the original transfer destination", async ({
    page,
  }) => {
    await page.goto(TRANSFER_PATH);

    await expect(
      page.getByRole("heading", {
        name: "ADMIN PORTAL",
      }),
    ).toBeVisible();

    expect(
      new URL(page.url()).pathname,
    ).toBe("/login");

    // The login destination must retain the exact invitation
    // token so the recipient can resume after signing in.
    expect(loginDestination(page.url())).toBe(
      EXPECTED_DESTINATION,
    );

    // A logged-out recipient cannot accept ownership.
    await expect(
      page.getByRole("button", {
        name: "Accept Ownership",
      }),
    ).toHaveCount(0);
  });

  test("does not review or accept an offer automatically during the login handoff", async ({
    page,
  }) => {
    const transferRequests: string[] = [];

    // Observe requests without contacting a transfer API ourselves.
    page.on("request", (request) => {
      if (
        request.url().includes(
          "/api/admin/ownership-transfer/",
        )
      ) {
        transferRequests.push(request.url());
      }
    });

    await page.goto(TRANSFER_PATH);

    await expect(
      page.getByRole("heading", {
        name: "ADMIN PORTAL",
      }),
    ).toBeVisible();

    // A simple invitation visit must not review an offer
    // as another account or submit an ownership decision.
    expect(transferRequests).toEqual([]);

    expect(loginDestination(page.url())).toBe(
      EXPECTED_DESTINATION,
    );
  });

  test("does not allow extra query parameters to alter the login destination", async ({
    page,
  }) => {
    await page.goto(
      `${TRANSFER_PATH}&role=owner&next=https%3A%2F%2Fexample.invalid`,
    );

    await expect(
      page.getByRole("heading", {
        name: "ADMIN PORTAL",
      }),
    ).toBeVisible();

    // The server constructs the destination from the
    // validated token, not from arbitrary query parameters.
    expect(loginDestination(page.url())).toBe(
      EXPECTED_DESTINATION,
    );

    expect(
      new URL(page.url()).searchParams.get("role"),
    ).toBeNull();
  });

  test("marks ownership-transfer links as private and non-indexable", async ({
    page,
  }) => {
    await page.goto(
      "/ownership-transfer?token=invalid",
    );

    await expect(
      page.getByRole("heading", {
        name: "Invalid ownership transfer link",
      }),
    ).toBeVisible();

    // Invitation pages should not appear in search indexes.
    await expect(
      page.locator('meta[name="robots"]'),
    ).toHaveAttribute(
      "content",
      /noindex/,
    );

    // Do not send invitation URLs as referrers to other sites.
    await expect(
      page.locator('meta[name="referrer"]'),
    ).toHaveAttribute(
      "content",
      "no-referrer",
    );
  });

  test("preserves the invitation destination on a mobile browser", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await page.goto(TRANSFER_PATH);

    await expect(
      page.getByRole("heading", {
        name: "ADMIN PORTAL",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("textbox", {
        name: "Email",
      }),
    ).toBeVisible();

    await expect(
      page.getByLabel("Password", {
        exact: true,
      }),
    ).toBeVisible();

    expect(loginDestination(page.url())).toBe(
      EXPECTED_DESTINATION,
    );
  });
});
