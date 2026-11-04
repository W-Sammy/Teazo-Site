/**
 * Browser tests for the public TEAZO Contact Form.
 *
 * Covers form rendering, required fields, browser validation,
 * field limits, honeypot configuration, Turnstile failures,
 * recovery feedback, pending submissions, and mobile layout.
 *
 * Cloudflare Turnstile is replaced with a browser mock.
 * Contact form POST requests are intercepted before reaching
 * the server, preventing database writes and email delivery.
 *
 * Uses the localhost origin configured in playwright.config.ts.
 */

import {
  expect,
  test,
  type Page,
} from "@playwright/test";

// Provide a local replacement for Cloudflare Turnstile.
//
// The real Turnstile script performs external network requests.
// These tests need to verify the Contact Form's UI behavior
// without depending on Cloudflare or real verification tokens.
async function mockTurnstile(page: Page) {
  // Install the fake API before application JavaScript executes.
  await page.addInitScript(() => {
    type TestWindow = Window & {
      __contactTurnstileControls?: {
        fail: () => void;
        recover: () => void;
      };
    };

    const testWindow = window as TestWindow;

    // The application checks window.turnstile when mounting.
    // Supply the same methods used by its React widget.
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: {
        render(
          container: HTMLElement,
          options: Record<string, unknown>,
        ) {
          // Simulate the hidden response field normally
          // inserted by the Cloudflare widget.
          const input = document.createElement("input");

          input.type = "hidden";
          input.name = "cf-turnstile-response";
          input.value = "mock-contact-token";

          container.appendChild(input);

          // Expose controlled callbacks so tests can
          // simulate a failed or recovered security check.
          testWindow.__contactTurnstileControls = {
            fail: () => {
              const callback = options["error-callback"];

              if (typeof callback === "function") {
                callback();
              }
            },

            recover: () => {
              const callback = options.callback;

              if (typeof callback === "function") {
                callback("mock-contact-token");
              }
            },
          };

          return "mock-contact-widget";
        },

        // These operations are needed when the component
        // resets or removes a previous Turnstile widget.
        reset() {},
        remove() {},
      },
    });
  });

  // Prevent the actual Cloudflare script from replacing
  // the mock or initiating an external verification flow.
  await page.route(
    "**/turnstile/v0/api.js**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "// Turnstile mocked for browser testing.",
      });
    },
  );
}

// Find the public Contact Form without relying on layout classes.
// The form is identified by its first-name input.
function getContactForm(page: Page) {
  return page.locator(
    'form:has(input[name="firstName"])',
  );
}

// Populate the fields required by the public Contact Form.
async function fillRequiredFields(page: Page) {
  await page.getByRole("textbox", {
    name: "First name",
  }).fill("Test");

  await page.getByRole("textbox", {
    name: "Email",
  }).fill("visitor@example.invalid");

  await page.getByRole("textbox", {
    name: "Message",
  }).fill("A browser test contact message.");

  // Confirm that the browser has retained the entered data.
  await expect(
    page.getByRole("textbox", {
      name: "First name",
    }),
  ).toHaveValue("Test");

  await expect(
    page.getByRole("textbox", {
      name: "Email",
    }),
  ).toHaveValue("visitor@example.invalid");

  await expect(
    page.getByRole("textbox", {
      name: "Message",
    }),
  ).toHaveValue("A browser test contact message.");
}

// Install the Turnstile mock before every browser test.
// Each Playwright test receives a separate browser page.
test.beforeEach(async ({ page }) => {
  await mockTurnstile(page);
});

