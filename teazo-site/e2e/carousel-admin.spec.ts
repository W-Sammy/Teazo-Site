/**
 * Browser tests for the TEAZO admin carousel editor.
 *
 * Exercises the real authenticated Website Content page.
 * Covers previews, accordion controls, new placeholders,
 * descriptions, visibility, uploads, deletion, errors,
 * retries, and mobile usability.
 *
 * Carousel API requests use synthetic responses.
 * Unexpected browser write requests are blocked.
 *
 * No real website content, D1 records, or R2 images
 * are created, modified, or deleted.
 *
 * Requires a previously exported local administrator
 * browser session. Authentication is not bypassed.
 */

import { existsSync } from "node:fs";

import {
  expect,
  test,
  type Page,
  type Route,
} from "@playwright/test";

// Reuse the local administrator session established
// for earlier authenticated frontend browser tests.
const adminStatePath =
  process.env.TEAZO_E2E_ADMIN_STORAGE_STATE;

const hasAdminState =
  Boolean(adminStatePath) &&
  existsSync(adminStatePath!);

// Tests skip without a valid local authentication file.
// Never store administrator cookies in the repository.
test.use({
  storageState:
    hasAdminState && adminStatePath
      ? adminStatePath
      : {
          cookies: [],
          origins: [],
        },
});

type CarouselImage = {
  id: string;
  src: string;
  alt: string;
  enabled: boolean;
};

type RecordedWrite = {
  method: string;
  body: Record<string, unknown> | null;
  rawBody: string;
};

type MockCarouselState = {
  images: CarouselImage[];
  writes: RecordedWrite[];

  // The initialization failure is persistent until
  // the test explicitly allows a successful retry.
  failInitialization: boolean;

  settingsFailures: number;
  uploadFailures: number;
  deletionFailures: number;
};

// Synthetic images use assets already served locally.
const INITIAL_IMAGES: CarouselImage[] = [
  {
    id: "browser-carousel-1",
    src: "/TEAZO_logo.svg",
    alt: "Synthetic tea carousel",
    enabled: true,
  },
  {
    id: "browser-carousel-2",
    src: "/carousel_images/drying-leaves.jpg",
    alt: "",
    enabled: false,
  },
];

// Small synthetic PNG with no customer or business data.
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

const CAROUSEL_API =
  "/api/admin/website-content/carousel";

// Fail closed for all unexpected browser writes.
async function blockUnexpectedWrites(route: Route) {
  const method = route.request().method();

  if (
    method === "GET" ||
    method === "HEAD" ||
    method === "OPTIONS"
  ) {
    await route.continue();
    return;
  }

  await route.abort("blockedbyclient");
}

