/**
 * Tests POST /api/admin/menu/upload.
 *
 * Coverage includes:
 * - Admin authorization and same-origin restrictions.
 * - Multipart form validation and bounded request sizes.
 * - PDF filename, MIME type, and byte-signature validation.
 * - R2 storage followed by D1 publication.
 * - Database, storage, and unexpected failure responses.
 *
 * Authentication, R2 storage, and D1 publication are mocked.
 * No actual files are uploaded or menu records modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { requireAdminApi } from "@/app/lib/admin";
import { D1Error } from "@/app/lib/d1";
import { MediaError, mintKey, putMedia } from "@/app/lib/media";
import { MAX_MENU_PDF_BYTES } from "@/app/lib/menu-upload";
import { publishMenuDocument } from "@/app/lib/queries/menu-documents";

import { POST } from "./route";

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: vi.fn(),
  getAdmin: vi.fn(),
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {},
}));

vi.mock("@/app/lib/media", () => ({
  MediaError: class MediaError extends Error {},
  mintKey: vi.fn(() => "documents/menu/generated.pdf"),
  putMedia: vi.fn(),
}));

vi.mock("@/app/lib/queries/menu-documents", () => ({
  publishMenuDocument: vi.fn(),
}));

const URL = "http://localhost:3000/api/admin/menu/upload";

const VALID_PDF = [
  "%PDF-1.7",
  "1 0 obj",
  "<<>>",
  "endobj",
  "%%EOF",
].join("\n");

const STORED_MEDIA = {
  bucket: "Images",
  key: "documents/menu/generated.pdf",
  size: new TextEncoder().encode(VALID_PDF).byteLength,
};

// The backend performs basic PDF signature checks rather
// than parsing the complete PDF document structure.
function pdf(
  contents: string | Uint8Array = VALID_PDF,
  name = "teazo-menu.pdf",
  type = "application/pdf",
): File {
  const body =
    typeof contents === "string"
      ? contents
      : Uint8Array.from(contents).buffer;

  return new File([body], name, { type });
}

function formWithFiles(files: File[] = [pdf()]): FormData {
  const form = new FormData();

  for (const file of files) {
    form.append("file", file);
  }

  return form;
}

// A Request built from FormData automatically includes
// the multipart boundary required by the upload handler.
function uploadRequest(
  form: FormData = formWithFiles(),
  origin: string | null = "http://localhost:3000",
): Request {
  const request = new Request(URL, {
    method: "POST",
    body: form,
  });

  if (origin !== null) {
    request.headers.set("Origin", origin);
  }

  return request;
}

describe("POST /api/admin/menu/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(requireAdminApi).mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        role_id: 2,
      },
    } as never);

    vi.mocked(putMedia).mockResolvedValue(
      STORED_MEDIA as never,
    );

    vi.mocked(publishMenuDocument).mockResolvedValue(
      undefined,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // Authorization and request origin
  // ============================================================

  it("requires edit-level Admin authorization", async () => {
    const request = uploadRequest();

    await POST(request);

    expect(requireAdminApi).toHaveBeenCalledWith(
      request,
      2,
    );
  });

  it("rejects unauthenticated requests before uploading", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(401);
    expect(putMedia).not.toHaveBeenCalled();
    expect(publishMenuDocument).not.toHaveBeenCalled();
  });

  it("rejects forbidden Admin requests before uploading", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Forbidden." },
        { status: 403 },
      ),
    });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(403);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // An authenticated session alone is insufficient:
  // uploads must also originate from this site's admin page.
  it("rejects requests without an Origin header", async () => {
    const response = await POST(
      uploadRequest(formWithFiles(), null),
    );

    expect(response.status).toBe(403);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects uploads from another origin", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles(),
        "https://other.example",
      ),
    );

    expect(response.status).toBe(403);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects malformed Origin headers", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles(),
        "not-a-valid-url",
      ),
    );

    expect(response.status).toBe(403);
  });

  // ============================================================
  // Multipart request validation
  // ============================================================

  it("rejects requests that are not multipart forms", async () => {
    const request = new Request(URL, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Expected a file-upload form.",
    });
  });

  it("rejects multipart requests without a body", async () => {
    const request = new Request(URL, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "multipart/form-data; boundary=test",
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "No file was received.",
    });
  });

  it("rejects malformed multipart payloads", async () => {
    const request = new Request(URL, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "multipart/form-data; boundary=test",
      },
      body: "not-a-valid-multipart-form",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects forms without a file", async () => {
    const response = await POST(
      uploadRequest(new FormData()),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Please choose one PDF file.",
    });
  });

  it("rejects non-file values in the file field", async () => {
    const form = new FormData();
    form.set("file", "not a file");

    const response = await POST(uploadRequest(form));

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // Uploading multiple files in a single request is forbidden.
  it("rejects forms containing multiple PDF files", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([
          pdf(),
          pdf(VALID_PDF, "second.pdf"),
        ]),
      ),
    );

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // ============================================================
  // Bounded request size
  // ============================================================

  it("rejects an oversized declared Content-Length", async () => {
    const request = uploadRequest();

    request.headers.set(
      "Content-Length",
      String(MAX_MENU_PDF_BYTES + 100_001),
    );

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // The request body is also bounded while streaming, even
  // when the declared Content-Length is missing.
  it("rejects oversized multipart bodies during streaming", async () => {
    const oversized = pdf(
      new Uint8Array(MAX_MENU_PDF_BYTES + 101_000),
    );

    const request = uploadRequest(
      formWithFiles([oversized]),
    );

    request.headers.delete("Content-Length");

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // A PDF can exceed the file limit without exceeding
  // the slightly larger multipart request limit.
  it("rejects files larger than 4 MB", async () => {
    const oversized = pdf(
      new Uint8Array(MAX_MENU_PDF_BYTES + 1),
    );

    const response = await POST(
      uploadRequest(formWithFiles([oversized])),
    );

    expect(response.status).toBe(413);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // ============================================================
  // PDF metadata and byte validation
  // ============================================================

  it("rejects filenames without a PDF extension", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([pdf(VALID_PDF, "menu.png")]),
      ),
    );

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME types", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([
          pdf(VALID_PDF, "menu.pdf", "image/png"),
        ]),
      ),
    );

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects empty PDF files", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([pdf("", "empty.pdf")]),
      ),
    );

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // Renaming a non-PDF file to .pdf must not bypass the
  // server-side signature check.
  it("rejects files missing the PDF header", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([
          pdf("This is not a PDF.\n%%EOF"),
        ]),
      ),
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error:
        "This file does not appear to be a complete PDF. Export it again and retry.",
    });

    expect(putMedia).not.toHaveBeenCalled();
  });

  it("rejects files missing the PDF EOF marker", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([
          pdf("%PDF-1.7\nIncomplete file"),
        ]),
      ),
    );

    expect(response.status).toBe(400);
    expect(putMedia).not.toHaveBeenCalled();
  });

  // ============================================================
  // Successful R2 storage and D1 publication
  // ============================================================

  it("uploads and publishes a valid PDF menu", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(201);

    const payload = await response.json();

    expect(payload).toEqual({
      success: true,
      documentId: expect.any(String),
    });

    expect(mintKey).toHaveBeenCalledWith(
      "documents/menu",
      "pdf",
    );

    expect(putMedia).toHaveBeenCalledWith(
      "documents/menu/generated.pdf",
      expect.any(Uint8Array),
      "application/pdf",
    );

    expect(publishMenuDocument).toHaveBeenCalledWith({
      documentId: payload.documentId,
      mediaId: expect.any(String),
      stored: STORED_MEDIA,
      originalFilename: "teazo-menu.pdf",
      adminId: "admin-1",
    });
  });

  // R2 storage occurs before the new menu is published in D1.
  it("stores the PDF before publishing its database record", async () => {
    await POST(uploadRequest());

    expect(putMedia).toHaveBeenCalledOnce();
    expect(publishMenuDocument).toHaveBeenCalledOnce();

    const storageOrder = vi.mocked(putMedia)
      .mock.invocationCallOrder[0];

    const publicationOrder = vi.mocked(publishMenuDocument)
      .mock.invocationCallOrder[0];

    expect(storageOrder).toBeLessThan(publicationOrder);
  });

  it("accepts a valid PDF with a generic MIME type", async () => {
    const response = await POST(
      uploadRequest(
        formWithFiles([
          pdf(
            VALID_PDF,
            "menu.pdf",
            "application/octet-stream",
          ),
        ]),
      ),
    );

    expect(response.status).toBe(201);
  });

  it("marks successful responses as non-cacheable", async () => {
    const response = await POST(uploadRequest());

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  // ============================================================
  // R2, D1, and unexpected failures
  // ============================================================

  it("returns 503 when R2 storage fails", async () => {
    vi.mocked(putMedia).mockRejectedValueOnce(
      new MediaError("R2 unavailable"),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
    expect(publishMenuDocument).not.toHaveBeenCalled();
  });

  it("returns 503 when D1 publication fails", async () => {
    vi.mocked(publishMenuDocument).mockRejectedValueOnce(
      new D1Error("D1 unavailable"),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
  });

  // A D1 batch response can be lost after the commit succeeds.
  // Never immediately delete the uploaded R2 file because
  // it might already be the current published menu.
  it("does not remove stored media after uncertain D1 failure", async () => {
    vi.mocked(publishMenuDocument).mockRejectedValueOnce(
      new D1Error("Lost transaction response"),
    );

    const response = await POST(uploadRequest());

    expect(response.status).toBe(503);
    expect(putMedia).toHaveBeenCalledOnce();

    // The route has no immediate media-deletion dependency.
    expect(publishMenuDocument).toHaveBeenCalledOnce();
  });

  it("returns 500 for unexpected upload failures", async () => {
    vi.mocked(mintKey).mockImplementationOnce(() => {
      throw new Error("Unexpected failure");
    });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("includes recovery guidance when publication cannot be confirmed", async () => {
    vi.mocked(publishMenuDocument).mockRejectedValueOnce(
      new D1Error("D1 unavailable"),
    );

    const response = await POST(uploadRequest());

    expect(await response.json()).toEqual({
      error:
        "The upload could not be confirmed. Check the public menu before retrying. If it did not change, check the app and Worker terminals.",
    });
  });

  it("marks error responses as non-cacheable", async () => {
    const response = await POST(
      uploadRequest(new FormData()),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });
});
