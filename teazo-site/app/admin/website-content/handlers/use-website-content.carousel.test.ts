/**
 * Tests the carousel state and persistence behavior managed
 * by the real useWebsiteContent React hook.
 *
 * Covers initialization, failed loads, retries, visibility,
 * debounced description saves, immediate save flushing,
 * failed settings updates, uploads, and image removal.
 *
 * HTTP requests are mocked at the fetch boundary.
 * No production database, R2 bucket, or website content
 * is accessed or modified.
 *
 * Uses built-in Vitest assertions without jest-dom.
 */

// @vitest-environment jsdom

import {
  act,
  cleanup,
  renderHook,
  waitFor,
} from "@testing-library/react";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  CarouselImage,
  WebsiteContent,
} from "@/app/types/website-content";

import {
  useWebsiteContent,
} from "./use-website-content";

// Synthetic saved images returned by the mocked API.
const IMAGES: CarouselImage[] = [
  {
    id: "saved-carousel-1",
    src: "/synthetic-carousel-one.jpg",
    alt: "First carousel photograph",
    enabled: true,
  },
  {
    id: "saved-carousel-2",
    src: "/synthetic-carousel-two.webp",
    alt: "Second carousel photograph",
    enabled: false,
  },
];

// A placeholder has not yet been persisted to storage.
const EMPTY_IMAGE: CarouselImage = {
  id: "unsaved-carousel-1",
  src: "",
  alt: "",
  enabled: true,
};

// Provide the required content structure without
// loading the real website content or database.
const INITIAL_CONTENT: WebsiteContent = {
  logo: "",
  story: "",
  socialLinks: [],
  address: {
    businessName: "Synthetic Teazo Test",
    streetAddress: "123 Example Street",
    locality: "Example City, CA",
    phone: "555-0100",
    email: "test@example.invalid",
  },
  hours: [],
  holidays: [],
  carouselImages: IMAGES,
  contactFormEnabled: true,
  onlineOrderingEnabled: true,
};

type RecordedRequest = {
  url: string;
  method: string;
  body: unknown;
};

type ResponseResolver = (
  request: RecordedRequest,
) => Response | Promise<Response>;

let requests: RecordedRequest[] = [];
let resolveRequest: ResponseResolver;

// Supply successful JSON responses by default.
function success(
  value: Record<string, unknown> = {},
): Response {
  return Response.json({
    success: true,
    ...value,
  });
}

// Build an API failure without contacting a server.
function failure(
  message: string,
  status = 503,
): Response {
  return Response.json(
    { error: message },
    { status },
  );
}

// Identify an action in the mock request body.
function isAction(
  request: RecordedRequest,
  action: string,
): boolean {
  return (
    request.body !== null &&
    typeof request.body === "object" &&
    !(request.body instanceof FormData) &&
    "action" in request.body &&
    request.body.action === action
  );
}

// Return all requests for a particular HTTP method.
function methodRequests(
  method: string,
): RecordedRequest[] {
  return requests.filter(
    (request) => request.method === method,
  );
}

// Return all carousel metadata update requests.
function settingsRequests(): RecordedRequest[] {
  return requests.filter(
    (request) =>
      request.method === "PATCH" &&
      isAction(request, "update-image"),
  );
}

// Mount the hook and wait for successful initialization.
async function loadCarousel() {
  const hook = renderHook(() =>
    useWebsiteContent(INITIAL_CONTENT),
  );

  await waitFor(() => {
    expect(
      hook.result.current.carousel.carouselReady,
    ).toBe(true);
  });

  return hook;
}

// Create a small synthetic file. The mock fetch
// prevents any upload from reaching external storage.
function imageFile(
  name = "synthetic.png",
  type = "image/png",
): File {
  return new File(
    [new Uint8Array([1, 2, 3, 4])],
    name,
    { type },
  );
}

beforeEach(() => {
  requests = [];

  // Initialization returns the known set of saved images.
  // Other operations succeed unless a test overrides them.
  resolveRequest = (request) => {
    if (
      request.method === "PATCH" &&
      isAction(request, "initialize-defaults")
    ) {
      return success({
        images: IMAGES,
      });
    }

    return success();
  };

  // Intercept requests made by the actual hook.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const method = init?.method ?? "GET";

        const body =
          init?.body instanceof FormData
            ? init.body
            : JSON.parse(
                String(init?.body ?? "{}"),
              ) as unknown;

        const request: RecordedRequest = {
          url: String(input),
          method,
          body,
        };

        requests.push(request);

        return resolveRequest(request);
      },
    ),
  );
});

