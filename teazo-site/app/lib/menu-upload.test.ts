/**
 * Tests shared Admin Menu PDF upload validation.
 *
 * Covers filename extensions, MIME types, file-size boundaries,
 * empty files, and successful upload response validation.
 *
 * These helpers are shared by the client and server.
 * No filesystem, database, or network mocks are required.
 */

import { describe, expect, it } from "vitest";

import {
  CURRENT_MENU_PDF_URL,
  MAX_MENU_PDF_BYTES,
  MENU_PDF_SIZE_LABEL,
  getMenuFileError,
  isMenuUploadResponse,
} from "./menu-upload";

// Use file metadata only. The shared validator does not read PDF bytes.
function file(
  overrides: Partial<{
    name: string;
    size: number;
    type: string;
  }> = {},
) {
  return {
    name: "teazo-menu.pdf",
    size: 1024,
    type: "application/pdf",
    ...overrides,
  };
}

describe("Menu PDF upload validation", () => {
  // ============================================================
  // Shared upload configuration
  // ============================================================

  it("uses the configured 4 MB PDF limit", () => {
    expect(MAX_MENU_PDF_BYTES).toBe(4_000_000);
    expect(MENU_PDF_SIZE_LABEL).toBe("4 MB");
  });

  // The UI and public PDF link must use the same endpoint.
  it("uses the current menu PDF endpoint", () => {
    expect(CURRENT_MENU_PDF_URL).toBe("/api/menu/pdf");
  });

  // ============================================================
  // Valid PDF metadata
  // ============================================================

  it("accepts valid PDF metadata", () => {
    expect(getMenuFileError(file())).toBeNull();
  });

  it("accepts uppercase PDF extensions", () => {
    expect(
      getMenuFileError(file({ name: "TEAZO-MENU.PDF" })),
    ).toBeNull();
  });

  // Browsers can supply generic or empty MIME types for PDFs.
  it.each([
    "application/pdf",
    "application/octet-stream",
    "",
  ])("accepts compatible MIME type %s", (type) => {
    expect(getMenuFileError(file({ type }))).toBeNull();
  });

  it("accepts a PDF exactly at the size limit", () => {
    expect(
      getMenuFileError(
        file({ size: MAX_MENU_PDF_BYTES }),
      ),
    ).toBeNull();
  });

  it("accepts the smallest nonempty PDF metadata", () => {
    expect(
      getMenuFileError(file({ size: 1 })),
    ).toBeNull();
  });

  // ============================================================
  // Invalid filenames and MIME types
  // ============================================================

  it.each([
    "menu.png",
    "menu.txt",
    "menu.pdf.exe",
    "menu",
  ])("rejects invalid filename %s", (name) => {
    expect(getMenuFileError(file({ name }))).toBe(
      "Please choose a PDF file ending in .pdf.",
    );
  });

  it.each([
    "image/png",
    "image/jpeg",
    "text/plain",
    "application/zip",
  ])("rejects incompatible MIME type %s", (type) => {
    expect(getMenuFileError(file({ type }))).toBe(
      "Please choose a PDF, not an image or another file type.",
    );
  });

  // ============================================================
  // Empty and oversized PDF files
  // ============================================================

  it("rejects empty PDF files", () => {
    expect(
      getMenuFileError(file({ size: 0 })),
    ).toBe("The selected PDF is empty.");
  });

  it("rejects a PDF one byte over the size limit", () => {
    expect(
      getMenuFileError(
        file({ size: MAX_MENU_PDF_BYTES + 1 }),
      ),
    ).toBe("The PDF must be 4 MB or smaller.");
  });

  it("rejects substantially oversized PDFs", () => {
    expect(
      getMenuFileError(file({ size: 10_000_000 })),
    ).toBe("The PDF must be 4 MB or smaller.");
  });
});

describe("Menu upload response validation", () => {
  // ============================================================
  // Valid success responses
  // ============================================================

  it("accepts a successful response with a document ID", () => {
    expect(
      isMenuUploadResponse({
        success: true,
        documentId: "document-123",
      }),
    ).toBe(true);
  });

  it("allows additional response fields", () => {
    expect(
      isMenuUploadResponse({
        success: true,
        documentId: "document-123",
        publishedAt: "2026-10-25",
      }),
    ).toBe(true);
  });

  // ============================================================
  // Invalid or unconfirmed responses
  // ============================================================

  it.each([
    null,
    undefined,
    false,
    "success",
    [],
    {},
    { success: false, documentId: "document-123" },
    { success: true },
    { success: true, documentId: null },
    { success: true, documentId: 123 },
    { success: "true", documentId: "document-123" },
  ])("rejects invalid response %#", (value) => {
    expect(isMenuUploadResponse(value)).toBe(false);
  });

  // A successful HTTP status is not enough if the server
  // does not provide the expected publication confirmation.
  it("rejects an error-shaped upload response", () => {
    expect(
      isMenuUploadResponse({
        error: "The upload could not be confirmed.",
      }),
    ).toBe(false);
  });
});
