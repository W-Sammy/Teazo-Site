/**
 * Regression tests for Admin Gallery file-size validation.
 *
 * Test client-side MP4/WebM limits, image preparation,
 * replacement behavior, and disabled Save controls.
 *
 * The image compression utility and Next.js image rendering
 * are mocked. No uploads, database writes, or external
 * requests are performed.
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
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { AdminGalleryImage } from "@/app/types/gallery-image";

const mocks = vi.hoisted(() => ({
  prepareGalleryImage: vi.fn(),
}));

vi.mock("../../../lib/gallery-image-compression", () => ({
  MAX_GALLERY_UPLOAD_BYTES: 4 * 1024 * 1024,
  prepareGalleryImage: mocks.prepareGalleryImage,
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      role="img"
      aria-label={alt}
      data-src={src}
    />
  ),
}));

import GalleryUploadForm from "./gallery-upload-form";

const maxBytes = 4 * 1024 * 1024;

const existingVideo: AdminGalleryImage = {
  id: "existing-video",
  name: "Existing Video",
  url: "/gallery/existing.mp4",
  tags: [],
  createdAt: "2026-11-23T12:00:00.000Z",
  mediaType: "video",
};

function sizedFile(
  size: number,
  type: string,
  name: string,
): File {
  const file = new File(
    [new Uint8Array([1])],
    name,
    { type },
  );

  // Simulate the real size without allocating large files.
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });

  return file;
}

function renderForm(
  initialImage: AdminGalleryImage | null = null,
) {
  const onSave = vi.fn(async () => {});
  const onCancel = vi.fn();

  const view = render(
    <GalleryUploadForm
      initialImage={initialImage}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  const fileInput = view.container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;

  if (!fileInput) {
    throw new Error("Gallery file input missing");
  }

  return {
    ...view,
    fileInput,
    onSave,
    onCancel,
  };
}

describe("Admin Gallery upload-size boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(
        () => "blob:test-gallery-file",
      ),
      revokeObjectURL: vi.fn(),
    });

    mocks.prepareGalleryImage.mockImplementation(
      async (file: File) => file,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["MP4", "video/mp4", "video.mp4"],
    ["WebM", "video/webm", "video.webm"],
    ["MOV", "video/quicktime", "video.mov"],
  ])(
    "accepts a %s exactly at 4 MiB",
    async (_format, mimeType, filename) => {
      const { fileInput, onSave } = renderForm();

      const file = sizedFile(
        maxBytes,
        mimeType,
        filename,
      );

      fireEvent.change(fileInput, {
        target: { files: [file] },
      });

      expect(screen.queryByRole("alert")).toBeNull();

      expect(
        screen.getByRole("button", {
          name: "Save",
        }).hasAttribute("disabled"),
      ).toBe(false);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Save",
        }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledOnce();
      });

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          file,
        }),
      );

      expect(
        mocks.prepareGalleryImage,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["MP4", "video/mp4", "video.mp4"],
    ["WebM", "video/webm", "video.webm"],
    ["MOV", "video/quicktime", "video.mov"],
  ])(
    "rejects a %s one byte above 4 MiB",
    (_format, mimeType, filename) => {
      const { fileInput, onSave } = renderForm();

      fireEvent.change(fileInput, {
        target: {
          files: [
            sizedFile(
              maxBytes + 1,
              mimeType,
              filename,
            ),
          ],
        },
      });

      expect(
        screen.getByRole("alert").textContent,
      ).toContain("maximum allowed size is 4 MB");

      expect(
        screen.getByRole("button", {
          name: "Save",
        }).hasAttribute("disabled"),
      ).toBe(true);

      expect(onSave).not.toHaveBeenCalled();
    },
  );

  it.each(["", "application/octet-stream"])(
    "accepts an iPhone MOV with MIME type %s",
    async (mimeType) => {
      const { fileInput, onSave } = renderForm();
      const original = sizedFile(1000, mimeType, "IMG_0001.MOV");

      fireEvent.change(fileInput, {
        target: { files: [original] },
      });

      expect(screen.queryByRole("alert")).toBeNull();

      fireEvent.click(
        screen.getByRole("button", { name: "Save" }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledOnce();
      });

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({
            name: "IMG_0001.MOV",
            type: "video/quicktime",
          }),
        }),
      );
      expect(mocks.prepareGalleryImage).not.toHaveBeenCalled();
    },
  );

  it("accepts an image at 4 MiB without compression", () => {
    const { fileInput } = renderForm();

    fireEvent.change(fileInput, {
      target: {
        files: [
          sizedFile(
            maxBytes,
            "image/png",
            "photo.png",
          ),
        ],
      },
    });

    expect(
      mocks.prepareGalleryImage,
    ).not.toHaveBeenCalled();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("compresses an image above 4 MiB before saving", async () => {
    const { fileInput, onSave } = renderForm();

    const original = sizedFile(
      maxBytes + 1,
      "image/png",
      "large.png",
    );

    const compressed = sizedFile(
      200_000,
      "image/webp",
      "large.webp",
    );

    mocks.prepareGalleryImage.mockResolvedValueOnce(
      compressed,
    );

    fireEvent.change(fileInput, {
      target: { files: [original] },
    });

    await waitFor(() => {
      expect(
        mocks.prepareGalleryImage,
      ).toHaveBeenCalledWith(original);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Save",
        }).hasAttribute("disabled"),
      ).toBe(false);
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save",
      }),
    );

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          file: compressed,
        }),
      );
    });
  });

  it("rejects a compressed image that remains oversized", async () => {
    const { fileInput, onSave } = renderForm();

    mocks.prepareGalleryImage.mockResolvedValueOnce(
      sizedFile(
        maxBytes + 1,
        "image/webp",
        "still-large.webp",
      ),
    );

    fireEvent.change(fileInput, {
      target: {
        files: [
          sizedFile(
            maxBytes + 2,
            "image/png",
            "large.png",
          ),
        ],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "prepared image exceeds the 4 MB upload limit",
      );
    });

    expect(
      screen.getByRole("button", {
        name: "Save",
      }).hasAttribute("disabled"),
    ).toBe(true);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("preserves the existing preview after a rejected video replacement", () => {
    const { fileInput, onSave } =
      renderForm(existingVideo);

    fireEvent.change(fileInput, {
      target: {
        files: [
          sizedFile(
            maxBytes + 1,
            "video/mp4",
            "too-large.mp4",
          ),
        ],
      },
    });

    expect(
      screen.getByRole("alert").textContent,
    ).toContain("maximum allowed size is 4 MB");

    const preview = screen.getByLabelText(
      "Existing Video preview",
    );

    expect(
      preview.getAttribute("src"),
    ).toBe(existingVideo.url);

    expect(onSave).not.toHaveBeenCalled();
  });
});
