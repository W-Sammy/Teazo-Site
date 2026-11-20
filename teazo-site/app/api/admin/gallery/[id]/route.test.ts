/**
 * Tests PATCH and DELETE /api/admin/gallery/[id].
 *
 * Covers role-based authorization, metadata editing, image
 * replacement, multipart form validation, soft deletion,
 * missing images, database failures, and response headers.
 *
 * Authorization and Gallery service operations are mocked.
 * No real database records or stored images are modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
  GalleryInputError: class GalleryInputError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
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

import { D1Error } from "@/app/lib/d1";
import { GalleryInputError } from "@/app/lib/gallery";
import { MediaError } from "@/app/lib/media";
import { DELETE, PATCH } from "./route";

const URL =
  "http://localhost:3000/api/admin/gallery/test-image-id";

const SAVED_IMAGE = {
  id: "test-image-id",
  name: "Test Image",
  url: "https://media.example/gallery/test.webp",
  tags: [],
  createdAt: "2026-10-17T00:00:00.000Z",
};

const context = {
  params: Promise.resolve({ id: "test-image-id" }),
};

function contextFor(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}

function validForm(): FormData {
  const form = new FormData();

  form.set("name", "Test Image");
  form.set("tags", "[]");

  return form;
}

function makeRequest(
  method: "PATCH" | "DELETE",
  formData: FormData = validForm(),
): Request {
  return new Request(URL, {
    method,
    headers: {
      origin: "http://localhost:3000",
    },
    body: method === "PATCH" ? formData : undefined,
  });
}

describe("Admin gallery PATCH and DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        username: "Test Admin",
        role_id: 2,
        can_invite_users: 0,
      },
    });

    mocks.editGalleryImageMetadata.mockResolvedValue(
      SAVED_IMAGE,
    );

    mocks.replaceGalleryImage.mockResolvedValue(
      SAVED_IMAGE,
    );

    mocks.removeGalleryImage.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================
  // Existing authorization tests
  // ============================================================

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

      const response = await DELETE(
        makeRequest("DELETE"),
        context,
      );

      expect(response.status).toBe(204);
      expect(mocks.removeGalleryImage).toHaveBeenCalledOnce();
    },
  );

  // ============================================================
  // PATCH request validation
  // ============================================================

  it("rejects an empty image ID when editing", async () => {
    const response = await PATCH(
      makeRequest("PATCH"),
      contextFor(""),
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "An image ID is required.",
    });

    expect(mocks.editGalleryImageMetadata).not.toHaveBeenCalled();
  });

  it("rejects non-multipart PATCH requests", async () => {
    const request = new Request(URL, {
      method: "PATCH",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Test Image",
      }),
    });

    const response = await PATCH(request, context);

    expect(response.status).toBe(415);

    expect(await response.json()).toEqual({
      error: "Send image edits as form data.",
    });
  });

  it("rejects malformed multipart request bodies", async () => {
    const request = new Request(URL, {
      method: "PATCH",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "multipart/form-data; boundary=test",
      },
      body: "invalid-multipart-data",
    });

    const response = await PATCH(request, context);

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "The image edit request could not be read.",
    });
  });

  it("requires exactly one image name", async () => {
    const form = validForm();

    form.append("name", "Another Name");

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.editGalleryImageMetadata).not.toHaveBeenCalled();
  });

  it("requires exactly one tag list", async () => {
    const form = validForm();

    form.append("tags", '["Duplicate"]');

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Provide one image name and one tag list.",
    });
  });

  it("rejects a missing tag list", async () => {
    const form = validForm();

    form.delete("tags");

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("rejects tags submitted as a file", async () => {
    const form = validForm();

    form.set(
      "tags",
      new File(["[]"], "tags.txt", {
        type: "text/plain",
      }),
    );

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "The image tags must be a JSON list.",
    });
  });

  it("rejects malformed tag JSON", async () => {
    const form = validForm();

    form.set("tags", "{invalid");

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "The image tags must be a valid JSON list.",
    });
  });

  it("rejects more than one replacement file", async () => {
    const form = validForm();

    form.append(
      "file",
      new File(["a"], "a.png", { type: "image/png" }),
    );
    form.append(
      "file",
      new File(["b"], "b.png", { type: "image/png" }),
    );

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Provide only one replacement file.",
    });

    expect(mocks.replaceGalleryImage).not.toHaveBeenCalled();
  });

  it("rejects replacement values that are not files", async () => {
    const form = validForm();

    form.set("file", "not-an-image-file");

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "The replacement must be an image file.",
    });
  });

  // ============================================================
  // Metadata edits and image replacement
  // ============================================================

  it("delegates metadata-only edits without uploading new media", async () => {
    const form = validForm();

    form.set("name", "Updated Photo");
    form.set("tags", '["Tea","Drinks"]');

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(200);

    expect(mocks.editGalleryImageMetadata).toHaveBeenCalledWith({
      id: "test-image-id",
      name: "Updated Photo",
      tags: ["Tea", "Drinks"],
    });

    expect(mocks.replaceGalleryImage).not.toHaveBeenCalled();
  });

  it("delegates file replacement to the Gallery service", async () => {
    const form = validForm();

    form.set(
      "file",
      new File(["image data"], "replacement.png", {
        type: "image/png",
      }),
    );

    const response = await PATCH(
      makeRequest("PATCH", form),
      context,
    );

    expect(response.status).toBe(200);

    expect(mocks.replaceGalleryImage).toHaveBeenCalledWith({
      id: "test-image-id",
      name: "Test Image",
      tags: [],
      file: expect.any(File),
      adminId: "admin-1",
    });

    expect(mocks.editGalleryImageMetadata).not.toHaveBeenCalled();
  });

  it("returns the persisted Gallery image after an edit", async () => {
    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(await response.json()).toEqual(SAVED_IMAGE);
  });

  it("sets no-store on successful PATCH responses", async () => {
    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  // ============================================================
  // PATCH error responses
  // ============================================================

  it("preserves Gallery input validation status", async () => {
    mocks.editGalleryImageMetadata.mockRejectedValueOnce(
      new GalleryInputError("The image was not found.", 404),
    );

    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(response.status).toBe(404);
  });

  // A stale replacement should surface as a conflict,
  // not as a confirmed successful edit.
  it("returns 409 when image replacement loses a race", async () => {
    mocks.editGalleryImageMetadata.mockRejectedValueOnce(
      new GalleryInputError("Image changed", 409),
    );

    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(response.status).toBe(409);
  });

  it("returns 503 with recovery guidance when D1 fails", async () => {
    mocks.editGalleryImageMetadata.mockRejectedValueOnce(
      new D1Error("D1 unavailable"),
    );

    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error:
        "The update could not be confirmed. Refresh the gallery to check the saved values before trying again.",
    });
  });

  it("returns 503 when image storage configuration fails", async () => {
    mocks.editGalleryImageMetadata.mockRejectedValueOnce(
      new MediaError("R2 unavailable"),
    );

    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The gallery image service is temporarily unavailable.",
    });
  });

  it("returns 500 for unexpected edit failures", async () => {
    mocks.editGalleryImageMetadata.mockRejectedValueOnce(
      new Error("Unexpected failure"),
    );

    const response = await PATCH(
      makeRequest("PATCH"),
      context,
    );

    expect(response.status).toBe(500);
  });

  // ============================================================
  // DELETE success and missing-image responses
  // ============================================================

  it("rejects deletion when the image ID is missing", async () => {
    const response = await DELETE(
      makeRequest("DELETE"),
      contextFor(""),
    );

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "An image ID is required.",
    });

    expect(mocks.removeGalleryImage).not.toHaveBeenCalled();
  });

  it("soft-deletes the requested Gallery image", async () => {
    const response = await DELETE(
      makeRequest("DELETE"),
      context,
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();

    expect(mocks.removeGalleryImage).toHaveBeenCalledWith(
      "test-image-id",
    );
  });

  it("returns 404 when the image has already been removed", async () => {
    mocks.removeGalleryImage.mockResolvedValueOnce(false);

    const response = await DELETE(
      makeRequest("DELETE"),
      context,
    );

    expect(response.status).toBe(404);

    expect(await response.json()).toEqual({
      error: "The gallery image was not found.",
    });
  });

  it("sets no-store on successful deletion", async () => {
    const response = await DELETE(
      makeRequest("DELETE"),
      context,
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  // ============================================================
  // DELETE database and unexpected failures
  // ============================================================

  it("returns 503 when the database deletion fails", async () => {
    mocks.removeGalleryImage.mockRejectedValueOnce(
      new D1Error("D1 unavailable"),
    );

    const response = await DELETE(
      makeRequest("DELETE"),
      context,
    );

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The image could not be removed from the database.",
    });
  });

  it("returns 500 for unexpected deletion failures", async () => {
    mocks.removeGalleryImage.mockRejectedValueOnce(
      new Error("Unexpected deletion failure"),
    );

    const response = await DELETE(
      makeRequest("DELETE"),
      context,
    );

    expect(response.status).toBe(500);

    expect(await response.json()).toEqual({
      error: "The image could not be deleted. Please try again.",
    });
  });

  it("sets no-store on deletion errors", async () => {
    mocks.removeGalleryImage.mockResolvedValueOnce(false);

    const response = await DELETE(
      makeRequest("DELETE"),
      context,
    );

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });
});
