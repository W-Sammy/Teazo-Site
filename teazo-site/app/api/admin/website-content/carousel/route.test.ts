/**
 * Backend API tests for Teazo carousel management.
 *
 * Covers administrator authorization, multipart uploads, JSON request
 * parsing, image removal, settings updates, default initialization,
 * successful responses, and expected/unexpected errors.
 *
 * The real POST, DELETE, and PATCH route handlers are tested.
 * Administrator authentication and the carousel service are mocked.
 *
 * No real administrator session, D1 request, R2 upload, email,
 * or production resource is accessed or modified.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Hoist all service and authentication mocks before importing the route.
const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  uploadCarouselImage: vi.fn(),
  removeCarouselImage: vi.fn(),
  saveCarouselSettings: vi.fn(),
}));

// Replace real administrator authentication with synthetic responses.
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

// The route needs a CarouselError class for recognizing expected errors.
// Keep the same public error shape while isolating the actual service.
vi.mock("@/app/lib/carousel", () => {
  class CarouselError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "CarouselError";
      this.status = status;
    }
  }

  return {
    CarouselError,
    uploadCarouselImage: mocks.uploadCarouselImage,
    removeCarouselImage: mocks.removeCarouselImage,
    saveCarouselSettings: mocks.saveCarouselSettings,
  };
});

import { CarouselError } from "@/app/lib/carousel";
import {
  DELETE,
  PATCH,
  POST,
  runtime,
} from "./route";

// Use a local-looking URL only to construct in-process Request objects.
// No actual HTTP connection is made.
const API_URL =
  "http://localhost:3000/api/admin/website-content/carousel";

// Synthetic upload metadata, unrelated to real storage.
const UPLOAD_RESULT = {
  success: true,
  key: "carousel/2026/11/synthetic.webp",
  url: "https://cdn.example.invalid/carousel/2026/11/synthetic.webp",
  image: {
    id: "synthetic-carousel-id",
    src: "https://cdn.example.invalid/carousel/2026/11/synthetic.webp",
    mediaKey: "carousel/2026/11/synthetic.webp",
    alt: "Synthetic carousel image",
    enabled: true,
  },
};

// A regular deletion returns the ID confirmed by the service.
const DELETE_RESULT = {
  success: true,
  id: "synthetic-carousel-id",
};

// Settings updates return success and the affected image ID.
const UPDATE_RESULT = {
  success: true,
  id: "synthetic-carousel-id",
};

// Default initialization returns the saved carousel image list.
const INITIALIZE_RESULT = {
  success: true,
  images: [
    {
      id: "default-synthetic",
      src: "/carousel_images/synthetic.jpg",
      alt: "Default synthetic image",
      enabled: true,
    },
  ],
};

// Create a multipart form like the real administrator upload form.
// The file is synthetic and will only be parsed by Request.formData().
function createUploadForm(options: {
  replacementId?: string;
  alt?: string;
  includeFile?: boolean;
} = {}) {
  const form = new FormData();

  if (options.includeFile !== false) {
    // The route passes File data through to the service.
    // Actual file validation belongs to carousel.ts.
    const file = new File(
      [
        Uint8Array.from([
          82, 73, 70, 70,
          8, 0, 0, 0,
          87, 69, 66, 80,
          86, 80, 56, 32,
        ]),
      ],
      "synthetic-carousel.webp",
      { type: "image/webp" },
    );

    form.set("file", file);
  }

  form.set(
    "alt",
    options.alt ?? "Synthetic carousel image",
  );

  if (options.replacementId !== undefined) {
    form.set("id", options.replacementId);
  }

  return form;
}

// Build an actual multipart Request without calling a server.
// Do not manually set Content-Type because Request supplies its boundary.
function uploadRequest(form: FormData) {
  return new Request(API_URL, {
    method: "POST",
    body: form,
  });
}

// Build DELETE/PATCH requests using the JSON content type.
// Raw strings support malformed-JSON test cases.
function jsonRequest(
  method: "DELETE" | "PATCH",
  body: unknown,
) {
  const payload =
    typeof body === "string"
      ? body
      : JSON.stringify(body);

  return new Request(API_URL, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: payload,
  });
}

// Produce an access-denied result without any real authentication.
// The route should return this response before reading request data.
function denyAccess(status: 401 | 403) {
  mocks.requireAdminApi.mockResolvedValueOnce({
    ok: false,
    response: Response.json(
      {
        error:
          status === 401
            ? "Authentication required."
            : "Administrator access denied.",
      },
      { status },
    ),
  });
}

// Check that the response retains the expected HTTP status and error.
async function expectApiError(
  response: Response,
  status: number,
  message: string,
) {
  expect(response.status).toBe(status);

  expect(await response.json()).toEqual({
    error: message,
  });
}

describe("Backend carousel administrator API", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Every test begins with an authorized synthetic administrator.
    // Individual denial tests override this result.
    mocks.requireAdminApi.mockResolvedValue({
      ok: true,
    });

    // Default service responses represent successful mocked writes.
    mocks.uploadCarouselImage.mockResolvedValue(UPLOAD_RESULT);
    mocks.removeCarouselImage.mockResolvedValue(DELETE_RESULT);
    mocks.saveCarouselSettings.mockResolvedValue(UPDATE_RESULT);
  });

  afterEach(() => {
    // Restore any console.error spies created for failure scenarios.
    vi.restoreAllMocks();
  });

  describe("Runtime and authorization", () => {
    it("uses the Node.js runtime for multipart uploads", () => {
      expect(runtime).toBe("nodejs");
    });

    it.each([
      ["POST"],
      ["DELETE"],
      ["PATCH"],
    ] as const)(
      "requires administrator authorization for %s",
      async (method) => {
        let request: Request;

        if (method === "POST") {
          request = uploadRequest(createUploadForm());
        } else {
          request = jsonRequest(method, {
            id: "synthetic-carousel-id",
          });
        }

        if (method === "POST") {
          await POST(request);
        } else if (method === "DELETE") {
          await DELETE(request);
        } else {
          await PATCH(request);
        }

        // Role level 2 permits administrator content management.
        expect(
          mocks.requireAdminApi,
        ).toHaveBeenCalledOnce();

        expect(
          mocks.requireAdminApi,
        ).toHaveBeenCalledWith(request, 2);
      },
    );

    it.each([
      ["POST", 401],
      ["POST", 403],
      ["DELETE", 401],
      ["DELETE", 403],
      ["PATCH", 401],
      ["PATCH", 403],
    ] as const)(
      "rejects %s with authorization status %s without calling the service",
      async (method, status) => {
        denyAccess(status);

        let request: Request;

        if (method === "POST") {
          request = uploadRequest(createUploadForm());
        } else {
          request = jsonRequest(method, {
            id: "synthetic-carousel-id",
          });
        }

        const response =
          method === "POST"
            ? await POST(request)
            : method === "DELETE"
              ? await DELETE(request)
              : await PATCH(request);

        expect(response.status).toBe(status);

        expect(
          mocks.uploadCarouselImage,
        ).not.toHaveBeenCalled();

        expect(
          mocks.removeCarouselImage,
        ).not.toHaveBeenCalled();

        expect(
          mocks.saveCarouselSettings,
        ).not.toHaveBeenCalled();
      },
    );
  });

  describe("POST — Upload or replace an image", () => {
    it("passes multipart image data to the upload service", async () => {
      const request = uploadRequest(
        createUploadForm({
          alt: "Uploaded tea leaves",
        }),
      );

      const response = await POST(request);

      expect(response.status).toBe(201);

      expect(await response.json()).toEqual(
        UPLOAD_RESULT,
      );

      expect(
        mocks.uploadCarouselImage,
      ).toHaveBeenCalledOnce();

      const form = mocks.uploadCarouselImage
        .mock.calls[0][0] as FormData;

      const file = form.get("file");

      expect(file).toBeInstanceOf(File);

      expect((file as File).name).toBe(
        "synthetic-carousel.webp",
      );

      expect((file as File).type).toBe(
        "image/webp",
      );

      expect(form.get("alt")).toBe(
        "Uploaded tea leaves",
      );

      expect(form.has("id")).toBe(false);
    });

    it("passes the replacement image ID through FormData", async () => {
      const request = uploadRequest(
        createUploadForm({
          replacementId: "existing-carousel-image",
          alt: "Replacement image",
        }),
      );

      const response = await POST(request);

      expect(response.status).toBe(201);

      const form = mocks.uploadCarouselImage
        .mock.calls[0][0] as FormData;

      expect(form.get("id")).toBe(
        "existing-carousel-image",
      );

      expect(form.get("alt")).toBe(
        "Replacement image",
      );
    });

    it("passes an empty upload form to service validation", async () => {
      const request = uploadRequest(new FormData());

      const response = await POST(request);

      // Required-field validation is handled by carousel.ts,
      // not duplicated by the route.
      expect(response.status).toBe(201);

      expect(
        mocks.uploadCarouselImage,
      ).toHaveBeenCalledOnce();

      const form = mocks.uploadCarouselImage
        .mock.calls[0][0] as FormData;

      expect(form.has("file")).toBe(false);
    });

    it("rejects a request that cannot be parsed as FormData", async () => {
      const request = new Request(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{}",
      });

      const response = await POST(request);

      await expectApiError(
        response,
        400,
        "Send the image using FormData.",
      );

      expect(
        mocks.uploadCarouselImage,
      ).not.toHaveBeenCalled();
    });

    it.each([
      [400, "No image file provided."],
      [413, "Image exceeds the size limit."],
      [415, "Unsupported image format."],
      [503, "Storage connection unavailable."],
    ] as const)(
      "preserves expected upload error status %s",
      async (status, message) => {
        mocks.uploadCarouselImage.mockRejectedValueOnce(
          new CarouselError(message, status),
        );

        const response = await POST(
          uploadRequest(createUploadForm()),
        );

        await expectApiError(
          response,
          status,
          message,
        );
      },
    );

    it("returns a safe generic error for unexpected upload failures", async () => {
      mocks.uploadCarouselImage.mockRejectedValueOnce(
        new Error("Synthetic private storage exception."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await POST(
        uploadRequest(createUploadForm()),
      );

      // Clone the response before expectApiError consumes its body.
      // This lets us verify the public error and ensure internal
      // exception details are not exposed to the client.
      const responseCopy = response.clone();

      await expectApiError(
        response,
        500,
        "Couldn't complete the carousel request. Please retry.",
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "Unexpected carousel request error:",
        expect.any(Error),
      );

      // Internal exception details must never reach the client.
      const responseBody = await responseCopy.json();

      expect(
        JSON.stringify(responseBody),
      ).not.toContain("Synthetic private storage exception.");
    });
  });

  describe("DELETE — Remove an image", () => {
    it("passes an image ID to the removal service", async () => {
      const request = jsonRequest("DELETE", {
        id: "synthetic-carousel-id",
      });

      const response = await DELETE(request);

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual(
        DELETE_RESULT,
      );

      expect(
        mocks.removeCarouselImage,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.removeCarouselImage,
      ).toHaveBeenCalledWith({
        id: "synthetic-carousel-id",
      });
    });

    it("leaves image ID validation to the carousel service", async () => {
      const response = await DELETE(
        jsonRequest("DELETE", {
          id: "",
        }),
      );

      // The route forwards parsed input to the service.
      // The service's own tests verify invalid IDs are rejected.
      expect(response.status).toBe(200);

      expect(
        mocks.removeCarouselImage,
      ).toHaveBeenCalledWith({
        id: "",
      });
    });

    it("returns a 400 error for malformed removal JSON", async () => {
      const response = await DELETE(
        jsonRequest("DELETE", '{"id":'),
      );

      await expectApiError(
        response,
        400,
        "Send the image ID as JSON.",
      );

      expect(
        mocks.removeCarouselImage,
      ).not.toHaveBeenCalled();
    });

    it.each([
      [400, "A valid image ID is required."],
      [409, "Saved carousel settings are invalid."],
      [503, "Database connection unavailable."],
    ] as const)(
      "preserves removal service error status %s",
      async (status, message) => {
        mocks.removeCarouselImage.mockRejectedValueOnce(
          new CarouselError(message, status),
        );

        const response = await DELETE(
          jsonRequest("DELETE", {
            id: "synthetic-carousel-id",
          }),
        );

        await expectApiError(
          response,
          status,
          message,
        );
      },
    );

    it("returns a generic error for unexpected removal failures", async () => {
      mocks.removeCarouselImage.mockRejectedValueOnce(
        new Error("Synthetic private database exception."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await DELETE(
        jsonRequest("DELETE", {
          id: "synthetic-carousel-id",
        }),
      );

      await expectApiError(
        response,
        500,
        "Couldn't complete the carousel request. Please retry.",
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "Unexpected carousel request error:",
        expect.any(Error),
      );
    });
  });

  describe("PATCH — Save image settings or initialize defaults", () => {
    it("forwards description and visibility changes to the service", async () => {
      const body = {
        action: "update-image",
        id: "synthetic-carousel-id",
        alt: "Updated tea image",
        enabled: false,
      };

      const response = await PATCH(
        jsonRequest("PATCH", body),
      );

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual(
        UPDATE_RESULT,
      );

      expect(
        mocks.saveCarouselSettings,
      ).toHaveBeenCalledOnce();

      expect(
        mocks.saveCarouselSettings,
      ).toHaveBeenCalledWith(body);
    });

    it("forwards default initialization requests", async () => {
      mocks.saveCarouselSettings.mockResolvedValueOnce(
        INITIALIZE_RESULT,
      );

      const request = jsonRequest("PATCH", {
        action: "initialize-defaults",
      });

      const response = await PATCH(request);

      expect(response.status).toBe(200);

      expect(await response.json()).toEqual(
        INITIALIZE_RESULT,
      );

      expect(
        mocks.saveCarouselSettings,
      ).toHaveBeenCalledWith({
        action: "initialize-defaults",
      });
    });

    it("passes null to service validation when request JSON is malformed", async () => {
      mocks.saveCarouselSettings.mockRejectedValueOnce(
        new CarouselError(
          "Unknown carousel action.",
          400,
        ),
      );

      const response = await PATCH(
        jsonRequest("PATCH", '{"action":'),
      );

      await expectApiError(
        response,
        400,
        "Unknown carousel action.",
      );

      // The PATCH handler converts failed JSON parsing into null.
      // The service then reports the validation error.
      expect(
        mocks.saveCarouselSettings,
      ).toHaveBeenCalledWith(null);
    });

    it.each([
      [400, "Invalid image settings."],
      [404, "Carousel image not found."],
      [409, "Saved carousel settings are invalid."],
      [503, "Database connection unavailable."],
    ] as const)(
      "preserves settings error status %s",
      async (status, message) => {
        mocks.saveCarouselSettings.mockRejectedValueOnce(
          new CarouselError(message, status),
        );

        const response = await PATCH(
          jsonRequest("PATCH", {
            action: "update-image",
            id: "synthetic-carousel-id",
            enabled: true,
          }),
        );

        await expectApiError(
          response,
          status,
          message,
        );
      },
    );

    it("returns a safe generic response for unexpected settings failures", async () => {
      mocks.saveCarouselSettings.mockRejectedValueOnce(
        new Error("Synthetic internal settings exception."),
      );

      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await PATCH(
        jsonRequest("PATCH", {
          action: "initialize-defaults",
        }),
      );

      await expectApiError(
        response,
        500,
        "Couldn't complete the carousel request. Please retry.",
      );

      expect(errorSpy).toHaveBeenCalledWith(
        "Unexpected carousel request error:",
        expect.any(Error),
      );
    });
  });
});