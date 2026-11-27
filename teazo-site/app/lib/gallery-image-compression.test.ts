/**
 * Regression tests for Gallery image compression.
 *
 * Images over 4 MiB are compressed at their original pixel
 * dimensions, never downscaled. Images that cannot fit are
 * rejected before upload.
 *
 * Browser decoding and WebP encoding are mocked.
 * No network requests or database writes occur.
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
  MAX_GALLERY_UPLOAD_BYTES,
  prepareGalleryImage,
} from "./gallery-image-compression";

const mocks = vi.hoisted(() => ({
  drawImage: vi.fn(),
  createObjectURL: vi.fn(() => "blob:test-image"),
  revokeObjectURL: vi.fn(),
}));

function makeImage(
  byteSize: number,
  type = "image/png",
  filename = "photo.png",
): File {
  return new File(
    [new Uint8Array(byteSize)],
    filename,
    { type },
  );
}

class FakeImage {
  src = "";
  naturalWidth = 3840;
  naturalHeight = 2160;

  async decode(): Promise<void> {
    return;
  }
}

describe("Gallery resolution-preserving compression", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("URL", {
      createObjectURL: mocks.createObjectURL,
      revokeObjectURL: mocks.revokeObjectURL,
    });

    vi.stubGlobal("Image", FakeImage);

    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockImplementation(
      () => ({
        drawImage: mocks.drawImage,
      }) as unknown as CanvasRenderingContext2D,
    );

    vi.spyOn(
      HTMLCanvasElement.prototype,
      "toBlob",
    ).mockImplementation((callback) => {
      callback(
        new Blob(
          [new Uint8Array(1024)],
          { type: "image/webp" },
        ),
      );
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts images below the limit without compression", async () => {
    const file = makeImage(1024);

    const result = await prepareGalleryImage(file);

    expect(result).toBe(file);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.drawImage).not.toHaveBeenCalled();
  });

  it("accepts an image exactly at the 4 MiB boundary", async () => {
    const file = makeImage(
      MAX_GALLERY_UPLOAD_BYTES,
    );

    const result = await prepareGalleryImage(file);

    expect(result).toBe(file);
    expect(mocks.drawImage).not.toHaveBeenCalled();
  });

  it("compresses larger images while preserving dimensions", async () => {
    const file = makeImage(
      MAX_GALLERY_UPLOAD_BYTES + 1,
    );

    const result = await prepareGalleryImage(file);

    expect(result.size).toBeLessThanOrEqual(
      MAX_GALLERY_UPLOAD_BYTES,
    );

    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("photo.webp");

    // The canvas must retain the original pixel dimensions.
    expect(mocks.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({
        naturalWidth: 3840,
        naturalHeight: 2160,
      }),
      0,
      0,
      3840,
      2160,
    );

    expect(mocks.createObjectURL).toHaveBeenCalledOnce();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith(
      "blob:test-image",
    );
  });

  it("rejects an image that cannot fit without downscaling", async () => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "toBlob",
    ).mockImplementation((callback) => {
      callback(
        new Blob(
          [new Uint8Array(MAX_GALLERY_UPLOAD_BYTES + 1)],
          { type: "image/webp" },
        ),
      );
    });

    await expect(
      prepareGalleryImage(
        makeImage(MAX_GALLERY_UPLOAD_BYTES + 1),
      ),
    ).rejects.toThrow(
      "could not be compressed below 4 MB without reducing its resolution",
    );

    // Compression failures must not cause a dimension change.
    expect(mocks.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      3840,
      2160,
    );
  });

  it("rejects an empty image", async () => {
    await expect(
      prepareGalleryImage(makeImage(0)),
    ).rejects.toThrow(
      "The selected image must be nonempty.",
    );
  });

  it("rejects unsupported image formats", async () => {
    await expect(
      prepareGalleryImage(
        makeImage(100, "application/pdf", "test.pdf"),
      ),
    ).rejects.toThrow(
      "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
    );
  });

  it("rejects an unavailable WebP encoder", async () => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "toBlob",
    ).mockImplementation((callback) => {
      callback(null);
    });

    await expect(
      prepareGalleryImage(
        makeImage(MAX_GALLERY_UPLOAD_BYTES + 1),
      ),
    ).rejects.toThrow(
      "This browser could not encode the image as WebP.",
    );
  });
});
