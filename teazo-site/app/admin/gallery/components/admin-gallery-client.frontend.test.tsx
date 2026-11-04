/**
 * Frontend integration tests for the administrator Gallery.
 *
 * Covers Gallery presentation, creation, metadata editing,
 * image replacement, POST/PATCH payloads, response validation,
 * request failures, duplicate submissions, and UI refresh.
 *
 * The actual AdminGalleryClient and GalleryUploadForm are
 * rendered together. Image preparation, Next.js images,
 * and network requests are mocked.
 *
 * No production database, R2 storage, or Gallery API
 * requests are made by these tests.
 */

// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  AdminGalleryImage,
} from "../../../types/gallery-image";

// The network mock is shared by every Gallery test.
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  prepareImageForStorage: vi.fn(),
}));

// Avoid actual image conversion and canvas operations.
vi.mock("../../../lib/image-conversion", () => ({
  defaultMaxImageSize: 10 * 1024 * 1024,

  isHeicImage: (file: File) =>
    /image\/hei[cf]/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name),

  prepareImageForStorage:
    mocks.prepareImageForStorage,
}));

// Gallery image rendering does not need an actual
// browser image download. Preserve accessible image names.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => (
    <span
      role="img"
      aria-label={alt}
      data-image-src={src}
    />
  ),
}));

import AdminGalleryClient from "./admin-gallery-client";

// Use stable synthetic Gallery records.
const ORIGINAL_IMAGE: AdminGalleryImage = {
  id: "gallery-image-1",
  name: "Milk Tea Wall",
  url: "https://images.example.invalid/milk-tea.jpg",
  tags: ["Drinks", "Store"],
  createdAt: "2026-10-01T12:00:00.000Z",
};

const SECOND_IMAGE: AdminGalleryImage = {
  id: "gallery-image-2",
  name: "Front Counter",
  url: "https://images.example.invalid/counter.jpg",
  tags: ["Store"],
  createdAt: "2026-10-02T12:00:00.000Z",
};

const NEW_IMAGE: AdminGalleryImage = {
  id: "gallery-image-3",
  name: "Fresh Fruit Tea",
  url: "https://images.example.invalid/fruit-tea.jpg",
  tags: ["Tea", "Fresh"],
  createdAt: "2026-11-04T12:00:00.000Z",
};

// Render the real Gallery with controlled initial data.
function renderGallery(
  images: AdminGalleryImage[] = [],
  canEdit = true,
) {
  return render(
    <AdminGalleryClient
      initialImages={images}
      canEdit={canEdit}
    />,
  );
}

// Create a synthetic image file without reading
// or uploading any real image content.
function makeImage(
  name = "fresh-fruit-tea.jpg",
  type = "image/jpeg",
): File {
  return new File(
    ["synthetic-gallery-test-image"],
    name,
    { type },
  );
}

// The styled image picker uses a real hidden input.
// Interact with that input directly in jsdom.
function fileInput(): HTMLInputElement {
  const input = document.querySelector(
    'input[name="galleryImageFile"]',
  );

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Gallery image input not found.");
  }

  return input;
}

// Simulate the native image selection event.
function chooseImage(file: File) {
  fireEvent.change(fileInput(), {
    target: {
      files: [file],
    },
  });
}

// The name label contains a visual required marker.
// Query the accessible textbox name instead of the
// label's full text content.
function nameInput(): HTMLInputElement {
  return screen.getByRole("textbox", {
    name: "Name",
  }) as HTMLInputElement;
}

// Identify the correct submit button for create/edit.
function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", {
    name: /^(?:Save|Save Changes)$/,
  }) as HTMLButtonElement;
}

// Open a blank image upload form.
function openCreateForm() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "New Image +",
    }),
  );

  expect(
    screen.getByRole("heading", {
      name: "Create New Image",
    }),
  ).toBeTruthy();
}

// Open the edit form from the requested List View row.
function openEditForm(imageName: string) {
  const row = screen.getByRole("row", {
    name: new RegExp(imageName),
  });

  fireEvent.click(
    within(row).getByRole("button", {
      name: "EDIT",
    }),
  );

  expect(
    screen.getByRole("heading", {
      name: "Edit Image",
    }),
  ).toBeTruthy();
}

