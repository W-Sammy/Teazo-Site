/**
 * Browser tests for TEAZO customization, cart, and checkout.
 *
 * Covers cart totals, quantity changes, item editing,
 * modifier prices, checkout validation, rejected items,
 * retry behavior, pending requests, successful mocked
 * checkout navigation, and mobile usability.
 *
 * Test items use synthetic Square IDs. Checkout requests
 * and external checkout navigation are intercepted, so no
 * orders, payment sessions, or charges are created.
 *
 * Uses the verified localhost Playwright development origin.
 */

import {
  expect,
  test,
  type Page,
} from "@playwright/test";

// Store a synthetic item matching the real CartItem schema.
const CART_ITEM = {
  cartItemId: "browser-cart-1",
  catalogObjectId: "ITEM1",
  variationId: "VAR1",
  variationName: "Regular",
  name: "Classic Milk Tea",
  basePriceCents: 500,
  imageUrl: null,
  selectedModifiers: [],
  quantity: 2,
  itemTotalCents: 1000,
};

// The Customizer must receive live-looking but synthetic
// variation and modifier information for editing.
const AVAILABLE = {
  available: true,
  locationId: "TEST-LOCATION",
  reasons: [],
};

const CATALOG_ITEM = {
  catalogObjectId: "ITEM1",
  name: "Classic Milk Tea",
  description: "A test drink",
  variationId: "VAR1",
  priceCents: 500,
  currency: "USD",
  imageUrl: null,
  categories: [
    { id: "CAT1", name: "Milk Tea" },
  ],
  availability: AVAILABLE,
  variations: [
    {
      id: "VAR1",
      name: "Regular",
      priceCents: 500,
      availability: AVAILABLE,
    },
    {
      id: "VAR2",
      name: "Large",
      priceCents: 650,
      availability: AVAILABLE,
    },
  ],
  modifiers: [
    {
      id: "TOPPINGS",
      name: "Toppings",
      minSelectedModifiers: 0,
      maxSelectedModifiers: 2,
      options: [
        {
          id: "BOBA",
          name: "Boba",
          priceCents: 75,
          availability: AVAILABLE,
        },
        {
          id: "JELLY",
          name: "Jelly",
          priceCents: 50,
          availability: AVAILABLE,
        },
      ],
    },
  ],
};

// Use a predictable, open test schedule so the checkout
// UI does not depend on current store hours.
const WEEKDAYS = [
  "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
];

const WEBSITE_CONTENT = {
  logo: "/TEAZO_logo.svg",
  story: "",
  socialLinks: [],
  contactFormEnabled: true,
  onlineOrderingEnabled: true,
  hours: WEEKDAYS.map((day) => ({
    day,
    start: 0,
    end: 24,
    closed: false,
  })),
  holidays: [],
  address: {
    businessName: "TEAZO",
    streetAddress: "1050 Taraval St",
    locality: "San Francisco, CA 94116",
    phone: "+1 (415) 748-7398",
    email: "contact@example.invalid",
    mapQuery: "1050 Taraval St, San Francisco, CA",
  },
};

// Install an isolated browser cart before React hydrates.
// This avoids using or changing an actual customer's cart.
async function seedTestCart(page: Page) {
  await page.addInitScript((item) => {
    window.localStorage.setItem(
      "teazo_cart",
      JSON.stringify([item]),
    );
  }, CART_ITEM);
}

// Replace Turnstile's API with a deterministic test widget.
//
// A token is supplied when the widget renders or resets.
// No requests are made to Cloudflare verification services.
async function mockTurnstile(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<
      string,
      Record<string, unknown>
    >();

    let nextId = 0;

    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: {
        render(
          container: HTMLElement,
          options: Record<string, unknown>,
        ) {
          const id = `test-widget-${++nextId}`;
          callbacks.set(id, options);

          const input = document.createElement("input");
          input.type = "hidden";
          input.name = "cf-turnstile-response";
          input.value = "test-checkout-token";
          container.appendChild(input);

          // Notify the React component asynchronously
          // after the widget has been mounted.
          queueMicrotask(() => {
            const callback = options.callback;
            if (typeof callback === "function") {
              callback("test-checkout-token");
            }
          });

          return id;
        },

        reset(id: string) {
          const callback = callbacks.get(id)?.callback;

          if (typeof callback === "function") {
            queueMicrotask(() => {
              callback("refreshed-checkout-token");
            });
          }
        },

        remove(id: string) {
          callbacks.delete(id);
        },
      },
    });
  });

  // Prevent the Cloudflare script from replacing the fake widget.
  await page.route(
    "**/turnstile/v0/api.js**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "// Mocked Turnstile for checkout browser tests.",
      });
    },
  );
}