// Install a synthetic in-memory replacement for all
// carousel API operations.
async function mockCarouselApi(
  page: Page,
): Promise<MockCarouselState> {
  const state: MockCarouselState = {
    images: INITIAL_IMAGES.map((image) => ({
      ...image,
    })),
    writes: [],
    failInitialization: false,
    settingsFailures: 0,
    uploadFailures: 0,
    deletionFailures: 0,
  };

  // This specific route takes precedence over the
  // general write blocker installed before each test.
  await page.route(
    `**${CAROUSEL_API}`,
    async (route) => {
      const request = route.request();
      const method = request.method();
      const rawBody = request.postData() ?? "";

      const body =
        method === "POST"
          ? null
          : (request.postDataJSON() as
              Record<string, unknown>);

      // Record requests without forwarding them.
      if (
        method === "POST" ||
        method === "PATCH" ||
        method === "DELETE"
      ) {
        state.writes.push({
          method,
          body,
          rawBody,
        });
      }

      // The editor initializes saved carousel data
      // through a PATCH action.
      if (
        method === "PATCH" &&
        body?.action === "initialize-defaults"
      ) {
        // Keep returning the same failure until the
        // test explicitly enables recovery.
        //
        // React Strict Mode may mount effects twice
        // during development. A one-time failure can
        // otherwise be consumed by the first request
        // while a second request succeeds immediately.
        if (state.failInitialization) {
          await route.fulfill({
            status: 503,
            json: {
              error:
                "Synthetic carousel loading failure.",
            },
          });

          return;
        }

        await route.fulfill({
          status: 200,
          json: {
            success: true,
            images: state.images,
          },
        });

        return;
      }

      // Settings updates never touch the actual
      // backend or database.
      if (
        method === "PATCH" &&
        body?.action === "update-image"
      ) {
        if (state.settingsFailures > 0) {
          state.settingsFailures -= 1;

          await route.fulfill({
            status: 503,
            json: {
              error:
                "Synthetic carousel settings unavailable.",
            },
          });

          return;
        }

        const id = String(body.id ?? "");

        state.images = state.images.map(
          (image) =>
            image.id === id
              ? {
                  ...image,
                  ...(typeof body.alt === "string"
                    ? { alt: body.alt }
                    : {}),
                  ...(typeof body.enabled === "boolean"
                    ? { enabled: body.enabled }
                    : {}),
                }
              : image,
        );

        await route.fulfill({
          status: 200,
          json: {
            success: true,
          },
        });

        return;
      }

      // A successful upload receives a synthetic
      // storage key and local preview URL.
      if (method === "POST") {
        if (state.uploadFailures > 0) {
          state.uploadFailures -= 1;

          await route.fulfill({
            status: 503,
            json: {
              error:
                "Synthetic carousel upload unavailable.",
            },
          });

          return;
        }

        const uploaded: CarouselImage = {
          id: "browser-uploaded-carousel",
          src:
            "/TEAZO_logo.svg?carousel-test-upload=1",
          alt: "",
          enabled: true,
        };

        state.images.push(uploaded);

        await route.fulfill({
          status: 201,
          json: {
            success: true,
            key: "carousel/synthetic-browser.png",
            url: uploaded.src,
            image: uploaded,
          },
        });

        return;
      }

      // Deletion is simulated only within the test's
      // own in-memory carousel collection.
      if (method === "DELETE") {
        if (state.deletionFailures > 0) {
          state.deletionFailures -= 1;

          await route.fulfill({
            status: 503,
            json: {
              error:
                "Synthetic carousel deletion unavailable.",
            },
          });

          return;
        }

        const id = String(body?.id ?? "");

        state.images = state.images.filter(
          (image) => image.id !== id,
        );

        await route.fulfill({
          status: 200,
          json: {
            success: true,
            id,
          },
        });

        return;
      }

      // Unknown operations never reach the real API.
      await route.abort("blockedbyclient");
    },
  );

  return state;
}

// Open the actual admin page using a local authenticated
// session, then expand the carousel section.
async function openCarouselEditor(
  page: Page,
  mobile = false,
) {
  await page.goto("/admin/website-content");

  if (
    new URL(page.url()).pathname === "/login"
  ) {
    throw new Error(
      "The saved administrator session is missing or expired.",
    );
  }

  await expect(
    page.getByRole("heading", {
      name: "Website Content",
    }),
  ).toBeVisible();

  if (mobile) {
    // Mobile layout uses the section dropdown.
    await page
      .locator("#website-content-section")
      .selectOption("carousel");
  } else {
    await page
      .locator("#section-heading-carousel")
      .click();
  }

  const panel = page.locator(
    "#section-panel-carousel",
  );

  await expect(panel).toBeVisible();

  return panel;
}

// Count requests for an operation without including
// the editor's initial load request.
function countWrites(
  state: MockCarouselState,
  method: string,
  action?: string,
): number {
  return state.writes.filter(
    (write) =>
      write.method === method &&
      (action === undefined ||
        write.body?.action === action),
  ).length;
}

// Every test blocks unrelated writes before navigation.
test.beforeEach(async ({ page }) => {
  test.skip(
    !hasAdminState,
    "Set TEAZO_E2E_ADMIN_STORAGE_STATE to a locally exported administrator session.",
  );

  await page.route(
    "**/*",
    blockUnexpectedWrites,
  );
});

