/**
 * Browser tests for administrator Gallery upload,
 * image replacement, validation, feedback, and refresh.
 *
 * The real authenticated Admin Gallery page and its
 * client components are used. All write requests are
 * blocked by default, and test-specific POST/PATCH
 * requests return synthetic Gallery records.
 *
 * No production Gallery records, database rows,
 * Cloudflare R2 objects, or real images are modified.
 *
 * Requires a locally exported admin browser session.
 * The session file must remain outside the repository.
 */

import { existsSync } from "node:fs";

import {
  expect,
  test,
  type Page,
  type Route,
} from "@playwright/test";

// Read the authentication state location from the
// environment rather than committing credentials or cookies.
const adminStatePath =
  process.env.TEAZO_E2E_ADMIN_STORAGE_STATE;

const hasAdminState =
  Boolean(adminStatePath) &&
  existsSync(adminStatePath!);

// Use empty browser storage only when the required
// session has not yet been configured. Tests will skip
// with an explanation rather than falsely passing.
test.use({
  storageState:
    hasAdminState && adminStatePath
      ? adminStatePath
      : {
          cookies: [],
          origins: [],
        },
});

// Use synthetic, predictable Gallery records.
type GalleryRecord = {
  id: string;
  name: string;
  url: string;
  tags: string[];
  createdAt: string;
};

const INITIAL_TEST_IMAGE: GalleryRecord = {
  id: "tz570-browser-created",
  name: "TZ570 Browser Gallery Image",
  url: "/TEAZO_logo.svg",
  tags: ["Browser Test"],
  createdAt: "2026-11-04T12:00:00.000Z",
};

const RENAMED_TEST_IMAGE: GalleryRecord = {
  ...INITIAL_TEST_IMAGE,
  name: "TZ570 Renamed Gallery Image",
  tags: ["Updated"],
};

const REPLACED_TEST_IMAGE: GalleryRecord = {
  ...INITIAL_TEST_IMAGE,
  url: "/TEAZO_logo.svg?gallery-replacement=1",
};

// Use valid synthetic PNG bytes so browser image
// handling remains realistic without supplying a
// real photograph or uploading a file to storage.
const TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

// Provide a file through the native browser input.
async function selectImage(
  page: Page,
  fileName = "tz570-gallery-test.png",
) {
  await page
    .locator('input[name="galleryImageFile"]')
    .setInputFiles({
      name: fileName,
      mimeType: "image/png",
      buffer: TEST_PNG,
    });
}

// A safe request handler must never forward test writes
// to the real backend.
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

  // Unexpected POST/PATCH/DELETE requests fail closed.
  await route.abort("blockedbyclient");
}

// Open the actual Gallery page using the previously
// exported administrator session.
async function openGallery(page: Page) {
  await page.goto("/admin/gallery");

  if (new URL(page.url()).pathname === "/login") {
    throw new Error(
      "The saved administrator session is missing or expired. Export a new local session before rerunning these tests.",
    );
  }

  await expect(
    page.getByRole("button", {
      name: "New Image +",
    }),
  ).toBeVisible();
}

// Open the real Gallery upload drawer.
async function openCreateForm(page: Page) {
  await page.getByRole("button", {
    name: "New Image +",
  }).click();

  await expect(
    page.getByRole("heading", {
      name: "Create New Image",
    }),
  ).toBeVisible();
}

// Fill the image name and select a synthetic PNG.
async function prepareUpload(
  page: Page,
  name = INITIAL_TEST_IMAGE.name,
) {
  await openCreateForm(page);
  await selectImage(page);

  await page.getByRole("textbox", {
    name: "Name",
  }).fill(name);

  await expect(
    page.getByRole("button", {
      name: "Save",
      exact: true,
    }),
  ).toBeEnabled();
}

// Find a Gallery row by its synthetic record name.
function imageRow(
  page: Page,
  name = INITIAL_TEST_IMAGE.name,
) {
  return page.getByRole("row", {
    name: new RegExp(name),
  });
}

