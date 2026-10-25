/**
 * Tests the shared Gallery service used by admin and public pages.
 *
 * Covers image validation, WebP conversion, upload persistence,
 * metadata edits, image replacement, media cleanup, and gallery
 * listing behavior.
 *
 * Sharp, D1 queries, R2 storage, and Next.js navigation are mocked.
 * No real images are stored or database records modified.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { D1Error } from "@/app/lib/d1";
import {
  deleteMediaNow,
  putMedia,
  toPublicUrl,
} from "@/app/lib/media";
import {
  deleteGalleryImage,
  getGalleryImage,
  listGalleryImages,
  listPublishedGalleryImages,
  recordGalleryImage,
  replaceGalleryImageMedia,
  updateGalleryImageMetadata,
  type GalleryImageRecord,
} from "@/app/lib/queries/gallery";
import { unstable_rethrow } from "next/navigation";
import sharp from "sharp";

import {
  editGalleryImageMetadata,
  getAdminGalleryImages,
  getPublicGalleryImages,
  GalleryInputError,
  removeGalleryImage,
  replaceGalleryImage,
  saveGalleryImage,
} from "./gallery";

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = "D1Error";
      this.status = status;
    }
  },
}));

// Sharp returns a chain of operations followed by a converted buffer.
vi.mock("sharp", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  deleteMediaNow: vi.fn(),
  mintKey: vi.fn(() => "gallery/generated.webp"),
  putMedia: vi.fn(),
  toPublicUrl: vi.fn(
    (key: string) => `https://media.example/${key}`,
  ),
}));

vi.mock("@/app/lib/queries/gallery", () => ({
  MAX_GALLERY_TAGS: 12,
  normalizeTag: (name: string) =>
    name.trim().replace(/\s+/g, " ").toLowerCase(),
  deleteGalleryImage: vi.fn(),
  getGalleryImage: vi.fn(),
  listGalleryImages: vi.fn(),
  listPublishedGalleryImages: vi.fn(),
  recordGalleryImage: vi.fn(),
  replaceGalleryImageMedia: vi.fn(),
  updateGalleryImageMetadata: vi.fn(),
}));

const STORED_MEDIA = {
  bucket: "Images",
  key: "gallery/generated.webp",
  size: 3,
};

function imageRecord(
  overrides: Partial<GalleryImageRecord> = {},
): GalleryImageRecord {
  return {
    id: "image-1",
    name: "Milk Tea",
    caption: null,
    alt: null,
    isPublished: true,
    createdAt: "2026-10-25T12:00:00.000Z",
    r2Key: "gallery/original.webp",
    mediaId: "media-original",
    r2Bucket: "Images",
    width: 800,
    height: 600,
    tags: ["Drinks"],
    ...overrides,
  };
}

function image(
  type = "image/png",
  name = "photo.png",
  bytes: Uint8Array = new Uint8Array([1, 2, 3]),
): File {
  return new File(
    [Uint8Array.from(bytes).buffer],
    name,
    { type },
  );
}

function uploadInput(
  overrides: Record<string, unknown> = {},
) {
  return {
    file: image(),
    name: "Milk Tea",
    tags: ["Drinks"],
    adminId: "admin-1",
    ...overrides,
  };
}

function replacementInput(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "image-1",
    file: image(),
    name: "Updated Milk Tea",
    tags: ["New"],
    adminId: "admin-1",
    ...overrides,
  };
}

function d1Error(status: number): Error {
  return new D1Error("Database failure", status);
}

describe("Gallery service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // The resize chain is mocked so test image bytes need not
    // contain a real JPEG/PNG/WebP encoding.
    const processor = {
      rotate: vi.fn(),
      resize: vi.fn(),
      webp: vi.fn(),
      toBuffer: vi.fn().mockResolvedValue({
        data: Buffer.from([4, 5, 6]),
        info: { width: 800, height: 600 },
      }),
    };

    processor.rotate.mockReturnValue(processor);
    processor.resize.mockReturnValue(processor);
    processor.webp.mockReturnValue(processor);

    vi.mocked(sharp).mockReturnValue(processor as never);

    vi.mocked(putMedia).mockResolvedValue(STORED_MEDIA);
    vi.mocked(deleteMediaNow).mockResolvedValue(undefined);
    vi.mocked(recordGalleryImage).mockResolvedValue(undefined);
    vi.mocked(getGalleryImage).mockResolvedValue(imageRecord());
    vi.mocked(updateGalleryImageMetadata).mockResolvedValue(
      imageRecord({ name: "Updated Milk Tea" }),
    );
    vi.mocked(replaceGalleryImageMedia).mockResolvedValue(
      imageRecord({
        name: "Updated Milk Tea",
        mediaId: "media-new",
        r2Key: "gallery/generated.webp",
      }),
    );
    vi.mocked(deleteGalleryImage).mockResolvedValue(true);
    vi.mocked(listGalleryImages).mockResolvedValue([]);
    vi.mocked(listPublishedGalleryImages).mockResolvedValue([]);
  });

  // ============================================================
  // Gallery image listing
  // ============================================================

  it("maps stored records into Admin Gallery images", async () => {
    vi.mocked(listGalleryImages).mockResolvedValueOnce([
      imageRecord(),
    ]);

    expect(await getAdminGalleryImages()).toEqual([
      {
        id: "image-1",
        name: "Milk Tea",
        url: "https://media.example/gallery/original.webp",
        tags: ["Drinks"],
        createdAt: "2026-10-25T12:00:00.000Z",
      },
    ]);
  });

  it("returns an empty Admin Gallery when there are no images", async () => {
    expect(await getAdminGalleryImages()).toEqual([]);
  });

  it("maps public image captions and alternative text", async () => {
    vi.mocked(listPublishedGalleryImages).mockResolvedValueOnce([
      imageRecord({
        caption: "Our signature tea",
        alt: "A cup of milk tea",
      }),
    ]);

    expect(await getPublicGalleryImages()).toEqual([
      {
        id: "image-1",
        url: "https://media.example/gallery/original.webp",
        alt: "A cup of milk tea",
        caption: "Our signature tea",
      },
    ]);
  });

  it("uses the image name when public caption or alt text is missing", async () => {
    vi.mocked(listPublishedGalleryImages).mockResolvedValueOnce([
      imageRecord(),
    ]);

    expect(await getPublicGalleryImages()).toEqual([
      expect.objectContaining({
        alt: "Milk Tea",
        caption: "Milk Tea",
      }),
    ]);
  });

  // The public page can show placeholders if gallery storage fails.
  it("returns null when public gallery queries fail", async () => {
    const error = new Error("Gallery D1 unavailable");

    vi.mocked(listPublishedGalleryImages).mockRejectedValueOnce(error);

    expect(await getPublicGalleryImages()).toBeNull();
    expect(unstable_rethrow).toHaveBeenCalledWith(error);
  });

  // ============================================================
  // Upload validation
  // ============================================================

  it("rejects blank image names", async () => {
    await expect(
      saveGalleryImage(uploadInput({ name: "   " })),
    ).rejects.toMatchObject({
      name: "GalleryInputError",
      status: 400,
      message: "Give the image a name.",
    });

    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects image names over 120 characters", async () => {
    await expect(
      saveGalleryImage(uploadInput({ name: "A".repeat(121) })),
    ).rejects.toThrow("Keep the name to 120 characters or fewer.");
  });

  it("rejects tags that are not an array", async () => {
    await expect(
      saveGalleryImage(uploadInput({ tags: "Drinks" })),
    ).rejects.toThrow("Tags must be a list.");
  });

  it("rejects non-string tags", async () => {
    await expect(
      saveGalleryImage(uploadInput({ tags: ["Tea", 42] })),
    ).rejects.toThrow("Each tag must be text.");
  });

  it("rejects tags longer than 30 characters", async () => {
    await expect(
      saveGalleryImage(uploadInput({ tags: ["A".repeat(31)] })),
    ).rejects.toThrow("Keep each tag to 30 characters or fewer.");
  });

  it("rejects more than 12 unique tags", async () => {
    await expect(
      saveGalleryImage(
        uploadInput({
          tags: Array.from(
            { length: 13 },
            (_, index) => `Tag ${index}`,
          ),
        }),
      ),
    ).rejects.toThrow("You can add up to 12 tags.");
  });

  it("rejects missing image files", async () => {
    await expect(
      saveGalleryImage(uploadInput({ file: null })),
    ).rejects.toThrow("Choose an image to upload.");
  });

  it("rejects empty image files", async () => {
    await expect(
      saveGalleryImage(
        uploadInput({
          file: new File([], "empty.png", { type: "image/png" }),
        }),
      ),
    ).rejects.toThrow("Choose an image to upload.");
  });

  it("rejects unsupported image MIME types", async () => {
    await expect(
      saveGalleryImage(
        uploadInput({ file: image("application/pdf", "file.pdf") }),
      ),
    ).rejects.toMatchObject({
      status: 415,
      message: "Upload a JPEG, PNG or WebP image.",
    });
  });

  it("rejects files exceeding 10 MB", async () => {
    const oversized = new File(
      [new ArrayBuffer(10 * 1024 * 1024 + 1)],
      "large.png",
      { type: "image/png" },
    );

    await expect(
      saveGalleryImage(uploadInput({ file: oversized })),
    ).rejects.toMatchObject({
      status: 413,
      message: "The image is over 10 MB.",
    });
  });

  // ============================================================
  // Successful image uploads
  // ============================================================

  it("converts uploads to WebP before storing them", async () => {
    await saveGalleryImage(uploadInput());

    const processor = vi.mocked(sharp).mock.results[0].value;

    expect(processor.rotate).toHaveBeenCalledOnce();

    expect(processor.resize).toHaveBeenCalledWith({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true,
    });

    expect(processor.webp).toHaveBeenCalledWith({
      quality: 82,
    });

    expect(putMedia).toHaveBeenCalledWith(
      "gallery/generated.webp",
      expect.any(Uint8Array),
      "image/webp",
    );
  });

  it("normalizes image names and duplicate tags before persistence", async () => {
    await saveGalleryImage(
      uploadInput({
        name: "  Milk   Tea  ",
        tags: [" Tea ", "tea", "Milk  Tea", "milk tea", ""],
      }),
    );

    expect(recordGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Milk Tea",
        tags: ["Tea", "Milk Tea"],
      }),
    );
  });

  it("stores media before writing the Gallery database records", async () => {
    await saveGalleryImage(uploadInput());

    expect(
      vi.mocked(putMedia).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(recordGalleryImage).mock.invocationCallOrder[0],
    );
  });

  it("records the converted image dimensions and owner", async () => {
    await saveGalleryImage(uploadInput());

    expect(recordGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        imageId: expect.any(String),
        mediaId: expect.any(String),
        stored: STORED_MEDIA,
        mimeType: "image/webp",
        width: 800,
        height: 600,
        originalFilename: "photo.png",
        adminId: "admin-1",
      }),
    );
  });

  it("returns the saved image read back from D1", async () => {
    expect(await saveGalleryImage(uploadInput())).toEqual({
      id: "image-1",
      name: "Milk Tea",
      url: "https://media.example/gallery/original.webp",
      tags: ["Drinks"],
      createdAt: "2026-10-25T12:00:00.000Z",
    });
  });

  // If D1 committed but its read-back failed, do not tell
  // the admin to upload again and create a duplicate.
  it("returns a fallback record when the D1 read-back is missing", async () => {
    vi.mocked(getGalleryImage).mockResolvedValueOnce(null);

    const result = await saveGalleryImage(uploadInput());

    expect(result.name).toBe("Milk Tea");
    expect(result.url).toBe(
      "https://media.example/gallery/generated.webp",
    );
    expect(result.id).toEqual(expect.any(String));
  });

  it("returns a fallback record when the D1 read-back throws", async () => {
    vi.mocked(getGalleryImage).mockRejectedValueOnce(
      new Error("Read-back unavailable"),
    );

    const result = await saveGalleryImage(uploadInput());

    expect(result.name).toBe("Milk Tea");
    expect(recordGalleryImage).toHaveBeenCalledOnce();
  });

  // ============================================================
  // Upload failures and cleanup
  // ============================================================

  it("rejects unreadable image data before storage", async () => {
    const processor = vi.mocked(sharp).mock.results;

    vi.mocked(sharp).mockImplementationOnce(() => {
      throw new Error("Invalid image");
    });

    await expect(
      saveGalleryImage(uploadInput()),
    ).rejects.toMatchObject({
      status: 415,
      message: "That file couldn't be read as an image.",
    });

    expect(processor).toBeDefined();
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("does not store media if the public URL cannot be configured", async () => {
    vi.mocked(toPublicUrl).mockImplementationOnce(() => {
      throw new Error("R2 public URL unavailable");
    });

    await expect(
      saveGalleryImage(uploadInput()),
    ).rejects.toThrow("R2 public URL unavailable");

    expect(putMedia).not.toHaveBeenCalled();
    expect(recordGalleryImage).not.toHaveBeenCalled();
  });

  // A definite D1 4xx rejection permits immediate cleanup
  // because the file was never linked to an image record.
  it("removes uploaded media after a definite D1 rejection", async () => {
    vi.mocked(recordGalleryImage).mockRejectedValueOnce(
      d1Error(400),
    );

    await expect(
      saveGalleryImage(uploadInput()),
    ).rejects.toThrow("Database failure");

    expect(deleteMediaNow).toHaveBeenCalledWith(
      "gallery/generated.webp",
    );
  });

  // An uncertain D1 5xx could have committed. Removing the
  // file would risk breaking a successfully saved Gallery image.
  it("preserves uploaded media after an uncertain D1 failure", async () => {
    vi.mocked(recordGalleryImage).mockRejectedValueOnce(
      d1Error(503),
    );

    await expect(
      saveGalleryImage(uploadInput()),
    ).rejects.toThrow("Database failure");

    expect(deleteMediaNow).not.toHaveBeenCalled();
  });

  it("preserves the original D1 error if immediate cleanup fails", async () => {
    vi.mocked(recordGalleryImage).mockRejectedValueOnce(
      d1Error(400),
    );
    vi.mocked(deleteMediaNow).mockRejectedValueOnce(
      new Error("R2 cleanup unavailable"),
    );

    await expect(
      saveGalleryImage(uploadInput()),
    ).rejects.toThrow("Database failure");
  });

  // ============================================================
  // Metadata editing
  // ============================================================

  it("updates an image name and tags without replacing its file", async () => {
    const result = await editGalleryImageMetadata({
      id: "image-1",
      name: "  Updated   Milk Tea ",
      tags: [" Drinks ", "drinks"],
    });

    expect(updateGalleryImageMetadata).toHaveBeenCalledWith({
      id: "image-1",
      name: "Updated Milk Tea",
      tags: ["Drinks"],
    });

    expect(result.name).toBe("Updated Milk Tea");
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects editing an image with an empty ID", async () => {
    await expect(
      editGalleryImageMetadata({
        id: "  ",
        name: "Milk Tea",
        tags: [],
      }),
    ).rejects.toThrow("An image ID is required.");
  });

  it("returns 404 when the image no longer exists", async () => {
    vi.mocked(getGalleryImage).mockResolvedValueOnce(null);

    await expect(
      editGalleryImageMetadata({
        id: "missing",
        name: "Milk Tea",
        tags: [],
      }),
    ).rejects.toMatchObject({
      status: 404,
    });

    expect(updateGalleryImageMetadata).not.toHaveBeenCalled();
  });

  it("returns 404 when a concurrent deletion prevents the update", async () => {
    vi.mocked(updateGalleryImageMetadata).mockResolvedValueOnce(
      null,
    );

    await expect(
      editGalleryImageMetadata({
        id: "image-1",
        name: "Milk Tea",
        tags: [],
      }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  // ============================================================
  // Image replacement
  // ============================================================

  it("preserves the image ID when replacing its stored media", async () => {
    const result = await replaceGalleryImage(
      replacementInput(),
    );

    expect(result.id).toBe("image-1");
    expect(result.url).toBe(
      "https://media.example/gallery/generated.webp",
    );

    expect(replaceGalleryImageMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "image-1",
        expectedMediaId: "media-original",
        newMediaId: expect.any(String),
        adminId: "admin-1",
        name: "Updated Milk Tea",
        tags: ["New"],
        stored: STORED_MEDIA,
      }),
    );
  });

  it("rejects replacement when the original image is missing", async () => {
    vi.mocked(getGalleryImage).mockResolvedValueOnce(null);

    await expect(
      replaceGalleryImage(replacementInput()),
    ).rejects.toMatchObject({
      status: 404,
    });

    expect(putMedia).not.toHaveBeenCalled();
  });

  // A concurrent replacement or deletion can invalidate
  // the expected old media ID. Remove the unlinked new file.
  it("cleans up a stale replacement and returns a conflict", async () => {
    vi.mocked(replaceGalleryImageMedia).mockResolvedValueOnce(
      null,
    );

    await expect(
      replaceGalleryImage(replacementInput()),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining(
        "This image changed while you were editing.",
      ),
    });

    expect(deleteMediaNow).toHaveBeenCalledWith(
      "gallery/generated.webp",
    );
  });

  it("cleans up replacement media after a definite D1 rejection", async () => {
    vi.mocked(replaceGalleryImageMedia).mockRejectedValueOnce(
      d1Error(400),
    );

    await expect(
      replaceGalleryImage(replacementInput()),
    ).rejects.toThrow("Database failure");

    expect(deleteMediaNow).toHaveBeenCalledWith(
      "gallery/generated.webp",
    );
  });

  it("preserves replacement media after an uncertain D1 failure", async () => {
    vi.mocked(replaceGalleryImageMedia).mockRejectedValueOnce(
      d1Error(503),
    );

    await expect(
      replaceGalleryImage(replacementInput()),
    ).rejects.toThrow("Database failure");

    expect(deleteMediaNow).not.toHaveBeenCalled();
  });

  // ============================================================
  // Deletion delegation
  // ============================================================

  it("delegates removal to the Gallery database query", async () => {
    expect(await removeGalleryImage("image-1")).toBe(true);

    expect(deleteGalleryImage).toHaveBeenCalledWith(
      "image-1",
    );
  });

  it("returns false when the Gallery image does not exist", async () => {
    vi.mocked(deleteGalleryImage).mockResolvedValueOnce(false);

    expect(await removeGalleryImage("missing")).toBe(false);
  });

  it("creates GalleryInputError with an HTTP status", () => {
    const error = new GalleryInputError("Invalid gallery image", 415);

    expect(error.name).toBe("GalleryInputError");
    expect(error.status).toBe(415);
  });
});