// Mock the storefront dependencies and block checkout
// by default. Individual tests override checkout errors
// or return a synthetic successful response.
async function mockStorefront(page: Page) {
  await seedTestCart(page);
  await mockTurnstile(page);

  // Provide the real CartDrawer with known hours.
  await page.route(
    "**/api/website-content",
    async (route) => {
      await route.fulfill({
        json: WEBSITE_CONTENT,
      });
    },
  );

  // Allow editing the synthetic item through the real
  // Customizer without contacting Square.
  await page.route(
    "**/api/square/products/ITEM1",
    async (route) => {
      await route.fulfill({
        json: CATALOG_ITEM,
      });
    },
  );

  // Fail closed if a test unexpectedly attempts checkout.
  // This prevents requests from reaching a live API.
  await page.route(
    "**/api/checkout",
    async (route) => {
      await route.fulfill({
        status: 503,
        json: {
          error: "Test checkout unavailable.",
        },
      });
    },
  );
}

// Open the Shopping Bag using the real website navigation.
async function openBag(page: Page) {
  await page.goto("/contact");

  const trigger = page.getByRole("button", {
    name: /Open Cart/,
  });

  await expect(trigger).toBeVisible();
  await trigger.click();

  const bag = page.getByRole("dialog", {
    name: "Shopping Bag",
  });

  await expect(bag).toBeVisible();

  return bag;
}

// Enter synthetic customer information. Test-only email
// addresses and phone numbers are never sent to Square.
async function fillCheckoutDetails(page: Page) {
  const bag = page.getByRole("dialog", {
    name: "Shopping Bag",
  });

  await bag.getByLabel(/Full Name/).fill(
    "Test Customer",
  );

  await bag.getByLabel(/Mobile Phone/).fill(
    "(415) 555-0100",
  );

  await bag.getByLabel(/Email Address/).fill(
    "customer@example.invalid",
  );

  // Scheduled pickup avoids depending on the current
  // time or whether ASAP ordering is currently open.
  await bag.getByRole("button", {
    name: "Schedule Later",
  }).click();

  // Wait for scheduling and the simulated Turnstile
  // token to make checkout available.
  await expect(
    bag.getByRole("button", {
      name: /Proceed to Checkout/,
    }),
  ).toBeEnabled();

  return bag;
}

test.beforeEach(async ({ page }) => {
  await mockStorefront(page);
});

