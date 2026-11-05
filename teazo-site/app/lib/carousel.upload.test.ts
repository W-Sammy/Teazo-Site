import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * Backend tests for Teazo carousel image uploads.
 *
 * Covers input validation, image format verification, upload limits,
 * synthetic R2 storage, database persistence requests, replacement
 * checks, and upload error handling.
 *
 * D1, R2, and Next.js cache revalidation are mocked.
 * No real database, storage bucket, or network service is accessed.
 */

// Create mocks before Vitest imports the carousel service.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  batch: vi.fn(),
  mintKey: vi.fn(),
  putMedia: vi.fn(),
  toPublicUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Prevent queries and batches from contacting the real D1 proxy.
vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
  batch: mocks.batch,
}));

// Replace R2 operations with deterministic synthetic responses.
vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  mintKey: mocks.mintKey,
  putMedia: mocks.putMedia,
  toPublicUrl: mocks.toPublicUrl,
}));

// The upload service imports default website content.
// These tests do not require the unrelated website settings.
vi.mock("@/app/lib/website-content", () => ({
  DEFAULT_WEBSITE_CONTENT: {
    carouselImages: [],
  },
}));

// Track page revalidation without invoking Next.js caching services.
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { uploadCarouselImage } from "./carousel";

// All test identifiers and URLs are synthetic.
const PUBLIC_BASE = "https://cdn.example.invalid";

const VALID_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);

const VALID_JPEG = Uint8Array.from([
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70,
]);

const VALID_WEBP = Uint8Array.from([
  82, 73, 70, 70, 8, 0, 0, 0,
  87, 69, 66, 80, 86, 80, 56, 32,
]);

type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
};

// Build native File objects using ArrayBuffer-backed data.
// This avoids TypeScript's ArrayBufferLike/BlobPart incompatibility.
function createTestFile(
  bytes: Uint8Array,
  type = "image/png",
  name = "synthetic-image.png",
): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new File([buffer], name, { type });
}

// Build the same FormData structure used by the upload endpoint.
function createUploadForm(
  bytes: Uint8Array = VALID_PNG,
  type = "image/png",
  options: {
    id?: string;
    alt?: string;
  } = {},
): FormData {
  const form = new FormData();

  form.set(
    "file",
    createTestFile(bytes, type),
  );

  if (options.id !== undefined) {
    form.set("id", options.id);
  }

  if (options.alt !== undefined) {
    form.set("alt", options.alt);
  }

  return form;
}

// Verify both the error class and the HTTP status associated with
// a rejected carousel upload.
async function expectCarouselError(
  form: FormData,
  status: number,
  message: string,
) {
  await expect(
    uploadCarouselImage(form),
  ).rejects.toMatchObject({
    name: "CarouselError",
    status,
    message,
  });
}

