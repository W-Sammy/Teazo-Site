/**
 * Backend tests for removing images from the Teazo carousel.
 *
 * Covers input validation, saved carousel state, database updates,
 * deferred R2 cleanup, storage bucket identification, shared-media
 * protection, and error handling.
 *
 * D1, R2, and Next.js cache revalidation are mocked.
 * No real database rows or storage objects are modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Create mocks before importing the carousel implementation.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  batch: vi.fn(),
  putMedia: vi.fn(),
  deleteMediaNow: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Prevent all D1 operations from contacting Cloudflare.
vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
  batch: mocks.batch,
}));

// No real media uploads or deletions are permitted.
vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  mintKey: vi.fn(),
  putMedia: mocks.putMedia,
  deleteMediaNow: mocks.deleteMediaNow,
  toPublicUrl: vi.fn(),
}));

// The removal service does not need unrelated website settings.
vi.mock("@/app/lib/website-content", () => ({
  DEFAULT_WEBSITE_CONTENT: {
    carouselImages: [],
  },
}));

// Track cache invalidation without invoking Next.js services.
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { removeCarouselImage } from "./carousel";

// All IDs, storage keys, and bucket names are synthetic.
const TEST_BUCKET = "synthetic-carousel-bucket";

type TestImage = {
  id: string;
  src: string;
  alt: string;
  enabled: boolean;
};

const DEFAULT_IMAGE: TestImage = {
  id: "default-image",
  src: "/carousel_images/default.jpg",
  alt: "Original carousel image",
  enabled: true,
};

const UPLOADED_IMAGE: TestImage = {
  id: "uploaded-image",
  src: "carousel/2026/11/uploaded.webp",
  alt: "Uploaded carousel image",
  enabled: false,
};

const OTHER_IMAGE: TestImage = {
  id: "other-image",
  src: "carousel/2026/11/other.webp",
  alt: "Another carousel image",
  enabled: true,
};

// Record each prepared SQL statement and its bound parameters.
type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
};

// Validate both the HTTP status and the user-facing error message.
async function expectRemovalError(
  body: unknown,
  status: number,
  message: string,
) {
  await expect(
    removeCarouselImage(body),
  ).rejects.toMatchObject({
    name: "CarouselError",
    status,
    message,
  });
}

describe("Backend carousel image removal", () => {
  let statements: PreparedRecord[];

  let savedRow: {
    value: string | null;
  } | null;

  let bucketRows: Array<{
    r2_bucket: string;
  }>;

  let bucketLookupError: Error | null;

  // Configure the simulated saved carousel list.
  function setSavedImages(images: TestImage[]) {
    savedRow = {
      value: JSON.stringify(images),
    };
  }

  // Find a prepared statement containing the expected SQL.
  function findStatement(fragment: string) {
    return statements.find((statement) =>
      statement.sql.includes(fragment),
    );
  }

  // Read the recorded batch without executing its SQL.
  function getBatchStatements(): PreparedRecord[] {
    expect(mocks.batch).toHaveBeenCalledOnce();

    return mocks.batch.mock.calls[0][0] as PreparedRecord[];
  }

  beforeEach(() => {
    vi.resetAllMocks();

    statements = [];
    savedRow = null;

    // A single known bucket is the default for uploaded files.
    bucketRows = [
      { r2_bucket: TEST_BUCKET },
    ];

    bucketLookupError = null;

    // Synthetic environment values are never used for network access.
    vi.stubEnv(
      "D1_PROXY_URL",
      "https://proxy.example.invalid",
    );

    vi.stubEnv(
      "PROXY_TOKEN",
      "synthetic-test-token",
    );

    // Simulate the D1 prepare/bind/read interface.
    mocks.prepare.mockImplementation((sql: string) => {
      const statement: PreparedRecord = {
        sql,
        params: [],
        bind: vi.fn(),
        first: vi.fn(),
        all: vi.fn(),
      };

      statement.bind.mockImplementation(
        (...params: unknown[]) => {
          statement.params = params;
          return statement;
        },
      );

      statement.first.mockImplementation(
        async () => savedRow,
      );

      statement.all.mockImplementation(async () => {
        if (
          sql.includes(
            "SELECT DISTINCT r2_bucket FROM r2_object",
          )
        ) {
          if (bucketLookupError) {
            throw bucketLookupError;
          }

          return {
            results: bucketRows,
          };
        }

        return {
          results: [],
        };
      });

      statements.push(statement);

      return statement;
    });

    // Record atomic batches but do not apply database changes.
    mocks.batch.mockResolvedValue([]);

    mocks.revalidatePath.mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("Removal input validation", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["plain string", "uploaded-image"],
      ["array", [{ id: "uploaded-image" }]],
      ["empty object", {}],
      ["missing ID", { other: "value" }],
      ["numeric ID", { id: 123 }],
      ["boolean ID", { id: true }],
      ["null ID", { id: null }],
      ["empty ID", { id: "" }],
      ["whitespace ID", { id: "   " }],
      ["oversized ID", { id: "x".repeat(101) }],
    ])(
      "rejects invalid removal input: %s",
      async (_label, body) => {
        await expectRemovalError(
          body,
          400,
          "A valid image ID is required.",
        );

        // Invalid requests must never reach database or storage.
        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.batch).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
        expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
      },
    );

    it("accepts an image ID at the maximum 100-character length", async () => {
      const id = "x".repeat(100);

      const result = await removeCarouselImage({ id });

      expect(result).toEqual({
        success: true,
        id,
      });

      expect(mocks.batch).not.toHaveBeenCalled();
    });
  });

  describe("Database configuration and saved state", () => {
    it.each([
      "D1_PROXY_URL",
      "PROXY_TOKEN",
    ])(
      "rejects removal when %s is missing",
      async (variable) => {
        vi.stubEnv(variable, "");

        await expectRemovalError(
          { id: UPLOADED_IMAGE.id },
          503,
          "The database connection isn't configured.",
        );

        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.batch).not.toHaveBeenCalled();
      },
    );

    it("rejects malformed saved carousel JSON", async () => {
      savedRow = {
        value: '{"invalid":',
      };

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        409,
        "Saved carousel settings are invalid; nothing was removed.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
    });

    it("rejects saved carousel settings that are not an array", async () => {
      savedRow = {
        value: JSON.stringify({
          invalid: true,
        }),
      };

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        409,
        "Saved carousel settings are invalid; nothing was removed.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("handles removal when no carousel row exists", async () => {
      // No saved carousel row means no removal update is needed.
      savedRow = null;

      const result = await removeCarouselImage({
        id: "missing-image",
      });

      expect(result).toEqual({
        success: true,
        id: "missing-image",
      });

      expect(mocks.batch).not.toHaveBeenCalled();

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/",
      );

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/website-content",
      );
    });

    it("prepares an empty-list update when the saved carousel is empty", async () => {
      setSavedImages([]);

      const result = await removeCarouselImage({
        id: "missing-image",
      });

      expect(result.success).toBe(true);

      const batch = getBatchStatements();

      expect(batch).toHaveLength(1);
      expect(batch[0].sql).toContain(
        "UPDATE content_block",
      );

      expect(batch[0].params).toEqual([
        "missing-image",
      ]);
    });
  });

  describe("Carousel removal behavior", () => {
    it("removes a default image without scheduling R2 cleanup", async () => {
      setSavedImages([
        DEFAULT_IMAGE,
        OTHER_IMAGE,
      ]);

      const result = await removeCarouselImage({
        id: DEFAULT_IMAGE.id,
      });

      expect(result).toEqual({
        success: true,
        id: DEFAULT_IMAGE.id,
      });

      const batch = getBatchStatements();

      // Default files live in public/carousel_images.
      // They must not be added to the R2 deletion queue.
      expect(batch).toHaveLength(1);

      expect(batch[0].sql).toContain(
        "UPDATE content_block",
      );

      expect(batch[0].params).toEqual([
        DEFAULT_IMAGE.id,
      ]);

      expect(
        findStatement("SELECT DISTINCT r2_bucket"),
      ).toBeUndefined();

      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
    });

    it("updates the saved list even when the requested ID is absent", async () => {
      setSavedImages([
        DEFAULT_IMAGE,
        UPLOADED_IMAGE,
      ]);

      const result = await removeCarouselImage({
        id: "already-removed",
      });

      expect(result).toEqual({
        success: true,
        id: "already-removed",
      });

      const batch = getBatchStatements();

      expect(batch).toHaveLength(1);
      expect(batch[0].params).toEqual([
        "already-removed",
      ]);

      // No matching image means no uploaded key to clean up.
      expect(
        findStatement("SELECT DISTINCT r2_bucket"),
      ).toBeUndefined();
    });

    it("removes an uploaded image and prepares deferred cleanup in one batch", async () => {
      setSavedImages([
        DEFAULT_IMAGE,
        UPLOADED_IMAGE,
        OTHER_IMAGE,
      ]);

      const result = await removeCarouselImage({
        id: UPLOADED_IMAGE.id,
      });

      expect(result).toEqual({
        success: true,
        id: UPLOADED_IMAGE.id,
      });

      // The saved image's bucket must be looked up by R2 key.
      const lookup = findStatement(
        "SELECT DISTINCT r2_bucket FROM r2_object",
      );

      expect(lookup).toBeTruthy();
      expect(lookup?.params).toEqual([
        UPLOADED_IMAGE.src,
      ]);

      const batch = getBatchStatements();

      // Removal and cleanup queue updates are prepared together.
      expect(batch).toHaveLength(3);

      expect(batch[0].sql).toContain(
        "UPDATE content_block",
      );

      expect(batch[1].sql).toContain(
        "UPDATE media_asset AS media",
      );

      expect(batch[2].sql).toContain(
        "INSERT INTO pending_r2_deletion",
      );

      expect(batch[0].params).toEqual([
        UPLOADED_IMAGE.id,
      ]);

      expect(batch[1].params).toEqual([
        UPLOADED_IMAGE.src,
        TEST_BUCKET,
      ]);

      expect(batch[2].params).toEqual([
        UPLOADED_IMAGE.src,
        TEST_BUCKET,
      ]);

      // The actual R2 bytes must remain untouched until
      // the separate scheduled cleanup process runs.
      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/",
      );

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/website-content",
      );
    });

    it("prepares an ordered list update that excludes only the requested ID", async () => {
      setSavedImages([
        DEFAULT_IMAGE,
        UPLOADED_IMAGE,
        OTHER_IMAGE,
      ]);

      await removeCarouselImage({
        id: DEFAULT_IMAGE.id,
      });

      const batch = getBatchStatements();
      const sql = batch[0].sql;

      // Inspect the SQL contract. This mock does not execute
      // the JSON aggregation against a real SQLite database.
      expect(sql).toContain(
        "json_group_array",
      );

      expect(sql).toContain(
        "json_each(content_block.value)",
      );

      expect(sql).toContain(
        "json_extract(entry.value, '$.id') IS NOT ?1",
      );

      expect(sql).toContain(
        "ORDER BY CAST(entry.key AS INTEGER)",
      );

      expect(sql).toContain(
        "WHERE key = 'home.carousel'",
      );

      expect(batch[0].params).toEqual([
        DEFAULT_IMAGE.id,
      ]);
    });

    it("guards media cleanup against references from other features", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      await removeCarouselImage({
        id: UPLOADED_IMAGE.id,
      });

      const batch = getBatchStatements();

      expect(batch).toHaveLength(3);

      const mediaCleanupSql = batch[1].sql;

      // The SQL must not mark media deleted while another
      // feature still references its media_asset row.
      for (const reference of [
        "event WHERE image_media_id = media.id",
        "gallery_image WHERE media_id = media.id",
        "carousel_slide WHERE media_id = media.id",
        "menu_document WHERE media_id = media.id",
        "content_block WHERE media_id = media.id",
        "site_link WHERE icon_media_id = media.id",
        "admin_user WHERE avatar_media_id = media.id",
      ]) {
        expect(mediaCleanupSql).toContain(reference);
      }

      expect(mediaCleanupSql).toContain(
        "NOT EXISTS",
      );

      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
    });

    it("guards queued deletion against remaining content references", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      await removeCarouselImage({
        id: UPLOADED_IMAGE.id,
      });

      const batch = getBatchStatements();

      const queueSql = batch[2].sql;

      // These SQL guards prevent scheduling cleanup while
      // content or navigation links still use the R2 key.
      expect(queueSql).toContain(
        "NOT EXISTS",
      );

      expect(queueSql).toContain(
        "FROM content_block AS block",
      );

      expect(queueSql).toContain(
        "json_tree",
      );

      expect(queueSql).toContain(
        "FROM site_link",
      );

      expect(queueSql).toContain(
        "instr(COALESCE(block.value, ''), ?1)",
      );

      expect(queueSql).toContain(
        "instr(COALESCE(url, ''), ?1)",
      );
    });

    it("prevents duplicate pending cleanup rows through SQL conditions", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      await removeCarouselImage({
        id: UPLOADED_IMAGE.id,
      });

      const batch = getBatchStatements();

      const queueSql = batch[2].sql;

      // A file should only be queued if it exists in R2,
      // is no longer referenced by active media metadata,
      // and is not already pending deletion.
      expect(queueSql).toContain(
        "FROM r2_object",
      );

      expect(queueSql).toContain(
        "FROM media_asset",
      );

      expect(queueSql).toContain(
        "FROM pending_r2_deletion",
      );

      expect(queueSql).toContain(
        "deleted_at IS NULL",
      );

      expect(batch[2].params).toEqual([
        UPLOADED_IMAGE.src,
        TEST_BUCKET,
      ]);
    });

    it.each([
      ["public image path", "/carousel_images/original.jpg"],
      ["external URL", "https://cdn.example.invalid/carousel/image.webp"],
      ["gallery storage path", "gallery/2026/11/image.webp"],
      ["parent-directory traversal", "carousel/../secret.webp"],
      ["duplicate separators", "carousel//image.webp"],
      ["spaces in key", "carousel/invalid name.webp"],
      ["query characters", "carousel/image.webp?version=1"],
    ])(
      "does not schedule R2 cleanup for an invalid or non-uploaded key: %s",
      async (_label, src) => {
        setSavedImages([
          {
            ...UPLOADED_IMAGE,
            src,
          },
        ]);

        const result = await removeCarouselImage({
          id: UPLOADED_IMAGE.id,
        });

        expect(result.success).toBe(true);

        const batch = getBatchStatements();

        // The carousel entry may be removed, but its source
        // is not recognized as an owned carousel R2 key.
        expect(batch).toHaveLength(1);

        expect(
          findStatement("SELECT DISTINCT r2_bucket"),
        ).toBeUndefined();

        expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
      },
    );
  });

  describe("Storage bucket safety", () => {
    it("rejects removal when no R2 bucket matches the uploaded key", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      bucketRows = [];

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        409,
        "Couldn't identify one storage bucket for this image. Nothing was removed; check its r2_object record.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
    });

    it("rejects removal when multiple R2 buckets match one key", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      bucketRows = [
        { r2_bucket: "synthetic-bucket-a" },
        { r2_bucket: "synthetic-bucket-b" },
      ];

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        409,
        "Couldn't identify one storage bucket for this image. Nothing was removed; check its r2_object record.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
    });

    it("does not remove an image when bucket lookup fails", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      bucketLookupError = new Error(
        "Synthetic bucket lookup failure.",
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        500,
        "Couldn't confirm image removal. Please try again.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();

      expect(errorSpy).toHaveBeenCalledWith(
        "Carousel removal failed:",
        expect.any(Error),
      );
    });
  });

  describe("Removal failure handling", () => {
    it("reports D1 read failures without submitting a removal batch", async () => {
      mocks.prepare.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic carousel database read failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        500,
        "Couldn't confirm image removal. Please try again.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();

      expect(errorSpy).toHaveBeenCalled();
    });

    it("does not report removal success after a failed D1 batch", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      mocks.batch.mockRejectedValueOnce(
        new Error("Synthetic D1 transaction failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectRemovalError(
        { id: UPLOADED_IMAGE.id },
        500,
        "Couldn't confirm image removal. Please try again.",
      );

      expect(mocks.batch).toHaveBeenCalledOnce();

      // No confirmed database change means no successful
      // cache revalidation or direct R2 deletion.
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.deleteMediaNow).not.toHaveBeenCalled();

      expect(errorSpy).toHaveBeenCalledWith(
        "Carousel removal failed:",
        expect.any(Error),
      );
    });

    it("preserves successful removal when cache revalidation fails", async () => {
      setSavedImages([DEFAULT_IMAGE]);

      mocks.revalidatePath.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic cache revalidation failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await removeCarouselImage({
        id: DEFAULT_IMAGE.id,
      });

      expect(result).toEqual({
        success: true,
        id: DEFAULT_IMAGE.id,
      });

      expect(mocks.batch).toHaveBeenCalledOnce();

      // Cache failures are logged, not mistaken for a
      // failed database transaction.
      expect(errorSpy).toHaveBeenCalledWith(
        "Carousel entry removed, but page revalidation failed:",
        expect.any(Error),
      );
    });
  });
});
