/**
 * SQLite integration tests for the Teazo landing-page carousel.
 *
 * Executes the real carousel service's SQL against an isolated,
 * in-memory SQLite database initialized with the actual migrations.
 *
 * Covers image ordering, settings persistence, default initialization,
 * upload/replacement, deferred cleanup, shared-media protection,
 * and transaction rollback.
 *
 * D1's network proxy, R2 writes, and Next.js cache revalidation
 * are replaced with test-only implementations.
 *
 * No production or local development database is modified.
 */

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { sqliteD1 } from "@/test/sqlite-d1";

// Hoist media and cache mocks before importing the Carousel service.
const mocks = vi.hoisted(() => ({
  mintKey: vi.fn(),
  putMedia: vi.fn(),
  toPublicUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Use the existing SQLite adapter, which runs real SQL in memory.
vi.mock("@/app/lib/d1", async () => ({
  ...(await import("@/test/sqlite-d1")).sqliteD1.module,
}));

// All R2 operations and URL generation are synthetic.
vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  mintKey: mocks.mintKey,
  putMedia: mocks.putMedia,
  toPublicUrl: mocks.toPublicUrl,
}));

// Use two predictable original Carousel images.
vi.mock("@/app/lib/website-content", () => ({
  DEFAULT_WEBSITE_CONTENT: {
    carouselImages: [
      {
        id: "default-one",
        src: "/carousel_images/one.jpg",
        alt: "Original tea image one",
        enabled: true,
      },
      {
        id: "default-two",
        src: "/carousel_images/two.jpg",
        alt: "Original tea image two",
        enabled: true,
      },
    ],
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import {
  removeCarouselImage,
  saveCarouselSettings,
  uploadCarouselImage,
} from "./carousel";

type TestImage = {
  id: string;
  src: string;
  alt: string;
  enabled: boolean;
};

const BUCKET = "synthetic-carousel-bucket";
const PUBLIC_BASE = "https://cdn.example.invalid";

const OLD_KEY = "carousel/2026/11/old.webp";
const NEW_KEY = "carousel/2026/11/new.png";

const DEFAULT_ONE: TestImage = {
  id: "default-one",
  src: "/carousel_images/one.jpg",
  alt: "Original tea image one",
  enabled: true,
};

const DEFAULT_TWO: TestImage = {
  id: "default-two",
  src: "/carousel_images/two.jpg",
  alt: "Original tea image two",
  enabled: true,
};

const UPLOADED: TestImage = {
  id: "uploaded-one",
  src: OLD_KEY,
  alt: "Uploaded tea image",
  enabled: false,
};

// Construct minimal PNG bytes accepted by carousel.ts.
const PNG_BYTES = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);

// Read actual persisted Carousel JSON from in-memory SQLite.
function readImages(): TestImage[] | null {
  const row = sqliteD1.db.prepare(
    "SELECT value FROM content_block WHERE key = 'home.carousel'",
  ).get() as { value: string | null } | undefined;

  if (!row) return null;

  return JSON.parse(row.value ?? "null") as TestImage[];
}

// Seed the real content_block schema with synthetic images.
function saveImages(images: TestImage[]) {
  sqliteD1.db.prepare(
    `INSERT INTO content_block
       (key, page_key, slot_key, block_type, value)
     VALUES ('home.carousel', 'home', 'carousel', 'text', ?1)
     ON CONFLICT (key) DO UPDATE
       SET value = excluded.value`,
  ).run(JSON.stringify(images));
}

// Create a synthetic object in the storage ledger and metadata table.
// This does not create any actual R2 object.
function registerStoredObject(
  key = OLD_KEY,
  mediaId = "synthetic-media",
) {
  sqliteD1.db.prepare(
    `INSERT INTO r2_object
       (r2_bucket, r2_key, byte_size)
     VALUES (?1, ?2, 100)`,
  ).run(BUCKET, key);

  sqliteD1.db.prepare(
    `INSERT INTO media_asset
       (id, r2_bucket, r2_key, mime_type, byte_size, purpose)
     VALUES (?1, ?2, ?3, 'image/webp', 100, 'carousel')`,
  ).run(mediaId, BUCKET, key);
}

// Inspect a media record after real SQL changes.
function mediaRecord(mediaId = "synthetic-media") {
  return sqliteD1.db.prepare(
    `SELECT id, deleted_at
       FROM media_asset
      WHERE id = ?1`,
  ).get(mediaId) as {
    id: string;
    deleted_at: string | null;
  } | undefined;
}

// Read pending R2 cleanup rows from the actual database.
function pendingDeletions() {
  return sqliteD1.db.prepare(
    `SELECT r2_bucket, r2_key, deleted_at
       FROM pending_r2_deletion
      ORDER BY r2_key`,
  ).all() as {
    r2_bucket: string;
    r2_key: string;
    deleted_at: string | null;
  }[];
}

// Build a real FormData request without uploading to R2.
function uploadForm(options: {
  id?: string;
  alt?: string;
} = {}) {
  const form = new FormData();

  const buffer = new ArrayBuffer(PNG_BYTES.byteLength);
  new Uint8Array(buffer).set(PNG_BYTES);

  form.set(
    "file",
    new File([buffer], "synthetic.png", {
      type: "image/png",
    }),
  );

  form.set("alt", options.alt ?? "New synthetic image");

  if (options.id !== undefined) {
    form.set("id", options.id);
  }

  return form;
}

describe("Carousel SQLite integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Reset reapplies the real migrations into a fresh in-memory DB.
    sqliteD1.reset();

    vi.stubEnv(
      "D1_PROXY_URL",
      "https://proxy.example.invalid",
    );

    vi.stubEnv(
      "PROXY_TOKEN",
      "synthetic-test-token",
    );

    mocks.mintKey.mockReturnValue(NEW_KEY);

    mocks.putMedia.mockImplementation(
      async (key: string, bytes: Uint8Array) => ({
        key,
        size: bytes.byteLength,
        bucket: BUCKET,
      }),
    );

    mocks.toPublicUrl.mockImplementation(
      (key: string) => `${PUBLIC_BASE}/${key}`,
    );

    mocks.revalidatePath.mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    sqliteD1.db.close();
  });

  it("initializes default images and saves the seeded flag", async () => {
    expect(readImages()).toBeNull();

    const result = await saveCarouselSettings({
      action: "initialize-defaults",
    });

    expect(result).toEqual({
      success: true,
      images: [DEFAULT_ONE, DEFAULT_TWO],
    });

    expect(readImages()).toEqual([
      DEFAULT_ONE,
      DEFAULT_TWO,
    ]);

    const seeded = sqliteD1.db.prepare(
      `SELECT value
         FROM content_block
        WHERE key = 'home.carousel_defaults_seeded'`,
    ).get() as { value: string } | undefined;

    expect(seeded?.value).toBe("1");
  });

  it("does not restore a removed default image after initialization", async () => {
    await saveCarouselSettings({
      action: "initialize-defaults",
    });

    await removeCarouselImage({
      id: DEFAULT_ONE.id,
    });

    expect(readImages()).toEqual([DEFAULT_TWO]);

    // Repeating initialization must not restore removed defaults.
    await saveCarouselSettings({
      action: "initialize-defaults",
    });

    expect(readImages()).toEqual([DEFAULT_TWO]);
    expect(pendingDeletions()).toEqual([]);
  });

  it("adds only missing defaults while preserving saved images", async () => {
    saveImages([
      UPLOADED,
      DEFAULT_ONE,
    ]);

    const result = await saveCarouselSettings({
      action: "initialize-defaults",
    });

    // The missing default comes before the existing saved list.
    expect(readImages()).toEqual([
      DEFAULT_TWO,
      UPLOADED,
      DEFAULT_ONE,
    ]);

    expect(result).toEqual({
      success: true,
      images: [
        DEFAULT_TWO,
        {
          ...UPLOADED,
          src: `${PUBLIC_BASE}/${OLD_KEY}`,
        },
        DEFAULT_ONE,
      ],
    });

    await saveCarouselSettings({
      action: "initialize-defaults",
    });

    // Initialization is idempotent after the seeded flag exists.
    expect(readImages()).toEqual([
      DEFAULT_TWO,
      UPLOADED,
      DEFAULT_ONE,
    ]);
  });

  it("updates description and visibility without changing other images", async () => {
    saveImages([
      DEFAULT_ONE,
      UPLOADED,
      DEFAULT_TWO,
    ]);

    const result = await saveCarouselSettings({
      action: "update-image",
      id: UPLOADED.id,
      alt: "Updated photograph",
      enabled: true,
    });

    expect(result).toEqual({
      success: true,
      id: UPLOADED.id,
    });

    expect(readImages()).toEqual([
      DEFAULT_ONE,
      {
        ...UPLOADED,
        alt: "Updated photograph",
        enabled: true,
      },
      DEFAULT_TWO,
    ]);

    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/",
    );
  });

  it("appends a new uploaded image without overwriting existing images", async () => {
    saveImages([
      DEFAULT_ONE,
      DEFAULT_TWO,
    ]);

    const result = await uploadCarouselImage(
      uploadForm({
        alt: "New synthetic photograph",
      }),
    );

    expect(result.success).toBe(true);
    expect(mocks.putMedia).toHaveBeenCalledOnce();

    const saved = readImages();

    expect(saved).toEqual([
      DEFAULT_ONE,
      DEFAULT_TWO,
      {
        id: result.image.id,
        src: NEW_KEY,
        alt: "New synthetic photograph",
        enabled: true,
      },
    ]);

    // Database rows store media keys rather than public URLs.
    expect(saved?.[2].src).toBe(NEW_KEY);
    expect(result.image.src).toBe(
      `${PUBLIC_BASE}/${NEW_KEY}`,
    );
  });

  it("saves an empty list when the last default image is removed", async () => {
    saveImages([DEFAULT_ONE]);

    const result = await removeCarouselImage({
      id: DEFAULT_ONE.id,
    });

    expect(result).toEqual({
      success: true,
      id: DEFAULT_ONE.id,
    });

    expect(readImages()).toEqual([]);
    expect(pendingDeletions()).toEqual([]);
  });

  it("removes unused uploaded media and schedules deferred cleanup", async () => {
    saveImages([
      DEFAULT_ONE,
      UPLOADED,
      DEFAULT_TWO,
    ]);

    registerStoredObject();

    const result = await removeCarouselImage({
      id: UPLOADED.id,
    });

    expect(result.success).toBe(true);

    expect(readImages()).toEqual([
      DEFAULT_ONE,
      DEFAULT_TWO,
    ]);

    expect(mediaRecord()?.deleted_at).not.toBeNull();

    expect(pendingDeletions()).toEqual([
      {
        r2_bucket: BUCKET,
        r2_key: OLD_KEY,
        deleted_at: null,
      },
    ]);

    // Removal only queues cleanup; R2 bytes are not deleted here.
    expect(mocks.putMedia).not.toHaveBeenCalled();
  });

  it("preserves uploaded media referenced by another content block", async () => {
    saveImages([UPLOADED]);
    registerStoredObject();

    sqliteD1.db.prepare(
      `INSERT INTO content_block
         (key, page_key, slot_key, block_type, value)
       VALUES ('home.other', 'home', 'other', 'text', ?1)`,
    ).run(
      JSON.stringify({
        image: OLD_KEY,
      }),
    );

    await removeCarouselImage({
      id: UPLOADED.id,
    });

    expect(readImages()).toEqual([]);

    // Other saved content still uses the image.
    expect(mediaRecord()?.deleted_at).toBeNull();
    expect(pendingDeletions()).toEqual([]);
  });

  it("preserves media metadata when an event still references it", async () => {
    saveImages([UPLOADED]);
    registerStoredObject();

    sqliteD1.db.prepare(
      `INSERT INTO event
         (id, name, image_media_id, start_at, end_at)
       VALUES
         ('synthetic-event', 'Synthetic event',
          'synthetic-media',
          '2026-11-01T00:00:00.000Z',
          '2026-11-30T00:00:00.000Z')`,
    ).run();

    await removeCarouselImage({
      id: UPLOADED.id,
    });

    expect(readImages()).toEqual([]);

    // The event's active reference prevents media retirement.
    expect(mediaRecord()?.deleted_at).toBeNull();
    expect(pendingDeletions()).toEqual([]);
  });

  it("rolls back image removal if cleanup queue insertion fails", async () => {
    saveImages([
      DEFAULT_ONE,
      UPLOADED,
    ]);

    registerStoredObject();

    // Force the last operation in the real D1 batch to fail.
    // Earlier updates must be rolled back with the transaction.
    sqliteD1.db.exec(`
      CREATE TRIGGER synthetic_queue_failure
      BEFORE INSERT ON pending_r2_deletion
      BEGIN
        SELECT RAISE(ABORT, 'synthetic queue failure');
      END;
    `);

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      removeCarouselImage({
        id: UPLOADED.id,
      }),
    ).rejects.toMatchObject({
      name: "CarouselError",
      status: 500,
    });

    // The removal and metadata updates must not persist.
    expect(readImages()).toEqual([
      DEFAULT_ONE,
      UPLOADED,
    ]);

    expect(mediaRecord()?.deleted_at).toBeNull();
    expect(pendingDeletions()).toEqual([]);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("replaces an uploaded image while preserving its position and settings", async () => {
    saveImages([
      DEFAULT_ONE,
      UPLOADED,
      DEFAULT_TWO,
    ]);

    registerStoredObject();

    const result = await uploadCarouselImage(
      uploadForm({
        id: UPLOADED.id,
        alt: UPLOADED.alt,
      }),
    );

    expect(result.success).toBe(true);
    expect(result.image.id).toBe(UPLOADED.id);

    // The database replacement changes only the source.
    expect(readImages()).toEqual([
      DEFAULT_ONE,
      {
        ...UPLOADED,
        src: NEW_KEY,
      },
      DEFAULT_TWO,
    ]);

    expect(mediaRecord()?.deleted_at).not.toBeNull();

    expect(pendingDeletions()).toEqual([
      {
        r2_bucket: BUCKET,
        r2_key: OLD_KEY,
        deleted_at: null,
      },
    ]);
  });

  it("rejects a replacement when another update changes the original source", async () => {
    saveImages([DEFAULT_ONE]);

    // Simulate another administrator changing the saved image
    // after the initial read but before the replacement batch.
    mocks.putMedia.mockImplementationOnce(
      async (key: string, bytes: Uint8Array) => {
        saveImages([
          {
            ...DEFAULT_ONE,
            src: "/carousel_images/newer.jpg",
          },
        ]);

        return {
          key,
          size: bytes.byteLength,
          bucket: BUCKET,
        };
      },
    );

    await expect(
      uploadCarouselImage(
        uploadForm({
          id: DEFAULT_ONE.id,
        }),
      ),
    ).rejects.toMatchObject({
      name: "CarouselError",
      status: 409,
      message:
        "The image changed during the upload. Refresh the carousel editor before trying again.",
    });

    // The newer update must survive the rejected stale replacement.
    expect(readImages()).toEqual([
      {
        ...DEFAULT_ONE,
        src: "/carousel_images/newer.jpg",
      },
    ]);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
