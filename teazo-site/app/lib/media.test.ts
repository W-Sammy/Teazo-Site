/**
 * Tests the server-side media storage helper.
 *
 * Covers public R2 URLs, generated storage keys, upload size
 * validation, authenticated proxy requests, storage failures,
 * and immediate cleanup of unlinked files.
 *
 * All fetch calls are mocked. No Cloudflare R2 or D1 proxy
 * requests are made.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  deleteMediaNow,
  MAX_MEDIA_BYTES,
  MEDIA_TYPES,
  MediaError,
  mintKey,
  putMedia,
  toPublicUrl,
} from "./media";

const mockFetch = vi.fn();

const STORED = {
  bucket: "Images",
  key: "gallery/test.webp",
  size: 3,
};

describe("Media storage helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Use local fixture values, never actual proxy credentials.
    vi.stubEnv("D1_PROXY_URL", "http://localhost:8787");
    vi.stubEnv("PROXY_TOKEN", "test-proxy-token");
    vi.stubEnv("R2_PUBLIC_BASE", "https://media.example");

    mockFetch.mockResolvedValue(
      Response.json(STORED),
    );

    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // ============================================================
  // Public URLs and storage keys
  // ============================================================

  it("creates a public URL from an R2 object key", () => {
    expect(
      toPublicUrl("gallery/test.webp"),
    ).toBe("https://media.example/gallery/test.webp");
  });

  it("removes a trailing slash from the public base URL", () => {
    vi.stubEnv(
      "R2_PUBLIC_BASE",
      "https://media.example/",
    );

    expect(
      toPublicUrl("gallery/test.webp"),
    ).toBe("https://media.example/gallery/test.webp");
  });

  it("rejects missing public URL configuration", () => {
    vi.stubEnv("R2_PUBLIC_BASE", "");

    expect(() =>
      toPublicUrl("gallery/test.webp"),
    ).toThrow("R2_PUBLIC_BASE must be set.");
  });

  // Generated storage paths include a UTC year/month and
  // a fresh UUID so previously cached files are not overwritten.
  it("generates date-based media keys", () => {
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date("2026-10-25T12:00:00.000Z"),
    );

    const key = mintKey("gallery", "webp");

    expect(key).toMatch(
      /^gallery\/2026\/10\/[0-9a-f-]{36}\.webp$/,
    );
  });

  it("generates different keys for successive files", () => {
    const first = mintKey("gallery", "webp");
    const second = mintKey("gallery", "webp");

    expect(first).not.toBe(second);
  });

  it("supports expected image and PDF MIME types", () => {
    expect(MEDIA_TYPES).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
  });

  // ============================================================
  // Successful uploads
  // ============================================================

  it("uploads image bytes through the authenticated media proxy", async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await putMedia(
      "gallery/test.webp",
      bytes,
      "image/webp",
    );

    expect(result).toEqual(STORED);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/media/gallery/test.webp",
      expect.objectContaining({
        method: "PUT",
        headers: {
          authorization: "Bearer test-proxy-token",
          "content-type": "image/webp",
        },
      }),
    );
  });

  // The payload is copied into a regular Uint8Array before
  // passing it to fetch, rather than mutating the caller's data.
  it("sends the original file bytes without modification", async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    await putMedia(
      "gallery/test.webp",
      bytes,
      "image/webp",
    );

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    const sent = options.body as Uint8Array;

    expect(sent).toBeInstanceOf(Uint8Array);
    expect(Array.from(sent)).toEqual([1, 2, 3]);
    expect(sent).not.toBe(bytes);
  });

  // ============================================================
  // Upload validation and configuration
  // ============================================================

  it("rejects missing proxy configuration", async () => {
    vi.stubEnv("PROXY_TOKEN", "");

    await expect(
      putMedia(
        "gallery/test.webp",
        new Uint8Array([1]),
        "image/webp",
      ),
    ).rejects.toThrow(
      "D1_PROXY_URL and PROXY_TOKEN must be set.",
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects empty files before sending an upload request", async () => {
    await expect(
      putMedia(
        "gallery/test.webp",
        new Uint8Array(),
        "image/webp",
      ),
    ).rejects.toThrow("refusing to store an empty file");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses a maximum stored media size of 10 MB", () => {
    expect(MAX_MEDIA_BYTES).toBe(10 * 1024 * 1024);
  });

  it("rejects stored media exceeding 10 MB", async () => {
    await expect(
      putMedia(
        "gallery/large.webp",
        new Uint8Array(MAX_MEDIA_BYTES + 1),
        "image/webp",
      ),
    ).rejects.toMatchObject({
      name: "MediaError",
      status: 413,
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ============================================================
  // Upload failures
  // ============================================================

  it("reports proxy HTTP failures with their status", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Storage limit exceeded", {
        status: 507,
      }),
    );

    await expect(
      putMedia(
        "gallery/test.webp",
        new Uint8Array([1, 2, 3]),
        "image/webp",
      ),
    ).rejects.toMatchObject({
      name: "MediaError",
      status: 507,
      message: expect.stringContaining("Storage limit exceeded"),
    });
  });

  it("reports media proxy network failures", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error("Connection refused"),
    );

    await expect(
      putMedia(
        "gallery/test.webp",
        new Uint8Array([1, 2, 3]),
        "image/webp",
      ),
    ).rejects.toThrow("could not reach the media proxy");
  });

  // ============================================================
  // Immediate cleanup of unlinked media
  // ============================================================

  // This operation is for definitely rejected database writes.
  // Normal Gallery deletion instead uses the delayed cleanup queue.
  it("deletes an unlinked file through the proxy", async () => {
    const result = await deleteMediaNow(
      "gallery/test.webp",
    );

    expect(result).toBeUndefined();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8787/media/gallery/test.webp",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer test-proxy-token",
        },
      },
    );
  });

  it("reports failed immediate deletions", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Unavailable", { status: 503 }),
    );

    await expect(
      deleteMediaNow("gallery/test.webp"),
    ).rejects.toMatchObject({
      name: "MediaError",
      status: 503,
      message: "delete failed: 503",
    });
  });

  it("does not hide network errors during immediate deletion", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    await expect(
      deleteMediaNow("gallery/test.webp"),
    ).rejects.toThrow("Network unavailable");
  });

  it("creates MediaError instances with optional status codes", () => {
    const error = new MediaError("R2 unavailable", 503);

    expect(error.name).toBe("MediaError");
    expect(error.message).toBe("R2 unavailable");
    expect(error.status).toBe(503);
  });
});
