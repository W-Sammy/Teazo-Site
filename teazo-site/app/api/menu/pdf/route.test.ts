/**
 * Tests GET and HEAD /api/menu/pdf.
 *
 * Coverage includes:
 * - Redirecting to the bundled PDF before the first upload.
 * - Streaming the current R2-backed PDF.
 * - Same-origin PDF viewing headers and cache restrictions.
 * - Browser byte-range requests and 416 responses.
 * - HEAD requests and response metadata.
 * - Storage key validation and failure handling.
 *
 * Menu document queries, media URLs, and upstream fetch are mocked.
 * No real PDF storage service is contacted.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { toPublicUrl } from "@/app/lib/media";
import { getCurrentMenuDocument } from "@/app/lib/queries/menu-documents";

import { GET, HEAD } from "./route";

vi.mock("@/app/lib/media", () => ({
  toPublicUrl: vi.fn(
    (key: string) => `https://media.example/${key}`,
  ),
}));

vi.mock("@/app/lib/queries/menu-documents", () => ({
  getCurrentMenuDocument: vi.fn(),
}));

const URL = "http://localhost:3000/api/menu/pdf";
const PDF_BODY = "%PDF-1.7\nExample PDF\n%%EOF";

const mockFetch = vi.fn();

function request(
  method = "GET",
  headers: Record<string, string> = {},
): Request {
  return new Request(URL, {
    method,
    headers,
  });
}

function upstreamPdf(
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(PDF_BODY, {
    status,
    headers: {
      "Content-Type": "application/pdf",
      "Accept-Ranges": "bytes",
      ...headers,
    },
  });
}

describe("/api/menu/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getCurrentMenuDocument).mockResolvedValue({
      id: "document-1",
      r2_key: "documents/menu/current.pdf",
    });

    mockFetch.mockResolvedValue(upstreamPdf());

    vi.stubGlobal("fetch", mockFetch);

    // Failure-path tests intentionally generate server logs.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ============================================================
  // Fallback to the bundled menu
  // ============================================================

  // Before any PDF upload, visitors should still see the
  // existing PDF shipped with the website.
  it("redirects to the bundled PDF when no upload exists", async () => {
    vi.mocked(getCurrentMenuDocument).mockResolvedValueOnce(null);

    const response = await GET(request());

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "/teazo-menu.pdf",
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("supports the fallback redirect for HEAD requests", async () => {
    vi.mocked(getCurrentMenuDocument).mockResolvedValueOnce(null);

    const response = await HEAD(request("HEAD"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe(
      "/teazo-menu.pdf",
    );
    expect(response.body).toBeNull();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ============================================================
  // Current PDF retrieval and browser viewing
  // ============================================================

  it("retrieves the current published PDF from storage", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PDF_BODY);

    expect(toPublicUrl).toHaveBeenCalledWith(
      "documents/menu/current.pdf",
    );
  });

  it("fetches the PDF without caching or following redirects", async () => {
    await GET(request());

    expect(mockFetch).toHaveBeenCalledWith(
      "https://media.example/documents/menu/current.pdf",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        redirect: "error",
      }),
    );
  });

  // Inline disposition lets the browser open its PDF viewer.
  // The Admin UI opens this endpoint in a new browser tab.
  it("uses headers compatible with inline browser PDF viewing", async () => {
    const response = await GET(request());

    expect(response.headers.get("Content-Type")).toBe(
      "application/pdf",
    );

    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="teazo-menu.pdf"',
    );
  });

  it("disables caching and MIME-type sniffing", async () => {
    const response = await GET(request());

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, max-age=0",
    );

    expect(response.headers.get("X-Content-Type-Options")).toBe(
      "nosniff",
    );
  });

  it("forwards supported PDF response headers", async () => {
    mockFetch.mockResolvedValueOnce(
      upstreamPdf(200, {
        "Content-Length": "25",
        "Accept-Ranges": "bytes",
      }),
    );

    const response = await GET(request());

    expect(response.headers.get("Accept-Ranges")).toBe(
      "bytes",
    );

    expect(response.headers.get("Content-Length")).toBe(
      "25",
    );
  });

  // Compressed upstream responses may be automatically
  // decoded by fetch, invalidating their original length.
  it("does not forward encoded upstream content length", async () => {
    mockFetch.mockResolvedValueOnce(
      upstreamPdf(200, {
        "Content-Length": "999",
        "Content-Encoding": "gzip",
      }),
    );

    const response = await GET(request());

    expect(response.headers.has("Content-Length")).toBe(false);
  });

  // ============================================================
  // Browser range requests
  // ============================================================

  // Range requests let browsers seek within large PDFs.
  it("forwards Range headers to the storage service", async () => {
    const response = await GET(
      request("GET", {
        Range: "bytes=0-99",
      }),
    );

    expect(response.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Headers;

    expect(headers.get("Range")).toBe("bytes=0-99");
  });

  it("preserves successful partial-content responses", async () => {
    mockFetch.mockResolvedValueOnce(
      upstreamPdf(206, {
        "Content-Range": "bytes 0-9/100",
        "Content-Length": "10",
      }),
    );

    const response = await GET(
      request("GET", {
        Range: "bytes=0-9",
      }),
    );

    expect(response.status).toBe(206);

    expect(response.headers.get("Content-Range")).toBe(
      "bytes 0-9/100",
    );

    expect(response.headers.get("Content-Length")).toBe(
      "10",
    );
  });

  // A 416 response tells the PDF viewer that the requested
  // byte range falls outside the stored document.
  it("preserves unsatisfiable range responses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 416,
        headers: {
          "Content-Range": "bytes */100",
        },
      }),
    );

    const response = await GET(
      request("GET", {
        Range: "bytes=1000-2000",
      }),
    );

    expect(response.status).toBe(416);

    expect(response.headers.get("Content-Range")).toBe(
      "bytes */100",
    );

    expect(response.body).toBeNull();
  });

  // ============================================================
  // HEAD requests
  // ============================================================

  it("uses HEAD when the client requests PDF metadata", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: {
          "Content-Length": "2048",
          "Accept-Ranges": "bytes",
        },
      }),
    );

    const response = await HEAD(request("HEAD"));

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "HEAD",
      }),
    );
  });

  it("returns PDF metadata on successful HEAD requests", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: {
          "Content-Length": "2048",
          "Accept-Ranges": "bytes",
        },
      }),
    );

    const response = await HEAD(request("HEAD"));

    expect(response.headers.get("Content-Type")).toBe(
      "application/pdf",
    );

    expect(response.headers.get("Content-Length")).toBe(
      "2048",
    );

    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="teazo-menu.pdf"',
    );
  });

  // ============================================================
  // Storage key validation
  // ============================================================

  // Only generated PDF keys under documents/menu/ are allowed.
  // Database contents must not become an arbitrary fetch URL.
  it.each([
    "documents/other/menu.pdf",
    "documents/menu/../secret.pdf",
    "documents/menu//invalid.pdf",
    "documents/menu/file.txt",
    "documents/menu/FILE.PDF",
    "https://other.example/menu.pdf",
    "documents/menu/file.pdf?token=secret",
  ])("rejects unsafe storage key %s", async (r2_key) => {
    vi.mocked(getCurrentMenuDocument).mockResolvedValueOnce({
      id: "document-1",
      r2_key,
    });

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ============================================================
  // Storage and database failures
  // ============================================================

  it("returns 503 when the current-menu query fails", async () => {
    vi.mocked(getCurrentMenuDocument).mockRejectedValueOnce(
      new Error("D1 unavailable"),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);

    expect(await response.text()).toBe(
      "The menu is temporarily unavailable. Please try again shortly.",
    );
  });

  it("returns 503 when fetching the PDF fails", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
  });

  it("returns 503 when storage reports a missing PDF", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
  });

  // A successful status without a body cannot satisfy GET.
  it("returns 503 when storage returns no PDF body", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );

    const response = await GET(request());

    expect(response.status).toBe(503);
  });

  it("returns a bodyless service error for failed HEAD requests", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );

    const response = await HEAD(request("HEAD"));

    expect(response.status).toBe(503);
    expect(response.body).toBeNull();
  });

  it("returns plain text and no-store on service errors", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );

    const response = await GET(request());

    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, max-age=0",
    );
  });
});
