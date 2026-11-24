/**
 * Regression tests for public Gallery cache invalidation.
 *
 * A successful image or video upload must clear the public
 * Gallery cache, including when the database read-back works.
 *
 * D1, R2, Sharp, and Next.js caching are mocked.
 * No real media uploads or database writes are performed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  putMedia: vi.fn(),
  recordGalleryImage: vi.fn(),
  getGalleryImage: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (loader: () => Promise<unknown>) => loader,
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock("sharp", () => {
  const processor = {
    rotate: vi.fn(),
    resize: vi.fn(),
    webp: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue({
      data: Buffer.from([1, 2, 3]),
      info: { width: 800, height: 600 },
    }),
  };

  processor.rotate.mockReturnValue(processor);
  processor.resize.mockReturnValue(processor);
  processor.webp.mockReturnValue(processor);

  return {
    default: vi.fn(() => processor),
  };
});

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {
    status?: number;
  },
}));

vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  mintKey: vi.fn(() => "gallery/generated.webp"),
  putMedia: mocks.putMedia,
  deleteMediaNow: vi.fn(),
  toPublicUrl: (key: string) =>
    `https://media.example/${key}`,
}));

vi.mock("@/app/lib/queries/gallery", () => ({
  MAX_GALLERY_TAGS: 12,
  normalizeTag: (value: string) =>
    value.trim().toLowerCase(),
  recordGalleryImage: mocks.recordGalleryImage,
  getGalleryImage: mocks.getGalleryImage,
  listGalleryImages: vi.fn(),
  listPublishedGalleryImages: vi.fn(),
  updateGalleryImageMetadata: vi.fn(),
  replaceGalleryImageMedia: vi.fn(),
  deleteGalleryImage: vi.fn(),
}));

import { saveGalleryImage } from "./gallery";

const imageRecord = {
  id: "gallery-item-1",
  name: "Test Upload",
  caption: null,
  alt: null,
  isPublished: true,
  createdAt: "2026-11-23T12:00:00.000Z",
  r2Key: "gallery/generated.webp",
  mimeType: "image/webp",
  mediaId: "media-1",
  r2Bucket: "Images",
  width: 800,
  height: 600,
  tags: [],
};

function uploadFile(type: string, name: string) {
  return new File(
    [new Uint8Array([1, 2, 3])],
    name,
    { type },
  );
}

describe("Public Gallery cache invalidation after upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.putMedia.mockResolvedValue({
      bucket: "Images",
      key: "gallery/generated.webp",
      size: 3,
    });

    mocks.recordGalleryImage.mockResolvedValue(undefined);
    mocks.getGalleryImage.mockResolvedValue(imageRecord);
  });

  it.each([
    ["image", "image/png", "test.png"],
    ["video", "video/mp4", "test.mp4"],
  ])(
    "invalidates the public cache after a successful %s upload and read-back",
    async (_mediaType, mimeType, filename) => {
      mocks.getGalleryImage.mockResolvedValueOnce({
        ...imageRecord,
        mimeType:
          mimeType === "video/mp4"
            ? "video/mp4"
            : "image/webp",
      });

      await saveGalleryImage({
        file: uploadFile(mimeType, filename),
        name: "Test Upload",
        tags: [],
        adminId: "admin-1",
      });

      expect(mocks.recordGalleryImage).toHaveBeenCalledOnce();
      expect(mocks.getGalleryImage).toHaveBeenCalledOnce();

      expect(mocks.revalidateTag).toHaveBeenCalledOnce();
      expect(mocks.revalidateTag).toHaveBeenCalledWith(
        "gallery",
        { expire: 0 },
      );
    },
  );

  it("invalidates the public cache when the database read-back returns null", async () => {
    mocks.getGalleryImage.mockResolvedValueOnce(null);

    await saveGalleryImage({
      file: uploadFile("image/png", "test.png"),
      name: "Test Upload",
      tags: [],
      adminId: "admin-1",
    });

    expect(mocks.recordGalleryImage).toHaveBeenCalledOnce();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      "gallery",
      { expire: 0 },
    );
  });

  it("does not invalidate the cache when the database rejects the upload", async () => {
    mocks.recordGalleryImage.mockRejectedValueOnce(
      new Error("Database write failed"),
    );

    await expect(
      saveGalleryImage({
        file: uploadFile("image/png", "test.png"),
        name: "Test Upload",
        tags: [],
        adminId: "admin-1",
      }),
    ).rejects.toThrow("Database write failed");

    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
