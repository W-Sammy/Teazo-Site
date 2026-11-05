/**
 * Tests the public Gallery page and image grid.
 *
 * Covers published images, captions, alternative text,
 * website logo selection, multiple images, and fallback
 * placeholders when no Gallery images are available.
 *
 * Gallery and website-content queries are mocked.
 * No production D1 or R2 requests are made.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  render,
  screen,
  within,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getPublicGalleryImages: vi.fn(),
  getWebsiteContent: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Cabin_Sketch: () => ({
    className: "test-cabin-sketch",
  }),
}));

// Mock Next.js image optimization while preserving the
// source and alt text for DOM assertions.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      data-testid="gallery-test-image"
      data-src={src}
      role="img"
      aria-label={alt}
    />
  ),
}));

vi.mock("@/app/components/bubble-field", () => ({
  BubbleField: () => null,
}));

vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: mocks.getWebsiteContent,
}));

vi.mock("@/app/lib/gallery", () => ({
  getPublicGalleryImages: mocks.getPublicGalleryImages,
}));

import GalleryPage from "./page";

const publishedImages = [
  {
    id: "image-1",
    url: "https://images.example.invalid/milk-tea.webp",
    alt: "A cup of milk tea",
    caption: "Classic Milk Tea",
  },
  {
    id: "image-2",
    url: "https://images.example.invalid/matcha.webp",
    alt: "A glass of matcha",
    caption: "Matcha Series",
  },
  {
    id: "image-3",
    url: "https://images.example.invalid/dessert.webp",
    alt: "A slice of cake",
  },
];

async function renderGallery() {
  const page = await GalleryPage();
  return render(page);
}

function galleryFigures(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("figure"),
  );
}

describe("Public Gallery page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getWebsiteContent.mockResolvedValue({
      logo: null,
    });

    mocks.getPublicGalleryImages.mockResolvedValue(
      publishedImages,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders published Gallery images with correct URLs and alternative text", async () => {
    const { container } = await renderGallery();

    const figures = galleryFigures(container);

    expect(figures).toHaveLength(3);

    expect(
        within(figures[0])
            .getByRole("img", { name: "A cup of milk tea" })
            .getAttribute("data-src"),
        ).toBe("https://images.example.invalid/milk-tea.webp");

    const images = Array.from(
      container.querySelectorAll(
        "figure [data-testid='gallery-test-image']",
      ),
    );

    expect(
      images.map((image) =>
        image.getAttribute("data-src"),
      ),
    ).toEqual([
      "https://images.example.invalid/milk-tea.webp",
      "https://images.example.invalid/matcha.webp",
      "https://images.example.invalid/dessert.webp",
    ]);

    expect(
      images.map((image) =>
        image.getAttribute("aria-label"),
      ),
    ).toEqual([
      "A cup of milk tea",
      "A glass of matcha",
      "A slice of cake",
    ]);
  });

  it("renders multiple images with their correct captions", async () => {
    const { container } = await renderGallery();

    const figures = galleryFigures(container);

    expect(figures).toHaveLength(3);

    expect(
      within(figures[0]).getByText("Classic Milk Tea"),
    ).toBeTruthy();

    expect(
      within(figures[1]).getByText("Matcha Series"),
    ).toBeTruthy();

    expect(
      within(figures[2]).queryByText("Matcha Series"),
    ).toBeNull();
  });

  it("does not render a caption when none is provided", async () => {
    const { container } = await renderGallery();

    const figures = galleryFigures(container);

    expect(figures).toHaveLength(3);

    expect(
      figures[2].querySelector("figcaption"),
    ).toBeNull();

    expect(
      figures[0].querySelector("figcaption"),
    ).not.toBeNull();
  });

  it("displays placeholder images when the published Gallery is empty", async () => {
    mocks.getPublicGalleryImages.mockResolvedValueOnce(
      [],
    );

    const { container } = await renderGallery();

    const figures = galleryFigures(container);

    expect(figures).toHaveLength(9);

    const placeholderImages = container.querySelectorAll(
      "figure [data-src='/TEAZO_logo.svg']",
    );

    expect(placeholderImages).toHaveLength(9);

    expect(
      screen.getByText("Signature Drinks"),
    ).toBeTruthy();

    expect(
      screen.getByText("Fresh Fruit Tea"),
    ).toBeTruthy();
  });

  it("displays placeholders when Gallery retrieval is unavailable", async () => {
    // The Gallery service handles its own database errors
    // and returns null when public images cannot be read.
    mocks.getPublicGalleryImages.mockResolvedValueOnce(
      null,
    );

    const { container } = await renderGallery();

    expect(galleryFigures(container)).toHaveLength(9);

    expect(
      container.querySelectorAll(
        "figure [data-src='/TEAZO_logo.svg']",
      ),
    ).toHaveLength(9);
  });

  it("uses the configured website logo", async () => {
    mocks.getWebsiteContent.mockResolvedValueOnce({
      logo: "https://images.example.invalid/logo.webp",
    });

    const { container } = await renderGallery();

    const logo = container.querySelector(
      "[data-src='https://images.example.invalid/logo.webp']",
    );

    expect(logo).not.toBeNull();

    expect(
      logo?.getAttribute("aria-label"),
    ).toBe("TEAZO logo");

    expect(
      screen.getByRole("heading", {
        name: "GALLERY",
      }),
    ).toBeTruthy();
  });
});
