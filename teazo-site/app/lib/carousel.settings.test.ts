/**
 * Backend tests for Teazo carousel image settings and initialization.
 *
 * Covers description and visibility updates, invalid input, missing
 * images, saved JSON validation, default image initialization,
 * database failures, and cache revalidation.
 *
 * D1 operations are mocked. SQL statements and their bound values
 * are inspected, but the mock does not execute SQL transactions.
 *
 * No production database, Cloudflare storage, or network service
 * is accessed.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Hoist mock functions before the carousel module is imported.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  batch: vi.fn(),
  toPublicUrl: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Prevent real D1 requests and database writes.
vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
  batch: mocks.batch,
}));

// Only URL conversion is needed by the settings service.
// Media uploads and deletions must not occur in these tests.
vi.mock("@/app/lib/media", () => ({
  MAX_MEDIA_BYTES: 10 * 1024 * 1024,
  mintKey: vi.fn(),
  putMedia: vi.fn(),
  toPublicUrl: mocks.toPublicUrl,
}));

// Supply deterministic default Carousel images.
vi.mock("@/app/lib/website-content", () => ({
  DEFAULT_WEBSITE_CONTENT: {
    carouselImages: [
      {
        id: "default-tea-one",
        src: "/carousel_images/tea-one.jpg",
        alt: "Tea image one",
        enabled: true,
      },
      {
        id: "default-tea-two",
        src: "/carousel_images/tea-two.jpg",
        alt: "Tea image two",
        enabled: true,
      },
    ],
  },
}));

// Capture page revalidation without invoking Next.js caching.
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { saveCarouselSettings } from "./carousel";

// Use synthetic IDs and storage keys for every test.
const PUBLIC_BASE = "https://cdn.example.invalid";

type TestImage = {
  id: string;
  src: string;
  alt: string;
  enabled: boolean;
};

const DEFAULT_ONE: TestImage = {
  id: "default-tea-one",
  src: "/carousel_images/tea-one.jpg",
  alt: "Tea image one",
  enabled: true,
};

const DEFAULT_TWO: TestImage = {
  id: "default-tea-two",
  src: "/carousel_images/tea-two.jpg",
  alt: "Tea image two",
  enabled: true,
};

const UPLOADED_IMAGE: TestImage = {
  id: "uploaded-carousel-image",
  src: "carousel/2026/11/synthetic.webp",
  alt: "Uploaded tea image",
  enabled: false,
};

const OTHER_IMAGE: TestImage = {
  id: "other-carousel-image",
  src: "/carousel_images/other.jpg",
  alt: "Another carousel image",
  enabled: true,
};

// Track prepared SQL and its bound parameters.
type PreparedRecord = {
  sql: string;
  params: unknown[];
  bind: ReturnType<typeof vi.fn>;
  first: ReturnType<typeof vi.fn>;
};

// Validate application errors without importing the error class.
async function expectSettingsError(
  body: unknown,
  status: number,
  message: string,
) {
  await expect(
    saveCarouselSettings(body),
  ).rejects.toMatchObject({
    name: "CarouselError",
    status,
    message,
  });
}

describe("Backend carousel settings and initialization", () => {
  let statements: PreparedRecord[];

  let savedRow: {
    value: string | null;
  } | null;

  // Simulate a row returned from the content_block table.
  function setSavedImages(images: TestImage[]) {
    savedRow = {
      value: JSON.stringify(images),
    };
  }

  // Return the prepared statements passed to one D1 batch.
  function getBatchStatements(): PreparedRecord[] {
    expect(mocks.batch).toHaveBeenCalledOnce();

    return mocks.batch.mock.calls[0][0] as PreparedRecord[];
  }

  // Locate SQL statements by their contents.
  function findStatement(fragment: string) {
    return statements.find((statement) =>
      statement.sql.includes(fragment),
    );
  }

  beforeEach(() => {
    vi.resetAllMocks();

    statements = [];
    savedRow = null;

    // Configuration values are synthetic and never used
    // to contact a real service.
    vi.stubEnv(
      "D1_PROXY_URL",
      "https://proxy.example.invalid",
    );

    vi.stubEnv(
      "PROXY_TOKEN",
      "synthetic-carousel-test-token",
    );

    // Create a mock D1 statement that supports bind() and first().
    mocks.prepare.mockImplementation((sql: string) => {
      const statement: PreparedRecord = {
        sql,
        params: [],
        bind: vi.fn(),
        first: vi.fn(),
      };

      statement.bind.mockImplementation(
        (...params: unknown[]) => {
          statement.params = params;
          return statement;
        },
      );

      // Return the latest synthetic row so tests can simulate
      // data changing after a successful batch.
      statement.first.mockImplementation(
        async () => savedRow,
      );

      statements.push(statement);

      return statement;
    });

    // Record prepared transactions without executing real SQL.
    mocks.batch.mockResolvedValue([]);

    mocks.toPublicUrl.mockImplementation(
      (key: string) =>
        `${PUBLIC_BASE}/${key}`,
    );

    mocks.revalidatePath.mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("Carousel action validation", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["string", "initialize-defaults"],
      ["number", 123],
      ["array", []],
      ["empty object", {}],
      ["unknown action", { action: "delete-image" }],
      ["missing action", { id: "example" }],
    ])(
      "rejects an unsupported settings request: %s",
      async (_label, body) => {
        await expectSettingsError(
          body,
          400,
          "Unknown carousel action.",
        );

        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.batch).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      },
    );

    it("requires a configured database for default initialization", async () => {
      vi.stubEnv("D1_PROXY_URL", "");

      await expectSettingsError(
        { action: "initialize-defaults" },
        503,
        "The database connection isn't configured.",
      );

      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    });
  });

  describe("Image settings input validation", () => {
    it.each([
      ["missing ID", undefined],
      ["null ID", null],
      ["numeric ID", 123],
      ["boolean ID", true],
      ["empty ID", ""],
      ["whitespace ID", "   "],
      ["oversized ID", "x".repeat(101)],
    ])(
      "rejects update-image with an invalid ID: %s",
      async (_label, id) => {
        await expectSettingsError(
          {
            action: "update-image",
            id,
            alt: "Updated description",
          },
          400,
          "Send an image ID, text description, and/or a true/false visibility setting.",
        );

        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.batch).not.toHaveBeenCalled();
      },
    );

    it("rejects image settings without a description or visibility change", async () => {
      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
        },
        400,
        "Send an image ID, text description, and/or a true/false visibility setting.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it.each([
      ["number", 123],
      ["boolean", true],
      ["null", null],
      ["object", { text: "description" }],
    ])(
      "rejects a non-text image description: %s",
      async (_label, alt) => {
        await expectSettingsError(
          {
            action: "update-image",
            id: UPLOADED_IMAGE.id,
            alt,
          },
          400,
          "Send an image ID, text description, and/or a true/false visibility setting.",
        );

        expect(mocks.batch).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["string", "true"],
      ["number", 1],
      ["null", null],
      ["object", { value: true }],
    ])(
      "rejects a non-boolean visibility value: %s",
      async (_label, enabled) => {
        await expectSettingsError(
          {
            action: "update-image",
            id: UPLOADED_IMAGE.id,
            enabled,
          },
          400,
          "Send an image ID, text description, and/or a true/false visibility setting.",
        );

        expect(mocks.batch).not.toHaveBeenCalled();
      },
    );

    it("rejects attempts to replace an image source through settings", async () => {
      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          alt: "New description",
          src: "carousel/unauthorized.webp",
        },
        400,
        "Send an image ID, text description, and/or a true/false visibility setting.",
      );

      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects unexpected fields that could change account or image metadata", async () => {
      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          enabled: true,
          role: "Owner",
        },
        400,
        "Send an image ID, text description, and/or a true/false visibility setting.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects updates when database configuration is missing", async () => {
      vi.stubEnv("PROXY_TOKEN", "");

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          alt: "Updated description",
        },
        503,
        "The database connection isn't configured.",
      );

      expect(mocks.prepare).not.toHaveBeenCalled();
      expect(mocks.batch).not.toHaveBeenCalled();
    });
  });

  describe("Saved carousel state validation", () => {
    it("rejects malformed saved JSON before editing", async () => {
      savedRow = {
        value: '{"invalid":',
      };

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          alt: "Changed",
        },
        409,
        "Saved carousel settings are invalid; nothing was changed.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects a saved carousel value that is not an array", async () => {
      savedRow = {
        value: JSON.stringify({
          invalid: true,
        }),
      };

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          enabled: true,
        },
        409,
        "Saved carousel settings are invalid; nothing was changed.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects edits when no carousel row exists", async () => {
      savedRow = null;

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          alt: "Changed",
        },
        404,
        "That image is no longer saved. Refresh the carousel editor.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("rejects editing an image that is no longer saved", async () => {
      setSavedImages([DEFAULT_ONE]);

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          enabled: true,
        },
        404,
        "That image is no longer saved. Refresh the carousel editor.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });
  });

  describe("Successful description and visibility updates", () => {
    beforeEach(() => {
      setSavedImages([
        DEFAULT_ONE,
        UPLOADED_IMAGE,
        OTHER_IMAGE,
      ]);
    });

    it("updates an image description without changing its source", async () => {
      const result = await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        alt: "Updated image description",
      });

      expect(result).toEqual({
        success: true,
        id: UPLOADED_IMAGE.id,
      });

      const batch = getBatchStatements();

      expect(batch).toHaveLength(1);

      expect(batch[0].sql).toContain(
        "UPDATE content_block",
      );

      expect(batch[0].sql).toContain(
        "json_patch",
      );

      expect(batch[0].params).toEqual([
        UPLOADED_IMAGE.id,
        JSON.stringify({
          alt: "Updated image description",
        }),
        null,
      ]);

      expect(mocks.toPublicUrl).not.toHaveBeenCalled();
    });

    it("allows an empty description", async () => {
      const result = await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        alt: "",
      });

      expect(result.success).toBe(true);

      const batch = getBatchStatements();

      expect(batch[0].params).toEqual([
        UPLOADED_IMAGE.id,
        JSON.stringify({
          alt: "",
        }),
        null,
      ]);
    });

    it("saves disabled visibility without changing the description", async () => {
      const result = await saveCarouselSettings({
        action: "update-image",
        id: DEFAULT_ONE.id,
        enabled: false,
      });

      expect(result).toEqual({
        success: true,
        id: DEFAULT_ONE.id,
      });

      const batch = getBatchStatements();

      expect(batch[0].params).toEqual([
        DEFAULT_ONE.id,
        JSON.stringify({
          enabled: false,
        }),
        null,
      ]);
    });

    it("allows an image to be enabled", async () => {
      const result = await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        enabled: true,
      });

      expect(result.success).toBe(true);

      const batch = getBatchStatements();

      expect(batch[0].params).toEqual([
        UPLOADED_IMAGE.id,
        JSON.stringify({
          enabled: true,
        }),
        null,
      ]);
    });

    it("saves description and visibility together", async () => {
      const result = await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        alt: "Updated tea photograph",
        enabled: true,
      });

      expect(result.success).toBe(true);

      const batch = getBatchStatements();

      expect(batch).toHaveLength(1);

      expect(batch[0].params).toEqual([
        UPLOADED_IMAGE.id,
        JSON.stringify({
          alt: "Updated tea photograph",
          enabled: true,
        }),
        null,
      ]);
    });

    it("prepares SQL that preserves order and unaffected image entries", async () => {
      await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        enabled: true,
      });

      const batch = getBatchStatements();
      const sql = batch[0].sql;

      // This verifies the SQL construction. A later isolated
      // SQLite test can verify the actual resulting row order.
      expect(sql).toContain(
        "json_each(content_block.value)",
      );

      expect(sql).toContain(
        "json_extract(entry.value, '$.id') = ?1",
      );

      expect(sql).toContain(
        "ELSE entry.value",
      );

      expect(sql).toContain(
        "ORDER BY CAST(entry.key AS INTEGER)",
      );

      expect(sql).toContain(
        "WHERE key = 'home.carousel'",
      );
    });

    it("revalidates both the public landing page and admin editor", async () => {
      await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        alt: "Changed",
      });

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/",
      );

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/website-content",
      );
    });
  });

  describe("Default carousel initialization", () => {
    it("prepares default-image insertion and a seeded flag in one batch", async () => {
      const result = await saveCarouselSettings({
        action: "initialize-defaults",
      });

      expect(result).toEqual({
        success: true,
        images: [],
      });

      const batch = getBatchStatements();

      expect(batch).toHaveLength(2);

      expect(batch[0].sql).toContain(
        "INSERT INTO content_block",
      );

      expect(batch[0].sql).toContain(
        "'home.carousel'",
      );

      expect(batch[1].sql).toContain(
        "'home.carousel_defaults_seeded'",
      );

      expect(batch[0].params).toEqual([
        JSON.stringify([DEFAULT_ONE, DEFAULT_TWO]),
      ]);

      expect(batch[1].params).toEqual([]);

      // No mock database mutation occurs in this test.
      // The empty returned image list is from the unsaved mock row.
    });

    it("guards against repeated initialization using a seeded flag", async () => {
      await saveCarouselSettings({
        action: "initialize-defaults",
      });

      const batch = getBatchStatements();

      expect(batch[0].sql).toContain(
        "WHERE NOT EXISTS",
      );

      expect(batch[0].sql).toContain(
        "'home.carousel_defaults_seeded'",
      );

      expect(batch[1].sql).toContain(
        "ON CONFLICT (key) DO NOTHING",
      );
    });

    it("prepares SQL that avoids duplicate default images by ID or source", async () => {
      await saveCarouselSettings({
        action: "initialize-defaults",
      });

      const batch = getBatchStatements();
      const sql = batch[0].sql;

      expect(sql).toContain(
        "FROM json_each(?1) AS original",
      );

      expect(sql).toContain(
        "FROM json_each(content_block.value) AS saved",
      );

      expect(sql).toContain(
        "json_extract(saved.value, '$.id')",
      );

      expect(sql).toContain(
        "json_extract(original.value, '$.id')",
      );

      expect(sql).toContain(
        "json_extract(saved.value, '$.src')",
      );

      expect(sql).toContain(
        "json_extract(original.value, '$.src')",
      );
    });

    it("prepares SQL that keeps defaults before previously saved images", async () => {
      setSavedImages([
        UPLOADED_IMAGE,
        OTHER_IMAGE,
      ]);

      await saveCarouselSettings({
        action: "initialize-defaults",
      });

      const batch = getBatchStatements();
      const sql = batch[0].sql;

      // Original and saved images form separate groups so
      // initialization preserves the intended carousel order.
      expect(sql).toContain(
        "0 AS image_group",
      );

      expect(sql).toContain(
        "1 AS image_group",
      );

      expect(sql).toContain(
        "ORDER BY image_group, position",
      );

      expect(sql).toContain(
        "UNION ALL",
      );
    });

    it("returns initialized default images with their original public paths", async () => {
      // Simulate the database returning the defaults after
      // the batch succeeds. No actual SQL is executed.
      mocks.batch.mockImplementationOnce(async () => {
        setSavedImages([
          DEFAULT_ONE,
          DEFAULT_TWO,
        ]);

        return [];
      });

      const result = await saveCarouselSettings({
        action: "initialize-defaults",
      });

      expect(result).toEqual({
        success: true,
        images: [
          DEFAULT_ONE,
          DEFAULT_TWO,
        ],
      });

      expect(mocks.toPublicUrl).not.toHaveBeenCalled();
    });

    it("converts uploaded storage keys to public URLs when returning saved images", async () => {
      mocks.batch.mockImplementationOnce(async () => {
        setSavedImages([
          DEFAULT_ONE,
          UPLOADED_IMAGE,
          DEFAULT_TWO,
        ]);

        return [];
      });

      const result = await saveCarouselSettings({
        action: "initialize-defaults",
      });

      expect(result).toEqual({
        success: true,
        images: [
          DEFAULT_ONE,
          {
            ...UPLOADED_IMAGE,
            src:
              `${PUBLIC_BASE}/${UPLOADED_IMAGE.src}`,
          },
          DEFAULT_TWO,
        ],
      });

      expect(mocks.toPublicUrl).toHaveBeenCalledOnce();

      expect(mocks.toPublicUrl).toHaveBeenCalledWith(
        UPLOADED_IMAGE.src,
      );
    });

    it("rejects existing carousel settings that are not a list", async () => {
      savedRow = {
        value: JSON.stringify({
          invalid: true,
        }),
      };

      await expectSettingsError(
        { action: "initialize-defaults" },
        409,
        "Saved carousel settings must be checked before adding originals.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
    });

    it("revalidates both pages after successful default initialization", async () => {
      await saveCarouselSettings({
        action: "initialize-defaults",
      });

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/",
      );

      expect(mocks.revalidatePath).toHaveBeenCalledWith(
        "/admin/website-content",
      );
    });
  });

  describe("Database and cache failure handling", () => {
    it("reports image settings database read failures", async () => {
      mocks.prepare.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic settings database read failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          alt: "Changed",
        },
        500,
        "Couldn't save or load carousel settings. Please retry.",
      );

      expect(mocks.batch).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("rejects an image update after a failed D1 batch", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      mocks.batch.mockRejectedValueOnce(
        new Error("Synthetic D1 update failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectSettingsError(
        {
          action: "update-image",
          id: UPLOADED_IMAGE.id,
          enabled: true,
        },
        500,
        "Couldn't save or load carousel settings. Please retry.",
      );

      expect(mocks.batch).toHaveBeenCalledOnce();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("rejects default initialization after a failed D1 batch", async () => {
      mocks.batch.mockRejectedValueOnce(
        new Error("Synthetic initialization failure."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectSettingsError(
        { action: "initialize-defaults" },
        500,
        "Couldn't save or load carousel settings. Please retry.",
      );

      expect(mocks.batch).toHaveBeenCalledOnce();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("reports invalid JSON returned after default initialization", async () => {
      mocks.batch.mockImplementationOnce(async () => {
        savedRow = {
          value: '{"invalid":',
        };

        return [];
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectSettingsError(
        { action: "initialize-defaults" },
        500,
        "Couldn't save or load carousel settings. Please retry.",
      );

      expect(errorSpy).toHaveBeenCalled();
    });

    it("reports a public URL conversion failure after initialization", async () => {
      mocks.batch.mockImplementationOnce(async () => {
        setSavedImages([UPLOADED_IMAGE]);

        return [];
      });

      mocks.toPublicUrl.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic public URL conversion failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expectSettingsError(
        { action: "initialize-defaults" },
        500,
        "Couldn't save or load carousel settings. Please retry.",
      );

      expect(mocks.batch).toHaveBeenCalledOnce();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("preserves successful updates when cache revalidation throws", async () => {
      setSavedImages([UPLOADED_IMAGE]);

      mocks.revalidatePath.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic cache revalidation failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await saveCarouselSettings({
        action: "update-image",
        id: UPLOADED_IMAGE.id,
        alt: "Changed",
      });

      expect(result).toEqual({
        success: true,
        id: UPLOADED_IMAGE.id,
      });

      expect(mocks.batch).toHaveBeenCalledOnce();

      expect(errorSpy).toHaveBeenCalledWith(
        "Carousel settings saved, but page revalidation failed:",
        expect.any(Error),
      );
    });

    it("preserves successful initialization when cache revalidation throws", async () => {
      mocks.revalidatePath.mockImplementationOnce(() => {
        throw new Error(
          "Synthetic cache refresh failure.",
        );
      });

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const result = await saveCarouselSettings({
        action: "initialize-defaults",
      });

      expect(result.success).toBe(true);
      expect(mocks.batch).toHaveBeenCalledOnce();

      expect(errorSpy).toHaveBeenCalledWith(
        "Carousel originals saved, but page revalidation failed:",
        expect.any(Error),
      );
    });

    it("does not create additional database statements when a settings update is rejected", async () => {
      setSavedImages([DEFAULT_ONE]);

      await expectSettingsError(
        {
          action: "update-image",
          id: "missing-image",
          alt: "Changed",
        },
        404,
        "That image is no longer saved. Refresh the carousel editor.",
      );

      // Only the initial read should have been prepared.
      expect(mocks.prepare).toHaveBeenCalledOnce();

      expect(
        findStatement("UPDATE content_block"),
      ).toBeUndefined();

      expect(mocks.batch).not.toHaveBeenCalled();
    });
  });
});