
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  editGalleryImageMetadata: vi.fn(),
  removeGalleryImage: vi.fn(),
  replaceGalleryImage: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/gallery", () => ({
  GalleryInputError: class GalleryInputError extends Error {},
  editGalleryImageMetadata: mocks.editGalleryImageMetadata,
  removeGalleryImage: mocks.removeGalleryImage,
  replaceGalleryImage: mocks.replaceGalleryImage,
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {},
}));

vi.mock("@/app/lib/media", () => ({
  MediaError: class MediaError extends Error {},
}));

import { DELETE, PATCH } from "./route";

const context = {
  params: Promise.resolve({ id: "test-image-id" }),
};

function makeRequest(method: "PATCH" | "DELETE"): Request {
  const formData = new FormData();

  if (method === "PATCH") {
    formData.set("name", "Test Image");
    formData.set("tags", "[]");
  }

  return new Request(
    "http://localhost:3000/api/admin/gallery/test-image-id",
    {
      method,
      headers: {
        origin: "http://localhost:3000",
      },
      body: method === "PATCH" ? formData : undefined,
    },
  );
}

describe("Admin gallery PATCH and DELETE authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["PATCH", "DELETE"] as const)(
    "rejects view-only access for %s",
    async (method) => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: false,
        response: Response.json(
          { error: "You do not have permission to perform this action." },
          { status: 403 },
        ),
      });

      const response =
        method === "PATCH"
          ? await PATCH(makeRequest(method), context)
          : await DELETE(makeRequest(method), context);

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        2,
      );
      expect(response.status).toBe(403);
      expect(mocks.editGalleryImageMetadata).not.toHaveBeenCalled();
      expect(mocks.replaceGalleryImage).not.toHaveBeenCalled();
      expect(mocks.removeGalleryImage).not.toHaveBeenCalled();
    },
  );

  it.each([1, 2])(
    "allows role %i to reach PATCH processing",
    async (role) => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: true,
        admin: {
          id: `admin-role-${role}`,
          username: "Test Admin",
          role_id: role,
          can_invite_users: 0,
        },
      });

      mocks.editGalleryImageMetadata.mockResolvedValue({
        id: "test-image-id",
        name: "Test Image",
        tags: [],
      });

      const response = await PATCH(
        makeRequest("PATCH"),
        context,
      );

      expect(response.status).toBe(200);
      expect(mocks.editGalleryImageMetadata).toHaveBeenCalledOnce();
    },
  );

  it.each([1, 2])(
    "allows role %i to reach DELETE processing",
    async (role) => {
      mocks.requireAdminApi.mockResolvedValue({
        ok: true,
        admin: {
          id: `admin-role-${role}`,
          username: "Test Admin",
          role_id: role,
          can_invite_users: 0,
        },
      });

      mocks.removeGalleryImage.mockResolvedValue(true);

      const response = await DELETE(
        makeRequest("DELETE"),
        context,
      );

      expect(response.status).toBe(204);
      expect(mocks.removeGalleryImage).toHaveBeenCalledOnce();
    },
  );
});
