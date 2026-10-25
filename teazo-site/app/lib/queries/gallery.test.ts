/**
 * Tests D1 queries for Gallery images and media associations.
 *
 * Covers image retrieval, tag normalization, image creation,
 * metadata updates, media replacement, optimistic concurrency,
 * and delayed R2 deletion records.
 *
 * D1 prepare() and batch() are mocked. Tests inspect SQL and
 * bound parameters without changing a real database.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { batch, prepare } from "@/app/lib/d1";

import {
  deleteGalleryImage,
  getGalleryImage,
  listGalleryImages,
  listPublishedGalleryImages,
  MAX_GALLERY_TAGS,
  normalizeTag,
  recordGalleryImage,
  replaceGalleryImageMedia,
  sortKey,
  updateGalleryImageMetadata,
} from "./gallery";

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {
    constructor(message: string) {
      super(message);
      this.name = "D1Error";
    }
  },
  batch: vi.fn(),
  prepare: vi.fn(),
}));

type CapturedStatement = {
  sql: string;
  args: unknown[];
};

const statements: CapturedStatement[] = [];
const first = vi.fn();
const all = vi.fn();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "image-1",
    name: "Milk Tea",
    caption: "Signature drink",
    alt: "Milk tea in a cup",
    is_published: 1,
    created_at: "2026-10-25T12:00:00.000Z",
    r2_key: "gallery/original.webp",
    media_id: "media-original",
    r2_bucket: "Images",
    width: 800,
    height: 600,
    tags: '["Drinks","Tea"]',
    ...overrides,
  };
}

function savedMedia() {
  return {
    bucket: "Images",
    key: "gallery/new.webp",
    size: 5000,
  };
}

function uploadInput() {
  return {
    imageId: "image-new",
    mediaId: "media-new",
    stored: savedMedia(),
    mimeType: "image/webp" as const,
    width: 800,
    height: 600,
    originalFilename: "photo.png",
    name: "Milk Tea",
    tags: ["Tea", "Drinks"],
    adminId: "admin-1",
  };
}

function updateInput() {
  return {
    id: "image-1",
    name: "Updated Milk Tea",
    tags: ["Tea"],
  };
}

function replacementInput() {
  return {
    id: "image-1",
    expectedMediaId: "media-original",
    newMediaId: "media-new",
    stored: savedMedia(),
    width: 1000,
    height: 700,
    originalFilename: "replacement.png",
    adminId: "admin-1",
    name: "Updated Milk Tea",
    tags: ["Tea"],
  };
}

function statementContaining(text: string) {
  return statements.find((statement) =>
    statement.sql.includes(text),
  );
}

// The final statement of update/replacement transactions reads
// back the newly saved image. Model one result per statement.
function successfulBatchRead(
  imageRow: Record<string, unknown> | null,
) {
  vi.mocked(batch).mockImplementationOnce(async (items) => ({
    results: items.map((_, index) => ({
      success: true,
      results:
        index === items.length - 1 && imageRow
          ? [imageRow]
          : [],
    })),
  } as never));
}

describe("Gallery D1 queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statements.length = 0;

    all.mockResolvedValue({ results: [] });
    first.mockResolvedValue(null);

    vi.mocked(prepare).mockImplementation((sql) => {
      const captured: CapturedStatement = {
        sql: String(sql),
        args: [],
      };

      statements.push(captured);

      const statement = {
        bind(...args: unknown[]) {
          captured.args = args;
          return statement;
        },
        all,
        first,
      };

      return statement as never;
    });

    vi.mocked(batch).mockResolvedValue({
      results: [],
    } as never);
  });

  // ============================================================
  // Image retrieval and mapping
  // ============================================================

  it("lists live Gallery images newest first", async () => {
    all.mockResolvedValueOnce({
      results: [row()],
    });

    const images = await listGalleryImages();

    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: "image-1",
      name: "Milk Tea",
      mediaId: "media-original",
      r2Key: "gallery/original.webp",
      tags: ["Drinks", "Tea"],
      isPublished: true,
    });

    expect(statements[0].sql).toContain(
      "g.deleted_at IS NULL",
    );
    expect(statements[0].sql).toContain(
      "m.deleted_at IS NULL",
    );
    expect(statements[0].sql).toContain(
      "ORDER BY g.created_at DESC, g.id",
    );
  });

  it("returns an empty list when no live images exist", async () => {
    expect(await listGalleryImages()).toEqual([]);
  });

  it("lists only published images in public display order", async () => {
    all.mockResolvedValueOnce({
      results: [row()],
    });

    const images = await listPublishedGalleryImages();

    expect(images).toHaveLength(1);
    expect(statements[0].sql).toContain(
      "g.is_published = 1",
    );
    expect(statements[0].sql).toContain(
      "ORDER BY g.sort_order, g.created_at DESC, g.id",
    );
  });

  it("maps unpublished image flags to false", async () => {
    all.mockResolvedValueOnce({
      results: [
        row({ is_published: 0, tags: "[]" }),
      ],
    });

    const images = await listGalleryImages();

    expect(images[0].isPublished).toBe(false);
    expect(images[0].tags).toEqual([]);
  });

  it("retrieves an image by its ID", async () => {
    first.mockResolvedValueOnce(row());

    const image = await getGalleryImage("image-1");

    expect(image?.id).toBe("image-1");
    expect(statements[0].args).toEqual(["image-1"]);
    expect(statements[0].sql).toContain("g.id = ?1");
  });

  it("returns null when the image does not exist", async () => {
    expect(await getGalleryImage("missing")).toBeNull();
  });

  // ============================================================
  // Sort keys and tag normalization
  // ============================================================

  it("normalizes accented names for sorting", () => {
    expect(sortKey("Éclair")).toBe("eclair");
  });

  it("lowercases image sort keys", () => {
    expect(sortKey("Milk TEA")).toBe("milk tea");
  });

  it("normalizes case and spacing in tags", () => {
    expect(normalizeTag("  Milk   Tea  ")).toBe("milk tea");
  });

  it("uses a maximum of 12 Gallery tags", () => {
    expect(MAX_GALLERY_TAGS).toBe(12);
  });

  // ============================================================
  // Image and tag creation
  // ============================================================

  it("creates image and media records in one batch", async () => {
    await recordGalleryImage(uploadInput());

    expect(batch).toHaveBeenCalledOnce();
    expect(statements).toHaveLength(6);

    expect(statements[0].sql).toContain(
      "INSERT INTO media_asset",
    );
    expect(statements[1].sql).toContain(
      "INSERT INTO gallery_image",
    );
  });

  it("binds media metadata and image identity correctly", async () => {
    await recordGalleryImage(uploadInput());

    expect(statements[0].args).toEqual([
      "media-new",
      "Images",
      "gallery/new.webp",
      "image/webp",
      5000,
      800,
      600,
      "photo.png",
      "admin-1",
    ]);

    expect(statements[1].args).toEqual([
      "image-new",
      "media-new",
      "Milk Tea",
      "milk tea",
    ]);
  });

  // Each tag gets an insert-if-new and association statement.
  it("uses normalized tag keys when creating associations", async () => {
    await recordGalleryImage(uploadInput());

    expect(
      statementContaining("INSERT INTO gallery_tag")?.args,
    ).toEqual(["Tea", "tea"]);

    expect(
      statementContaining("INSERT INTO gallery_image_tag")?.args,
    ).toEqual(["image-new", "tea"]);
  });

  it("guards tag associations against deleted images", async () => {
    await recordGalleryImage(uploadInput());

    const association = statementContaining(
      "INSERT INTO gallery_image_tag",
    );

    expect(association?.sql).toContain(
      "deleted_at IS NULL",
    );
    expect(association?.sql).toContain("ON CONFLICT");
  });

  it("propagates failed image creation transactions", async () => {
    vi.mocked(batch).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    await expect(
      recordGalleryImage(uploadInput()),
    ).rejects.toThrow("D1 unavailable");
  });

  // ============================================================
  // Metadata updates
  // ============================================================

  it("updates image metadata and returns the saved row", async () => {
    successfulBatchRead(
      row({ name: "Updated Milk Tea" }),
    );

    const result = await updateGalleryImageMetadata(
      updateInput(),
    );

    expect(result?.name).toBe("Updated Milk Tea");
    expect(batch).toHaveBeenCalledOnce();
    expect(statements).toHaveLength(5);
  });

  it("preserves the media reference during metadata updates", async () => {
    successfulBatchRead(row());

    await updateGalleryImageMetadata(updateInput());

    const update = statementContaining(
      "UPDATE gallery_image",
    );

    expect(update?.args).toEqual([
      "image-1",
      "Updated Milk Tea",
      "updated milk tea",
    ]);

    expect(update?.sql).not.toContain(
      "SET media_id",
    );
  });

  // Each update rechecks that the image and its media are live.
  it("guards metadata writes against concurrent deletion", async () => {
    successfulBatchRead(row());

    await updateGalleryImageMetadata(updateInput());

    const sql = statements
      .map((statement) => statement.sql)
      .join("\n");

    expect(sql).toContain(
      "g.deleted_at IS NULL",
    );
    expect(sql).toContain(
      "m.deleted_at IS NULL",
    );
  });

  it("replaces existing tag associations when metadata changes", async () => {
    successfulBatchRead(row());

    await updateGalleryImageMetadata(updateInput());

    expect(
      statementContaining("DELETE FROM gallery_image_tag")?.args,
    ).toEqual(["image-1"]);

    expect(
      statementContaining("INSERT INTO gallery_tag")?.args,
    ).toEqual(["image-1", "Tea", "tea"]);
  });

  it("rejects metadata updates with more than 12 tags", async () => {
    await expect(
      updateGalleryImageMetadata({
        ...updateInput(),
        tags: Array.from(
          { length: 13 },
          (_, index) => `Tag ${index}`,
        ),
      }),
    ).rejects.toThrow("more than 12 tags");

    expect(batch).not.toHaveBeenCalled();
  });

  it("returns null when the edited image was deleted concurrently", async () => {
    successfulBatchRead(null);

    expect(
      await updateGalleryImageMetadata(updateInput()),
    ).toBeNull();
  });

  // A truncated batch response must never be treated as
  // confirmation that all metadata writes succeeded.
  it("rejects an incomplete metadata transaction result", async () => {
    vi.mocked(batch).mockResolvedValueOnce({
      results: [],
    } as never);

    await expect(
      updateGalleryImageMetadata(updateInput()),
    ).rejects.toThrow(
      "The gallery update result could not be confirmed.",
    );
  });

  // ============================================================
  // Media replacement transactions
  // ============================================================

  it("replaces media while preserving the Gallery image ID", async () => {
    successfulBatchRead(
      row({
        media_id: "media-new",
        r2_key: "gallery/new.webp",
        name: "Updated Milk Tea",
      }),
    );

    const result = await replaceGalleryImageMedia(
      replacementInput(),
    );

    expect(result?.id).toBe("image-1");
    expect(result?.mediaId).toBe("media-new");
    expect(result?.r2Key).toBe("gallery/new.webp");
  });

  // Inserting replacement media requires the image still
  // to reference the expected old media ID.
  it("guards replacements against concurrent changes", async () => {
    successfulBatchRead(
      row({ media_id: "media-new" }),
    );

    await replaceGalleryImageMedia(replacementInput());

    expect(statements[0].args).toEqual([
      "media-new",
      "Images",
      "gallery/new.webp",
      5000,
      1000,
      700,
      "replacement.png",
      "admin-1",
      "image-1",
      "media-original",
    ]);

    expect(statements[0].sql).toContain(
      "g.media_id = ?10",
    );
    expect(statements[0].sql).toContain(
      "g.deleted_at IS NULL",
    );
  });

  it("updates the image record to the new media ID", async () => {
    successfulBatchRead(
      row({ media_id: "media-new" }),
    );

    await replaceGalleryImageMedia(replacementInput());

    expect(
      statementContaining("UPDATE gallery_image")?.args,
    ).toEqual([
      "image-1",
      "media-new",
      "media-original",
      "Updated Milk Tea",
      "updated milk tea",
    ]);
  });

  // Old media is retired only when no live image references it.
  it("protects media that is still referenced by another image", async () => {
    successfulBatchRead(
      row({ media_id: "media-new" }),
    );

    await replaceGalleryImageMedia(replacementInput());

    const oldMediaUpdate = statementContaining(
      "UPDATE media_asset",
    );

    expect(oldMediaUpdate?.sql).toContain(
      "NOT EXISTS",
    );
    expect(oldMediaUpdate?.args).toEqual([
      "image-1",
      "media-new",
      "media-original",
    ]);
  });

  it("queues old media for delayed R2 deletion", async () => {
    successfulBatchRead(
      row({ media_id: "media-new" }),
    );

    await replaceGalleryImageMedia(replacementInput());

    const queue = statementContaining(
      "INSERT INTO pending_r2_deletion",
    );

    expect(queue?.sql).toContain(
      "NOT EXISTS",
    );

    expect(queue?.args).toEqual([
      "image-1",
      "media-new",
      "media-original",
    ]);
  });

  it("returns null when another replacement won the race", async () => {
    successfulBatchRead(
      row({
        media_id: "media-other",
      }),
    );

    const result = await replaceGalleryImageMedia(
      replacementInput(),
    );

    expect(result).toBeNull();
  });

  it("returns null when replacement produces no live row", async () => {
    successfulBatchRead(null);

    expect(
      await replaceGalleryImageMedia(replacementInput()),
    ).toBeNull();
  });

  it("rejects incomplete replacement transaction results", async () => {
    vi.mocked(batch).mockResolvedValueOnce({
      results: [],
    } as never);

    await expect(
      replaceGalleryImageMedia(replacementInput()),
    ).rejects.toThrow(
      "The image replacement transaction could not be confirmed.",
    );
  });

  it("rejects replacements with more than 12 tags", async () => {
    await expect(
      replaceGalleryImageMedia({
        ...replacementInput(),
        tags: Array.from(
          { length: 13 },
          (_, index) => `Tag ${index}`,
        ),
      }),
    ).rejects.toThrow("more than 12 tags");

    expect(batch).not.toHaveBeenCalled();
  });

  // ============================================================
  // Soft deletion and R2 cleanup queue
  // ============================================================

  it("returns false when deleting a nonexistent image", async () => {
    first.mockResolvedValueOnce(null);

    expect(await deleteGalleryImage("missing")).toBe(false);

    expect(batch).not.toHaveBeenCalled();
  });

  it("soft-deletes an image and its media in one batch", async () => {
    first.mockResolvedValueOnce({
      media_id: "media-original",
      r2_bucket: "Images",
      r2_key: "gallery/original.webp",
    });

    expect(await deleteGalleryImage("image-1")).toBe(true);
    expect(batch).toHaveBeenCalledOnce();

    expect(statements[1].sql).toContain(
      "UPDATE gallery_image SET deleted_at",
    );
    expect(statements[1].args).toEqual(["image-1"]);

    expect(statements[2].sql).toContain(
      "UPDATE media_asset SET deleted_at",
    );
    expect(statements[2].args).toEqual(["media-original"]);
  });

  it("queues the deleted file without duplicate active queue entries", async () => {
    first.mockResolvedValueOnce({
      media_id: "media-original",
      r2_bucket: "Images",
      r2_key: "gallery/original.webp",
    });

    await deleteGalleryImage("image-1");

    const queued = statementContaining(
      "INSERT INTO pending_r2_deletion",
    );

    expect(queued?.sql).toContain("NOT EXISTS");

    expect(queued?.args).toEqual([
      "Images",
      "gallery/original.webp",
    ]);
  });

  it("does not report success if the deletion transaction fails", async () => {
    first.mockResolvedValueOnce({
      media_id: "media-original",
      r2_bucket: "Images",
      r2_key: "gallery/original.webp",
    });

    vi.mocked(batch).mockRejectedValueOnce(
      new Error("D1 deletion failed"),
    );

    await expect(
      deleteGalleryImage("image-1"),
    ).rejects.toThrow("D1 deletion failed");
  });
});