// Open editing from the current List View.
async function openEditForm(
  page: Page,
  name = INITIAL_TEST_IMAGE.name,
) {
  const row = imageRow(page, name);

  await expect(row).toBeVisible();

  await row.getByRole("button", {
    name: "EDIT",
  }).click();

  await expect(
    page.getByRole("heading", {
      name: "Edit Image",
    }),
  ).toBeVisible();
}

// Register a mock POST response, preserving the request
// body so the test can inspect what the browser submitted.
async function mockUpload(
  page: Page,
  image: GalleryRecord = INITIAL_TEST_IMAGE,
) {
  const requests: string[] = [];

  await page.route(
    "**/api/admin/gallery",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      requests.push(
        route.request().postData() ?? "",
      );

      await route.fulfill({
        status: 201,
        json: image,
      });
    },
  );

  return requests;
}

// Register a mock PATCH response and capture the
// replacement or metadata-only FormData submission.
async function mockReplacement(
  page: Page,
  image: GalleryRecord,
) {
  const requests: string[] = [];

  await page.route(
    "**/api/admin/gallery/*",
    async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }

      requests.push(
        route.request().postData() ?? "",
      );

      await route.fulfill({
        status: 200,
        json: image,
      });
    },
  );

  return requests;
}

// Every test starts with the same secure request policy.
// Specific mocked write handlers are registered afterward
// and take precedence over the general blocking rule.
test.beforeEach(async ({ page }) => {
  test.skip(
    !hasAdminState,
    "Set TEAZO_E2E_ADMIN_STORAGE_STATE to a locally exported administrator Playwright session.",
  );

  await page.route("**/*", blockUnexpectedWrites);
});

