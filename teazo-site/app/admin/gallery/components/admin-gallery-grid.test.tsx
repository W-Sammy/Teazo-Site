/**
 * Regression tests for Admin Gallery Card View interactions.
 *
 * Ensures image and video thumbnails open the editing form,
 * while selection and deletion controls remain independent.
 *
 * Gallery media is mocked. No network requests, database writes,
 * or actual media deletions occur.
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
} from "@testing-library/react";

import type { AdminGalleryImage } from "@/app/types/gallery-image";

// Avoid loading actual media while testing card interactions.
vi.mock("./gallery-image", () => ({
  default: ({ alt }: { alt: string }) => (
    <span role="img" aria-label={alt} />
  ),
}));

import AdminGalleryGrid from "./admin-gallery-grid";

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

function renderGrid(canEdit = true) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggleSelect = vi.fn();

  render(
    <AdminGalleryGrid
      images={[testImage, testVideo]}
      canEdit={canEdit}
      onEdit={onEdit}
      onDelete={onDelete}
      selectedIds={[]}
      onToggleSelect={onToggleSelect}
    />,
  );

  return { onEdit, onDelete, onToggleSelect };
}

describe("Admin Gallery Card View interactions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the editor when an image thumbnail is clicked", () => {
    const { onEdit } = renderGrid();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Test Image",
      }),
    );

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(testImage);
  });

  it("opens the editor when a video thumbnail is clicked", () => {
    const { onEdit } = renderGrid();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit Test Video",
      }),
    );

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(testVideo);
  });

  it("provides a pointer cursor for both media thumbnails", () => {
    renderGrid();

    const imageButton = screen.getByRole("button", {
      name: "Edit Test Image",
    });

    const videoButton = screen.getByRole("button", {
      name: "Edit Test Video",
    });

    expect(imageButton.className).toContain(
      "cursor-pointer",
    );

    expect(videoButton.className).toContain(
      "cursor-pointer",
    );

    expect(videoButton.className).toContain("z-10");
  });

  it("selects a video without opening its editor", () => {
    const { onEdit, onToggleSelect } = renderGrid();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Test Video",
      }),
    );

    expect(onToggleSelect).toHaveBeenCalledOnce();
    expect(onToggleSelect).toHaveBeenCalledWith(
      testVideo.id,
    );

    expect(onEdit).not.toHaveBeenCalled();
  });

  it("deletes a video without opening its editor", () => {
    const { onEdit, onDelete } = renderGrid();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete Test Video",
      }),
    );

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(testVideo);

    expect(onEdit).not.toHaveBeenCalled();
  });

  it("keeps selection and deletion controls above the edit overlay", () => {
    renderGrid();

    const selectVideo = screen.getByRole("checkbox", {
      name: "Select Test Video",
    });

    const deleteVideo = screen.getByRole("button", {
      name: "Delete Test Video",
    });

    expect(
      selectVideo.closest("label")?.className,
    ).toContain("z-20");

    expect(deleteVideo.className).toContain("z-20");
  });

  it("does not expose editing controls to read-only users", () => {
    const { onEdit, onDelete } = renderGrid(false);

    expect(
      screen.queryByRole("button", {
        name: "Edit Test Video",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: "Edit Test Image",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("checkbox", {
        name: "Select Test Video",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: "Delete Test Video",
      }),
    ).toBeNull();

    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
