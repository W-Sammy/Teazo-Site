/**
 * Browser tests for the TEAZO password setup/reset UI.
 *
 * Covers dialog behavior, recovery requests, setup/reset
 * validation, invalid tokens, API errors, and mobile layout.
 *
 * All password APIs are mocked. Tests never send emails
 * or update real administrator credentials.
 */

import {
  expect,
  test,
} from "@playwright/test";

// Use a correctly formatted 43-character token for setup/reset tests.
const TOKEN = "A".repeat(43);

test.describe("Admin password-flow browser tests", () => {
  // Verify the dialog can be opened and dismissed through the UI.
  test("opens and closes the password request dialog", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByRole("button", {
      name: "SET OR RESET PASSWORD",
    }).click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByRole("heading", {
        name: "Set or reset your password",
      }),
    ).toBeVisible();

    await dialog.getByRole("button", {
      name: "Close password dialog",
    }).click();

    await expect(dialog).not.toBeVisible();
  });

  // Intercept password recovery requests and inspect email normalization.
  // A successful mock response must display the generic confirmation.
  test("submits a normalized password-link request", async ({
    page,
  }) => {
    let requestBody: unknown = null;

    // Prevent real email delivery by mocking the request endpoint.
    await page.route(
      "**/api/admin/password/request",
      async (route) => {
        requestBody =
          route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          json: {
            message:
              "If this email is eligible, a password link will be sent shortly.",
          },
        });
      },
    );

    await page.goto("/login");

    await page.getByRole("button", {
      name: "SET OR RESET PASSWORD",
    }).click();

    const dialog = page.getByRole("dialog");

    await dialog.getByRole("textbox", {
      name: "Email",
    }).fill("ADMIN@EXAMPLE.COM");

    await dialog.getByRole("button", {
      name: "Send email link",
    }).click();

    await expect(
      dialog.getByRole("status"),
    ).toContainText(
      "If this email is eligible",
    );

    // The email must be normalized before reaching the API.
    expect(requestBody).toEqual({
      email: "admin@example.com",
    });
  });

  // Simulate HTTP 429 to verify password-request rate-limit feedback.
  test("displays password request rate-limit errors", async ({
    page,
  }) => {
    await page.route(
      "**/api/admin/password/request",
      async (route) => {
        await route.fulfill({
          status: 429,
          json: {
            error:
              "Too many requests. Try again in 15 minutes.",
          },
        });
      },
    );

    await page.goto("/login");

    await page.getByRole("button", {
      name: "SET OR RESET PASSWORD",
    }).click();

    const dialog = page.getByRole("dialog");

    await dialog.getByRole("textbox", {
      name: "Email",
    }).fill("admin@example.com");

    await dialog.getByRole("button", {
      name: "Send email link",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Too many requests. Try again in 15 minutes.",
    );
  });

  // Abort the request to simulate a connection or server failure.
  // The UI should show a user-friendly message rather than raw errors.
  test("displays network errors during a password request", async ({
    page,
  }) => {
    await page.route(
      "**/api/admin/password/request",
      async (route) => {
        await route.abort("failed");
      },
    );

    await page.goto("/login");

    await page.getByRole("button", {
      name: "SET OR RESET PASSWORD",
    }).click();

    const dialog = page.getByRole("dialog");

    await dialog.getByRole("textbox", {
      name: "Email",
    }).fill("admin@example.com");

    await dialog.getByRole("button", {
      name: "Send email link",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Unable to complete the request. Check your connection and try again.",
    );
  });

  // Reject passwords shorter than the six-character minimum.
  // No password-completion API call should occur.
  test("rejects a password shorter than six characters", async ({
    page,
  }) => {
    let requestCount = 0;

    // Count unexpected requests instead of updating actual credentials.
    await page.route(
      "**/api/admin/password/complete",
      async (route) => {
        requestCount += 1;

        await route.fulfill({
          status: 400,
          json: {
            error: "Unexpected submission.",
          },
        });
      },
    );

    await page.goto(
      `/login?passwordAction=reset&token=${TOKEN}`,
    );

    const dialog = page.getByRole("dialog");

    await dialog.getByLabel(
      "New password",
    ).fill("short");

    await dialog.getByLabel(
      "Confirm password",
    ).fill("short");

    await dialog.getByRole("button", {
      name: "Save password",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Use a password between 6 and 128 characters.",
    );

    // Client-side validation must stop the request.
    expect(requestCount).toBe(0);
  });

  // Require matching password and confirmation values.
  // Invalid confirmation must be rejected before reaching the backend.
  test("rejects mismatched passwords", async ({
    page,
  }) => {
    let requestCount = 0;

    await page.route(
      "**/api/admin/password/complete",
      async (route) => {
        requestCount += 1;

        await route.fulfill({
          status: 400,
          json: {
            error: "Unexpected submission.",
          },
        });
      },
    );

    await page.goto(
      `/login?passwordAction=reset&token=${TOKEN}`,
    );

    const dialog = page.getByRole("dialog");

    await dialog.getByLabel(
      "New password",
    ).fill("Password123");

    await dialog.getByLabel(
      "Confirm password",
    ).fill("DifferentPassword123");

    await dialog.getByRole("button", {
      name: "Save password",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "Your passwords do not match.",
    );

    // Password mismatch must never trigger an API submission.
    expect(requestCount).toBe(0);
  });

  // Exercise both invitation setup and existing-account reset workflows.
  // Verify purpose, token, and password data sent to the mocked API.
  for (const purpose of ["setup", "reset"] as const) {
    test(`submits a valid ${purpose} password request`, async ({
      page,
    }) => {
      let requestBody: unknown = null;

      // Mock a successful password update without touching the database.
      await page.route(
        "**/api/admin/password/complete",
        async (route) => {
          requestBody =
            route.request().postDataJSON();

          await route.fulfill({
            status: 200,
            json: {
              message:
                "Your password has been saved. Sign in to continue.",
            },
          });
        },
      );

      await page.goto(
        `/login?passwordAction=${purpose}&token=${TOKEN}`,
      );

      const dialog = page.getByRole("dialog");

      await dialog.getByLabel(
        "New password",
      ).fill("NewPassword123");

      await dialog.getByLabel(
        "Confirm password",
      ).fill("NewPassword123");

      await dialog.getByRole("button", {
        name: "Save password",
      }).click();

      await expect(
        dialog.getByRole("status"),
      ).toHaveText(
        "Your password has been saved. Sign in to continue.",
      );

      // The request must retain the original setup/reset purpose.
      expect(requestBody).toEqual({
        token: TOKEN,
        purpose,
        password: "NewPassword123",
        confirmPassword: "NewPassword123",
      });

      // Completing the workflow must allow returning to the login page.
      await dialog.getByRole("button", {
        name: "Back to sign in",
      }).click();

      await expect(dialog).not.toBeVisible();
    });
  }

  // Simulate an invalid or expired token returned by the backend.
  // The user should be able to request a replacement password link.
  test("offers recovery when a password token is invalid", async ({
    page,
  }) => {
    await page.route(
      "**/api/admin/password/complete",
      async (route) => {
        await route.fulfill({
          status: 400,
          json: {
            error:
              "This password link is invalid or has expired.",
            code: "INVALID_TOKEN",
          },
        });
      },
    );

    await page.goto(
      `/login?passwordAction=reset&token=${TOKEN}`,
    );

    const dialog = page.getByRole("dialog");

    await dialog.getByLabel(
      "New password",
    ).fill("NewPassword123");

    await dialog.getByLabel(
      "Confirm password",
    ).fill("NewPassword123");

    await dialog.getByRole("button", {
      name: "Save password",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toHaveText(
      "This password link is invalid or has expired.",
    );

    // Following recovery should remove the rejected token from the URL.
    await dialog.getByRole("button", {
      name: "Request another link",
    }).click();

    await expect(page).toHaveURL(
      /\/login\?passwordAction=reset$/,
    );
  });

  // Test the password dialog at a typical mobile viewport.
  // Ensure the dialog, email field, and submit button stay accessible.
  test("keeps the password dialog usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await page.goto("/login");

    await page.getByRole("button", {
      name: "SET OR RESET PASSWORD",
    }).click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByRole("textbox", {
        name: "Email",
      }),
    ).toBeVisible();

    await expect(
      dialog.getByRole("button", {
        name: "Send email link",
      }),
    ).toBeVisible();
  });
});