afterEach(() => {
  // Unmount the hook before restoring fetch.
  // This also clears its pending save timers.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Website content carousel state management", () => {
  describe("Initialization and loading", () => {
    it("loads saved images and enables editing after initialization", async () => {
      const { result } = await loadCarousel();

      expect(
        result.current.carousel.carouselReady,
      ).toBe(true);

      expect(
        result.current.carousel.carouselImages,
      ).toEqual(IMAGES);

      expect(
        result.current.carousel.carouselLoadError,
      ).toBe("");

      expect(requests).toHaveLength(1);

      expect(requests[0]).toMatchObject({
        url: "/api/admin/website-content/carousel",
        method: "PATCH",
        body: {
          action: "initialize-defaults",
        },
      });
    });

    it("preserves the loading error and retries initialization", async () => {
      let attempts = 0;

      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          attempts += 1;

          if (attempts === 1) {
            return failure(
              "Synthetic carousel initialization failure.",
            );
          }

          return success({
            images: IMAGES,
          });
        }

        return success();
      };

      const { result } = renderHook(() =>
        useWebsiteContent(INITIAL_CONTENT),
      );

      await waitFor(() => {
        expect(
          result.current.carousel.carouselLoadError,
        ).toBe(
          "Synthetic carousel initialization failure.",
        );
      });

      expect(
        result.current.carousel.carouselReady,
      ).toBe(false);

      // Retry should issue a new initialization request.
      act(() => {
        result.current.carousel.retryLoading();
      });

      await waitFor(() => {
        expect(
          result.current.carousel.carouselReady,
        ).toBe(true);
      });

      expect(
        result.current.carousel.carouselLoadError,
      ).toBe("");

      expect(attempts).toBe(2);
    });

    it("rejects initialization responses without an image list", async () => {
      resolveRequest = () => success();

      const { result } = renderHook(() =>
        useWebsiteContent(INITIAL_CONTENT),
      );

      await waitFor(() => {
        expect(
          result.current.carousel.carouselLoadError,
        ).toBe(
          "Couldn't load carousel images.",
        );
      });

      expect(
        result.current.carousel.carouselReady,
      ).toBe(false);
    });
  });

  describe("Visibility and description persistence", () => {
    it("saves visibility changes immediately", async () => {
      const { result } = await loadCarousel();

      act(() => {
        result.current.carousel.updateCarouselImage(
          IMAGES[0].id,
          { enabled: false },
        );
      });

      await waitFor(() => {
        expect(
          settingsRequests(),
        ).toHaveLength(1);
      });

      expect(settingsRequests()[0].body).toMatchObject({
        action: "update-image",
        id: IMAGES[0].id,
        enabled: false,
      });

      expect(
        result.current.carousel.carouselImages[0]
          .enabled,
      ).toBe(false);
    });

    it("debounces description changes and saves the latest value", async () => {
      const { result } = await loadCarousel();

      act(() => {
        result.current.carousel.updateCarouselImage(
          IMAGES[0].id,
          { alt: "First edit" },
        );

        result.current.carousel.updateCarouselImage(
          IMAGES[0].id,
          { alt: "Final description" },
        );
      });

      // Text changes are queued, not sent immediately.
      expect(
        settingsRequests(),
      ).toHaveLength(0);

      // The application uses a 600ms debounce.
      await waitFor(
        () => {
          expect(
            settingsRequests(),
          ).toHaveLength(1);
        },
        { timeout: 2000 },
      );

      expect(settingsRequests()[0].body).toMatchObject({
        action: "update-image",
        id: IMAGES[0].id,
        alt: "Final description",
      });

      expect(
        result.current.carousel.carouselImages[0].alt,
      ).toBe("Final description");
    });

    it("flushes pending descriptions immediately when requested", async () => {
      const { result } = await loadCarousel();

      act(() => {
        result.current.carousel.updateCarouselImage(
          IMAGES[0].id,
          {
            alt: "Description saved on blur",
          },
        );
      });

      expect(
        settingsRequests(),
      ).toHaveLength(0);

      // The editor calls this when its text field blurs.
      act(() => {
        result.current.carousel
          .flushAllCarouselSettings();
      });

      await waitFor(() => {
        expect(
          settingsRequests(),
        ).toHaveLength(1);
      });

      expect(settingsRequests()[0].body).toMatchObject({
        id: IMAGES[0].id,
        alt: "Description saved on blur",
      });
    });

    it("retains failed settings updates for a later retry", async () => {
      let saveAttempts = 0;

      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: IMAGES,
          });
        }

        if (
          isAction(
            request,
            "update-image",
          )
        ) {
          saveAttempts += 1;

          if (saveAttempts === 1) {
            return failure(
              "Synthetic settings save failure.",
            );
          }
        }

        return success();
      };

      const { result } = await loadCarousel();

      act(() => {
        result.current.carousel.updateCarouselImage(
          IMAGES[0].id,
          { enabled: false },
        );
      });

      await waitFor(() => {
        expect(
          result.current.carousel.carouselHasError,
        ).toBe(true);
      });

      expect(
        result.current.carousel.carouselSaveErrors[
          IMAGES[0].id
        ],
      ).toBe(
        "Synthetic settings save failure.",
      );

      // A failed patch must remain available for retry.
      act(() => {
        result.current.carousel
          .flushAllCarouselSettings();
      });

      await waitFor(() => {
        expect(saveAttempts).toBe(2);

        expect(
          result.current.carousel.carouselHasError,
        ).toBe(false);
      });

      expect(
        result.current.carousel.carouselImages[0]
          .enabled,
      ).toBe(false);
    });

    it("does not persist metadata for an image without a saved source", async () => {
      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: [EMPTY_IMAGE],
          });
        }

        return success();
      };

      const { result } = await loadCarousel();

      act(() => {
        result.current.carousel.updateCarouselImage(
          EMPTY_IMAGE.id,
          {
            alt: "Description before uploading",
            enabled: false,
          },
        );

        result.current.carousel
          .flushAllCarouselSettings();
      });

      expect(
        result.current.carousel.carouselImages[0],
      ).toMatchObject({
        alt: "Description before uploading",
        enabled: false,
      });

      // An unsaved placeholder has no server record
      // to update until its image is uploaded.
      expect(
        settingsRequests(),
      ).toHaveLength(0);
    });
  });

  describe("Image uploads", () => {
    it("uploads a replacement image and updates its saved preview", async () => {
      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: IMAGES,
          });
        }

        if (request.method === "POST") {
          return Response.json(
            {
              success: true,
              url: "https://example.invalid/carousel/replacement.jpg",
              key: "carousel/replacement.jpg",
              image: {
                id: IMAGES[0].id,
              },
            },
            { status: 201 },
          );
        }

        return success();
      };

      const { result } = await loadCarousel();

      const file = imageFile(
        "replacement.png",
        "image/png",
      );

      await act(async () => {
        await result.current.carousel.handleImageFile(
          IMAGES[0].id,
          file,
        );
      });

      const uploads = methodRequests("POST");

      expect(uploads).toHaveLength(1);

      expect(uploads[0].url).toBe(
        "/api/admin/website-content/carousel",
      );

      expect(uploads[0].body).toBeInstanceOf(
        FormData,
      );

      const formData = uploads[0].body as FormData;

      expect(
        (formData.get("file") as File).name,
      ).toBe("replacement.png");

      expect(formData.get("alt")).toBe(
        IMAGES[0].alt,
      );

      expect(formData.get("id")).toBe(
        IMAGES[0].id,
      );

      expect(
        result.current.carousel.carouselImages[0]
          .src,
      ).toBe(
        "https://example.invalid/carousel/replacement.jpg",
      );

      // A successful upload must also persist the
      // image's description and visibility settings.
      await waitFor(() => {
        expect(
          settingsRequests(),
        ).toHaveLength(1);
      });
    });

    it("rejects unsupported files before making an upload request", async () => {
      const { result } = await loadCarousel();

      const invalidFile = new File(
        ["not an image"],
        "notes.txt",
        { type: "text/plain" },
      );

      await act(async () => {
        await result.current.carousel.handleImageFile(
          IMAGES[0].id,
          invalidFile,
        );
      });

      expect(
        methodRequests("POST"),
      ).toHaveLength(0);

      expect(
        result.current.carousel.imageErrors[
          IMAGES[0].id
        ],
      ).toBe("File must be an image");
    });

    it("rejects empty image files before upload", async () => {
      const { result } = await loadCarousel();

      const emptyFile = new File(
        [],
        "empty.jpg",
        { type: "image/jpeg" },
      );

      await act(async () => {
        await result.current.carousel.handleImageFile(
          IMAGES[0].id,
          emptyFile,
        );
      });

      expect(
        methodRequests("POST"),
      ).toHaveLength(0);

      expect(
        result.current.carousel.imageErrors[
          IMAGES[0].id
        ],
      ).toBe(
        "The image file is empty.",
      );
    });

    it("preserves the existing preview when the upload fails", async () => {
      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: IMAGES,
          });
        }

        if (request.method === "POST") {
          return failure(
            "Synthetic image upload failure.",
          );
        }

        return success();
      };

      const { result } = await loadCarousel();

      const originalSource =
        result.current.carousel.carouselImages[0].src;

      await act(async () => {
        await result.current.carousel.handleImageFile(
          IMAGES[0].id,
          imageFile(),
        );
      });

      expect(
        methodRequests("POST"),
      ).toHaveLength(1);

      expect(
        result.current.carousel.carouselImages[0].src,
      ).toBe(originalSource);

      expect(
        result.current.carousel.imageErrors[
          IMAGES[0].id
        ],
      ).toBe(
        "Synthetic image upload failure.",
      );
    });

    it("rejects incomplete successful upload responses", async () => {
      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: IMAGES,
          });
        }

        if (request.method === "POST") {
          // A 201 response alone does not prove the
          // image was saved correctly.
          return Response.json(
            {
              success: true,
              image: {
                id: IMAGES[0].id,
              },
            },
            { status: 201 },
          );
        }

        return success();
      };

      const { result } = await loadCarousel();

      await act(async () => {
        await result.current.carousel.handleImageFile(
          IMAGES[0].id,
          imageFile(),
        );
      });

      expect(
        result.current.carousel.carouselImages[0].src,
      ).toBe(IMAGES[0].src);

      expect(
        result.current.carousel.imageErrors[
          IMAGES[0].id
        ],
      ).toContain(
        "The server returned an unexpected response.",
      );
    });
  });

  describe("Image removal", () => {
    it("removes a saved image only after a successful server response", async () => {
      const { result } = await loadCarousel();

      await act(async () => {
        await result.current.carousel.handleRemoveImage(
          IMAGES[0].id,
        );
      });

      const deletions = methodRequests("DELETE");

      expect(deletions).toHaveLength(1);

      expect(deletions[0].body).toEqual({
        id: IMAGES[0].id,
      });

      expect(
        result.current.carousel.carouselImages,
      ).toHaveLength(1);

      expect(
        result.current.carousel.carouselImages[0].id,
      ).toBe(IMAGES[1].id);
    });

    it("preserves a saved image when deletion fails", async () => {
      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: IMAGES,
          });
        }

        if (request.method === "DELETE") {
          return failure(
            "Synthetic image deletion failure.",
          );
        }

        return success();
      };

      const { result } = await loadCarousel();

      await act(async () => {
        await result.current.carousel.handleRemoveImage(
          IMAGES[0].id,
        );
      });

      expect(
        methodRequests("DELETE"),
      ).toHaveLength(1);

      expect(
        result.current.carousel.carouselImages,
      ).toHaveLength(2);

      expect(
        result.current.carousel.imageErrors[
          IMAGES[0].id
        ],
      ).toBe(
        "Synthetic image deletion failure.",
      );
    });

    it("removes an unsaved placeholder without sending a DELETE request", async () => {
      resolveRequest = (request) => {
        if (
          isAction(
            request,
            "initialize-defaults",
          )
        ) {
          return success({
            images: [EMPTY_IMAGE],
          });
        }

        return success();
      };

      const { result } = await loadCarousel();

      await act(async () => {
        await result.current.carousel.handleRemoveImage(
          EMPTY_IMAGE.id,
        );
      });

      expect(
        result.current.carousel.carouselImages,
      ).toEqual([]);

      expect(
        methodRequests("DELETE"),
      ).toHaveLength(0);
    });
  });
});
