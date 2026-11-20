/**
 * Browser tests for the TEAZO administrator login page.
 *
 * Covers form rendering, HTML validation, credentials,
 * error messages, safe redirects, and mobile usability.
 *
 * NextAuth credentials are mocked. No real administrator
 * account is authenticated or modified.
 *
 * The form helper clears and refills inputs between retries
 * to handle delayed React hydration in Next.js development.
 */

import {
  expect,
  test,
  type Page,
} from "@playwright/test";

// Mock unsuccessful NextAuth authentication and capture the
// submitted credentials for assertions.
async function mockFailedCredentials(page: Page) {
  let submittedBody: URLSearchParams | null = null;

  // Return synthetic authentication providers instead of
  // requesting the actual NextAuth provider configuration.
  await page.route(
    "**/api/auth/providers**",
    async (route) => {
      await route.fulfill({
        json: {
          credentials: {
            id: "credentials",
            name: "Credentials",
            type: "credentials",
          },
          google: {
            id: "google",
            name: "Google",
            type: "oauth",
          },
        },
      });
    },
  );

  // Provide a mock CSRF token for credential submission.
  await page.route(
    "**/api/auth/csrf**",
    async (route) => {
      await route.fulfill({
        json: {
          csrfToken: "test-csrf-token",
        },
      });
    },
  );

  // Reject credentials without contacting a real admin account.
  // Capture the request before sending the mocked response.
  await page.route(
    "**/api/auth/callback/credentials**",
    async (route) => {
      submittedBody = new URLSearchParams(
        route.request().postData() ?? "",
      );

      const origin = new URL(
        route.request().url(),
      ).origin;

      await route.fulfill({
        status: 401,
        json: {
          url:
            `${origin}/login?error=CredentialsSignin`,
        },
      });
    },
  );

  // Allow tests to inspect the intercepted credentials request.
  return {
    submittedBody: () =>
      submittedBody as URLSearchParams | null,
  };
}

// Locate only the login form's authentication error.
//
// Next.js may also render an empty route announcer with
// role="alert", which would make a page-wide alert
// locator ambiguous.
function getLoginError(page: Page) {
  return page
    .locator('form:has(input[name="password"])')
    .getByRole("alert");
}

// Fill both credentials and wait for React to recognize them.
//
// Next.js may initially display server-rendered inputs
// before their React event handlers are attached.
//
// If Playwright fills those inputs too early, the browser
// can retain their values without updating React state.
//
// Clear the inputs before each retry to force new changes
// instead of repeatedly filling the same existing values.
async function fillLoginForm(
  page: Page,
  emailValue: string,
  passwordValue: string,
) {
  const email = page.getByRole("textbox", {
    name: "Email",
  });

  const password = page.getByLabel("Password", {
    exact: true,
  });

  const signIn = page.getByRole("button", {
    name: "SIGN IN",
  });

  // Retry the complete interaction while the page finishes
  // hydration. Each attempt generates fresh input changes.
  await expect(async () => {
    // First clear any values left by a previous attempt.
    await email.fill("");
    await password.fill("");

    // Enter credentials again after clearing both fields.
    await email.fill(emailValue);
    await password.fill(passwordValue);

    // Verify that the browser retained both values.
    await expect(email).toHaveValue(emailValue, {
      timeout: 1_000,
    });

    await expect(password).toHaveValue(passwordValue, {
      timeout: 1_000,
    });

    // React must recognize the completed form before
    // Playwright attempts to submit it.
    await expect(signIn).toBeEnabled({
      timeout: 1_000,
    });
  }).toPass({
    intervals: [100, 250, 500, 1_000],
    timeout: 15_000,
  });
}

