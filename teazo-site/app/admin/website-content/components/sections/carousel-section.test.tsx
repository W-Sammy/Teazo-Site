/**
 * Frontend tests for the Teazo admin carousel editor.
 *
 * Covers accordion behavior, image previews, placeholders,
 * descriptions, visibility toggles, removal actions,
 * upload controls, busy states, and error recovery.
 *
 * Also verifies HEIC/HEIF conversion, file-size checks,
 * conversion failures, and forwarding converted JPEGs.
 *
 * All admin handlers are mocked. No requests are sent
 * to the carousel API, database, or image storage.
 *
 * Uses built-in Vitest assertions without jest-dom.
 */

// @vitest-environment jsdom

import {
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

import type {
  CarouselImage,
} from "@/app/types/website-content";

import type {
  useWebsiteContent,
} from "../../handlers/use-website-content";

import CarouselSection from "./carousel-section";

// Reuse the actual carousel handler interface.
// Only its dependencies are replaced by test doubles.
type CarouselEditor =
  ReturnType<typeof useWebsiteContent>["carousel"];

// Mock HEIC conversion without loading a native image decoder.
const mocks = vi.hoisted(() => ({
  convert: vi.fn(),
}));

vi.mock("heic2any", () => ({
  default: mocks.convert,
}));

// Use synthetic image addresses rather than real media.
const IMAGES: CarouselImage[] = [
  {
    id: "carousel-test-1",
    src: "/synthetic-carousel-one.jpg",
    alt: "Synthetic milk tea photograph",
    enabled: true,
  },
  {
    id: "carousel-test-2",
    src: "/synthetic-carousel-two.webp",
    alt: "",
    enabled: false,
  },
];

const EMPTY_IMAGE: CarouselImage = {
  id: "carousel-empty-1",
  src: "",
  alt: "",
  enabled: true,
};

// Construct a valid carousel editor without mounting
// the entire admin website-content page.
function makeEditor(
  overrides: Partial<CarouselEditor> = {},
): CarouselEditor {
  return {
    carouselImages: IMAGES,
    carouselReady: true,
    carouselLoadError: "",
    retryLoading: vi.fn(),
    carouselHasError: false,
    carouselSaveErrors: {},
    flushAllCarouselSettings: vi.fn(),
    addCarouselImage: vi.fn(),
    updateCarouselImage: vi.fn(),
    handleImageFile: vi.fn(async () => {}),
    handleRemoveImage: vi.fn(async () => {}),
    uploading: {},
    deleting: {},
    imageErrors: {},
    ...overrides,
  };
}

// Render the actual section with its accordion expanded.
function renderEditor(
  carousel: CarouselEditor = makeEditor(),
  options: {
    isOpen?: boolean;
    onToggle?: () => void;
    setRef?: (element: HTMLDivElement | null) => void;
  } = {},
) {
  const onToggle = options.onToggle ?? vi.fn();
  const setRef = options.setRef ?? vi.fn();

  const result = render(
    <CarouselSection
      carousel={carousel}
      isOpen={options.isOpen ?? true}
      onToggle={onToggle}
      setRef={setRef}
    />,
  );

  return {
    ...result,
    carousel,
    onToggle,
    setRef,
  };
}

// Retrieve an upload input by its associated image ID.
// This avoids selecting the visible "Choose file" label.
function fileInput(
  id = IMAGES[0].id,
): HTMLInputElement {
  const input = document.getElementById(
    `carousel-file-${id}`,
  );

  expect(input).toBeInstanceOf(
    HTMLInputElement,
  );

  return input as HTMLInputElement;
}

// Generate a small synthetic image file.
// The section delegates standard image validation to
// the existing website-content handler.
function sampleFile(
  name = "synthetic-image.png",
  type = "image/png",
): File {
  return new File(
    [new Uint8Array([1, 2, 3, 4])],
    name,
    { type },
  );
}

beforeEach(() => {
  mocks.convert.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Admin carousel editor", () => {
  describe("Accordion and image previews", () => {
    it("hides editor controls when the accordion is closed", () => {
      renderEditor(makeEditor(), {
        isOpen: false,
      });

      const heading = screen.getByRole("button", {
        name: "Image Carousel",
      });

      expect(
        heading.getAttribute("aria-expanded"),
      ).toBe("false");

      expect(
        screen.queryByRole("region"),
      ).toBeNull();

      expect(
        screen.queryByText("Image 1"),
      ).toBeNull();
    });

    it("opens the editor through its accordion callback", () => {
      const onToggle = vi.fn();
      const setRef = vi.fn();

      renderEditor(makeEditor(), {
        onToggle,
        setRef,
      });

      const heading = screen.getByRole("button", {
        name: "Image Carousel",
      });

      expect(
        heading.getAttribute("aria-expanded"),
      ).toBe("true");

      fireEvent.click(heading);

      expect(onToggle).toHaveBeenCalledTimes(1);

      expect(setRef).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
      );
    });

    it("displays an empty-state message and permits adding an image", () => {
      const carousel = makeEditor({
        carouselImages: [],
      });

      renderEditor(carousel);

      expect(
        screen.getByText(
          "No carousel images yet. Add an image to get started!",
        ),
      ).toBeTruthy();

      fireEvent.click(
        screen.getByRole("button", {
          name: "New Carousel Image +",
        }),
      );

      expect(
        carousel.addCarouselImage,
      ).toHaveBeenCalledOnce();
    });

    it("shows saved previews with accessible descriptions", () => {
      renderEditor();

      const preview = screen.getByRole("img", {
        name: "Synthetic milk tea photograph",
      });

      expect(
        preview.getAttribute("src"),
      ).toBe(IMAGES[0].src);

      // An image without alt text uses a descriptive
      // fallback for its admin preview.
      const fallback = screen.getByRole("img", {
        name: "Carousel image 2 preview",
      });

      expect(
        fallback.getAttribute("src"),
      ).toBe(IMAGES[1].src);
    });

    it("shows a placeholder when no file has been selected", () => {
      renderEditor(
        makeEditor({
          carouselImages: [EMPTY_IMAGE],
        }),
      );

      expect(
        screen.getByText("No image selected"),
      ).toBeTruthy();

      expect(
        screen.getByText("Upload image"),
      ).toBeTruthy();

      expect(
        screen.queryByRole("img"),
      ).toBeNull();
    });
  });

  describe("Image settings and controls", () => {
    it("accepts the supported image formats", () => {
      renderEditor();

      expect(
        fileInput().getAttribute("accept"),
      ).toBe(
        "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif",
      );
    });

    it("toggles image visibility through the supplied handler", () => {
      const carousel = makeEditor();

      renderEditor(carousel);

      const enabledSwitch = screen.getByRole(
        "switch",
        {
          name: "Show image 1 in the carousel",
        },
      );

      expect(
        enabledSwitch.getAttribute("aria-checked"),
      ).toBe("true");

      fireEvent.click(enabledSwitch);

      expect(
        carousel.updateCarouselImage,
      ).toHaveBeenCalledWith(
        IMAGES[0].id,
        { enabled: false },
      );

      const disabledSwitch = screen.getByRole(
        "switch",
        {
          name: "Show image 2 in the carousel",
        },
      );

      expect(
        disabledSwitch.getAttribute("aria-checked"),
      ).toBe("false");

      fireEvent.click(disabledSwitch);

      expect(
        carousel.updateCarouselImage,
      ).toHaveBeenCalledWith(
        IMAGES[1].id,
        { enabled: true },
      );
    });

    it("forwards description edits and flushes settings on blur", () => {
      const carousel = makeEditor();

      renderEditor(carousel);

      const descriptions =
        screen.getAllByLabelText("Image description");

      fireEvent.change(descriptions[0], {
        target: {
          value: "Updated carousel description",
        },
      });

      expect(
        carousel.updateCarouselImage,
      ).toHaveBeenCalledWith(
        IMAGES[0].id,
        {
          alt: "Updated carousel description",
        },
      );

      fireEvent.blur(descriptions[0]);

      expect(
        carousel.flushAllCarouselSettings,
      ).toHaveBeenCalledOnce();
    });

    it("requests image removal using the correct image ID", () => {
      const carousel = makeEditor();

      renderEditor(carousel);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Remove carousel image 2",
        }),
      );

      expect(
        carousel.handleRemoveImage,
      ).toHaveBeenCalledWith(
        IMAGES[1].id,
      );

      expect(
        carousel.handleRemoveImage,
      ).toHaveBeenCalledTimes(1);
    });

    it("disables editing until carousel initialization is ready", () => {
      const carousel = makeEditor({
        carouselReady: false,
      });

      renderEditor(carousel);

      // Use Vitest's built-in property assertions rather
      // than matchers from @testing-library/jest-dom.
      expect(
        screen.getByRole("button", {
          name: "New Carousel Image +",
        }),
      ).toHaveProperty("disabled", true);

      expect(
        screen.getByRole("switch", {
          name: "Show image 1 in the carousel",
        }),
      ).toHaveProperty("disabled", true);

      expect(
        screen.getByRole("button", {
          name: "Remove carousel image 1",
        }),
      ).toHaveProperty("disabled", true);

      expect(fileInput().disabled).toBe(true);

      expect(
        screen.getAllByLabelText(
          "Image description",
        )[0],
      ).toHaveProperty("disabled", true);
    });

    it("locks one image's controls while it is uploading", () => {
      const carousel = makeEditor({
        uploading: {
          [IMAGES[0].id]: true,
        },
      });

      renderEditor(carousel);

      expect(fileInput().disabled).toBe(true);

      expect(
        screen.getByRole("button", {
          name: "Remove carousel image 1",
        }),
      ).toHaveProperty("disabled", true);

      expect(
        screen.getByRole("switch", {
          name: "Show image 1 in the carousel",
        }),
      ).toHaveProperty("disabled", true);

      // Another image remains independently editable.
      expect(
        fileInput(IMAGES[1].id).disabled,
      ).toBe(false);
    });

    it("locks one image's controls while it is deleting", () => {
      const carousel = makeEditor({
        deleting: {
          [IMAGES[0].id]: true,
        },
      });

      renderEditor(carousel);

      expect(fileInput().disabled).toBe(true);

      expect(
        screen.getByRole("button", {
          name: "Remove carousel image 1",
        }),
      ).toHaveProperty("disabled", true);

      expect(
        screen.getByRole("switch", {
          name: "Show image 1 in the carousel",
        }),
      ).toHaveProperty("disabled", true);
    });
  });

  describe("Loading and save error handling", () => {
    it("shows a loading error and allows retry", () => {
      const carousel = makeEditor({
        carouselReady: false,
        carouselLoadError:
          "Could not retrieve saved carousel images.",
      });

      renderEditor(carousel);

      // Inspect textContent directly to avoid requiring
      // the unsupported toHaveTextContent matcher.
      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "Could not retrieve saved carousel images.",
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Retry loading images",
        }),
      );

      expect(
        carousel.retryLoading,
      ).toHaveBeenCalledOnce();
    });

    it("shows a save error and allows retry", () => {
      const carousel = makeEditor({
        carouselHasError: true,
        carouselSaveErrors: {
          [IMAGES[0].id]:
            "Could not save the updated description.",
        },
      });

      renderEditor(carousel);

      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "Could not save the updated description.",
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Retry saving carousel changes",
        }),
      );

      expect(
        carousel.flushAllCarouselSettings,
      ).toHaveBeenCalledOnce();
    });

    it("displays a file error with accessible input state", () => {
      const carousel = makeEditor({
        imageErrors: {
          [IMAGES[0].id]:
            "The selected image is invalid.",
        },
      });

      renderEditor(carousel);

      expect(
        screen.getByRole("alert").textContent,
      ).toContain(
        "The selected image is invalid.",
      );

      expect(
        fileInput().getAttribute("aria-invalid"),
      ).toBe("true");

      expect(
        fileInput().getAttribute("aria-describedby"),
      ).toBe(
        `carousel-error-${IMAGES[0].id}`,
      );
    });
  });

  describe("Image selection and HEIC conversion", () => {
    it("passes a normal PNG file to the upload handler", async () => {
      const carousel = makeEditor();
      const file = sampleFile();

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [file],
        },
      });

      await waitFor(() => {
        expect(
          carousel.handleImageFile,
        ).toHaveBeenCalledExactlyOnceWith(
          IMAGES[0].id,
          file,
        );
      });
    });

    it("converts HEIC images to JPEG before upload", async () => {
      const carousel = makeEditor();

      const heic = sampleFile(
        "synthetic-photo.heic",
        "image/heic",
      );

      const jpegBlob = new Blob(
        [new Uint8Array([255, 216, 255, 217])],
        { type: "image/jpeg" },
      );

      mocks.convert.mockResolvedValue(jpegBlob);

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [heic],
        },
      });

      await waitFor(() => {
        expect(
          carousel.handleImageFile,
        ).toHaveBeenCalledTimes(1);
      });

      expect(
        mocks.convert,
      ).toHaveBeenCalledWith({
        blob: heic,
        toType: "image/jpeg",
        quality: 0.85,
      });

      const call = vi.mocked(
        carousel.handleImageFile,
      ).mock.calls[0];

      expect(call[0]).toBe(IMAGES[0].id);

      const converted = call[1];

      expect(converted).toBeInstanceOf(File);
      expect(converted?.name).toBe(
        "synthetic-photo.jpg",
      );
      expect(converted?.type).toBe(
        "image/jpeg",
      );
    });

    it("converts HEIF files identified by extension", async () => {
      const carousel = makeEditor();

      const heif = sampleFile(
        "synthetic-photo.heif",
        "application/octet-stream",
      );

      mocks.convert.mockResolvedValue(
        new Blob(
          [new Uint8Array([255, 216, 255, 217])],
          { type: "image/jpeg" },
        ),
      );

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [heif],
        },
      });

      await waitFor(() => {
        expect(
          carousel.handleImageFile,
        ).toHaveBeenCalledTimes(1);
      });

      const converted = vi.mocked(
        carousel.handleImageFile,
      ).mock.calls[0][1];

      expect(converted?.name).toBe(
        "synthetic-photo.jpg",
      );

      expect(converted?.type).toBe(
        "image/jpeg",
      );
    });

    it("rejects an empty HEIC file before conversion", async () => {
      const carousel = makeEditor();

      const empty = new File(
        [],
        "empty.heic",
        { type: "image/heic" },
      );

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [empty],
        },
      });

      expect(
        (await screen.findByRole("alert")).textContent,
      ).toContain(
        "The image file is empty.",
      );

      expect(
        mocks.convert,
      ).not.toHaveBeenCalled();

      expect(
        carousel.handleImageFile,
      ).not.toHaveBeenCalled();
    });

    it("rejects an oversized HEIC file before conversion", async () => {
      const carousel = makeEditor();

      const oversized = new File(
        [new Uint8Array(5 * 1024 * 1024 + 1)],
        "oversized.heic",
        { type: "image/heic" },
      );

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [oversized],
        },
      });

      expect(
        (await screen.findByRole("alert")).textContent,
      ).toContain(
        "The selected image must be 5 MB or smaller.",
      );

      expect(
        mocks.convert,
      ).not.toHaveBeenCalled();

      expect(
        carousel.handleImageFile,
      ).not.toHaveBeenCalled();
    });

    it("displays HEIC conversion failures without uploading", async () => {
      const carousel = makeEditor();

      mocks.convert.mockRejectedValue(
        new Error("Synthetic conversion failure."),
      );

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [
            sampleFile(
              "invalid.heic",
              "image/heic",
            ),
          ],
        },
      });

      expect(
        (await screen.findByRole("alert")).textContent,
      ).toContain(
        "Synthetic conversion failure.",
      );

      expect(
        carousel.handleImageFile,
      ).not.toHaveBeenCalled();
    });

    it("rejects empty converted JPEG output", async () => {
      const carousel = makeEditor();

      mocks.convert.mockResolvedValue(
        new Blob([], {
          type: "image/jpeg",
        }),
      );

      renderEditor(carousel);

      fireEvent.change(fileInput(), {
        target: {
          files: [
            sampleFile(
              "unreadable.heic",
              "image/heic",
            ),
          ],
        },
      });

      expect(
        (await screen.findByRole("alert")).textContent,
      ).toContain(
        "The converted image is empty.",
      );

      expect(
        carousel.handleImageFile,
      ).not.toHaveBeenCalled();
    });
  });
});