test.describe("Customizer, Cart, and Checkout browser tests", () => {
  // Verify stored cart items appear in the actual
  // Shopping Bag with correct quantities and totals.
  test("displays cart items and subtotal", async ({
    page,
  }) => {
    const bag = await openBag(page);

    await expect(
      bag.getByText("Classic Milk Tea"),
    ).toBeVisible();

    await expect(
      bag.getByText("Subtotal (2 items)"),
    ).toBeVisible();

    await expect(
      bag.getByText("$10.00", {
        exact: true,
      }).first(),
    ).toBeVisible();
  });

  // Quantity changes must immediately update the
  // displayed subtotal without contacting checkout.
  test("updates totals when increasing quantity", async ({
    page,
  }) => {
    const bag = await openBag(page);

    await bag.getByRole("button", {
      name: "Increase quantity",
    }).click();

    await expect(
      bag.getByText("Subtotal (3 items)"),
    ).toBeVisible();

    await expect(
      bag.getByText("$15.00", {
        exact: true,
      }).first(),
    ).toBeVisible();
  });

  // Editing an item should load the available Square
  // choices and show an updated live price.
  test("updates customization prices in the edit modal", async ({
    page,
  }) => {
    const bag = await openBag(page);

    await bag.getByRole("button", {
      name: "Edit",
    }).click();

    const customizer = page.getByRole("dialog", {
      name: /Edit: Classic Milk Tea/,
    });

    await expect(customizer).toBeVisible();

    const large = customizer.getByRole("radio", {
      name: /Large/,
    });

    await expect(large).toBeEnabled();
    await large.click();

    // Quantity remains two when editing an existing line.
    // The larger variation costs $6.50 each.
    await expect(
      customizer.getByRole("button", {
        name: /Update Drink/,
      }),
    ).toContainText("$13.00");

    await customizer.getByRole("checkbox", {
      name: "Boba",
    }).click();

    // Topping adds $0.75 per drink:
    // ($6.50 + $0.75) × 2 = $14.50.
    await expect(
      customizer.getByRole("button", {
        name: /Update Drink/,
      }),
    ).toContainText("$14.50");
  });

  // Empty required customer details must stop
  // checkout before the server is contacted.
  test("validates checkout customer details", async ({
    page,
  }) => {
    let checkoutRequests = 0;

    await page.route(
      "**/api/checkout",
      async (route) => {
        checkoutRequests += 1;

        await route.fulfill({
          status: 400,
          json: {
            error: "Unexpected checkout request.",
          },
        });
      },
    );

    const bag = await openBag(page);

    await bag.getByRole("button", {
      name: "Schedule Later",
    }).click();

    const checkout = bag.getByRole("button", {
      name: /Proceed to Checkout/,
    });

    await expect(checkout).toBeEnabled();

    await checkout.click();

    await expect(
      bag.getByText(
        "Please complete the required contact and pickup details above.",
      ),
    ).toBeVisible();

    expect(checkoutRequests).toBe(0);
  });

  // A rejected item must remain in the cart with a
  // visible explanation and removal option.
  test("shows rejected-order feedback", async ({
    page,
  }) => {
    await page.route(
      "**/api/checkout",
      async (route) => {
        await route.fulfill({
          status: 409,
          json: {
            error:
              "One or more items are no longer available.",
            code: "ITEM_UNAVAILABLE",
            variationIds: ["VAR1"],
          },
        });
      },
    );

    const bag = await openBag(page);
    await fillCheckoutDetails(page);

    await bag.getByRole("button", {
      name: /Proceed to Checkout/,
    }).click();

    await expect(
      bag.getByText(
        "One or more items are no longer available.",
      ),
    ).toBeVisible();

    await expect(
      bag.getByText(
        "No longer available. Remove it to continue.",
      ),
    ).toBeVisible();

    await expect(
      bag.getByRole("button", {
        name: "Remove this item",
      }),
    ).toBeVisible();
  });

  // Simulate a temporary checkout failure, then verify
  // the visitor may retry after the security token resets.
  test("allows retry after checkout service failure", async ({
    page,
  }) => {
    let attempts = 0;

    await page.route(
      "**/api/checkout",
      async (route) => {
        attempts += 1;

        await route.fulfill({
          status: 503,
          json: {
            error: "Square temporarily unavailable.",
          },
        });
      },
    );

    const bag = await openBag(page);
    await fillCheckoutDetails(page);

    const checkout = bag.getByRole("button", {
      name: /Proceed to Checkout/,
    });

    await checkout.click();

    await expect(
      bag.getByText("Square temporarily unavailable."),
    ).toBeVisible();

    // Wait for the fake Turnstile widget to supply a
    // replacement token before retrying.
    await expect(checkout).toBeEnabled();

    await checkout.click();

    await expect.poll(() => attempts).toBe(2);
  });

  // Hold a simulated checkout response so we can
  // examine the disabled and loading state.
  test("disables checkout while awaiting a response", async ({
    page,
  }) => {
    let release!: () => void;

    const heldResponse = new Promise<void>(
      (resolve) => {
        release = resolve;
      },
    );

    await page.route(
      "**/api/checkout",
      async (route) => {
        await heldResponse;

        // Return an error rather than a real Square URL.
        await route.fulfill({
          status: 503,
          json: {
            error: "Test checkout stopped.",
          },
        });
      },
    );

    const bag = await openBag(page);
    await fillCheckoutDetails(page);

    const checkout = bag.getByRole("button", {
      name: /Proceed to Checkout/,
    });

    try {
      await checkout.click();

      const pending = bag.getByRole("button", {
        name: /Redirecting to Square/,
      });

      await expect(pending).toBeVisible();
      await expect(pending).toBeDisabled();
    } finally {
      release();
    }

    await expect(
      bag.getByText("Test checkout stopped."),
    ).toBeVisible();
  });

  // Verify successful checkout-session handling.
  //
  // The browser must navigate to the URL returned by
  // the mocked checkout API, but never contact Square.
  //
  // A fictional .invalid domain is used for the checkout
  // destination, and Playwright serves its HTML locally.
  test("navigates to a mocked successful checkout session", async ({
    page,
  }) => {
    const checkoutUrl =
      "https://checkout.example.invalid/test-session";

    const orderId = "TEST_ORDER_123";

    let checkoutRequests = 0;
    let checkoutPageVisits = 0;
    let submittedBody: unknown = null;

    // Intercept the fake checkout destination before
    // navigating to the Contact page.
    //
    // This verifies browser navigation without opening
    // a real Square Hosted Checkout page.
    await page.route(
      "https://checkout.example.invalid/**",
      async (route) => {
        checkoutPageVisits += 1;

        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <title>Mock Checkout</title>
              </head>
              <body>
                <h1>Mock Square Checkout</h1>
                <p>Test checkout destination reached.</p>
              </body>
            </html>
          `,
        });
      },
    );

    // Return an HTTP 200 response containing the same
    // fields as a successful checkout-session response.
    //
    // No request is forwarded to the real checkout API.
    await page.route(
      "**/api/checkout",
      async (route) => {
        checkoutRequests += 1;

        submittedBody =
          route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          json: {
            checkoutUrl,
            orderId,
          },
        });
      },
    );

    const bag = await openBag(page);
    await fillCheckoutDetails(page);

    const checkout = bag.getByRole("button", {
      name: /Proceed to Checkout/,
    });

    // Register the response and navigation listeners
    // before clicking, so fast redirects are not missed.
    const responsePromise = page.waitForResponse(
      (response) => {
        return (
          new URL(response.url()).pathname ===
            "/api/checkout" &&
          response.request().method() === "POST"
        );
      },
    );

    const navigationPromise =
      page.waitForURL(checkoutUrl);

    // The app should receive the successful response
    // and initiate navigation to the returned URL.
    const [checkoutResponse] = await Promise.all([
      responsePromise,
      navigationPromise,
      checkout.click(),
    ]);

    // Confirm the checkout API returned success.
    expect(checkoutResponse.status()).toBe(200);

    // Only one checkout request should be submitted.
    expect(checkoutRequests).toBe(1);

    // Verify the customer and cart data passed to the
    // intercepted endpoint before the redirect.
    expect(submittedBody).toMatchObject({
      customer: {
        displayName: "Test Customer",
        email: "customer@example.invalid",
        phone: "(415) 555-0100",
      },
      pickupTiming: {
        type: "SCHEDULED",
      },
      items: [
        {
          catalogObjectId: "ITEM1",
          variationId: "VAR1",
          quantity: 2,
          modifierOptionIds: [],
        },
      ],
    });

    // Confirm the browser reached the fictional
    // checkout URL, served entirely by Playwright.
    await expect(page).toHaveURL(checkoutUrl);

    await expect(
      page.getByRole("heading", {
        name: "Mock Square Checkout",
      }),
    ).toBeVisible();

    expect(checkoutPageVisits).toBe(1);
  });

  // The mobile Shopping Bag must allow customers to
  // inspect and modify their cart without overflowing.
  test("keeps the Shopping Bag usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    const bag = await openBag(page);

    await expect(
      bag.getByText("Classic Milk Tea"),
    ).toBeVisible();

    await expect(
      bag.getByRole("button", {
        name: "Increase quantity",
      }),
    ).toBeVisible();

    await expect(
      bag.getByRole("button", {
        name: /Proceed to Checkout/,
      }),
    ).toBeVisible();
  });
});
