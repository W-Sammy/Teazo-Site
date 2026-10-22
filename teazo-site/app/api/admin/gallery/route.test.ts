
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  saveGalleryImage: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/app/lib/gallery", () => ({
  GalleryInputError: class GalleryInputError extends Error {},
  saveGalleryImage: mocks.saveGalleryImage,
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {},
}));

vi.mock("@/app/lib/media", () => ({
  MediaError: class MediaError extends Error {},
}));

import { POST } from "./route";

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/admin/gallery", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
    },
    body: new FormData(),
  });
}

describe("Admin gallery POST authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Return a serializable image so the POST handler
    // can produce its normal 201 Created response.
    mocks.saveGalleryImage.mockResolvedValue({
      id: "test-image-id",
      name: "Test Image",
      url: "http://localhost:3000/test-image.webp",
      tags: [],
      createdAt: "2026-10-17T00:00:00.000Z",
    });
  });

  it("requires role 2 for image creation", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      response: Response.json(
        {
          error: "You do not have permission to perform this action.",
        },
        { status: 403 },
      ),
    });

    const response = await POST(makeRequest());

    expect(mocks.requireAdminApi).toHaveBeenCalledWith(
      expect.any(Request),
      2,
    );

    expect(response.status).toBe(403);
    expect(mocks.saveGalleryImage).not.toHaveBeenCalled();
  });

  it.each([1, 2])(
    "allows role %i to reach image processing",
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

      const response = await POST(makeRequest());

      expect(mocks.requireAdminApi).toHaveBeenCalledWith(
        expect.any(Request),
        2,
      );

      expect(mocks.saveGalleryImage).toHaveBeenCalledOnce();
      expect(mocks.saveGalleryImage).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: `admin-role-${role}`,
        }),
      );

      expect(response.status).toBe(201);

      const result = await response.json();

      expect(result).toMatchObject({
        id: "test-image-id",
        name: "Test Image",
      });
    },
  );
});
