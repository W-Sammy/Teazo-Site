/**
 * Regression tests for Admin Gallery List View thumbnails.
 *
 * List View uses original stored images to avoid the washed-out
 * thumbnails observed with Next.js image optimization.
 *
 * Card View must retain image optimization. Video previews
 * and Gallery selection/editing behavior must remain intact.
 *
 * Next.js image rendering is mocked. No remote media requests,
 * database writes, or production operations occur.
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

import type {
  AdminGalleryImage,
} from "@/app/types/gallery-image";

// Expose the props passed to Next.js Image without performing
// actual image optimization or network requests.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    unoptimized,
    className,
    sizes,
    loading,
  }: {
    src: string;
    alt: string;
    unoptimized?: boolean;
    className?: string;
    sizes?: string;
    loading?: string;
  }) => (
    <span
      role="img"
      aria-label={alt}
      data-src={src}
      data-unoptimized={String(Boolean(unoptimized))}
      data-classname={className}
      data-sizes={sizes}
      data-loading={loading}
    />
  ),
}));

import AdminGalleryList from "./admin-gallery-list";
import AdminGalleryGrid from "./admin-gallery-grid";

const testImage: AdminGalleryImage = {
  id: "image-1",
  name: "PNG Compression Test",
  url: "http://127.0.0.1:8787/media/gallery/test.webp",
  tags: [],
  createdAt: "2026-11-23T12:00:00.000Z",
  mediaType: "image",
};

const testVideo: AdminGalleryImage = {
  id: "video-1",
  name: "Test Video 4MB",
  url: "http://127.0.0.1:8787/media/gallery/test.mp4",
  tags: [],
  createdAt: "2026-11-23T12:00:00.000Z",
  mediaType: "video",
};

function renderList(canEdit = true) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggleSelect = vi.fn();
  const onSelectAll = vi.fn();

  const result = render(
    <AdminGalleryList
      images={[testImage, testVideo]}
      canEdit={canEdit}
      onEdit={onEdit}
      onDelete={onDelete}
      selectedIds={[]}
      onToggleSelect={onToggleSelect}
      onSelectAll={onSelectAll}
    />,
  );

  return {
    ...result,
    onEdit,
    onDelete,
    onToggleSelect,
    onSelectAll,
  };
}

describe("Admin Gallery List View thumbnails", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("bypasses Next.js optimization for List View images", () => {
    renderList();

    const image = screen.getByRole("img", {
      name: "PNG Compression Test",
    });

    expect(
      image.getAttribute("data-unoptimized"),
    ).toBe("true");

    expect(
      image.getAttribute("data-src"),
    ).toBe(testImage.url);
  });

  it("uses object-contain without changing thumbnail size", () => {
    renderList();

    const image = screen.getByRole("img", {
      name: "PNG Compression Test",
    });

    expect(
      image.getAttribute("data-classname"),
    ).toContain("object-contain");

    expect(
      image.getAttribute("data-sizes"),
    ).toBe("44px");

    expect(
      image.closest(".h-11.w-11"),
    ).not.toBeNull();
  });

  it("retains the existing video thumbnail implementation", () => {
    const { container } = renderList();

    const video = container.querySelector("video");

    expect(video).not.toBeNull();

    expect(
      video?.getAttribute("src"),
    ).toBe(testVideo.url);

    expect(
      screen.getByRole("img", {
        name: "Test Video 4MB: video thumbnail",
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("img", {
        name: "Test Video 4MB",
      }),
    ).toBeNull();
  });

  it("keeps Card View image optimization enabled", () => {
    render(
      <AdminGalleryGrid
        images={[testImage]}
        canEdit={true}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        selectedIds={[]}
        onToggleSelect={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", {
      name: "PNG Compression Test",
    });

    expect(
      image.getAttribute("data-unoptimized"),
    ).toBe("false");

    expect(
      image.getAttribute("data-classname"),
    ).toContain("object-cover");
  });

  it("allows selecting a List View image without editing it", () => {
    const { onEdit, onToggleSelect } = renderList();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select PNG Compression Test",
      }),
    );

    expect(onToggleSelect).toHaveBeenCalledOnce();
    expect(onToggleSelect).toHaveBeenCalledWith(
      testImage.id,
    );

    expect(onEdit).not.toHaveBeenCalled();
  });

  it("preserves row-click editing", () => {
    const { onEdit } = renderList();

    fireEvent.click(
      screen.getByRole("img", {
        name: "PNG Compression Test",
      }),
    );

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith(testImage);
  });
});
