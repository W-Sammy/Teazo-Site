/**
 * Tests administrator Gallery bulk-selection behavior.
 *
 * Covers individual and bulk selection, filtering,
 * sorting, view switching, deletion confirmation,
 * partial failures, retries, and read-only access.
 *
 * Images and network requests are mocked. No production
 * database or storage operations are performed.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type {
  AdminGalleryImage,
} from "@/app/types/gallery-image";

vi.mock("./gallery-image", () => ({
  default: ({ alt }: { alt: string }) => (
    <span aria-label={alt} />
  ),
}));

vi.mock("./gallery-upload-form", () => ({
  default: () => null,
}));

import AdminGalleryClient from "./admin-gallery-client";

const images: AdminGalleryImage[] = [
  {
    id: "apple",
    name: "Apple Milk Tea",
    url: "/gallery/apple.jpg",
    tags: ["Drinks", "Featured"],
    createdAt: "2026-10-01T12:00:00.000Z",
  },
  {
    id: "boba",
    name: "Boba Cup",
    url: "/gallery/boba.jpg",
    tags: ["Drinks"],
    createdAt: "2026-10-02T12:00:00.000Z",
  },
  {
    id: "cookie",
    name: "Cookie Tray",
    url: "/gallery/cookie.jpg",
    tags: ["Snacks"],
    createdAt: "2026-10-03T12:00:00.000Z",
  },
  {
    id: "donut",
    name: "Donut",
    url: "/gallery/donut.jpg",
    tags: [],
    createdAt: "2026-10-04T12:00:00.000Z",
  },
];

const fetchMock = vi.fn();

function renderGallery(
  canEdit = true,
  initialImages = images,
) {
  return render(
    <AdminGalleryClient
      initialImages={initialImages}
      canEdit={canEdit}
    />,
  );
}

function selectedCount() {
  return screen.getByRole("status").textContent;
}

function selectImage(name: string) {
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: `Select ${name}`,
    }),
  );
}

function selectAllDisplayed() {
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Select all displayed",
    }),
  );
}

function openBulkDelete() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /Delete selected \(\d+\)/,
    }),
  );

  return screen.getByRole("dialog", {
    name: "Delete selected images?",
  });
}

function selectTag(name: string) {
  const panel = document.getElementById(
    "gallery-filter-panel",
  );

  if (!panel) {
    throw new Error("Gallery filter panel missing");
  }

  const label = within(panel)
    .getByText(name)
    .closest("label");

  const checkbox = label?.querySelector("input");

  if (!checkbox) {
    throw new Error(`Tag checkbox missing: ${name}`);
  }

  fireEvent.click(checkbox);
}

describe("Gallery administration bulk selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fetchMock.mockResolvedValue({
      status: 204,
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("defaults to List View with no images selected", () => {
    renderGallery();

    expect(
      screen.getByRole("button", {
        name: "List View",
      }).getAttribute("aria-pressed"),
    ).toBe("true");

    expect(selectedCount()).toBe("0 selected");

    expect(
      screen.getByRole("button", {
        name: "Delete selected (0)",
      }).hasAttribute("disabled"),
    ).toBe(true);

    expect(
      screen.getByText("4 images"),
    ).toBeTruthy();
  });

  it("hides selection and deletion controls for read-only users", () => {
    renderGallery(false);

    expect(
      screen.queryByRole("checkbox", {
        name: "Select Apple Milk Tea",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: /Delete selected/,
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: "New Image +",
      }),
    ).toBeNull();
  });

  it("selects an individual image", () => {
    renderGallery();

    selectImage("Apple Milk Tea");

    expect(selectedCount()).toBe("1 selected");

    expect(
      screen.getByRole("checkbox", {
        name: "Select Apple Milk Tea",
      }).getAttribute("type"),
    ).toBe("checkbox");

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Apple Milk Tea",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    expect(
      screen.getByRole("button", {
        name: "Delete selected (1)",
      }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("deselects an image when its checkbox is clicked again", () => {
    renderGallery();

    selectImage("Apple Milk Tea");
    selectImage("Apple Milk Tea");

    expect(selectedCount()).toBe("0 selected");

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Apple Milk Tea",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("selects and deselects all displayed images", () => {
    renderGallery();

    selectAllDisplayed();

    expect(selectedCount()).toBe("4 selected");

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select all displayed",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    selectAllDisplayed();

    expect(selectedCount()).toBe("0 selected");
  });

  it("clears selections using the Clear selection button", () => {
    renderGallery();

    selectImage("Apple Milk Tea");
    selectImage("Boba Cup");

    expect(selectedCount()).toBe("2 selected");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Clear selection",
      }),
    );

    expect(selectedCount()).toBe("0 selected");
  });

  it("preserves selections when switching between List and Image views", () => {
    renderGallery();

    selectImage("Boba Cup");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Image View",
      }),
    );

    expect(selectedCount()).toBe("1 selected");

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Boba Cup",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", {
        name: "List View",
      }),
    );

    expect(selectedCount()).toBe("1 selected");

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Boba Cup",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("preserves selections when changing sort order", () => {
    renderGallery();

    selectImage("Apple Milk Tea");

    fireEvent.change(
      screen.getByLabelText("Sort by:"),
      {
        target: {
          value: "name-desc",
        },
      },
    );

    expect(selectedCount()).toBe("1 selected");

    expect(
      (
        screen.getByRole("checkbox", {
          name: "Select Apple Milk Tea",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("clears selections when the search query changes", () => {
    renderGallery();

    selectImage("Apple Milk Tea");

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search photos",
      }),
      {
        target: {
          value: "Cookie",
        },
      },
    );

    expect(selectedCount()).toBe("0 selected");

    expect(
      screen.getByText("1 image"),
    ).toBeTruthy();

    expect(
      screen.getByRole("checkbox", {
        name: "Select Cookie Tray",
      }),
    ).toBeTruthy();
  });

  it("clears selections when tag filters change", () => {
    renderGallery();

    selectImage("Apple Milk Tea");

    selectTag("Snacks");

    expect(selectedCount()).toBe("0 selected");

    expect(
      screen.getByText("1 image"),
    ).toBeTruthy();

    expect(
      screen.getByRole("checkbox", {
        name: "Select Cookie Tray",
      }),
    ).toBeTruthy();
  });

  it("selects only images matching the current search", () => {
    renderGallery();

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search photos",
      }),
      {
        target: {
          value: "Boba",
        },
      },
    );

    selectAllDisplayed();

    expect(selectedCount()).toBe("1 selected");

    const dialog = openBulkDelete();

    // Look inside the image list rather than the entire
    // dialog, since the image name also appears in the
    // confirmation sentence for a single-image deletion.
    const selectedImagesList = within(dialog).getByRole(
      "list",
    );

    expect(
      within(selectedImagesList).getByText("Boba Cup"),
    ).toBeTruthy();

    expect(
      within(selectedImagesList).queryByText(
        "Apple Milk Tea",
      ),
    ).toBeNull();
  });

  it("retains selections when bulk deletion is canceled", () => {
    renderGallery();

    selectImage("Apple Milk Tea");
    selectImage("Boba Cup");

    const dialog = openBulkDelete();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(
      screen.queryByRole("dialog", {
        name: "Delete selected images?",
      }),
    ).toBeNull();

    expect(selectedCount()).toBe("2 selected");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes images after successful server-confirmed deletion", async () => {
    renderGallery();

    selectImage("Apple Milk Tea");
    selectImage("Boba Cup");

    const dialog = openBulkDelete();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete 2",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Delete selected images?",
        }),
      ).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/gallery/apple",
      expect.objectContaining({
        method: "DELETE",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/gallery/boba",
      expect.objectContaining({
        method: "DELETE",
      }),
    );

    expect(selectedCount()).toBe("0 selected");

    expect(
      screen.getByText("2 images"),
    ).toBeTruthy();
  });

  it("retains failed images and retries only those images", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    fetchMock.mockImplementation(
      async (url: string) => {
        if (url.endsWith("/boba")) {
          return {
            status: 500,
            json: async () => ({
              error: "Deletion failed",
            }),
          };
        }

        return {
          status: 204,
        };
      },
    );

    renderGallery();

    selectImage("Apple Milk Tea");
    selectImage("Boba Cup");

    const dialog = openBulkDelete();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete 2",
      }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByRole("alert")
          .textContent,
      ).toContain("Boba Cup");
    });

    expect(selectedCount()).toBe("1 selected");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The successful deletion is no longer included.
    expect(
      within(dialog).queryByText(
        "Apple Milk Tea",
      ),
    ).toBeNull();

    fetchMock.mockResolvedValue({
      status: 204,
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete 1",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: "Delete selected images?",
        }),
      ).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(
      fetchMock.mock.calls[2][0],
    ).toBe("/api/admin/gallery/boba");

    expect(selectedCount()).toBe("0 selected");
  });

  it("keeps failed deletions selected when the network is unavailable", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    fetchMock.mockRejectedValue(
      new Error("Network unavailable"),
    );

    renderGallery();

    selectImage("Apple Milk Tea");

    const dialog = openBulkDelete();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete 1",
      }),
    );

    await waitFor(() => {
      expect(
        within(dialog).getByRole("alert")
          .textContent,
      ).toContain("Apple Milk Tea");
    });

    expect(selectedCount()).toBe("1 selected");

    expect(
      screen.getByText("4 images"),
    ).toBeTruthy();
  });

  it("disables bulk selection when the gallery is empty", () => {
    renderGallery(true, []);

    expect(
      screen.getByText(
        "No gallery images yet",
      ),
    ).toBeTruthy();

    expect(
      screen.getByRole("checkbox", {
        name: "Select all displayed",
      }).hasAttribute("disabled"),
    ).toBe(true);

    expect(
      screen.getByRole("button", {
        name: "Delete selected (0)",
      }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
