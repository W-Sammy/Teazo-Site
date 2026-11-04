import { beforeEach, describe, expect, it, vi } from "vitest";
import { GALLERY_TAG } from "@/app/lib/cache-tags";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  listPublished: vi.fn(),
  deleteImage: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  // Pass-through: these tests check when the cache is cleared and what a failed read does.
  unstable_cache: (load: () => Promise<unknown>) => load,
}));
vi.mock("sharp", () => ({ default: vi.fn() }));
vi.mock("@/app/lib/media", () => ({
  toPublicUrl: (key: string) => `https://media.test/${key}`,
  deleteMediaNow: vi.fn(),
  storeMedia: vi.fn(),
}));
vi.mock("@/app/lib/queries/gallery", async (original) => ({
  ...(await original<typeof import("@/app/lib/queries/gallery")>()),
  listPublishedGalleryImages: mocks.listPublished,
  deleteGalleryImage: mocks.deleteImage,
}));

const { getPublicGalleryImages, removeGalleryImage } = await import("@/app/lib/gallery");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("public gallery caching (TZ-515)", () => {
  it("clears the cached gallery when an image is removed", async () => {
    mocks.deleteImage.mockResolvedValue(true);
    await expect(removeGalleryImage("image-1")).resolves.toBe(true);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(GALLERY_TAG, { expire: 0 });
  });

  it("leaves the cache alone when removing an image fails", async () => {
    mocks.deleteImage.mockRejectedValue(new Error("D1 is down"));
    await expect(removeGalleryImage("image-1")).rejects.toThrow("D1 is down");
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("still reports a removal when clearing the cache fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteImage.mockResolvedValue(true);
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error("no cache here");
    });
    await expect(removeGalleryImage("image-1")).resolves.toBe(true);
    mocks.revalidateTag.mockReset();
  });

  it("maps published images to their public URLs", async () => {
    mocks.listPublished.mockResolvedValue([
      { id: "1", name: "Boba", alt: null, caption: null, r2Key: "gallery/1.webp" },
    ]);
    await expect(getPublicGalleryImages()).resolves.toEqual([
      { id: "1", url: "https://media.test/gallery/1.webp", alt: "Boba", caption: "Boba" },
    ]);
  });

  it("returns null so the page shows placeholders when the read fails", async () => {
    mocks.listPublished.mockRejectedValue(new Error("D1 is down"));
    await expect(getPublicGalleryImages()).resolves.toBeNull();
  });
});
