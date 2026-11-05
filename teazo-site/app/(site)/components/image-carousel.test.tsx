/**
 * Frontend tests for the public Teazo image carousel.
 *
 * Verifies empty-image behavior, visibility filtering,
 * accessible descriptions, dot navigation, transition
 * locking, automatic advancement, and changing image lists.
 *
 * Next.js Image is replaced with a lightweight component.
 * No network requests or image downloads occur.
 */

// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  CarouselImage,
} from "@/app/types/website-content";

import ImageCarousel from "./image-carousel";

// Represent Next.js images without loading image assets.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    loading,
  }: {
    src: string;
    alt: string;
    loading?: string;
  }) => (
    <span
      role="img"
      aria-label={alt}
      data-src={src}
      data-loading={loading}
    />
  ),
}));

// All test images use synthetic local paths.
const IMAGES: CarouselImage[] = [
  {
    id: "carousel-test-1",
    src: "/test-carousel-one.jpg",
    alt: "First synthetic carousel image",
    enabled: true,
  },
  {
    id: "carousel-test-2",
    src: "/test-carousel-two.jpg",
    alt: "Second synthetic carousel image",
    enabled: true,
  },
  {
    id: "carousel-test-3",
    src: "/test-carousel-three.jpg",
    alt: "Third synthetic carousel image",
    enabled: true,
  },
];

// The existing carousel identifies its active navigation
// dot with the bg-black class.
function activeDotNumber(): number {
  const dots = screen.getAllByRole("button", {
    name: /Go to image \d+/,
  });

  const selected = dots.find(
    (dot) => dot.className.includes("bg-black"),
  );

  expect(selected).toBeDefined();

  return dots.indexOf(selected!) + 1;
}

afterEach(() => {
  // Unmount first so component timers are cleaned up
  // before restoring the test clock.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Public image carousel", () => {
  it("renders nothing when no images are available", () => {
    const { container } = render(
      <ImageCarousel images={[]} />,
    );

    expect(container.firstChild).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: /Go to image/,
      }),
    ).toBeNull();
  });

  it("filters disabled images and images with blank sources", () => {
    render(
      <ImageCarousel
        images={[
          IMAGES[0],
          {
            ...IMAGES[1],
            enabled: false,
          },
          {
            ...IMAGES[2],
            src: "   ",
          },
        ]}
      />,
    );

    expect(
      screen.getAllByRole("img"),
    ).toHaveLength(1);

    expect(
      screen.getByRole("img", {
        name: IMAGES[0].alt,
      }),
    ).toBeTruthy();

    expect(
      screen.getAllByRole("button", {
        name: /Go to image/,
      }),
    ).toHaveLength(1);
  });

  it("preserves accessible descriptions and image sources", () => {
    render(
      <ImageCarousel images={IMAGES} />,
    );

    for (const image of IMAGES) {
      const rendered = screen.getByRole("img", {
        name: image.alt,
      });

      expect(
        rendered.getAttribute("data-src"),
      ).toBe(image.src);
    }

    expect(
      screen.getAllByRole("img"),
    ).toHaveLength(3);
  });

  it("selects the first image initially", () => {
    render(
      <ImageCarousel images={IMAGES} />,
    );

    expect(activeDotNumber()).toBe(1);

    expect(
      screen.getAllByRole("button", {
        name: /Go to image/,
      }),
    ).toHaveLength(3);
  });

  it("changes the selected image using navigation dots", () => {
    render(
      <ImageCarousel images={IMAGES} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Go to image 2",
      }),
    );

    expect(activeDotNumber()).toBe(2);
  });

  it("prevents another transition while an animation is active", () => {
    vi.useFakeTimers();

    render(
      <ImageCarousel images={IMAGES} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Go to image 2",
      }),
    );

    // The animation lock lasts 500 milliseconds.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Go to image 3",
      }),
    );

    expect(activeDotNumber()).toBe(2);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Go to image 3",
      }),
    );

    expect(activeDotNumber()).toBe(3);
  });

  it("automatically advances and wraps to the first image", () => {
    vi.useFakeTimers();

    render(
      <ImageCarousel images={IMAGES} />,
    );

    expect(activeDotNumber()).toBe(1);

    // The carousel advances every five seconds.
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(activeDotNumber()).toBe(2);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(activeDotNumber()).toBe(3);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(activeDotNumber()).toBe(1);
  });

  it("keeps the selected index valid when the image list shrinks", () => {
    const { rerender } = render(
      <ImageCarousel images={IMAGES} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Go to image 3",
      }),
    );

    expect(activeDotNumber()).toBe(3);

    // Simulate content changing after a carousel update.
    rerender(
      <ImageCarousel images={[IMAGES[0]]} />,
    );

    expect(activeDotNumber()).toBe(1);

    expect(
      screen.getAllByRole("img"),
    ).toHaveLength(1);
  });
});