describe("Backend carousel image uploads", () => {
  let statements: PreparedRecord[];

  // Simulate the saved content_block row returned by D1.
  let savedRow: {
    value: string | null;
  } | null;

  beforeEach(() => {
    vi.resetAllMocks();

    statements = [];
    savedRow = null;

    // Use synthetic configuration values.
    // No HTTP requests are ever made to this URL.
    vi.stubEnv(
      "D1_PROXY_URL",
      "https://proxy.example.invalid",
    );

    vi.stubEnv(
      "PROXY_TOKEN",
      "synthetic-test-token",
    );

    // Record every SQL statement and its bound parameters.
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

      statement.all.mockResolvedValue({
        results: [],
      });

      statements.push(statement);

      return statement;
    });

    // The mock records statements without executing SQL.
    mocks.batch.mockResolvedValue([]);

    // Generate predictable R2 keys rather than random UUID paths.
    mocks.mintKey.mockImplementation(
      (prefix: string, extension: string) =>
        `${prefix}/2026/11/synthetic.${extension}`,
    );

    mocks.toPublicUrl.mockImplementation(
      (key: string) => `${PUBLIC_BASE}/${key}`,
    );

    // Simulate successful R2 storage without writing a file.
    mocks.putMedia.mockImplementation(
      async (key: string, bytes: Uint8Array) => ({
        key,
        size: bytes.byteLength,
        bucket: "synthetic-carousel-bucket",
      }),
    );

    mocks.revalidatePath.mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("Required upload inputs", () => {
    it("rejects an upload without a file", async () => {
      const form = new FormData();

      await expectCarouselError(
        form,
        400,
        "No image file provided.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects an image description supplied as a file", async () => {
      const form = createUploadForm();

      // FormData accepts File values, but image descriptions
      // must be text.
      form.set(
        "alt",
        new File(["description"], "description.txt"),
      );

      await expectCarouselError(
        form,
        400,
        "Image description must be text.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
    });

    it.each([
      ["empty", ""],
      ["whitespace", "   "],
      ["too long", "x".repeat(101)],
    ])(
      "rejects an invalid replacement ID: %s",
      async (_label, id) => {
        const form = createUploadForm(
          VALID_PNG,
          "image/png",
          { id },
        );

        await expectCarouselError(
          form,
          400,
          "A valid image ID is required for replacement.",
        );

        expect(mocks.putMedia).not.toHaveBeenCalled();
        expect(mocks.batch).not.toHaveBeenCalled();
      },
    );

    it("rejects a replacement ID supplied as a file", async () => {
      const form = createUploadForm();

      form.set(
        "id",
        new File(["not-an-id"], "id.txt"),
      );

      await expectCarouselError(
        form,
        400,
        "A valid image ID is required for replacement.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
    });

    it("allows an empty image description", async () => {
      const form = createUploadForm();

      const result = await uploadCarouselImage(form);

      expect(result.success).toBe(true);
      expect(result.image.alt).toBe("");

      expect(mocks.putMedia).toHaveBeenCalledOnce();
    });
  });

  describe("Image format and size validation", () => {
    it.each([
      ["image/gif", "synthetic.gif"],
      ["image/svg+xml", "synthetic.svg"],
      ["application/pdf", "synthetic.pdf"],
    ])(
      "rejects unsupported file type %s",
      async (type, name) => {
        const form = new FormData();

        form.set(
          "file",
          createTestFile(
            Uint8Array.from([1, 2, 3, 4]),
            type,
            name,
          ),
        );

        await expectCarouselError(
          form,
          415,
          "Unsupported image format. Upload PNG, JPG, or WebP.",
        );

        expect(mocks.putMedia).not.toHaveBeenCalled();
        expect(mocks.batch).not.toHaveBeenCalled();
      },
    );

    it("rejects an empty image file", async () => {
      const form = createUploadForm(
        new Uint8Array(0),
      );

      await expectCarouselError(
        form,
        400,
        "Choose a nonempty image that is 5 MB or less.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
    });

    it("rejects an image larger than 5 MiB", async () => {
      const oversized = new Uint8Array(
        5 * 1024 * 1024 + 1,
      );

      const form = createUploadForm(oversized);

      await expectCarouselError(
        form,
        413,
        "Choose a nonempty image that is 5 MB or less.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(mocks.prepare).not.toHaveBeenCalled();
    });

    it("rejects PNG files with an incorrect signature", async () => {
      const invalid = new Uint8Array(24);

      invalid.fill(1);

      await expectCarouselError(
        createUploadForm(invalid, "image/png"),
        415,
        "That file doesn't match its image format.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
    });

    it("rejects PNG files shorter than the required header", async () => {
      const shortPng = Uint8Array.from([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);

      await expectCarouselError(
        createUploadForm(shortPng, "image/png"),
        415,
        "That file doesn't match its image format.",
      );
    });

    it("rejects JPEG files without a JPEG signature", async () => {
      await expectCarouselError(
        createUploadForm(
          Uint8Array.from([1, 2, 3, 4, 5]),
          "image/jpeg",
        ),
        415,
        "That file doesn't match its image format.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
    });

    it("rejects WebP files without RIFF and WEBP markers", async () => {
      const invalidWebp = new Uint8Array(16);

      await expectCarouselError(
        createUploadForm(invalidWebp, "image/webp"),
        415,
        "That file doesn't match its image format.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
    });

    it.each([
      ["image/jpeg", VALID_JPEG, "jpg"],
      ["image/webp", VALID_WEBP, "webp"],
    ])(
      "accepts a valid %s header",
      async (type, bytes, extension) => {
        const form = createUploadForm(bytes, type);

        const result = await uploadCarouselImage(form);

        expect(result.success).toBe(true);

        expect(mocks.mintKey).toHaveBeenCalledWith(
          "carousel",
          extension,
        );

        expect(mocks.putMedia).toHaveBeenCalledOnce();

        expect(mocks.putMedia).toHaveBeenCalledWith(
          `carousel/2026/11/synthetic.${extension}`,
          expect.any(Uint8Array),
          type,
        );
      },
    );
  });

  describe("Database and storage configuration", () => {
    it.each([
      "D1_PROXY_URL",
      "PROXY_TOKEN",
    ])(
      "rejects an upload when %s is missing",
      async (variable) => {
        vi.stubEnv(variable, "");

        await expectCarouselError(
          createUploadForm(),
          503,
          "The database/storage connection isn't configured.",
        );

        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.putMedia).not.toHaveBeenCalled();
      },
    );

    it("rejects saved carousel settings that are not an array", async () => {
      savedRow = {
        value: JSON.stringify({
          invalid: true,
        }),
      };

      await expectCarouselError(
        createUploadForm(),
        409,
        "Existing carousel settings need to be checked before adding images.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects replacement of an image that is no longer saved", async () => {
      savedRow = {
        value: JSON.stringify([]),
      };

      await expectCarouselError(
        createUploadForm(
          VALID_PNG,
          "image/png",
          { id: "missing-image" },
        ),
        404,
        "That image is no longer saved. Refresh the carousel editor.",
      );

      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects upload when a public image URL cannot be generated", async () => {
      mocks.toPublicUrl.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic public URL configuration failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectCarouselError(
        createUploadForm(),
        500,
        "Couldn't upload the image. Check the database/storage connection and try again.",
      );

      // Public URL validation occurs before R2 upload.
      expect(mocks.putMedia).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("Successful synthetic uploads", () => {
    it("uploads a valid PNG and prepares the carousel database insert", async () => {
      const form = createUploadForm(
        VALID_PNG,
        "image/png",
        { alt: "Synthetic carousel image" },
      );

      const result = await uploadCarouselImage(form);

      const key = "carousel/2026/11/synthetic.png";
      const url = `${PUBLIC_BASE}/${key}`;

      expect(result).toEqual({
        success: true,
        key,
        url,
        image: {
          id: expect.any(String),
          src: url,
          mediaKey: key,
          alt: "Synthetic carousel image",
          enabled: true,
        },
      });

      expect(mocks.mintKey).toHaveBeenCalledWith(
        "carousel",
        "png",
      );

      expect(mocks.putMedia).toHaveBeenCalledWith(
        key,
        VALID_PNG,
        "image/png",
      );

      expect(mocks.batch).toHaveBeenCalledOnce();

      const batchStatements = mocks.batch.mock.calls[0][0] as
        PreparedRecord[];

      expect(batchStatements).toHaveLength(1);

      expect(batchStatements[0].sql).toContain(
        "INSERT INTO content_block",
      );

      expect(batchStatements[0].sql).toContain(
        "json_insert",
      );

      const savedImage = JSON.parse(
        String(batchStatements[0].params[0]),
      ) as {
        id: string;
        src: string;
        alt: string;
        enabled: boolean;
      };

      expect(savedImage).toEqual({
        id: result.image.id,
        src: key,
        alt: "Synthetic carousel image",
        enabled: true,
      });

      // The stored database value is an R2 key, not a public URL.
      expect(savedImage.src).not.toBe(url);

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/",
      );

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/website-content",
      );
    });

    it("uses an append operation when other images already exist", async () => {
      savedRow = {
        value: JSON.stringify([
          {
            id: "existing-image",
            src: "/carousel_images/example.jpg",
            alt: "Existing image",
            enabled: false,
          },
        ]),
      };

      const result = await uploadCarouselImage(
        createUploadForm(),
      );

      expect(result.success).toBe(true);

      const batchStatements = mocks.batch.mock.calls[0][0] as
        PreparedRecord[];

      // Confirm the SQL appends rather than replacing the list.
      expect(batchStatements[0].sql).toContain(
        "ON CONFLICT (key) DO UPDATE",
      );

      expect(batchStatements[0].sql).toContain(
        "json_insert(content_block.value, '$[#]'",
      );

      expect(batchStatements).toHaveLength(1);
    });

    it("preserves an existing image ID and visibility when replacing a default image", async () => {
      const original = {
        id: "existing-default",
        src: "/carousel_images/example.jpg",
        alt: "Original description",
        enabled: false,
      };

      savedRow = {
        value: JSON.stringify([original]),
      };

      // Simulate the second D1 read confirming that the replacement
      // was saved. The mock is not a real database transaction.
      mocks.batch.mockImplementationOnce(async () => {
        savedRow = {
          value: JSON.stringify([
            {
              ...original,
              src: "carousel/2026/11/synthetic.png",
            },
          ]),
        };

        return [];
      });

      const result = await uploadCarouselImage(
        createUploadForm(
          VALID_PNG,
          "image/png",
          {
            id: original.id,
            alt: "Replacement upload description",
          },
        ),
      );

      expect(result.success).toBe(true);

      expect(result.image.id).toBe(original.id);

      // The existing visibility setting is preserved.
      expect(result.image.enabled).toBe(false);

      // The replacement supplies the requested description.
      expect(result.image.alt).toBe(
        "Replacement upload description",
      );

      const batchStatements = mocks.batch.mock.calls[0][0] as
        PreparedRecord[];

      expect(batchStatements).toHaveLength(1);

      expect(batchStatements[0].sql).toContain(
        "UPDATE content_block",
      );

      expect(batchStatements[0].params).toEqual([
        original.id,
        JSON.stringify({
          src: "carousel/2026/11/synthetic.png",
        }),
        original.src,
      ]);
    });
  });

  describe("Upload and save failures", () => {
    it("reports R2 upload failures without submitting a D1 batch", async () => {
      mocks.putMedia.mockRejectedValueOnce(
        new Error("Synthetic R2 failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectCarouselError(
        createUploadForm(),
        500,
        "Couldn't upload the image. Check the database/storage connection and try again.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("reports an uncertain database save after R2 upload succeeds", async () => {
      mocks.batch.mockRejectedValueOnce(
        new Error("Synthetic D1 save failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectCarouselError(
        createUploadForm(),
        500,
        "The image uploaded, but its database save could not be confirmed. Check the saved carousel before retrying.",
      );

      expect(mocks.putMedia).toHaveBeenCalledOnce();
      expect(mocks.batch).toHaveBeenCalledOnce();

      // The service intentionally does not delete the uploaded
      // file because the database write result is uncertain.
      expect(errorSpy).toHaveBeenCalled();
    });

    it("rejects a replacement when the post-save check cannot find the new image", async () => {
      const original = {
        id: "stale-image",
        src: "/carousel_images/example.jpg",
        alt: "Original",
        enabled: true,
      };

      savedRow = {
        value: JSON.stringify([original]),
      };

      // The mock keeps returning the original row even after
      // the batch resolves, simulating a stale database save.
      await expectCarouselError(
        createUploadForm(
          VALID_PNG,
          "image/png",
          { id: original.id },
        ),
        409,
        "The image changed during the upload. Refresh the carousel editor before trying again.",
      );

      expect(mocks.putMedia).toHaveBeenCalledOnce();
      expect(mocks.batch).toHaveBeenCalledOnce();

      // The service must not report a confirmed save.
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    it("does not report a successful save as failed when cache revalidation throws", async () => {
      mocks.revalidatePath.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic cache revalidation failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await uploadCarouselImage(
        createUploadForm(),
      );

      expect(result.success).toBe(true);
      expect(mocks.batch).toHaveBeenCalledOnce();

      // Database save succeeded even though refreshing the page failed.
      expect(errorSpy).toHaveBeenCalledWith(
        "Carousel saved, but page revalidation failed:",
        expect.any(Error),
      );
    });
  });
});