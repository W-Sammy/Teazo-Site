/**
 * MOV Gallery database regression tests.
 *
 * Exercises the real Gallery SQL with an in-memory SQLite database,
 * including new uploads and media replacement. No D1/R2/network writes.
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as DatabaseSync | null,
}));

vi.mock("@/app/lib/d1", () => {
  type SqlStatement = {
    sql: string;
    args: (string | number | null)[];
    bind: (...args: (string | number | null)[]) => SqlStatement;
    all: () => Promise<{ results: unknown[] }>;
    first: () => Promise<unknown | null>;
  };

  function makeStatement(
    sql: string,
    args: (string | number | null)[] = [],
  ): SqlStatement {
    return {
      sql,
      args,
      bind: (...nextArgs) => makeStatement(sql, nextArgs),
      async all() {
        return { results: state.db!.prepare(sql).all(...args) };
      },
      async first() {
        return state.db!.prepare(sql).get(...args) ?? null;
      },
    };
  }

  return {
    D1Error: class D1Error extends Error {},
    prepare: makeStatement,
    async batch(statements: SqlStatement[]) {
      const db = state.db!;
      const results: { success: boolean; results: unknown[] }[] = [];
      db.exec("BEGIN");
      try {
        for (const statement of statements) {
          const compiled = db.prepare(statement.sql);
          const rows = /^SELECT\b/i.test(statement.sql.trim())
            ? compiled.all(...statement.args)
            : (compiled.run(...statement.args), []);
          results.push({ success: true, results: rows });
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { results };
    },
  };
});

import {
  getGalleryImage,
  recordGalleryImage,
  replaceGalleryImageMedia,
} from "./queries/gallery";

const migration = readFileSync(
  new URL("../../migrations/0015_gallery_mov_support.sql", import.meta.url),
  "utf8",
);

beforeEach(() => {
  const db = new DatabaseSync(":memory:");
  state.db = db;
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE media_asset (
      id TEXT PRIMARY KEY NOT NULL,
      r2_bucket TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      mime_type TEXT NOT NULL
        CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm')),
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      width INTEGER,
      height INTEGER,
      original_filename TEXT,
      purpose TEXT NOT NULL DEFAULT 'gallery',
      uploaded_by TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      deleted_at TEXT
    );
    CREATE TABLE gallery_image (
      id TEXT PRIMARY KEY NOT NULL,
      media_id TEXT NOT NULL REFERENCES media_asset(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      name_sort_key TEXT NOT NULL,
      caption TEXT,
      alt TEXT,
      is_published INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      deleted_at TEXT
    );
    CREATE TABLE gallery_tag (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL UNIQUE
    );
    CREATE TABLE gallery_image_tag (
      image_id TEXT NOT NULL REFERENCES gallery_image(id),
      tag_id INTEGER NOT NULL REFERENCES gallery_tag(id),
      PRIMARY KEY (image_id, tag_id)
    );
    CREATE TABLE pending_r2_deletion (
      r2_bucket TEXT NOT NULL,
      r2_key TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  db.exec(migration);
});

afterEach(() => {
  state.db?.close();
  state.db = null;
});

const baseInput = {
  imageId: "image-1",
  mediaId: "media-original",
  stored: { bucket: "teazo-media", key: "gallery/old.mp4", size: 1000 },
  mimeType: "video/mp4" as const,
  width: null,
  height: null,
  originalFilename: "old.mp4",
  name: "Gallery test",
  tags: [] as string[],
  adminId: "admin-1",
};

describe("Gallery MOV database persistence", () => {
  it("inserts a MOV with true MIME type and preserved foreign keys", async () => {
    await recordGalleryImage({
      ...baseInput,
      mimeType: "video/quicktime",
      originalFilename: "iphone.mov",
      stored: { ...baseInput.stored, key: "gallery/iphone.mov" },
    });

    const result = state.db!.prepare(`
      SELECT mime_type, mime_type_override FROM media_asset WHERE id='media-original'
    `).get();
    expect(result).toMatchObject({
      mime_type: "video/mp4",
      mime_type_override: "video/quicktime",
    });
    expect((await getGalleryImage("image-1"))?.mimeType).toBe("video/quicktime");
    expect(state.db!.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("keeps existing MP4 mime types unchanged", async () => {
    await recordGalleryImage(baseInput);
    const result = state.db!.prepare(`
      SELECT mime_type, mime_type_override FROM media_asset WHERE id='media-original'
    `).get();
    expect(result).toMatchObject({ mime_type: "video/mp4", mime_type_override: null });
    expect((await getGalleryImage("image-1"))?.mimeType).toBe("video/mp4");
  });

  it("replaces MP4 with MOV while preserving the Gallery image ID", async () => {
    await recordGalleryImage(baseInput);
    const updated = await replaceGalleryImageMedia({
      id: "image-1",
      expectedMediaId: "media-original",
      newMediaId: "media-mov",
      stored: { bucket: "teazo-media", key: "gallery/replacement.mov", size: 1000 },
      mimeType: "video/quicktime",
      width: null,
      height: null,
      originalFilename: "replacement.mov",
      adminId: "admin-1",
      name: "Updated Gallery test",
      tags: [],
    });
    expect(updated).not.toBeNull();
    expect(updated?.id).toBe("image-1");
    expect(updated?.mediaId).toBe("media-mov");
    expect(updated?.mimeType).toBe("video/quicktime");
    expect(state.db!.prepare("SELECT deleted_at FROM media_asset WHERE id='media-original'").get())
      .toMatchObject({ deleted_at: expect.any(String) });
    expect(state.db!.prepare("SELECT r2_key FROM pending_r2_deletion").get())
      .toMatchObject({ r2_key: "gallery/old.mp4" });
    expect(state.db!.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
