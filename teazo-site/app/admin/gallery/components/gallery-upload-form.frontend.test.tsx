/**
 * Frontend interaction tests for the administrator
 * Gallery upload and image-editing form.
 *
 * Covers image validation, previews, automatic naming,
 * tag limits, HEIC/HEIF preparation, replacement files,
 * metadata-only editing, submission feedback, and cleanup.
 *
 * Image preparation, Next.js image rendering, and browser
 * object URLs are mocked. No real files are uploaded,
 * and no Gallery API, database, or R2 requests are made.
 */

// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
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

import type { AdminGalleryImage } from "../../../types/gallery-image";
import GalleryUploadForm, {
  type GalleryUploadValues,
} from "./gallery-upload-form";

// Mock only image preparation. The real form still
// performs all its own frontend validation and state updates.
const imageMocks = vi.hoisted(() => ({
  prepareImageForStorage: vi.fn(),
}));

vi.mock("../../../lib/image-conversion", () => ({
  defaultMaxImageSize: 10 * 1024 * 1024,

  isHeicImage: (file: File) =>
    /image\/hei[cf]/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name),

  prepareImageForStorage:
    imageMocks.prepareImageForStorage,
}));

// Render an accessible stand-in for Next/Image.
// The data attribute allows tests to inspect preview URLs
// without loading remote images or starting a real download.
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

const existingImage: AdminGalleryImage = {
  id: "gallery-existing-1",
  name: "Original Gallery Image",
  url: "https://images.example.invalid/original.jpg",
  tags: ["Drinks", "Store"],
  createdAt: "2026-10-01T12:00:00.000Z",
};

// Render the form with replaceable save and cancel callbacks.
function renderForm({
  initialImage = null,
  onSave = vi.fn(
    async () => {},
  ),
  onCancel = vi.fn(),
}: {
  initialImage?: AdminGalleryImage | null;
  onSave?: (
    values: GalleryUploadValues,
  ) => void | Promise<void>;
  onCancel?: () => void;
} = {}) {
  return render(
    <GalleryUploadForm
      initialImage={initialImage}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
}

// Construct small synthetic image files. Their contents
// are deliberately not valid image bytes because the
// browser preview and conversion are mocked.
function makeFile(
  name = "gallery-image.jpg",
  type = "image/jpeg",
  contents = "synthetic-gallery-image",
) {
  return new File([contents], name, { type });
}

// The file input is visually hidden behind the styled
// picker button but remains the actual HTML file control.
function fileInput(): HTMLInputElement {
  const input = document.querySelector(
    'input[name="galleryImageFile"]',
  );

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Gallery file input was not rendered.");
  }

  return input;
}

// Simulate a visitor selecting an image using the native
// file input instead of opening the operating-system picker.
function chooseFile(file: File) {
  fireEvent.change(fileInput(), {
    target: {
      files: [file],
    },
  });
}

// Add a tag through the actual keyboard interaction.
function addTag(value: string) {
  const input = screen.getByLabelText("Add Tags");

  fireEvent.change(input, {
    target: {
      value,
    },
  });

  fireEvent.keyDown(input, {
    key: "Enter",
    code: "Enter",
  });
}

// Match the save action in create mode, edit mode,
// and while an asynchronous save is in progress.
function saveButton() {
  return screen.getByRole("button", {
    name: /^(?:Save(?: Changes)?|Saving\.\.\.)$/,
  }) as HTMLButtonElement;
}

// Read the mock Next/Image source for a rendered preview.
function previewSource(): string | null {
  const image = screen.getByRole("img", {
    name: /preview$/,
  });

  return image.getAttribute("data-image-src");
}

