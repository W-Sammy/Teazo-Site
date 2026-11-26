/**
 * Regression tests for Gallery server upload-size limits.
 *
 * Videos are limited to 4 MiB for both new uploads and
 * media replacements. Oversized requests must be rejected
 * before writing to R2 or D1.
 *
 * File sizes are simulated without allocating large files.
 * Sharp, R2, D1, and Next.js caching are mocked.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  putMedia: vi.fn(),
  recordGalleryImage: vi.fn(),
  getGalleryImage: vi.fn(),
  replaceGalleryImageMedia: vi.fn(),
  deleteMediaNow: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (
    loader: () => Promise<unknown>,
  ) => loader,
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock("sharp", () => {
  const processor = {
    rotate: vi.fn(),
    webp: vi.fn(),
    toBuffer: vi.fn().mockResolvedValue({
      data: Buffer.from([1, 2, 3]),
      info: { width: 800, height: 600 },
    }),
  };

  processor.rotate.mockReturnValue(processor);
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
  mintKey: vi.fn(() => "gallery/test-media"),
  putMedia: mocks.putMedia,
  deleteMediaNow: mocks.deleteMediaNow,
  toPublicUrl: (key: string) =>
    `https://media.example/${key}`,
}));

vi.mock("@/app/lib/queries/gallery", () => ({
  MAX_GALLERY_TAGS: 12,
  normalizeTag: (value: string) =>
    value.trim().toLowerCase(),
  recordGalleryImage: mocks.recordGalleryImage,
  getGalleryImage: mocks.getGalleryImage,
  replaceGalleryImageMedia:
    mocks.replaceGalleryImageMedia,
  listGalleryImages: vi.fn(),
  listPublishedGalleryImages: vi.fn(),
  updateGalleryImageMetadata: vi.fn(),
  deleteGalleryImage: vi.fn(),
}));

import {
  replaceGalleryImage,
  saveGalleryImage,
} from "./gallery";

const maxVideoBytes = 4 * 1024 * 1024;

const storedRecord = {
  id: "image-1",
  name: "Test Media",
  caption: null,
  alt: null,
  isPublished: true,
  createdAt: "2026-11-23T12:00:00.000Z",
  r2Key: "gallery/test-media",
  mimeType: "video/mp4",
  mediaId: "media-original",
  r2Bucket: "Images",
  width: null,
  height: null,
  tags: [],
};

function fileWithSize(
  size: number,
  type: string,
  name: string,
): File {
  const file = new File(
    [new Uint8Array([1])],
    name,
    { type },
  );

  // Exercise size validation without allocating a 4 MiB buffer.
  Object.defineProperty(file, "size", {
    configurable: true,
    value: size,
  });

  return file;
}

function newUpload(file: File) {
  return {
    file,
    name: "Test Media",
    tags: [],
    adminId: "admin-1",
  };
}

function replacement(file: File) {
  return {
    id: "image-1",
    file,
    name: "Updated Test Media",
    tags: [],
    adminId: "admin-1",
  };
}

describe("Gallery server upload boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.putMedia.mockResolvedValue({
      bucket: "Images",
      key: "gallery/test-media",
      size: 1,
    });

    mocks.recordGalleryImage.mockResolvedValue(
      undefined,
    );

    mocks.getGalleryImage.mockResolvedValue(
      storedRecord,
    );

    mocks.replaceGalleryImageMedia.mockResolvedValue({
      ...storedRecord,
      name: "Updated Test Media",
      mediaId: "media-new",
    });

    mocks.deleteMediaNow.mockResolvedValue(undefined);
  });

  it.each([
    ["MP4", "video/mp4", "test.mp4"],
    ["WebM", "video/webm", "test.webm"],
    ["MOV", "video/quicktime", "test.mov"],
  ])(
    "accepts a %s upload exactly at 4 MiB",
    async (_format, mimeType, filename) => {
      await saveGalleryImage(
        newUpload(
          fileWithSize(
            maxVideoBytes,
            mimeType,
            filename,
          ),
        ),
      );

      expect(mocks.putMedia).toHaveBeenCalledOnce();
      expect(
        mocks.recordGalleryImage,
      ).toHaveBeenCalledOnce();

      expect(mocks.putMedia).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Uint8Array),
        mimeType,
      );
    },
  );

  it.each([
    ["MP4", "video/mp4", "test.mp4"],
    ["WebM", "video/webm", "test.webm"],
    ["MOV", "video/quicktime", "test.mov"],
  ])(
    "rejects a %s upload one byte above 4 MiB",
    async (_format, mimeType, filename) => {
      await expect(
        saveGalleryImage(
          newUpload(
            fileWithSize(
              maxVideoBytes + 1,
              mimeType,
              filename,
            ),
          ),
        ),
      ).rejects.toMatchObject({
        status: 413,
        message: "The video is over 4 MB.",
      });

      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(
        mocks.recordGalleryImage,
      ).not.toHaveBeenCalled();
      expect(
        mocks.revalidateTag,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["MP4", "video/mp4", "replacement.mp4"],
    ["WebM", "video/webm", "replacement.webm"],
    ["MOV", "video/quicktime", "replacement.mov"],
  ])(
    "rejects an oversized %s replacement",
    async (_format, mimeType, filename) => {
      await expect(
        replaceGalleryImage(
          replacement(
            fileWithSize(
              maxVideoBytes + 1,
              mimeType,
              filename,
            ),
          ),
        ),
      ).rejects.toMatchObject({
        status: 413,
        message: "The video is over 4 MB.",
      });

      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(
        mocks.replaceGalleryImageMedia,
      ).not.toHaveBeenCalled();
      expect(
        mocks.revalidateTag,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(["", "application/octet-stream"])(
    "accepts a MOV with MIME type %s from the iPhone picker",
    async (mimeType) => {
      await saveGalleryImage(
        newUpload(fileWithSize(1024, mimeType, "IMG_0001.MOV")),
      );

      expect(mocks.putMedia).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Uint8Array),
        "video/quicktime",
      );
      expect(mocks.recordGalleryImage).toHaveBeenCalledOnce();
    },
  );

  it("accepts an MP4 replacement at the limit", async () => {
    await replaceGalleryImage(
      replacement(
        fileWithSize(
          maxVideoBytes,
          "video/mp4",
          "replacement.mp4",
        ),
      ),
    );

    expect(mocks.putMedia).toHaveBeenCalledOnce();

    expect(
      mocks.replaceGalleryImageMedia,
    ).toHaveBeenCalledOnce();

    expect(
      mocks.revalidateTag,
    ).toHaveBeenCalledOnce();
  });

  it("retains the existing 10 MiB image backstop", async () => {
    await expect(
      saveGalleryImage(
        newUpload(
          fileWithSize(
            10 * 1024 * 1024 + 1,
            "image/png",
            "too-large.png",
          ),
        ),
      ),
    ).rejects.toMatchObject({
      status: 413,
      message: "The file is over 10 MB.",
    });

    expect(mocks.putMedia).not.toHaveBeenCalled();
  });
});