test.describe(
  "Admin carousel browser interactions",
  () => {
    test("loads saved image previews and visibility controls", async ({
      page,
    }) => {
      await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page);

      await expect(
        panel.getByRole("img", {
          name: "Synthetic tea carousel",
        }),
      ).toBeVisible();

      await expect(
        panel.getByRole("img", {
          name: "Carousel image 2 preview",
        }),
      ).toBeVisible();

      await expect(
        panel.getByRole("switch", {
          name:
            "Show image 1 in the carousel",
        }),
      ).toHaveAttribute(
        "aria-checked",
        "true",
      );

      await expect(
        panel.getByRole("switch", {
          name:
            "Show image 2 in the carousel",
        }),
      ).toHaveAttribute(
        "aria-checked",
        "false",
      );
    });

    test("opens and closes the carousel accordion", async ({
      page,
    }) => {
      await mockCarouselApi(page);

      await openCarouselEditor(page);

      const heading = page.locator(
        "#section-heading-carousel",
      );

      await expect(heading).toHaveAttribute(
        "aria-expanded",
        "true",
      );

      await heading.click();

      await expect(heading).toHaveAttribute(
        "aria-expanded",
        "false",
      );

      await expect(
        page.locator("#section-panel-carousel"),
      ).toHaveCount(0);

      await heading.click();

      await expect(
        page.locator("#section-panel-carousel"),
      ).toBeVisible();
    });

    test("adds an empty carousel placeholder without saving it", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page);

      await expect(
        panel.getByRole("button", {
          name: "New Carousel Image +",
        }),
      ).toBeEnabled();

      await panel.getByRole("button", {
        name: "New Carousel Image +",
      }).click();

      await expect(
        panel.getByText("No image selected"),
      ).toBeVisible();

      // Adding an empty placeholder is a local
      // editor action, not a database write.
      expect(
        countWrites(state, "POST"),
      ).toBe(0);

      expect(
        countWrites(
          state,
          "PATCH",
          "update-image",
        ),
      ).toBe(0);
    });

    test("toggles image visibility using a mocked settings save", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page);

      const toggle = panel.getByRole(
        "switch",
        {
          name:
            "Show image 1 in the carousel",
        },
      );

      await toggle.click();

      await expect(toggle).toHaveAttribute(
        "aria-checked",
        "false",
      );

      await expect.poll(
        () =>
          countWrites(
            state,
            "PATCH",
            "update-image",
          ),
      ).toBe(1);

      expect(state.images[0].enabled).toBe(
        false,
      );
    });

    test("saves edited descriptions when the field loses focus", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page);

      const description = panel.getByLabel(
        "Image description",
      ).first();

      await description.fill(
        "Updated browser carousel description",
      );

      await description.press("Tab");

      await expect.poll(
        () =>
          countWrites(
            state,
            "PATCH",
            "update-image",
          ),
      ).toBe(1);

      expect(state.images[0].alt).toBe(
        "Updated browser carousel description",
      );

      await expect(description).toHaveValue(
        "Updated browser carousel description",
      );
    });

    test("displays failed settings saves and permits retry", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      state.settingsFailures = 1;

      const panel =
        await openCarouselEditor(page);

      await panel.getByRole("switch", {
        name:
          "Show image 1 in the carousel",
      }).click();

      await expect(
        panel.getByRole("alert").filter({
          hasText:
            "Synthetic carousel settings unavailable.",
        }),
      ).toBeVisible();

      await panel.getByRole("button", {
        name:
          "Retry saving carousel changes",
      }).click();

      await expect.poll(
        () =>
          countWrites(
            state,
            "PATCH",
            "update-image",
          ),
      ).toBe(2);

      await expect(
        panel.getByRole("alert").filter({
          hasText:
            "Synthetic carousel settings unavailable.",
        }),
      ).toHaveCount(0);
    });

    test("uploads a synthetic PNG through the mocked carousel API", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page);

      await panel.getByRole("button", {
        name: "New Carousel Image +",
      }).click();

      // Select a valid synthetic PNG using the actual
      // hidden browser file input.
      const inputs = panel.locator(
        'input[type="file"]',
      );

      await inputs.last().setInputFiles({
        name: "synthetic-carousel.png",
        mimeType: "image/png",
        buffer: TEST_PNG,
      });

      await expect.poll(
        () => countWrites(state, "POST"),
      ).toBe(1);

      // The component should show the saved preview
      // returned by the mocked upload operation.
      const uploaded = panel.getByRole("img", {
        name: "Carousel image 3 preview",
      });

      await expect(uploaded).toHaveAttribute(
        "src",
        /carousel-test-upload=1/,
      );

      const upload = state.writes.find(
        (write) => write.method === "POST",
      );

      expect(upload?.rawBody).toContain(
        "synthetic-carousel.png",
      );
    });

    test("preserves the existing preview after a rejected upload", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      state.uploadFailures = 1;

      const panel =
        await openCarouselEditor(page);

      await panel.locator(
        'input[type="file"]',
      ).first().setInputFiles({
        name: "rejected-carousel.png",
        mimeType: "image/png",
        buffer: TEST_PNG,
      });

      await expect(
        panel.getByRole("alert").filter({
          hasText:
            "Synthetic carousel upload unavailable.",
        }),
      ).toBeVisible();

      await expect(
        panel.getByRole("img", {
          name: "Synthetic tea carousel",
        }),
      ).toHaveAttribute(
        "src",
        "/TEAZO_logo.svg",
      );

      expect(
        countWrites(state, "POST"),
      ).toBe(1);
    });

    test("removes an image only after a mocked deletion response", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page);

      await panel.getByRole("button", {
        name:
          "Remove carousel image 2",
      }).click();

      await expect.poll(
        () => countWrites(state, "DELETE"),
      ).toBe(1);

      await expect(
        panel.getByRole("img", {
          name: "Carousel image 2 preview",
        }),
      ).toHaveCount(0);

      await expect(
        panel.getByRole("img", {
          name: "Synthetic tea carousel",
        }),
      ).toBeVisible();

      expect(state.images).toHaveLength(1);
    });

    test("recovers from a failed carousel initialization", async ({
      page,
    }) => {
      const state =
        await mockCarouselApi(page);

      // Keep initialization failing until we explicitly
      // allow recovery. React Strict Mode may issue more
      // than one initialization request on page load.
      //
      // A one-time failure would not be deterministic.
      state.failInitialization = true;

      const panel =
        await openCarouselEditor(page);

      // Every initial request fails, so the editor must
      // display the error instead of silently loading.
      await expect(
        panel.getByRole("alert").filter({
          hasText:
            "Synthetic carousel loading failure.",
        }),
      ).toBeVisible();

      await expect(
        panel.getByRole("button", {
          name: "New Carousel Image +",
        }),
      ).toBeDisabled();

      // Record the number of initialization requests.
      // It can vary in development due to Strict Mode.
      const requestsBeforeRetry =
        state.writes.filter(
          (write) =>
            write.method === "PATCH" &&
            write.body?.action ===
              "initialize-defaults",
        ).length;

      expect(
        requestsBeforeRetry,
      ).toBeGreaterThanOrEqual(1);

      // Explicitly restore simulated API availability
      // immediately before the user's retry action.
      state.failInitialization = false;

      await panel.getByRole("button", {
        name: "Retry loading images",
      }).click();

      // The retry should load the saved images and
      // re-enable editing without a page refresh.
      await expect(
        panel.getByRole("img", {
          name: "Synthetic tea carousel",
        }),
      ).toBeVisible();

      await expect(
        panel.getByRole("button", {
          name: "New Carousel Image +",
        }),
      ).toBeEnabled();

      await expect(
        panel.getByRole("alert").filter({
          hasText:
            "Synthetic carousel loading failure.",
        }),
      ).toHaveCount(0);

      // Confirm an additional request occurred after
      // the retry. Do not assume an exact total, since
      // development mode can initialize more than once.
      await expect.poll(
        () =>
          state.writes.filter(
            (write) =>
              write.method === "PATCH" &&
              write.body?.action ===
                "initialize-defaults",
          ).length,
      ).toBeGreaterThan(requestsBeforeRetry);
    });

    test("keeps carousel editing usable on mobile", async ({
      page,
    }) => {
      await page.setViewportSize({
        width: 390,
        height: 844,
      });

      const state =
        await mockCarouselApi(page);

      const panel =
        await openCarouselEditor(page, true);

      await expect(
        panel.getByLabel(
          "Image description",
        ).first(),
      ).toBeVisible();

      await expect(
        panel.getByRole("button", {
          name: "New Carousel Image +",
        }),
      ).toBeVisible();

      // Mobile still permits visibility editing.
      await panel.getByRole("switch", {
        name:
          "Show image 2 in the carousel",
      }).click();

      await expect.poll(
        () =>
          countWrites(
            state,
            "PATCH",
            "update-image",
          ),
      ).toBe(1);

      expect(state.images[1].enabled).toBe(
        true,
      );
    });
  },
);