test.describe("Public Contact Form browser tests", () => {
  // Verify the form and its interactive controls are rendered.
  test("renders the contact form and its fields", async ({
    page,
  }) => {
    await page.goto("/contact");

    await expect(
      getContactForm(page),
    ).toBeVisible();

    for (const name of [
      "First name",
      "Last name",
      "Email",
      "Subject",
      "Message",
    ]) {
      await expect(
        page.getByRole("textbox", { name }),
      ).toBeVisible();
    }

    await expect(
      page.getByRole("button", {
        name: "SUBMIT",
      }),
    ).toBeVisible();
  });

  // Confirm browser validation rejects missing mandatory fields.
  // No request is sent because the form is not submitted.
  test("requires first name, email, and message", async ({
    page,
  }) => {
    await page.goto("/contact");

    const form = getContactForm(page);

    // An empty form must fail native browser validation.
    expect(
      await form.evaluate(
        (element) =>
          (element as HTMLFormElement).checkValidity(),
      ),
    ).toBe(false);

    // Enter the three required fields.
    await fillRequiredFields(page);

    // Last name and subject are optional.
    await expect(
      page.getByRole("textbox", {
        name: "Last name",
      }),
    ).toHaveValue("");

    await expect(
      page.getByRole("textbox", {
        name: "Subject",
      }),
    ).toHaveValue("");

    // All required browser-side values are now valid.
    expect(
      await form.evaluate(
        (element) =>
          (element as HTMLFormElement).checkValidity(),
      ),
    ).toBe(true);
  });

  // Check HTML email validation using the browser's actual
  // validity state instead of browser-specific popup wording.
  test("rejects an invalid email format", async ({
    page,
  }) => {
    await page.goto("/contact");

    const email = page.getByRole("textbox", {
      name: "Email",
    });

    await email.fill("invalid-email");

    const hasTypeMismatch = await email.evaluate(
      (element) =>
        (element as HTMLInputElement)
          .validity.typeMismatch,
    );

    expect(hasTypeMismatch).toBe(true);
  });

  // Ensure the browser form applies the same field limits
  // as the Contact Form component.
  test("enforces configured field length attributes", async ({
    page,
  }) => {
    await page.goto("/contact");

    const fields = [
      ["First name", "100"],
      ["Last name", "100"],
      ["Email", "254"],
      ["Subject", "200"],
      ["Message", "5000"],
    ] as const;

    for (const [name, maximum] of fields) {
      await expect(
        page.getByRole("textbox", { name }),
      ).toHaveAttribute("maxlength", maximum);
    }
  });

  // Verify the bot-detection field is present but excluded
  // from normal keyboard navigation.
  test("keeps the honeypot out of keyboard navigation", async ({
    page,
  }) => {
    await page.goto("/contact");

    const honeypot = getContactForm(page).locator(
      'input[name="company"]',
    );

    await expect(honeypot).toHaveCount(1);

    await expect(honeypot).toHaveAttribute(
      "tabindex",
      "-1",
    );

    await expect(honeypot).toHaveAttribute(
      "autocomplete",
      "off",
    );

    // The honeypot's container is hidden from
    // assistive technology using aria-hidden.
    await expect(
      honeypot.locator("..").locator(".."),
    ).toHaveAttribute("aria-hidden", "true");
  });

  // Simulate the security widget reporting a failure.
  // The visitor should receive a visible fallback message.
  test("displays a warning when Turnstile fails", async ({
    page,
  }) => {
    await page.goto("/contact");

    // Wait until the widget has registered its callbacks.
    await expect.poll(async () => {
      return page.evaluate(() => {
        const target = window as Window & {
          __contactTurnstileControls?: object;
        };

        return Boolean(target.__contactTurnstileControls);
      });
    }).toBe(true);

    // Trigger the mock's error callback.
    await page.evaluate(() => {
      const target = window as Window & {
        __contactTurnstileControls?: {
          fail: () => void;
        };
      };

      target.__contactTurnstileControls?.fail();
    });

    await expect(
      page.getByText(
        /The security check couldn't load/,
      ),
    ).toBeVisible();

    // The warning must contain an alternate contact link.
    await expect(
      page.getByRole("link", {
        name: "teazosf@hotmail.com",
      }).last(),
    ).toHaveAttribute(
      "href",
      "mailto:teazosf@hotmail.com",
    );
  });

  // A recovered security check must remove the failure
  // message without requiring the user to reload the page.
  test("clears the warning when Turnstile recovers", async ({
    page,
  }) => {
    await page.goto("/contact");

    await expect.poll(async () => {
      return page.evaluate(() => {
        const target = window as Window & {
          __contactTurnstileControls?: object;
        };

        return Boolean(target.__contactTurnstileControls);
      });
    }).toBe(true);

    // First simulate a Turnstile failure.
    await page.evaluate(() => {
      const target = window as Window & {
        __contactTurnstileControls?: {
          fail: () => void;
        };
      };

      target.__contactTurnstileControls?.fail();
    });

    await expect(
      page.getByText(
        /The security check couldn't load/,
      ),
    ).toBeVisible();

    // Simulate successful verification afterward.
    await page.evaluate(() => {
      const target = window as Window & {
        __contactTurnstileControls?: {
          recover: () => void;
        };
      };

      target.__contactTurnstileControls?.recover();
    });

    await expect(
      page.getByText(
        /The security check couldn't load/,
      ),
    ).toHaveCount(0);
  });

  // Verify that mobile visitors can reach and interact
  // with the required contact fields.
  test("keeps the contact form usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await page.goto("/contact");

    await expect(
      getContactForm(page),
    ).toBeVisible();

    await fillRequiredFields(page);

    await expect(
      page.getByRole("button", {
        name: "SUBMIT",
      }),
    ).toBeVisible();
  });

  // Verify the pending state while preventing the contact
  // action from reaching the actual Next.js server.
  //
  // We intercept the browser's POST request and hold it.
  // This allows testing SENDING... without storing a
  // message, verifying Turnstile, or sending email.
  test("disables submission while a request is pending", async ({
    page,
  }) => {
    let releaseRequest: () => void = () => {};
    let interceptedRequests = 0;

    const heldRequest = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    // Block application POST requests before they reach
    // the server. GET requests must remain unaffected.
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (
        request.method() === "POST" &&
        url.origin === "http://localhost:3000"
      ) {
        interceptedRequests += 1;

        // Keep the request pending until the test releases it.
        await heldRequest;

        // Simulate a connection failure after testing.
        await route.abort("failed").catch(() => {});
        return;
      }

      await route.continue();
    });

    await page.goto("/contact");
    await fillRequiredFields(page);

    // Do not wait for the submission to complete because
    // the network request is intentionally held open.
    const submission = page.getByRole("button", {
      name: "SUBMIT",
    }).click();

    try {
      // Verify the browser attempted a POST request.
      await expect.poll(
        () => interceptedRequests,
      ).toBeGreaterThan(0);

      // React should display the pending submission state.
      const pendingButton = page.getByRole("button", {
        name: "SENDING...",
      });

      await expect(pendingButton).toBeVisible();
      await expect(pendingButton).toBeDisabled();
    } finally {
      // Always release the intercepted request, even
      // when an assertion fails, to avoid leaving it open.
      releaseRequest();

      await submission.catch(() => {});
    }
  });
});