describe("Admin Gallery upload form frontend interactions", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Normal preparation returns the supplied image.
    // Individual tests override this for HEIC conversion,
    // oversized files, failures, or pending operations.
    imageMocks.prepareImageForStorage.mockReset();
    imageMocks.prepareImageForStorage.mockImplementation(
      async (file: File) => file,
    );

    // jsdom does not provide the browser object URL
    // methods required by the Gallery preview component.
    let nextPreviewId = 0;

    createObjectURL = vi.fn(
      () => `blob:gallery-test-${++nextPreviewId}`,
    );

    revokeObjectURL = vi.fn();

    const NativeURL = URL;

    vi.stubGlobal(
      "URL",
      Object.assign(class extends NativeURL {}, {
        createObjectURL,
        revokeObjectURL,
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A new upload starts with empty fields and must not
  // allow saving without a name and image.
  it("starts a new image form with saving disabled", () => {
    renderForm();

    expect(
      screen.getByRole("heading", {
        name: "Create New Image",
      }),
    ).toBeTruthy();

    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
        .value,
    ).toBe("");

    expect(saveButton().disabled).toBe(true);
  });

  // Editing an existing record should retain its title,
  // tags, and saved image preview until the user changes them.
  it("prepopulates the existing image when editing", () => {
    renderForm({
      initialImage: existingImage,
    });

    expect(
      screen.getByRole("heading", {
        name: "Edit Image",
      }),
    ).toBeTruthy();

    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
        .value,
    ).toBe("Original Gallery Image");

    expect(screen.getByText("Drinks")).toBeTruthy();
    expect(screen.getByText("Store")).toBeTruthy();

    expect(previewSource()).toBe(existingImage.url);

    expect(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    ).toBeTruthy();
  });

  // A direct form submission must still validate the
  // name even if the visible save button is disabled.
  it("rejects a missing image name", () => {
    const { container } = renderForm();

    const form = container.querySelector("form");

    expect(form).not.toBeNull();

    fireEvent.submit(form!);

    expect(
      screen.getByText("Enter a name for the image."),
    ).toBeTruthy();
  });

  // A new Gallery record needs an image file.
  // Supplying only the name is insufficient.
  it("rejects a new image without a selected file", () => {
    const { container } = renderForm();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: {
        value: "New Gallery Entry",
      },
    });

    fireEvent.submit(container.querySelector("form")!);

    expect(
      screen.getByText("Select an image before saving."),
    ).toBeTruthy();
  });

  // Unsupported file types must not be accepted as images.
  it("rejects unsupported file formats", () => {
    renderForm();

    chooseFile(makeFile("document.pdf", "application/pdf"));

    expect(
      screen.getByText(
        "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
      ),
    ).toBeTruthy();

    expect(saveButton().disabled).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  // Files with no content must fail before preview creation.
  it("rejects empty image files", () => {
    renderForm();

    chooseFile(makeFile("empty.png", "image/png", ""));

    expect(
      screen.getByText(
        "The selected image must be nonempty.",
      ),
    ).toBeTruthy();

    expect(saveButton().disabled).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  // Standard supported formats should be previewed
  // directly without unnecessary conversion.
  it.each([
    ["JPEG", "photo.jpg", "image/jpeg"],
    ["PNG", "photo.png", "image/png"],
    ["WebP", "photo.webp", "image/webp"],
  ])(
    "accepts a standard %s image",
    (_label, fileName, mimeType) => {
      renderForm();

      chooseFile(makeFile(fileName, mimeType));

      expect(previewSource()).toMatch(/^blob:gallery-test-/);

      expect(
        imageMocks.prepareImageForStorage,
      ).not.toHaveBeenCalled();

      expect(saveButton().disabled).toBe(false);
    },
  );

  // The form suggests a readable name from the filename
  // when the user has not typed a custom image name.
  it("suggests an image name from its filename", () => {
    renderForm();

    chooseFile(
      makeFile("honey_milk-tea.jpg"),
    );

    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
        .value,
    ).toBe("Honey Milk Tea");
  });

  // Selecting a file must not overwrite a title the
  // administrator deliberately entered beforehand.
  it("preserves a manually entered name", () => {
    renderForm();

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: {
        value: "My Custom Title",
      },
    });

    chooseFile(makeFile("different-file.jpg"));

    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
        .value,
    ).toBe("My Custom Title");
  });

  // Tags are normalized and unfinished tag text is
  // included when the form is submitted.
  it("normalizes tags and includes a pending tag on save", async () => {
    const onSave = vi.fn(
      async () => {},
    );

    renderForm({ onSave });

    chooseFile(makeFile());

    addTag("  Brown    Sugar  ");

    fireEvent.change(
      screen.getByLabelText("Add Tags"),
      {
        target: {
          value: "  Fresh   Fruit ",
        },
      },
    );

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gallery Image",
          tags: ["Brown Sugar", "Fresh Fruit"],
        }),
      );
    });
  });

  // Duplicate tags should be checked without regard
  // to letter case or surrounding whitespace.
  it("rejects duplicate tags case-insensitively", () => {
    renderForm();

    addTag("Milk Tea");
    addTag("  milk tea ");

    expect(
      screen.getByText(
        "That tag has already been added.",
      ),
    ).toBeTruthy();

    expect(
      screen.getAllByRole("button", {
        name: "Remove Milk Tea tag",
      }),
    ).toHaveLength(1);
  });

  // An individual tag may contain at most 30 characters.
  it("rejects tags longer than the configured limit", () => {
    renderForm();

    addTag("A".repeat(31));

    expect(
      screen.getByText(
        "Tags must be 30 characters or fewer.",
      ),
    ).toBeTruthy();
  });

  // The form permits no more than twelve tags.
  it("enforces the maximum tag count", () => {
    renderForm();

    for (let index = 1; index <= 12; index += 1) {
      addTag(`Tag ${index}`);
    }

    addTag("Extra Tag");

    expect(
      screen.getByText(
        "You can add up to 12 tags.",
      ),
    ).toBeTruthy();
  });

  // Removing a tag should remove only that tag.
  it("allows removal of an individual tag", () => {
    renderForm();

    addTag("Coffee");
    addTag("Tea");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Coffee tag",
      }),
    );

    expect(screen.queryByText("Coffee")).toBeNull();
    expect(screen.getByText("Tea")).toBeTruthy();
  });

  // Drag-and-drop should use the same image validation
  // and preview behavior as the regular file picker.
  it("accepts an image using drag and drop", () => {
    renderForm();

    const picker = screen.getByRole("button", {
      name: "Select/Drag Image Here",
    });

    const dropZone = picker.parentElement;

    expect(dropZone).not.toBeNull();

    fireEvent.drop(dropZone!, {
      dataTransfer: {
        files: [
          makeFile("store_photo.png", "image/png"),
        ],
      },
    });

    expect(previewSource()).toMatch(/^blob:gallery-test-/);

    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
        .value,
    ).toBe("Store Photo");
  });

  // HEIC/HEIF images need preparation before they can
  // be previewed and submitted to Gallery storage.
  it("converts a HEIC file before allowing save", async () => {
    const convertedFile = makeFile(
      "store-photo.jpg",
      "image/jpeg",
    );

    imageMocks.prepareImageForStorage.mockResolvedValueOnce(
      convertedFile,
    );

    const onSave = vi.fn(
      async () => {},
    );

    renderForm({ onSave });

    const original = makeFile(
      "store-photo.heic",
      "image/heic",
    );

    chooseFile(original);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Save",
        }) as HTMLButtonElement,
      ).not.toHaveProperty("disabled", true);
    });

    expect(
      imageMocks.prepareImageForStorage,
    ).toHaveBeenCalledWith(
      original,
      10 * 1024 * 1024,
    );

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          file: convertedFile,
        }),
      );
    });
  });

  // An unfinished conversion must keep submission
  // disabled and display the preparation status.
  it("disables saving while image preparation is pending", async () => {
    let finishPreparation!: (file: File) => void;

    imageMocks.prepareImageForStorage.mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          finishPreparation = resolve;
        }),
    );

    renderForm();

    chooseFile(
      makeFile("pending-image.heif", "image/heif"),
    );

    expect(
      screen.getByRole("status").textContent,
    ).toContain(
      "Preparing image for preview and upload...",
    );

    expect(saveButton().disabled).toBe(true);

    await act(async () => {
      finishPreparation(
        makeFile("pending-image.jpg", "image/jpeg"),
      );
    });

    await waitFor(() => {
      expect(saveButton().disabled).toBe(false);
    });
  });

  // Failed preparation must show an error and avoid
  // replacing the previously selected image.
  it("shows an error when image preparation fails", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    imageMocks.prepareImageForStorage.mockRejectedValueOnce(
      new Error("Conversion failed"),
    );

    renderForm();

    chooseFile(
      makeFile("invalid-photo.heic", "image/heic"),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "This image could not be prepared. Try another image or convert it to JPG first.",
        ),
      ).toBeTruthy();
    });

    expect(saveButton().disabled).toBe(true);
  });

  // Oversized supported images should be sent to the
  // image-preparation helper for resizing.
  it("prepares an image larger than the size limit", async () => {
    renderForm();

    const oversized = makeFile(
      "oversized.jpg",
      "image/jpeg",
    );

    // Simulate a large File without allocating 10 MB
    // of unnecessary test bytes.
    Object.defineProperty(oversized, "size", {
      configurable: true,
      value: 10 * 1024 * 1024 + 1,
    });

    chooseFile(oversized);

    await waitFor(() => {
      expect(
        imageMocks.prepareImageForStorage,
      ).toHaveBeenCalledWith(
        oversized,
        10 * 1024 * 1024,
      );
    });

    await waitFor(() => {
      expect(saveButton().disabled).toBe(false);
    });
  });

  // Existing Gallery images can have their names and
  // tags updated without selecting a replacement file.
  it("saves metadata-only edits without a new file", async () => {
    const onSave = vi.fn(
      async () => {},
    );

    renderForm({
      initialImage: existingImage,
      onSave,
    });

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: {
        value: "  Updated Gallery Title  ",
      },
    });

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: "Updated Gallery Title",
        tags: ["Drinks", "Store"],
        file: null,
      });
    });
  });

  // Selecting a replacement image should keep the
  // existing title and tags unless explicitly edited.
  it("submits a replacement file for an existing image", async () => {
    const onSave = vi.fn(
      async () => {},
    );

    renderForm({
      initialImage: existingImage,
      onSave,
    });

    const replacement = makeFile(
      "replacement.png",
      "image/png",
    );

    chooseFile(replacement);

    expect(previewSource()).toMatch(/^blob:gallery-test-/);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: "Original Gallery Image",
        tags: ["Drinks", "Store"],
        file: replacement,
      });
    });
  });

  // A pending save must disable Save, Cancel, and
  // image changes to prevent conflicting operations.
  it("prevents duplicate submissions while saving", async () => {
    let completeSave!: () => void;

    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeSave = resolve;
        }),
    );

    const { container } = renderForm({
      onSave,
    });

    chooseFile(makeFile());

    fireEvent.click(saveButton());

    expect(
      screen.getByRole("button", {
        name: "Saving...",
      }),
    ).toBeTruthy();

    expect(saveButton().disabled).toBe(true);

    expect(
      (
        screen.getByRole("button", {
          name: "Cancel",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    expect(fileInput().disabled).toBe(true);

    // A second submit event must not create
    // another save operation.
    fireEvent.submit(container.querySelector("form")!);

    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      completeSave();
    });

    await waitFor(() => {
      expect(saveButton().disabled).toBe(false);
    });
  });

  // A save failure should remain visible in the form.
  // Correcting or retrying should remain possible.
  it("shows save failures and supports retry", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    const onSave = vi.fn()
      .mockRejectedValueOnce(
        new Error("Gallery service unavailable."),
      )
      .mockResolvedValue(undefined);

    renderForm({ onSave });

    chooseFile(makeFile());

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(
        screen.getByRole("alert").textContent,
      ).toContain("Gallery service unavailable.");
    });

    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });

  // Cancel delegates to the parent Gallery drawer.
  // The form itself should not save anything.
  it("cancels without submitting", () => {
    const onCancel = vi.fn();

    const onSave = vi.fn(
      async () => {},
    );

    renderForm({
      onCancel,
      onSave,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  // Replaced object URLs must be revoked, and the last
  // temporary preview must be released on unmount.
  it("cleans up temporary preview URLs", () => {
    const { unmount } = renderForm();

    chooseFile(
      makeFile("first.png", "image/png"),
    );

    expect(previewSource()).toBe("blob:gallery-test-1");

    chooseFile(
      makeFile("second.png", "image/png"),
    );

    expect(previewSource()).toBe("blob:gallery-test-2");

    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:gallery-test-1",
    );

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith(
      "blob:gallery-test-2",
    );

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