// Add tags through the Gallery form's actual input.
function addTag(tag: string) {
  const input = screen.getByRole("textbox", {
    name: "Add Tags",
  });

  fireEvent.change(input, {
    target: {
      value: tag,
    },
  });

  fireEvent.keyDown(input, {
    key: "Enter",
    code: "Enter",
  });
}

// Submit a new image with a known title.
function prepareNewImage(
  name = "Fresh Fruit Tea",
  file = makeImage(),
) {
  openCreateForm();

  chooseImage(file);

  fireEvent.change(nameInput(), {
    target: {
      value: name,
    },
  });
}

// Read only Gallery creation and editing requests.
function gallerySaveCalls() {
  return mocks.fetch.mock.calls.filter(
    (call) =>
      call[1]?.method === "POST" ||
      call[1]?.method === "PATCH",
  );
}

// Inspect the request without calling the backend.
function savedRequest(
  index = 0,
): {
  endpoint: string;
  options: RequestInit;
  formData: FormData;
} {
  const call = gallerySaveCalls()[index];

  if (!call) {
    throw new Error(
      `Gallery save request ${index} was not sent.`,
    );
  }

  const [endpoint, options] = call as [
    string,
    RequestInit,
  ];

  if (!(options.body instanceof FormData)) {
    throw new Error(
      "Gallery request did not contain FormData.",
    );
  }

  return {
    endpoint,
    options,
    formData: options.body,
  };
}

// Successful responses must contain the full saved
// Gallery record, not just an HTTP success code.
function successResponse(
  image: AdminGalleryImage,
): Response {
  return Response.json(image, {
    status: 200,
  });
}

// The visible row is the source of truth for the
// currently displayed Gallery state in these tests.
function galleryRow(name: string) {
  return screen.getByRole("row", {
    name: new RegExp(name),
  });
}

