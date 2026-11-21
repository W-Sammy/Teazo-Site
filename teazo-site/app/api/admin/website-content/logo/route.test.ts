import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Error } from "@/app/lib/d1";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  mintKey: vi.fn(),
  putMedia: vi.fn(),
  deleteMediaNow: vi.fn(),
  toPublicUrl: vi.fn(),
  updateWebsiteContent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/media", () => ({
  mintKey: mocks.mintKey,
  putMedia: mocks.putMedia,
  deleteMediaNow: mocks.deleteMediaNow,
  toPublicUrl: mocks.toPublicUrl,
}));

vi.mock("@/app/lib/website-content", () => ({
  updateWebsiteContent: mocks.updateWebsiteContent,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { POST } from "./route";

function makeMockFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

function uploadRequest(file?: File | null): Request {
  const formData = new FormData();
  if (file !== undefined && file !== null) {
    formData.append("file", file);
  }
  return new Request("http://localhost:3000/api/admin/website-content/logo", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: formData,
  });
}

describe("POST /api/admin/website-content/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", role_id: 1 },
    });
    mocks.mintKey.mockReturnValue("logo/2026/11/mock-uuid.png");
    mocks.putMedia.mockResolvedValue({
      key: "logo/2026/11/mock-uuid.png",
      size: 1024,
      bucket: "teazo-media",
    });
    mocks.toPublicUrl.mockReturnValue("https://r2.teazo.com/logo/2026/11/mock-uuid.png");
    mocks.updateWebsiteContent.mockResolvedValue({});
    mocks.deleteMediaNow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([401, 403])("rejects unauthorized caller with status %i", async (status) => {
    mocks.requireAdminApi.mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status }),
    });

    const file = makeMockFile("logo.png", "image/png", 1024);
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(status);
    expect(mocks.putMedia).not.toHaveBeenCalled();
    expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
  });

  it("rejects request without a file with status 400", async () => {
    const res = await POST(uploadRequest(null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("No image file provided.");
    expect(mocks.putMedia).not.toHaveBeenCalled();
  });

  it("rejects empty file (0 bytes) with status 400", async () => {
    const file = makeMockFile("empty.png", "image/png", 0);
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("The image file is empty.");
    expect(mocks.putMedia).not.toHaveBeenCalled();
  });

  it.each([
    ["logo.gif", "image/gif"],
    ["logo.svg", "image/svg+xml"],
    ["logo.bmp", "image/bmp"],
    ["doc.pdf", "application/pdf"],
  ])("rejects unsupported format %s with status 415", async (name, type) => {
    const file = makeMockFile(name, type, 1024);
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(415);
    const data = await res.json();
    expect(data.error).toContain("Unsupported image format. Please upload PNG, JPG, or WebP.");
    expect(mocks.putMedia).not.toHaveBeenCalled();
  });

  it("rejects file just over 4 MiB with status 413", async () => {
    const file = makeMockFile("huge.png", "image/png", 4 * 1024 * 1024 + 1);
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.error).toContain("Image file is too large. Must be 4 MiB or less.");
    expect(mocks.putMedia).not.toHaveBeenCalled();
  });

  it.each([
    ["logo.png", "image/png", "png"],
    ["logo.jpg", "image/jpeg", "jpg"],
    ["logo.webp", "image/webp", "webp"],
  ])("successfully stores media, persists to database, and revalidates for %s", async (name, type, ext) => {
    mocks.mintKey.mockReturnValueOnce(`logo/2026/11/uuid.${ext}`);
    mocks.toPublicUrl.mockReturnValueOnce(`https://r2.teazo.com/logo/2026/11/uuid.${ext}`);

    const file = makeMockFile(name, type, 2048);
    const res = await POST(uploadRequest(file));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      success: true,
      url: `https://r2.teazo.com/logo/2026/11/uuid.${ext}`,
    });

    expect(mocks.mintKey).toHaveBeenCalledWith("logo", ext);
    expect(mocks.putMedia).toHaveBeenCalledWith(
      `logo/2026/11/uuid.${ext}`,
      expect.any(Uint8Array),
      type,
    );
    expect(mocks.updateWebsiteContent).toHaveBeenCalledWith({
      logo: `https://r2.teazo.com/logo/2026/11/uuid.${ext}`,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/website-content");
    expect(mocks.deleteMediaNow).not.toHaveBeenCalled();
  });

  it("accepts a 4 MiB file with multipart overhead below the deployment limit", async () => {
    const request = uploadRequest(makeMockFile("logo.png", "image/png", 4 * 1024 * 1024));
    expect((await request.clone().arrayBuffer()).byteLength).toBeLessThan(4_500_000);
    expect((await POST(request)).status).toBe(200);
  });

  it("cleans up uploaded media when the database definitely rejects the write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.mintKey.mockReturnValueOnce("logo/2026/11/uuid.png");
    mocks.putMedia.mockResolvedValueOnce({
      key: "logo/2026/11/uuid.png",
      size: 1024,
      bucket: "teazo-media",
    });
    mocks.updateWebsiteContent.mockRejectedValueOnce(new D1Error("Database rejected write", 400));

    const file = makeMockFile("logo.png", "image/png", 1024);
    const res = await POST(uploadRequest(file));

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Could not save the logo. Please try again.");
    expect(data.requiresReload).not.toBe(true);

    expect(mocks.deleteMediaNow).toHaveBeenCalledWith("logo/2026/11/uuid.png");
  });
});
