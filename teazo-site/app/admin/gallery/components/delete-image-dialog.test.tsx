/**
 * Regression tests for the Admin Gallery delete confirmation dialog.
 *
 * Covers image/video previews, media-specific wording,
 * preview failures, cancellation, and deletion errors.
 *
 * No production requests, database writes, or deletions occur.
 */

// @vitest-environment jsdom

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
  waitFor,
  within,
} from "@testing-library/react";

import type { AdminGalleryImage } from "@/app/types/gallery-image";

// Mock Next.js image optimization while retaining the real
// GalleryImage component's media-type handling.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      data-testid="next-image"
      data-src={src}
      aria-label={alt}
    />
  ),
}));

import DeleteImageDialog from "./delete-image-dialog";

const testImage: AdminGalleryImage = {
  id: "image-1",
  name: "Test Image",
  url: "/gallery/test.webp",
  tags: [],
  createdAt: "2026-11-23T12:00:00.000Z",
  mediaType: "image",
};

const testVideo: AdminGalleryImage = {
  id: "video-1",
  name: "Test Video",
  url: "/gallery/test.mp4",
  tags: [],
  createdAt: "2026-11-23T12:00:00.000Z",
  mediaType: "video",
};

function renderDialog(image: AdminGalleryImage | null) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn(
    async (): Promise<string | null> => null,
  );

  render(
    <DeleteImageDialog
      image={image}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  return { onCancel, onConfirm };
}

describe("Admin Gallery delete confirmation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when no item is selected", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("displays an image thumbnail and image-specific wording", () => {
    renderDialog(testImage);

    const dialog = screen.getByRole("dialog", {
      name: "Delete image?",
    });

    const preview = within(dialog).getByTestId(
      "next-image",
    );

    expect(preview.getAttribute("data-src")).toBe(
      testImage.url,
    );

    expect(dialog.querySelector("video")).toBeNull();

    expect(dialog.textContent).toContain(
      "This removes the image from the Gallery page.",
    );
  });

  it("displays a video thumbnail and video-specific wording", () => {
    renderDialog(testVideo);

    const dialog = screen.getByRole("dialog", {
      name: "Delete video?",
    });

    const video = dialog.querySelector("video");

    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe(
      testVideo.url,
    );

    expect(
      within(dialog).getByRole("img", {
        name: "Test Video: video thumbnail",
      }),
    ).toBeTruthy();

    expect(
      within(dialog).queryByTestId("next-image"),
    ).toBeNull();

    expect(dialog.textContent).toContain(
      "This removes the video from the Gallery page.",
    );
  });

  it("handles a video preview failure without showing a broken image", () => {
    renderDialog(testVideo);

    const dialog = screen.getByRole("dialog", {
      name: "Delete video?",
    });

    const video = dialog.querySelector("video");

    expect(video).not.toBeNull();

    fireEvent.error(video!);

    expect(
      within(dialog).getByRole("img", {
        name: "Test Video: video preview unavailable",
      }),
    ).toBeTruthy();

    expect(dialog.querySelector("video")).toBeNull();

    expect(
      within(dialog).getByRole("button", {
        name: "Cancel",
      }),
    ).toBeTruthy();
  });

  it("cancels without requesting deletion", () => {
    const { onCancel, onConfirm } =
      renderDialog(testVideo);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does not cancel when clicking inside the dialog", () => {
    const { onCancel } = renderDialog(testImage);

    const dialog = screen.getByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("heading", {
        name: "Delete image?",
      }),
    );

    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(dialog);

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls the deletion callback on confirmation", async () => {
    const { onConfirm } = renderDialog(testVideo);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("displays an error when deletion is rejected", async () => {
    const { onConfirm } = renderDialog(testVideo);

    onConfirm.mockResolvedValueOnce(
      "The video could not be deleted.",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "The video could not be deleted.",
      );
    });

    expect(
      screen.getByRole("dialog", {
        name: "Delete video?",
      }),
    ).toBeTruthy();
  });

  it("handles unexpected deletion errors", async () => {
    vi.spyOn(console, "error").mockImplementation(
      () => {},
    );

    const { onConfirm } = renderDialog(testVideo);

    onConfirm.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "The gallery item could not be deleted. Please try again.",
      );
    });

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      }).hasAttribute("disabled"),
    ).toBe(false);
  });
});