describe("Admin Gallery client frontend interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Unexpected requests must fail rather than
    // accidentally contact a real Gallery service.
    mocks.fetch.mockReset();
    mocks.fetch.mockImplementation(
      async (endpoint: string) => {
        throw new Error(
          `Unexpected network request: ${endpoint}`,
        );
      },
    );

    vi.stubGlobal("fetch", mocks.fetch);

    // Standard images do not require conversion.
    mocks.prepareImageForStorage.mockReset();
    mocks.prepareImageForStorage.mockImplementation(
      async (file: File) => file,
    );

    // jsdom does not implement object URLs.
    // Use deterministic preview URLs instead.
    const NativeURL = URL;

    let previewId = 0;

    vi.stubGlobal(
      "URL",
      Object.assign(class extends NativeURL {}, {
        createObjectURL: vi.fn(
          () => `blob:gallery-client-${++previewId}`,
        ),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Both desktop and mobile start in List View.
  // A manual toggle is required to change to Image View.
  it("defaults to List View", () => {
    renderGallery([ORIGINAL_IMAGE]);

    const listView = screen.getByRole("button", {
      name: "List View",
    });

    const imageView = screen.getByRole("button", {
      name: "Image View",
    });

    expect(
      listView.getAttribute("aria-pressed"),
    ).toBe("true");

    expect(
      imageView.getAttribute("aria-pressed"),
    ).toBe("false");

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();
  });

  // Switching views should not discard image data.
  it("switches between List View and Image View", () => {
    renderGallery([ORIGINAL_IMAGE]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Image View",
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "Image View",
      }).getAttribute("aria-pressed"),
    ).toBe("true");

    expect(
      screen.getByRole("heading", {
        name: "Milk Tea Wall",
      }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "List View",
      }),
    );

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();
  });

  // Read-only users may inspect images but must not
  // be offered the administrator upload/edit controls.
  it("hides editing actions when editing is disabled", () => {
    renderGallery(
      [ORIGINAL_IMAGE],
      false,
    );

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();

    expect(
      screen.queryByRole("button", {
        name: "New Image +",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: "EDIT",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: /Delete selected/,
      }),
    ).toBeNull();
  });

  // A blank Gallery should display its empty state
  // and still provide the creation action.
  it("shows an empty Gallery and allows opening upload", () => {
    renderGallery();

    expect(
      screen.getByText("No gallery images yet"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add an image",
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Create New Image",
      }),
    ).toBeTruthy();
  });

  // Canceling must close the drawer and never send
  // an upload or replacement request.
  it("cancels a new image without saving", () => {
    renderGallery();

    prepareNewImage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(
      screen.queryByRole("heading", {
        name: "Create New Image",
      }),
    ).toBeNull();

    expect(gallerySaveCalls()).toHaveLength(0);
  });

  // A new image must use POST and send the expected
  // name, normalized tags, and selected file.
  it("sends the correct POST upload payload", async () => {
    mocks.fetch.mockResolvedValueOnce(
      successResponse(NEW_IMAGE),
    );

    renderGallery();

    const file = makeImage();

    prepareNewImage(
      "  Fresh Fruit Tea  ",
      file,
    );

    addTag("  Tea  ");
    addTag("Fresh");

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(gallerySaveCalls()).toHaveLength(1);
    });

    const request = savedRequest();

    expect(request.endpoint).toBe(
      "/api/admin/gallery",
    );

    expect(request.options.method).toBe("POST");
    expect(request.options.credentials).toBe(
      "same-origin",
    );
    expect(request.options.redirect).toBe("error");

    expect(request.formData.get("name")).toBe(
      "Fresh Fruit Tea",
    );

    expect(
      JSON.parse(
        String(request.formData.get("tags")),
      ),
    ).toEqual(["Tea", "Fresh"]);

    const sentFile = request.formData.get("file");

    expect(sentFile).toBeInstanceOf(File);

    expect(
      (sentFile as File).name,
    ).toBe(file.name);

    expect(
      (sentFile as File).type,
    ).toBe("image/jpeg");
  });

  // A confirmed POST should immediately insert the
  // returned image into the visible Gallery collection.
  it("refreshes the Gallery after a successful upload", async () => {
    mocks.fetch.mockResolvedValueOnce(
      successResponse(NEW_IMAGE),
    );

    renderGallery([ORIGINAL_IMAGE]);

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(galleryRow("Fresh Fruit Tea")).toBeTruthy();
    });

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();

    expect(
      screen.getByText("2 images"),
    ).toBeTruthy();

    expect(
      screen.queryByRole("heading", {
        name: "Create New Image",
      }),
    ).toBeNull();

    // Only the initial server-provided records and
    // confirmed POST response are needed for refresh.
    expect(gallerySaveCalls()).toHaveLength(1);
  });

  // Failure responses should surface a useful message,
  // preserve existing images, and keep editing available.
  it("shows server errors without adding an image", async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json(
        {
          error: "Gallery storage is unavailable.",
        },
        {
          status: 503,
        },
      ),
    );

    renderGallery([ORIGINAL_IMAGE]);

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "Gallery storage is unavailable.",
      );
    });

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();

    expect(
      screen.queryByRole("row", {
        name: /Fresh Fruit Tea/,
      }),
    ).toBeNull();

    expect(saveButton().disabled).toBe(false);
  });

  // The parent catches connection failures and
  // provides a retry-safe message to the administrator.
  it("handles upload network failures", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockRejectedValueOnce(
      new Error("Connection lost"),
    );

    renderGallery();

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "The save could not be confirmed.",
      );
    });

    expect(
      screen.getByText("No gallery images yet"),
    ).toBeTruthy();

    expect(saveButton().disabled).toBe(false);
  });

  // Even HTTP 200 is insufficient if the response
  // does not contain a valid saved Gallery record.
  it("rejects malformed successful upload responses", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockResolvedValueOnce(
      Response.json(
        {
          id: "incomplete-gallery-record",
          name: "Fresh Fruit Tea",
        },
        {
          status: 200,
        },
      ),
    );

    renderGallery();

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "The server's saved image could not be confirmed.",
      );
    });

    expect(
      screen.getByText("No gallery images yet"),
    ).toBeTruthy();
  });

  // Responses that cannot be parsed as JSON must not
  // be treated as successfully saved images.
  it("rejects unreadable successful upload responses", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockResolvedValueOnce(
      new Response(
        "not-json",
        {
          status: 200,
          headers: {
            "content-type": "text/plain",
          },
        },
      ),
    );

    renderGallery();

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "The server's saved image could not be confirmed.",
      );
    });

    expect(gallerySaveCalls()).toHaveLength(1);
  });

  // While POST is pending, the form and Gallery
  // should block another competing save operation.
  it("prevents duplicate uploads during a pending request", async () => {
    let completeRequest!: (response: Response) => void;

    const pending = new Promise<Response>(
      (resolve) => {
        completeRequest = resolve;
      },
    );

    mocks.fetch.mockReturnValueOnce(pending);

    renderGallery();

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(gallerySaveCalls()).toHaveLength(1);

      expect(
        screen.getByRole("button", {
          name: "Saving...",
        }),
      ).toBeTruthy();
    });

    const form = document.querySelector(
      'form',
    );

    if (!form) {
      throw new Error("Gallery form is missing.");
    }

    // Even direct submission must not initiate
    // a duplicate request while a save is pending.
    fireEvent.submit(form);

    expect(gallerySaveCalls()).toHaveLength(1);

    expect(
      (
        screen.getByRole("button", {
          name: "New Image +",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await act(async () => {
      completeRequest(
        successResponse(NEW_IMAGE),
      );
    });

    await waitFor(() => {
      expect(galleryRow("Fresh Fruit Tea")).toBeTruthy();
    });

    expect(gallerySaveCalls()).toHaveLength(1);
  });

  // Metadata-only editing must use PATCH and omit the
  // file field to preserve the existing uploaded image.
  it("sends metadata-only edits using PATCH", async () => {
    const updated: AdminGalleryImage = {
      ...ORIGINAL_IMAGE,
      name: "Updated Milk Tea Wall",
      tags: ["Drinks", "Updated"],
    };

    mocks.fetch.mockResolvedValueOnce(
      successResponse(updated),
    );

    renderGallery([ORIGINAL_IMAGE]);

    openEditForm("Milk Tea Wall");

    fireEvent.change(nameInput(), {
      target: {
        value: "  Updated Milk Tea Wall  ",
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Store tag",
      }),
    );

    addTag("Updated");

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(gallerySaveCalls()).toHaveLength(1);
      expect(galleryRow("Updated Milk Tea Wall")).toBeTruthy();
    });

    const request = savedRequest();

    expect(request.endpoint).toBe(
      "/api/admin/gallery/gallery-image-1",
    );

    expect(request.options.method).toBe("PATCH");

    expect(request.formData.get("name")).toBe(
      "Updated Milk Tea Wall",
    );

    expect(
      JSON.parse(
        String(request.formData.get("tags")),
      ),
    ).toEqual(["Drinks", "Updated"]);

    // The original image remains unchanged in
    // storage when no replacement file was selected.
    expect(request.formData.has("file")).toBe(false);

    expect(
      screen.getByText("1 image"),
    ).toBeTruthy();

    expect(
      screen.queryByRole("heading", {
        name: "Edit Image",
      }),
    ).toBeNull();
  });

  // A replacement uses the existing image ID and
  // transmits the new image file with PATCH.
  it("replaces an existing image with a new file", async () => {
    const updated: AdminGalleryImage = {
      ...ORIGINAL_IMAGE,
      url: "https://images.example.invalid/replacement.png",
    };

    mocks.fetch.mockResolvedValueOnce(
      successResponse(updated),
    );

    renderGallery([ORIGINAL_IMAGE]);

    openEditForm("Milk Tea Wall");

    const replacement = makeImage(
      "replacement.png",
      "image/png",
    );

    chooseImage(replacement);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(gallerySaveCalls()).toHaveLength(1);

      expect(
        screen.queryByRole("heading", {
          name: "Edit Image",
        }),
      ).toBeNull();
    });

    const request = savedRequest();

    expect(request.endpoint).toBe(
      "/api/admin/gallery/gallery-image-1",
    );

    expect(request.options.method).toBe("PATCH");

    expect(request.formData.has("file")).toBe(true);

    const sentFile = request.formData.get("file");

    expect(sentFile).toBeInstanceOf(File);

    expect((sentFile as File).name).toBe(
      "replacement.png",
    );

    // Reopening the record should display the new
    // server-confirmed image URL.
    openEditForm("Milk Tea Wall");

    expect(
      screen.getByRole("img", {
        name: "Milk Tea Wall preview",
      }).getAttribute("data-image-src"),
    ).toBe(updated.url);
  });

  // The server must confirm the same image ID
  // during an edit; a different ID is not a valid edit.
  it("rejects replacement responses with a mismatched ID", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    const unexpected: AdminGalleryImage = {
      ...ORIGINAL_IMAGE,
      id: "some-other-image",
      name: "Incorrect Result",
    };

    mocks.fetch.mockResolvedValueOnce(
      successResponse(unexpected),
    );

    renderGallery([ORIGINAL_IMAGE]);

    openEditForm("Milk Tea Wall");

    fireEvent.change(nameInput(), {
      target: {
        value: "Attempted Update",
      },
    });

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "The server's saved image could not be confirmed.",
      );
    });

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();

    expect(
      screen.queryByRole("row", {
        name: /Incorrect Result/,
      }),
    ).toBeNull();

    expect(saveButton().disabled).toBe(false);
  });

  // Failed PATCH responses must keep the existing
  // record visible and the edit form open.
  it("preserves Gallery state after a failed PATCH", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockResolvedValueOnce(
      Response.json(
        {
          error: "Image replacement failed.",
        },
        {
          status: 500,
        },
      ),
    );

    renderGallery([ORIGINAL_IMAGE]);

    openEditForm("Milk Tea Wall");

    chooseImage(
      makeImage("replacement.jpg"),
    );

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain("Image replacement failed.");
    });

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();

    expect(
      screen.getByRole("heading", {
        name: "Edit Image",
      }),
    ).toBeTruthy();

    expect(saveButton().disabled).toBe(false);
  });

  // When editing changes the displayed name, the
  // Gallery should reflect the server-confirmed value
  // without requiring browser navigation or reload.
  it("refreshes the visible Gallery after a rename", async () => {
    const updated: AdminGalleryImage = {
      ...ORIGINAL_IMAGE,
      name: "Renamed Gallery Photo",
    };

    mocks.fetch.mockResolvedValueOnce(
      successResponse(updated),
    );

    renderGallery([
      ORIGINAL_IMAGE,
      SECOND_IMAGE,
    ]);

    openEditForm("Milk Tea Wall");

    fireEvent.change(nameInput(), {
      target: {
        value: "Renamed Gallery Photo",
      },
    });

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        galleryRow("Renamed Gallery Photo"),
      ).toBeTruthy();
    });

    expect(
      screen.queryByRole("row", {
        name: /Milk Tea Wall/,
      }),
    ).toBeNull();

    expect(galleryRow("Front Counter")).toBeTruthy();

    expect(
      screen.getByText("2 images"),
    ).toBeTruthy();
  });

  // Gallery search should respond to edits using the
  // updated local image collection.
  it("updates Gallery search results after editing", async () => {
    const updated: AdminGalleryImage = {
      ...ORIGINAL_IMAGE,
      name: "Matcha Display",
    };

    mocks.fetch.mockResolvedValueOnce(
      successResponse(updated),
    );

    renderGallery([ORIGINAL_IMAGE]);

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search photos",
      }),
      {
        target: {
          value: "Milk",
        },
      },
    );

    expect(galleryRow("Milk Tea Wall")).toBeTruthy();

    openEditForm("Milk Tea Wall");

    fireEvent.change(nameInput(), {
      target: {
        value: "Matcha Display",
      },
    });

    fireEvent.click(saveButton());

    // The renamed image no longer matches the
    // existing "Milk" search.
    await waitFor(() => {
      expect(
        screen.getByText("No images found"),
      ).toBeTruthy();
    });

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search photos",
      }),
      {
        target: {
          value: "Matcha",
        },
      },
    );

    expect(galleryRow("Matcha Display")).toBeTruthy();
  });

  // New image creation should start a clean form
  // after a previous upload has been saved.
  it("resets the form for a subsequent upload", async () => {
    mocks.fetch.mockResolvedValueOnce(
      successResponse(NEW_IMAGE),
    );

    renderGallery();

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(galleryRow("Fresh Fruit Tea")).toBeTruthy();
    });

    openCreateForm();

    expect(nameInput().value).toBe("");

    expect(
      screen.queryByRole("img", {
        name: /preview$/,
      }),
    ).toBeNull();

    expect(saveButton().disabled).toBe(true);

    expect(gallerySaveCalls()).toHaveLength(1);
  });

  // An administrator may select another view during
  // normal browsing. Saving should not reset that choice.
  it("preserves the selected Gallery view after saving", async () => {
    mocks.fetch.mockResolvedValueOnce(
      successResponse(NEW_IMAGE),
    );

    renderGallery([ORIGINAL_IMAGE]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Image View",
      }),
    );

    prepareNewImage();

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Fresh Fruit Tea",
        }),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("button", {
        name: "Image View",
      }).getAttribute("aria-pressed"),
    ).toBe("true");

    expect(
      screen.getByRole("heading", {
        name: "Milk Tea Wall",
      }),
    ).toBeTruthy();
  });
});
