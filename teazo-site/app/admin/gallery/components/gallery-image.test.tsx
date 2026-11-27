// @vitest-environment jsdom

/**
 * Regression tests for Gallery thumbnail error recovery.
 *
 * A failed media source must not prevent a replacement
 * image or video from loading in the same mounted component.
 *
 * Image rendering is mocked. No network requests, database
 * operations, or production media changes occur.
 */

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

// Use an actual img element as the test-only replacement
// for next/image so React handles native image error events.
//
// This mock deliberately bypasses Next.js image processing.
// The alt attribute preserves the image's accessible name.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    onError,
  }: {
    src: string;
    alt: string;
    onError?: () => void;
  }) => {
    // A native img is required to test the error callback.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} onError={onError} />;
  },
}));

import GalleryImage from "./gallery-image";

const firstImage = "/media/gallery/first.webp";
const secondImage = "/media/gallery/second.webp";
const firstVideo = "/media/gallery/first.mp4";
const secondVideo = "/media/gallery/second.mp4";

describe("Gallery thumbnail error recovery", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("recovers when a failed image is replaced", () => {
    const { rerender } = render(
      <GalleryImage
        src={firstImage}
        alt="Gallery item"
        sizes="44px"
      />,
    );

    fireEvent.error(
      screen.getByRole("img", {
        name: "Gallery item",
      }),
    );

    expect(
      screen.getByRole("img", {
        name: "Gallery item could not be loaded",
      }),
    ).toBeTruthy();

    rerender(
      <GalleryImage
        src={secondImage}
        alt="Gallery item"
        sizes="44px"
      />,
    );

    const replacement = screen.getByRole("img", {
      name: "Gallery item",
    });

    expect(
      replacement.getAttribute("src"),
    ).toBe(secondImage);

    expect(
      screen.queryByText("Image unavailable"),
    ).toBeNull();
  });

  it("keeps the fallback for the same failed source", () => {
    const { rerender } = render(
      <GalleryImage
        src={firstImage}
        alt="Gallery item"
        sizes="44px"
      />,
    );

    fireEvent.error(
      screen.getByRole("img", {
        name: "Gallery item",
      }),
    );

    rerender(
      <GalleryImage
        src={firstImage}
        alt="Renamed gallery item"
        sizes="44px"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Renamed gallery item could not be loaded",
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("img", {
        name: "Renamed gallery item",
      }),
    ).toBeNull();
  });

  it("recovers when a failed video is replaced", () => {
    const { container, rerender } = render(
      <GalleryImage
        src={firstVideo}
        alt="Gallery clip"
        sizes="80px"
        mediaType="video"
      />,
    );

    const original = container.querySelector("video");

    expect(original).not.toBeNull();

    fireEvent.error(original!);

    expect(
      screen.getByRole("img", {
        name: "Gallery clip: video preview unavailable",
      }),
    ).toBeTruthy();

    expect(
      container.querySelector("video"),
    ).toBeNull();

    rerender(
      <GalleryImage
        src={secondVideo}
        alt="Gallery clip"
        sizes="80px"
        mediaType="video"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Gallery clip: video thumbnail",
      }),
    ).toBeTruthy();

    expect(
      container.querySelector("video")?.getAttribute("src"),
    ).toBe(secondVideo);
  });

  it("recovers when a failed image becomes a video", () => {
    const { container, rerender } = render(
      <GalleryImage
        src={firstImage}
        alt="Gallery item"
        sizes="80px"
      />,
    );

    fireEvent.error(
      screen.getByRole("img", {
        name: "Gallery item",
      }),
    );

    rerender(
      <GalleryImage
        src={firstVideo}
        alt="Gallery item"
        sizes="80px"
        mediaType="video"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Gallery item: video thumbnail",
      }),
    ).toBeTruthy();

    expect(
      container.querySelector("video")?.getAttribute("src"),
    ).toBe(firstVideo);
  });
});
