/**
 * Tests D1 queries for retrieving and publishing PDF menus.
 *
 * Covers current-document selection, filtering retired media,
 * publication statement ordering, saved media metadata, and
 * propagation of transaction failures.
 *
 * D1 prepare() and batch() are mocked. No database writes occur.
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
  getCurrentMenuDocument,
  publishMenuDocument,
} from "./menu-documents";

vi.mock("@/app/lib/d1", () => ({
  prepare: vi.fn(),
  batch: vi.fn(),
}));

type StatementRecord = {
  sql: string;
  args: unknown[];
};

const statements: StatementRecord[] = [];
const first = vi.fn();

function publication() {
  return {
    documentId: "document-new",
    mediaId: "media-new",
    stored: {
      bucket: "Images",
      key: "documents/menu/new.pdf",
      size: 2048,
    },
    originalFilename: "new-menu.pdf",
    adminId: "admin-1",
  };
}

describe("Menu document queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statements.length = 0;

    // Record statement order and bound parameters.
    vi.mocked(prepare).mockImplementation((sql) => {
      const record: StatementRecord = {
        sql: String(sql),
        args: [],
      };

      statements.push(record);

      const statement = {
        bind(...args: unknown[]) {
          record.args = args;
          return statement;
        },
        first,
      };

      return statement as never;
    });

    vi.mocked(batch).mockResolvedValue([] as never);
  });

  // ============================================================
  // Retrieving the current menu
  // ============================================================

  it("retrieves the current published PDF", async () => {
    first.mockResolvedValueOnce({
      id: "document-1",
      r2_key: "documents/menu/current.pdf",
    });

    const result = await getCurrentMenuDocument();

    expect(result).toEqual({
      id: "document-1",
      r2_key: "documents/menu/current.pdf",
    });
  });

  it("returns null when no current PDF exists", async () => {
    first.mockResolvedValueOnce(null);

    expect(await getCurrentMenuDocument()).toBeNull();
  });

  // The public endpoint must not serve retired or non-PDF media.
  it("filters current, active PDF document media", async () => {
    first.mockResolvedValueOnce(null);

    await getCurrentMenuDocument();

    const sql = statements[0].sql;

    expect(sql).toContain("document.is_current = 1");
    expect(sql).toContain("media.deleted_at IS NULL");
    expect(sql).toContain("media.mime_type = 'application/pdf'");
    expect(sql).toContain("media.purpose = 'document'");
  });

  it("selects the newest published current document", async () => {
    first.mockResolvedValueOnce(null);

    await getCurrentMenuDocument();

    expect(statements[0].sql).toContain(
      "ORDER BY document.published_at DESC, document.id",
    );
    expect(statements[0].sql).toContain("LIMIT 1");
  });

  // ============================================================
  // Publishing a new PDF menu
  // ============================================================

  it("publishes a PDF using a single D1 batch", async () => {
    await publishMenuDocument(publication());

    expect(batch).toHaveBeenCalledOnce();

    const batched = vi.mocked(batch).mock.calls[0][0];

    expect(batched).toHaveLength(3);
    expect(statements).toHaveLength(3);
  });

  // The new media record is inserted before the current-menu
  // flag changes, and the new version is inserted last.
  it("uses the required publication statement order", async () => {
    await publishMenuDocument(publication());

    expect(statements[0].sql).toContain(
      "INSERT INTO media_asset",
    );

    expect(statements[1].sql).toContain(
      "UPDATE menu_document SET is_current = 0 WHERE is_current = 1",
    );

    expect(statements[2].sql).toContain(
      "INSERT INTO menu_document",
    );
  });

  it("binds the stored PDF metadata to the media record", async () => {
    await publishMenuDocument(publication());

    expect(statements[0].args).toEqual([
      "media-new",
      "Images",
      "documents/menu/new.pdf",
      2048,
      "new-menu.pdf",
      "admin-1",
    ]);

    expect(statements[0].sql).toContain(
      "'application/pdf'",
    );

    expect(statements[0].sql).toContain(
      "'document'",
    );
  });

  it("marks the newly published document as current", async () => {
    await publishMenuDocument(publication());

    expect(statements[2].args).toEqual([
      "document-new",
      "media-new",
      "admin-1",
    ]);

    expect(statements[2].sql).toContain(
      "'TEAZO Menu', 1",
    );
  });

  // Publishing a new version must not delete old PDF files.
  // Keeping previous media avoids broken references and permits recovery.
  it("does not delete older media during publication", async () => {
    await publishMenuDocument(publication());

    const sql = statements
      .map((statement) => statement.sql)
      .join("\n")
      .toUpperCase();

    expect(sql).not.toContain("DELETE FROM");
    expect(sql).not.toContain("UPDATE MEDIA_ASSET SET DELETED_AT");
  });

  // A failed D1 batch must be surfaced to the upload endpoint.
  // The transaction itself is responsible for atomicity.
  it("propagates D1 publication errors", async () => {
    vi.mocked(batch).mockRejectedValueOnce(
      new Error("D1 transaction failed"),
    );

    await expect(
      publishMenuDocument(publication()),
    ).rejects.toThrow("D1 transaction failed");

    expect(batch).toHaveBeenCalledOnce();
  });
});
