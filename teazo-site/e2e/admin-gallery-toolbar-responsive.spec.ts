/**
 * Browser regression tests for the Admin Gallery toolbar.
 *
 * Verifies that Search, Card/List View, and New Item do not
 * overlap when the viewport, filter panel, or form drawer changes.
 *
 * Uses an authenticated local administrator session.
 * No Gallery records are created, modified, or deleted.
 */

import { existsSync } from "node:fs";
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

const storageStatePath =
  process.env.TEAZO_E2E_OWNER_STORAGE_STATE ??
  process.env.TEAZO_E2E_ADMIN_STORAGE_STATE;

const hasStorageState =
  Boolean(storageStatePath) &&
  existsSync(storageStatePath!);

test.use({
  storageState:
    hasStorageState && storageStatePath
      ? storageStatePath
      : { cookies: [], origins: [] },
});

// Block unexpected Gallery API writes during layout testing.
async function blockGalleryWrites(route: Route) {
  const method = route.request().method();

  if (method === "GET" || method === "HEAD") {
    await route.continue();
    return;
  }

  await route.abort("blockedbyclient");
}

async function openGallery(page: Page) {
  await page.route(
    "**/api/admin/gallery**",
    blockGalleryWrites,
  );

  await page.goto("/admin/gallery");

  if (new URL(page.url()).pathname === "/login") {
    throw new Error(
      "The saved administrator session has expired. " +
        "Sign in locally and refresh the saved session.",
    );
  }

  await expect(
    page.locator(".gallery-landscape-toolbar"),
  ).toBeVisible();

  await expect(
    page.getByRole("group", { name: "Gallery view" }),
  ).toBeVisible();
}

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - 1 &&
    a.x + a.width > b.x + 1 &&
    a.y < b.y + b.height - 1 &&
    a.y + a.height > b.y + 1
  );
}

async function getRect(
  locator: Locator,
  label: string,
): Promise<Rect> {
  const rect = await locator.boundingBox();

  expect(
    rect,
    `${label} must have a visible bounding rectangle`,
  ).not.toBeNull();

  return rect!;
}

// Validate actual rendered positions rather than CSS class names.
async function assertNoToolbarOverlap(
  page: Page,
  scenario: string,
) {
  const toolbar = page.locator(
    ".gallery-landscape-toolbar",
  );

  const search = page.getByRole("searchbox", {
    name: "Search photos",
  });

  const toggle = page.getByRole("group", {
    name: "Gallery view",
  });

  const newItem = page.getByRole("button", {
    name: "New Item +",
  });

  const controls = [
    { name: "Search photos", locator: search },
    { name: "Gallery view", locator: toggle },
    { name: "New Item", locator: newItem },
  ];

  const toolbarRect = await getRect(
    toolbar,
    `${scenario}: toolbar`,
  );

  const measured = [];

  for (const control of controls) {
    await expect(control.locator).toBeVisible();

    const rect = await getRect(
      control.locator,
      `${scenario}: ${control.name}`,
    );

    expect(
      rect.x,
      `${scenario}: ${control.name} is outside the toolbar`,
    ).toBeGreaterThanOrEqual(toolbarRect.x - 1);

    expect(
      rect.x + rect.width,
      `${scenario}: ${control.name} exceeds toolbar width`,
    ).toBeLessThanOrEqual(
      toolbarRect.x + toolbarRect.width + 1,
    );

    measured.push({
      name: control.name,
      rect,
    });
  }

  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = measured[i];
      const b = measured[j];

      expect(
        overlaps(a.rect, b.rect),
        `${scenario}: ${a.name} overlaps ${b.name}`,
      ).toBe(false);
    }
  }
}

test.beforeEach(() => {
  test.skip(
    !hasStorageState,
    "Set TEAZO_E2E_OWNER_STORAGE_STATE or " +
      "TEAZO_E2E_ADMIN_STORAGE_STATE.",
  );
});

test.describe("Admin Gallery responsive toolbar", () => {
  test("does not overlap across desktop widths and drawer/filter states", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 1440,
      height: 900,
    });

    await openGallery(page);

    const filterPanel = page.locator(
      "#gallery-filter-panel",
    );

    const drawer = page.locator(
      'aside[role="dialog"]',
    );

    // Open the actual Gallery form without saving anything.
    await page.getByRole("button", {
      name: "New Item +",
    }).click();

    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("width", "320px");

    for (const width of [1440, 1280, 1150, 1050]) {
      await page.setViewportSize({
        width,
        height: 900,
      });

      // Allow responsive resizing and drawer transitions to settle.
      await expect(drawer).toHaveCSS("width", "320px");

      // Desktop Filters expanded.
      await expect(filterPanel).toHaveCSS(
        "width",
        "208px",
      );

      await assertNoToolbarOverlap(
        page,
        `${width}px, drawer open, filters expanded`,
      );

      // Desktop Filters collapsed.
      await page.getByRole("button", {
        name: "Collapse filters",
      }).click();

      await expect(filterPanel).toHaveCSS(
        "width",
        "44px",
      );

      await assertNoToolbarOverlap(
        page,
        `${width}px, drawer open, filters collapsed`,
      );

      // Restore expanded Filters for the next width.
      await page.getByRole("button", {
        name: "Expand filters",
      }).click();

      await expect(filterPanel).toHaveCSS(
        "width",
        "208px",
      );
    }

    // Close the form and verify available space is restored.
    await drawer.getByRole("button", {
      name: "Close",
    }).click();

    await expect(drawer).toHaveCSS("width", "0px");

    for (const width of [1050, 1150, 1440]) {
      await page.setViewportSize({
        width,
        height: 900,
      });

      await assertNoToolbarOverlap(
        page,
        `${width}px, drawer closed`,
      );
    }
  });

  test("keeps view switching and the narrow layout usable", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 980,
      height: 900,
    });

    await openGallery(page);

    const toggle = page.getByRole("group", {
      name: "Gallery view",
    });

    const cardView = toggle.getByRole("button", {
      name: "Card View",
    });

    const listView = toggle.getByRole("button", {
      name: "List View",
    });

    await expect(listView).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    for (const width of [980, 760, 650]) {
      await page.setViewportSize({
        width,
        height: 900,
      });

      await assertNoToolbarOverlap(
        page,
        `${width}px, narrow layout`,
      );

      await cardView.click();

      await expect(cardView).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await listView.click();

      await expect(listView).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // Search must remain usable at each width.
      const search = page.getByRole("searchbox", {
        name: "Search photos",
      });

      await search.fill("layout check");
      await expect(search).toHaveValue("layout check");
      await search.clear();
    }

    // Returning to desktop width must preserve List View.
    await page.setViewportSize({
        width: 1440,
        height: 900,
    });

    // Wait for the desktop Filters sidebar to finish its width
    // transition before measuring the available Gallery space.
    await expect(
        page.locator("#gallery-filter-panel"),
    ).toHaveCSS("width", "208px");

    await assertNoToolbarOverlap(
        page,
        "1440px after resizing from narrow layout",
    );

    await expect(listView).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