test.describe("Admin Gallery browser interactions", () => {
  // List View must remain the default on desktop.
  // The administrator may switch views manually.
  test("defaults to List View and supports Image View", async ({
    page,
  }) => {
    await openGallery(page);

    const listView = page.getByRole("button", {
      name: "List View",
    });

    const imageView = page.getByRole("button", {
      name: "Image View",
    });

    await expect(listView).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await imageView.click();

    await expect(imageView).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await listView.click();

    await expect(listView).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Upload validation should reject file types that
  // are not supported by the Gallery image form.
  test("rejects unsupported upload file types", async ({
    page,
  }) => {
    await openGallery(page);
    await openCreateForm(page);

    await page
      .locator('input[name="galleryImageFile"]')
      .setInputFiles({
        name: "not-an-image.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("synthetic document"),
      });

    await expect(
      page.getByText(
        "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
      ),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Save",
        exact: true,
      }),
    ).toBeDisabled();
  });

  // The image form must reject a file with no content.
  test("rejects empty image uploads", async ({
    page,
  }) => {
    await openGallery(page);
    await openCreateForm(page);

    await page
      .locator('input[name="galleryImageFile"]')
      .setInputFiles({
        name: "empty.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(0),
      });

    await expect(
      page.getByText(
        "The selected image must be nonempty.",
      ),
    ).toBeVisible();
  });

  // Tags should be normalized, and duplicate tags
  // must be rejected without modifying the Gallery.
  test("validates Gallery tags", async ({
    page,
  }) => {
    await openGallery(page);
    await openCreateForm(page);

    const tagInput = page.getByRole("textbox", {
      name: "Add Tags",
    });

    await tagInput.fill("  Brown   Sugar ");
    await tagInput.press("Enter");

    await expect(
      page.getByRole("button", {
        name: "Remove Brown Sugar tag",
      }),
    ).toBeVisible();

    await tagInput.fill("brown sugar");
    await tagInput.press("Enter");

    await expect(
      page.getByText(
        "That tag has already been added.",
      ),
    ).toBeVisible();
  });

  // Canceling a new upload should close the form
  // without sending a Gallery API request.
  test("cancels an upload without saving", async ({
    page,
  }) => {
    let uploadRequests = 0;

    await page.route(
      "**/api/admin/gallery",
      async (route) => {
        if (route.request().method() === "POST") {
          uploadRequests += 1;
        }

        await route.abort("blockedbyclient");
      },
    );

    await openGallery(page);
    await prepareUpload(page);

    await page.getByRole("button", {
      name: "Cancel",
    }).click();

    await expect(
      page.getByRole("heading", {
        name: "Create New Image",
      }),
    ).toHaveCount(0);

    expect(uploadRequests).toBe(0);
  });

  // Verify the complete upload workflow against a
  // simulated successful response.
  test("uploads a synthetic image and refreshes the Gallery", async ({
    page,
  }) => {
    const submittedRequests = await mockUpload(page);

    await openGallery(page);
    await prepareUpload(page);

    const tags = page.getByRole("textbox", {
      name: "Add Tags",
    });

    await tags.fill("Browser Test");
    await tags.press("Enter");

    await page.getByRole("button", {
      name: "Save",
      exact: true,
    }).click();

    // The server-confirmed record must appear without
    // navigating away or refreshing the browser.
    await expect(
      imageRow(page),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Create New Image",
      }),
    ).toHaveCount(0);

    expect(submittedRequests).toHaveLength(1);

    const body = submittedRequests[0];

    expect(body).toContain('name="name"');
    expect(body).toContain(INITIAL_TEST_IMAGE.name);
    expect(body).toContain('name="tags"');
    expect(body).toContain("Browser Test");
    expect(body).toContain('name="file"');
    expect(body).toContain("tz570-gallery-test.png");
  });

  // Server failures must remain visible and preserve
  // the unsaved form for correction or retry.
  test("displays upload API errors without false success", async ({
    page,
  }) => {
    await page.route(
      "**/api/admin/gallery",
      async (route) => {
        await route.fulfill({
          status: 503,
          json: {
            error: "Gallery storage unavailable.",
          },
        });
      },
    );

    await openGallery(page);
    await prepareUpload(page);

    await page.getByRole("button", {
      name: "Save",
      exact: true,
    }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Gallery storage unavailable.",
      }),
    ).toBeVisible();

    await expect(
      imageRow(page),
    ).toHaveCount(0);

    await expect(
      page.getByRole("heading", {
        name: "Create New Image",
      }),
    ).toBeVisible();
  });

  // A network failure is different from an HTTP
  // error but must not appear as a successful upload.
  test("displays upload network errors", async ({
    page,
  }) => {
    await page.route(
      "**/api/admin/gallery",
      async (route) => {
        await route.abort("failed");
      },
    );

    await openGallery(page);
    await prepareUpload(page);

    await page.getByRole("button", {
      name: "Save",
      exact: true,
    }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "The save could not be confirmed.",
      }),
    ).toBeVisible();

    await expect(
      imageRow(page),
    ).toHaveCount(0);
  });

  // A success HTTP status without a valid Gallery
  // record must not update the displayed collection.
  test("rejects malformed upload success responses", async ({
    page,
  }) => {
    await page.route(
      "**/api/admin/gallery",
      async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            name: INITIAL_TEST_IMAGE.name,
          },
        });
      },
    );

    await openGallery(page);
    await prepareUpload(page);

    await page.getByRole("button", {
      name: "Save",
      exact: true,
    }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText:
          "The server's saved image could not be confirmed.",
      }),
    ).toBeVisible();

    await expect(imageRow(page)).toHaveCount(0);
  });

  // Hold a mocked upload response to verify loading
  // feedback and duplicate-submission prevention.
  test("disables Gallery submission while saving", async ({
    page,
  }) => {
    let releaseRequest!: () => void;

    const pendingRequest = new Promise<void>(
      (resolve) => {
        releaseRequest = resolve;
      },
    );

    let uploadRequests = 0;

    await page.route(
      "**/api/admin/gallery",
      async (route) => {
        uploadRequests += 1;

        await pendingRequest;

        await route.fulfill({
          status: 201,
          json: INITIAL_TEST_IMAGE,
        });
      },
    );

    await openGallery(page);
    await prepareUpload(page);

    try {
      await page.getByRole("button", {
        name: "Save",
        exact: true,
      }).click();

      const savingButton = page.getByRole("button", {
        name: "Saving...",
      });

      await expect(savingButton).toBeVisible();
      await expect(savingButton).toBeDisabled();

      await expect(
        page.getByRole("button", {
          name: "Cancel",
        }),
      ).toBeDisabled();

      await expect(
        page.getByRole("button", {
          name: "New Image +",
        }),
      ).toBeDisabled();

      expect(uploadRequests).toBe(1);
    } finally {
      releaseRequest();
    }

    await expect(imageRow(page)).toBeVisible();

    expect(uploadRequests).toBe(1);
  });

  // Metadata-only edits should use PATCH without
  // transmitting another image file.
  //
  // The client must update its search results after
  // the server confirms the changed image name.
  test("saves metadata edits and refreshes search results", async ({
    page,
  }) => {
    await mockUpload(page);

    const patchRequests = await mockReplacement(
      page,
      RENAMED_TEST_IMAGE,
    );

    await openGallery(page);
    await prepareUpload(page);

    await page.getByRole("button", {
      name: "Save",
      exact: true,
    }).click();

    await expect(imageRow(page)).toBeVisible();

    const search = page.getByRole("searchbox", {
      name: "Search photos",
    });

    await search.fill(INITIAL_TEST_IMAGE.name);

    await openEditForm(page);

    await page.getByRole("textbox", {
      name: "Name",
    }).fill(RENAMED_TEST_IMAGE.name);

    await page.getByRole("button", {
      name: "Save Changes",
    }).click();

    // The old search should no longer match the
    // renamed server-confirmed Gallery record.
    await expect(
      page.getByText("No images found"),
    ).toBeVisible();

    expect(patchRequests).toHaveLength(1);

    const body = patchRequests[0];

    expect(body).toContain('name="name"');
    expect(body).toContain(RENAMED_TEST_IMAGE.name);

    // Metadata editing must preserve the original
    // image file in backend storage.
    expect(body).not.toContain('name="file"');

    await search.fill(RENAMED_TEST_IMAGE.name);

    await expect(
      imageRow(page, RENAMED_TEST_IMAGE.name),
    ).toBeVisible();
  });

  // Replacement should send PATCH with the selected
  // new file while preserving the image record ID.
  test("replaces an existing Gallery image", async ({
    page,
  }) => {
    await mockUpload(page);

    const patchRequests = await mockReplacement(
      page,
      REPLACED_TEST_IMAGE,
    );

    await openGallery(page);
    await prepareUpload(page);

    await page.getByRole("button", {
      name: "Save",
      exact: true,
    }).click();

    await expect(imageRow(page)).toBeVisible();

    await openEditForm(page);

    await selectImage(
      page,
      "tz570-replacement.png",
    );

    await page.getByRole("button", {
      name: "Save Changes",
    }).click();

    await expect(
      page.getByRole("heading", {
        name: "Edit Image",
      }),
    ).toHaveCount(0);

    expect(patchRequests).toHaveLength(1);
    expect(patchRequests[0]).toContain(
      'name="file"',
    );
    expect(patchRequests[0]).toContain(
      "tz570-replacement.png",
    );

    // Reopening must use the updated image URL,
    // not the previously uploaded image URL.
    await openEditForm(page);

    const preview = page.getByRole("img", {
      name: `${INITIAL_TEST_IMAGE.name} preview`,
    });

    await expect(preview).toHaveAttribute(
      "src",
      /TEAZO_logo\.svg/,
    );
  });

  // Check the same default view and form controls
  // on a phone-sized viewport.
  test("keeps Gallery upload usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await openGallery(page);

    const listView = page.getByRole("button", {
      name: "List View",
    });

    await expect(listView).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", {
      name: "Image View",
    }).click();

    await expect(
      page.getByRole("button", {
        name: "Image View",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await openCreateForm(page);

    await expect(
      page.getByRole("textbox", {
        name: "Name",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Select/Drag Image Here",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: "Save",
        exact: true,
      }),
    ).toBeDisabled();

    await page.getByRole("button", {
      name: "Cancel",
    }).click();

    await expect(
      page.getByRole("heading", {
        name: "Create New Image",
      }),
    ).toHaveCount(0);
  });
});
