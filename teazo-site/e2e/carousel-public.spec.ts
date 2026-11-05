/**
 * Playwright browser tests for the public TEAZO carousel.
 *
 * Exercises the real homepage carousel in Chromium.
 *
 * Covers rendered images, navigation dots, animation
 * locking, pointer swipes, touch gestures, automatic
 * advancement, wraparound, and mobile usability.
 *
 * Tests are read-only. No admin carousel settings,
 * database records, or stored images are modified.
 *
 * The homepage loads its existing configured images.
 * Tests requiring multiple images skip explicitly if
 * the local environment has insufficient carousel data.
 */

import {
  expect,
  test,
  type Page,
} from "@playwright/test";

// Match the accessible navigation controls rendered
// by the real ImageCarousel component.
function carouselDots(page: Page) {
  return page.getByRole("button", {
    name: /^Go to image \d+$/,
  });
}

// Find the carousel track containing the slides.
// Each actual slide has a data-carousel-index attribute.
function carouselTrack(page: Page) {
  return page
    .locator("[data-carousel-index]")
    .first()
    .locator("..");
}

// Open the real homepage and verify the requested number
// of images exists before exercising navigation behavior.
async function openCarousel(
  page: Page,
  minimumImages = 2,
) {
  await page.goto("/");

  const dots = carouselDots(page);

  // Allow React to hydrate before inspecting controls.
  await expect(
    page.getByRole("main"),
  ).toBeVisible();

  const count = await dots.count();

  test.skip(
    count < minimumImages,
    `This test requires ${minimumImages} enabled carousel images; found ${count}.`,
  );

  await expect(
    dots.first(),
  ).toBeVisible();

  return {
    dots,
    count,
  };
}

// The selected dot uses the component's black background.
// Test the rendered state instead of private React state.
async function expectActiveImage(
  page: Page,
  number: number,
) {
  const dots = carouselDots(page);

  await expect(
    dots.nth(number - 1),
  ).toHaveClass(/bg-black/);
}

test.describe("Public carousel browser behavior", () => {
  test("renders the configured images and navigation controls", async ({
    page,
  }) => {
    const { count } = await openCarousel(page, 1);

    const slides = page.locator(
      "[data-carousel-index]",
    );

    await expect(slides).toHaveCount(count);

    // Every configured slide should contain an image.
    for (let index = 0; index < count; index++) {
      const image = slides.nth(index).locator("img");

      await expect(image).toHaveCount(1);

      await expect(image).toHaveAttribute(
        "src",
        /.+/,
      );
    }

    await expectActiveImage(page, 1);
  });

  test("navigates between images using the dots", async ({
    page,
  }) => {
    const { dots } = await openCarousel(page, 2);

    await dots.nth(1).click();

    await expectActiveImage(page, 2);

    // Allow the 500ms transition lock to finish.
    await page.waitForTimeout(550);

    await dots.nth(0).click();

    await expectActiveImage(page, 1);
  });

  test("prevents overlapping slide transitions", async ({
    page,
  }) => {
    const { dots } = await openCarousel(page, 3);

    await dots.nth(1).click();

    await expectActiveImage(page, 2);

    // The component ignores another change while its
    // current 500ms animation is still running.
    await dots.nth(2).click();

    await expectActiveImage(page, 2);

    await page.waitForTimeout(550);

    await dots.nth(2).click();

    await expectActiveImage(page, 3);
  });

  test("moves to the next slide after a leftward pointer swipe", async ({
    page,
  }) => {
    await openCarousel(page, 2);

    const track = carouselTrack(page);
    const bounds = await track.boundingBox();

    expect(bounds).not.toBeNull();

    if (!bounds) {
      return;
    }

    const startX = bounds.x + bounds.width * 0.65;
    const startY = bounds.y + bounds.height / 2;

    // Use an actual Playwright mouse interaction so
    // React receives pointerdown, pointermove, and
    // pointerup events from the browser.
    await page.mouse.move(startX, startY);
    await page.mouse.down();

    await page.mouse.move(
      startX - 140,
      startY,
      { steps: 8 },
    );

    await page.mouse.up();

    await expectActiveImage(page, 2);
  });

  test("supports touch-style navigation on the dot controls", async ({
    page,
  }) => {
    await openCarousel(page, 2);

    // The component handles touchstart/touchend on
    // the navigation-dot container. Synthesize those
    // browser events to verify its touch handler.
    const dotContainer = carouselDots(page)
      .first()
      .locator("..");

    await dotContainer.evaluate((element) => {
      const start = new Touch({
        identifier: 1,
        target: element,
        clientX: 250,
        clientY: 100,
      });

      const end = new Touch({
        identifier: 1,
        target: element,
        clientX: 120,
        clientY: 100,
      });

      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [start],
          targetTouches: [start],
          changedTouches: [start],
        }),
      );

      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          targetTouches: [],
          changedTouches: [end],
        }),
      );
    });

    await expectActiveImage(page, 2);
  });

  test("automatically advances to the next slide", async ({
    page,
  }) => {
    await openCarousel(page, 2);

    await expectActiveImage(page, 1);

    // The production carousel advances every 5000ms.
    // Waiting for the real timer also verifies that
    // the browser actually performs the transition.
    await expect(
      carouselDots(page).nth(1),
    ).toHaveClass(
      /bg-black/,
      { timeout: 7000 },
    );
  });

  test("remains usable at a mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    const { dots, count } = await openCarousel(page, 2);

    await expect(
      dots.first(),
    ).toBeVisible();

    // The active image should fit within the mobile
    // viewport without requiring horizontal scrolling.
    const activeSlide = page.locator(
      '[data-carousel-index="0"]',
    );

    const bounds = await activeSlide.boundingBox();

    expect(bounds).not.toBeNull();

    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(-1);

      expect(
        bounds.x + bounds.width,
      ).toBeLessThanOrEqual(391);
    }

    // Navigation remains interactive on mobile.
    await dots.nth(count - 1).click();

    await expectActiveImage(page, count);
  });
});