test.describe("Admin login browser tests", () => {
  // Confirm that the page displays all required login controls.
  test("renders the login page and controls", async ({
    page,
  }) => {
    await page.goto("/login");

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
    ).toHaveAttribute("type", "password");

    // Submission must initially be disabled.
    await expect(
      page.getByRole("button", {
        name: "SIGN IN",
      }),
    ).toBeDisabled();

    // Google SSO and password recovery should be available.
    await expect(
      page.getByRole("button", {
        name: "CONTINUE WITH GOOGLE",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "SET OR RESET PASSWORD",
      }),
    ).toBeVisible();
  });

  // Verify that both credential fields are required.
  test("requires both login fields before submitting", async ({
    page,
  }) => {
    await page.goto("/login");

    const signIn = page.getByRole("button", {
      name: "SIGN IN",
    });

    await expect(signIn).toBeDisabled();

    // Email alone must not enable submission.
    await page.getByRole("textbox", {
      name: "Email",
    }).fill("admin@example.com");

    await expect(signIn).toBeDisabled();

    // Supplying a password should enable the button.
    await page.getByLabel("Password", {
      exact: true,
    }).fill("TestPassword123");

    await expect(signIn).toBeEnabled();
  });

  // Verify native HTML email validation in Chromium.
  test("uses native browser email validation", async ({
    page,
  }) => {
    await page.goto("/login");

    const email = page.getByRole("textbox", {
      name: "Email",
    });

    await email.fill("not-an-email");

    await page.getByLabel("Password", {
      exact: true,
    }).fill("TestPassword123");

    // Inspect the browser validity state rather than
    // depending on its validation popup text.
    const invalid = await email.evaluate(
      (element) =>
        (element as HTMLInputElement)
          .validity.typeMismatch,
    );

    expect(invalid).toBe(true);
  });

  // Display denied-access feedback for unauthorized Google accounts.
  test("displays denied Google account feedback", async ({
    page,
  }) => {
    await page.goto(
      "/login?error=AccessDenied",
    );

    await expect(
      page.getByRole("alert"),
    ).toHaveText(
      "This Google account does not have admin access. Contact the site owner.",
    );
  });

  // Display a service error when administrator access cannot be verified.
  test("displays authentication service errors", async ({
    page,
  }) => {
    await page.goto(
      "/login?error=ServiceUnavailable",
    );

    await expect(
      page.getByRole("alert"),
    ).toHaveText(
      "We could not verify your access. Please try again shortly.",
    );
  });

  // Verify email normalization, invalid-login feedback,
  // and password clearing after unsuccessful authentication.
  test("normalizes credentials and displays invalid login feedback", async ({
    page,
  }) => {
    const auth = await mockFailedCredentials(page);

    await page.goto("/login");

    // Fill credentials and confirm that React has enabled submission.
    await fillLoginForm(
      page,
      "ADMIN@EXAMPLE.COM",
      "TestPassword123",
    );

    await page.getByRole("button", {
      name: "SIGN IN",
    }).click();

    // Check the form error rather than unrelated Next.js alerts.
    await expect(
      getLoginError(page),
    ).toHaveText("Invalid email or password.");

    // Failed sign-in must clear the entered password.
    await expect(
      page.getByLabel("Password", {
        exact: true,
      }),
    ).toBeEmpty();

    // The email must be normalized before authentication.
    expect(
      auth.submittedBody()?.get("email"),
    ).toBe("admin@example.com");

    // The default destination must be the admin dashboard.
    expect(
      auth.submittedBody()?.get("callbackUrl"),
    ).toBe("/admin");
  });

  // Reject external redirect destinations to prevent
  // users from being sent to an unauthorized website.
  test("rejects an unsafe login destination", async ({
    page,
  }) => {
    const auth = await mockFailedCredentials(page);

    const unsafe = encodeURIComponent(
      "https://example.com/redirect",
    );

    await page.goto(
      `/login?next=${unsafe}`,
    );

    // Enter credentials only after React recognizes input changes.
    await fillLoginForm(
      page,
      "admin@example.com",
      "TestPassword123",
    );

    await page.getByRole("button", {
      name: "SIGN IN",
    }).click();

    await expect(
      getLoginError(page),
    ).toHaveText("Invalid email or password.");

    // Unsafe destinations must fall back to /admin.
    expect(
      auth.submittedBody()?.get("callbackUrl"),
    ).toBe("/admin");
  });

  // Preserve ownership-transfer links with valid-format tokens.
  test("preserves a valid ownership-transfer destination", async ({
    page,
  }) => {
    const auth = await mockFailedCredentials(page);

    const destination =
      `/ownership-transfer?token=${"A".repeat(43)}`;

    await page.goto(
      `/login?next=${encodeURIComponent(destination)}`,
    );

    // Wait until both fields are reflected in React form state.
    await fillLoginForm(
      page,
      "admin@example.com",
      "TestPassword123",
    );

    await page.getByRole("button", {
      name: "SIGN IN",
    }).click();

    await expect(
      getLoginError(page),
    ).toHaveText("Invalid email or password.");

    // A valid transfer destination must remain unchanged.
    expect(
      auth.submittedBody()?.get("callbackUrl"),
    ).toBe(destination);
  });

  // Check that login controls remain visible at a mobile viewport.
  test("keeps login controls available on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await page.goto("/login");

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

    await expect(
      page.getByRole("button", {
        name: "SIGN IN",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "CONTINUE WITH GOOGLE",
      }),
    ).toBeVisible();
  });
});
