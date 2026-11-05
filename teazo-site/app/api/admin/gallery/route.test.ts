/**
 * Tests POST /api/admin/gallery.
 *
 * Covers Admin authorization, form data parsing, JSON tag input,
 * successful uploads, validation errors, R2 storage failures,
 * D1 failures, and unexpected exceptions.
 *
 * The Gallery service and authorization guard are mocked.
 * These tests never upload files or modify database records.
 */

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  saveGalleryImage: vi.fn(),
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
  saveGalleryImage: mocks.saveGalleryImage,
}));

vi.mock("@/app/lib/d1", () => ({
  D1Error: class D1Error extends Error {},
}));

vi.mock("@/app/lib/media", () => ({
  MediaError: class MediaError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { D1Error } from "@/app/lib/d1";
import { GalleryInputError } from "@/app/lib/gallery";
import { MediaError } from "@/app/lib/media";
import { POST } from "./route";

const URL = "http://localhost:3000/api/admin/gallery";

const SAVED_IMAGE = {
  id: "test-image-id",
  name: "Test Image",
  url: "http://localhost:3000/test-image.webp",
  tags: [],
  createdAt: "2026-10-17T00:00:00.000Z",
};

function makeRequest(form: FormData = new FormData()): Request {
  return new Request(URL, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
    },
    body: form,
  });
}

function validForm(): FormData {
  const form = new FormData();

  form.set("name", "Milk Tea");
  form.set("tags", '["Drinks","Tea"]');
  form.set(
    "file",
    new File(
      ["image contents"],
      "photo.png",
      { type: "image/png" },
    ),
  );

  return form;
}

describe("Admin gallery POST authorization and upload handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        role_id: 2,
      },
    });

    // Return a serializable image so the POST handler
    // can produce its normal 201 Created response.
    mocks.saveGalleryImage.mockResolvedValue(SAVED_IMAGE);
  });

  // ============================================================
  // Existing authorization tests
  // ============================================================

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

  // ============================================================
  // Upload form parsing
  // ============================================================

  it("passes image fields to the Gallery service", async () => {
    await POST(makeRequest(validForm()));

    expect(mocks.saveGalleryImage).toHaveBeenCalledWith({
      file: expect.any(File),
      name: "Milk Tea",
      tags: ["Drinks", "Tea"],
      adminId: "admin-1",
    });
  });

  it("defaults to an empty tag list when tags are omitted", async () => {
    const form = new FormData();

    form.set("name", "Milk Tea");

    await POST(makeRequest(form));

    expect(mocks.saveGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Milk Tea",
        tags: [],
      }),
    );
  });

  it("returns 400 when image tags contain malformed JSON", async () => {
    const form = validForm();

    form.set("tags", "{invalid-json");

    const response = await POST(makeRequest(form));

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Invalid image tags.",
    });

    expect(mocks.saveGalleryImage).not.toHaveBeenCalled();
  });

  // JSON parsing itself does not validate tag element types.
  // The Gallery service performs that validation.
  it("forwards parsed tag arrays for service validation", async () => {
    const form = validForm();

    form.set("tags", '["Drinks",42]');

    await POST(makeRequest(form));

    expect(mocks.saveGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["Drinks", 42],
      }),
    );
  });

  // ============================================================
  // Successful upload responses
  // ============================================================

  it("returns the saved Gallery image after upload", async () => {
    const response = await POST(
      makeRequest(validForm()),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(SAVED_IMAGE);
  });

  it("sets no-store on successful upload responses", async () => {
    const response = await POST(makeRequest(validForm()));

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  // ============================================================
  // Validation failures
  // ============================================================

  it("returns 400 when Gallery input validation fails", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new GalleryInputError("Give the image a name."),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(400);

    expect(await response.json()).toEqual({
      error: "Give the image a name.",
    });
  });

  it("preserves unsupported image type status 415", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new GalleryInputError(
        "Upload a JPEG, PNG or WebP image.",
        415,
      ),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(415);
  });

  it("preserves oversized image status 413", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new GalleryInputError("The image is over 10 MB.", 413),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(413);
  });

  // ============================================================
  // Storage and database failure responses
  // ============================================================

  it("returns a service error when media storage fails", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new MediaError("R2 unavailable"),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The image could not be stored. Please try again.",
    });
  });

  it("preserves media proxy refusal status codes", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new MediaError("Storage full", 507),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(507);
  });

  it("returns 503 when database persistence fails", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new D1Error("D1 unavailable"),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(503);

    expect(await response.json()).toEqual({
      error: "The image could not be saved to the database.",
    });
  });

  it("returns 500 for unexpected upload failures", async () => {
    mocks.saveGalleryImage.mockRejectedValueOnce(
      new Error("Unexpected failure"),
    );

    const response = await POST(makeRequest(validForm()));

    expect(response.status).toBe(500);

    expect(await response.json()).toEqual({
      error: "The image could not be uploaded. Please try again.",
    });
  });

  it("marks upload error responses as non-cacheable", async () => {
    const form = validForm();

    form.set("tags", "invalid");

    const response = await POST(makeRequest(form));

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });
});
