/**
 * Admin Events form interaction tests.
 *
 * Covers creation, editing, cancellation, validation,
 * catalog targeting, image selection, and HEIC conversion.
 *
 * No production data or external services are accessed.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
  EventFormValues,
} from "@/app/types/admin-event";

const mocks = vi.hoisted(() => ({
  heicTo: vi.fn(),
}));

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
      data-testid="event-preview"
      data-src={src}
    />
  ),
}));

vi.mock("heic-to", () => ({
  heicTo: mocks.heicTo,
}));

import EventForm from "./event-form";

const categories: EventCategory[] = [
  {
    id: "category-drinks",
    name: "Tea Drinks",
  },
  {
    id: "category-snacks",
    name: "Snacks",
  },
];

const items: EventCatalogItem[] = [
  {
    id: "item-1",
    name: "Classic Boba",
    categoryIds: ["category-drinks"],
  },
  {
    id: "item-2",
    name: "Green Tea",
    categoryIds: ["category-drinks"],
  },
  {
    id: "item-3",
    name: "Cookie",
    categoryIds: ["category-snacks"],
  },
];

const existingEvent: AdminEvent = {
  id: "event-1",
  name: "Existing Tea Event",
  description: "Original event description",
  imageUrl: "/events/existing.jpg",
  startAt: "2026-11-05T18:00:00.000Z",
  endAt: "2026-11-05T21:00:00.000Z",
  appliesToAll: false,
  categoryIds: ["category-drinks"],
  itemIds: ["item-3"],
};

// Give Vitest mocks the exact callback signatures
// required by EventForm.
let onSave: Mock<(values: EventFormValues) => void>;
let onCancel: Mock<() => void>;

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function renderForm(
  initialEvent: AdminEvent | null = null,
) {
  return render(
    <EventForm
      initialEvent={initialEvent}
      categories={categories}
      items={items}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
}

function submitForm() {
  fireEvent.click(
    screen.getByRole("button", {
      name: /^(Save|Save Changes)$/,
    }),
  );
}

function setText(
  label: RegExp,
  value: string,
) {
  fireEvent.change(
    screen.getByLabelText(label),
    {
      target: { value },
    },
  );
}

function fillValidFields() {
  setText(/^Name/, "  Fall Tea Festival  ");

  setText(
    /^Description/,
    "  Seasonal tea promotion  ",
  );

  setText(
    /^Starts/,
    "2026-11-05T10:00",
  );

  setText(
    /^Ends/,
    "2026-11-05T12:00",
  );
}

function chooseFile(file: File) {
  const input = document.getElementById(
    "event-image",
  ) as HTMLInputElement;

  if (!input) {
    throw new Error("Event file input missing");
  }

  fireEvent.change(input, {
    target: {
      files: [file],
    },
  });
}

function imageFile(
  name: string,
  type: string,
  data = "image contents",
) {
  return new File(
    [data],
    name,
    { type },
  );
}

describe("Admin Events form interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    onSave = vi.fn<(values: EventFormValues) => void>();
    onCancel = vi.fn<() => void>();

    createObjectURL.mockReturnValue(
      "blob:event-preview",
    );

    // Retain the native URL constructor so other
    // browser APIs continue to behave normally.
    const NativeURL = URL;

    class TestURL extends NativeURL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }

    vi.stubGlobal("URL", TestURL);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts a new event with empty fields", () => {
    renderForm();

    expect(
      screen.getByRole("heading", {
        name: "Create New Event",
      }),
    ).toBeTruthy();

    expect(
      (
        screen.getByLabelText(
          /^Name/,
        ) as HTMLInputElement
      ).value,
    ).toBe("");

    expect(
      (
        screen.getByLabelText(
          /^Description/,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("");

    expect(
      screen.getByText("No file chosen"),
    ).toBeTruthy();

    expect(
      onSave,
    ).not.toHaveBeenCalled();
  });

  it("rejects missing event name and description", () => {
    renderForm();

    submitForm();

    expect(
      screen.getByRole("alert").textContent,
    ).toBe(
      "Enter an event name and description.",
    );

    expect(onSave).not.toHaveBeenCalled();
  });

  it("requires both event dates", () => {
    renderForm();

    setText(/^Name/, "Tea Festival");
    setText(/^Description/, "Special event");

    submitForm();

    expect(
      screen.getByRole("alert").textContent,
    ).toBe(
      "Choose a start and end date.",
    );

    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects an end date earlier than the start date", () => {
    renderForm();

    fillValidFields();

    setText(
      /^Ends/,
      "2026-11-05T09:00",
    );

    submitForm();

    expect(
      screen.getByRole("alert").textContent,
    ).toBe(
      "The end date must be later than the start date.",
    );

    expect(onSave).not.toHaveBeenCalled();
  });

  it("trims valid event details and submits the correct dates", () => {
    renderForm();

    fillValidFields();

    submitForm();

    expect(onSave).toHaveBeenCalledOnce();

    expect(onSave).toHaveBeenCalledWith({
      name: "Fall Tea Festival",
      description: "Seasonal tea promotion",
      imageFile: null,
      startAt: new Date(
        "2026-11-05T10:00",
      ).toISOString(),
      endAt: new Date(
        "2026-11-05T12:00",
      ).toISOString(),
      appliesToAll: false,
      categoryIds: [],
      itemIds: [],
    });
  });

  it("calls Cancel without submitting changes", () => {
    renderForm();

    fillValidFields();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("counts affected items without double-counting overlapping selections", () => {
    renderForm();

    fireEvent.click(
      screen.getByLabelText("Tea Drinks"),
    );

    expect(
      screen.getByText(
        /2 current items affected/,
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText("Classic Boba"),
    );

    expect(
      screen.getByText(
        /2 current items affected/,
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByLabelText("Cookie"),
    );

    expect(
      screen.getByText(
        /3 current items affected/,
      ),
    ).toBeTruthy();
  });

  it("omits specific targets when the event applies to all items", () => {
    renderForm();

    fillValidFields();

    fireEvent.click(
      screen.getByLabelText("Tea Drinks"),
    );

    fireEvent.click(
      screen.getByLabelText("Cookie"),
    );

    fireEvent.click(
      screen.getByLabelText(
        "All current and future items",
      ),
    );

    expect(
      screen.getByText(
        /3 current items affected/,
      ),
    ).toBeTruthy();

    expect(
      screen.queryByLabelText("Tea Drinks"),
    ).toBeNull();

    submitForm();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        appliesToAll: true,
        categoryIds: [],
        itemIds: [],
      }),
    );
  });

  it("populates the edit form from an existing event", () => {
    renderForm(existingEvent);

    expect(
      screen.getByRole("heading", {
        name: "Edit Event",
      }),
    ).toBeTruthy();

    expect(
      (
        screen.getByLabelText(
          /^Name/,
        ) as HTMLInputElement
      ).value,
    ).toBe("Existing Tea Event");

    expect(
      (
        screen.getByLabelText(
          /^Description/,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(
      "Original event description",
    );

    expect(
      (
        screen.getByLabelText(
          "Tea Drinks",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);

    expect(
      (
        screen.getByLabelText(
          "Cookie",
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);

    expect(
      screen.getByText("Current image selected"),
    ).toBeTruthy();
  });

  it("submits edited event details while retaining existing targets", () => {
    renderForm(existingEvent);

    setText(
      /^Name/,
      "Updated Tea Event",
    );

    submitForm();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Updated Tea Event",
        description:
          "Original event description",
        categoryIds: ["category-drinks"],
        itemIds: ["item-3"],
        imageFile: null,
        startAt: existingEvent.startAt,
        endAt: existingEvent.endAt,
      }),
    );
  });

  it("rejects unsupported image formats", () => {
    renderForm();

    chooseFile(
      imageFile(
        "document.txt",
        "text/plain",
      ),
    );

    expect(
      screen.getByText(
        "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
      ),
    ).toBeTruthy();

    expect(createObjectURL)
      .not.toHaveBeenCalled();
  });

  it("rejects empty image files", () => {
    renderForm();

    chooseFile(
      imageFile(
        "empty.png",
        "image/png",
        "",
      ),
    );

    expect(
      screen.getByText(
        "The selected image must be nonempty and 10 MB or smaller.",
      ),
    ).toBeTruthy();

    expect(createObjectURL)
      .not.toHaveBeenCalled();
  });

  it("rejects images exceeding 10 MB", () => {
    renderForm();

    const file = imageFile(
      "oversized.jpg",
      "image/jpeg",
    );

    Object.defineProperty(file, "size", {
      configurable: true,
      value: 10 * 1024 * 1024 + 1,
    });

    chooseFile(file);

    expect(
      screen.getByText(
        "The selected image must be nonempty and 10 MB or smaller.",
      ),
    ).toBeTruthy();

    expect(createObjectURL)
      .not.toHaveBeenCalled();
  });

  it("accepts a valid PNG and forwards the file on save", () => {
    renderForm();

    const file = imageFile(
      "festival.png",
      "image/png",
    );

    chooseFile(file);

    expect(
      screen.getByText(
        "festival.png",
      ),
    ).toBeTruthy();

    expect(
      screen.getByTestId("event-preview")
        .getAttribute("data-src"),
    ).toBe("blob:event-preview");

    fillValidFields();
    submitForm();

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        imageFile: file,
      }),
    );
  });

  it("releases replaced image previews and the last preview on unmount", () => {
    createObjectURL
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");

    const view = renderForm();

    chooseFile(
      imageFile("first.png", "image/png"),
    );

    chooseFile(
      imageFile("second.webp", "image/webp"),
    );

    expect(
      revokeObjectURL,
    ).toHaveBeenCalledWith(
      "blob:first",
    );

    expect(
      screen.getByTestId("event-preview")
        .getAttribute("data-src"),
    ).toBe("blob:second");

    view.unmount();

    expect(
      revokeObjectURL,
    ).toHaveBeenCalledWith(
      "blob:second",
    );
  });

  it("converts HEIC uploads to JPEG before saving", async () => {
    mocks.heicTo.mockResolvedValue(
      new Blob(
        ["converted jpeg"],
        { type: "image/jpeg" },
      ),
    );

    renderForm();

    chooseFile(
      imageFile(
        "holiday.HEIC",
        "",
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByText("holiday.jpg"),
      ).toBeTruthy();
    });

    expect(mocks.heicTo).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image/jpeg",
        quality: 0.85,
      }),
    );

    fillValidFields();
    submitForm();

    const saved =
      onSave.mock.calls[0][0];

    expect(saved.imageFile).toBeInstanceOf(
      File,
    );

    expect(saved.imageFile?.name).toBe(
      "holiday.jpg",
    );

    expect(saved.imageFile?.type).toBe(
      "image/jpeg",
    );
  });

  it("shows a useful error when HEIC conversion fails", async () => {
    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.heicTo.mockRejectedValue(
      new Error("Conversion failed"),
    );

    renderForm();

    chooseFile(
      imageFile(
        "broken.heic",
        "image/heic",
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "This HEIC/HEIF image could not be converted. Try another image or convert it to JPG first.",
        ),
      ).toBeTruthy();
    });

    expect(createObjectURL)
      .not.toHaveBeenCalled();
  });

  it("blocks saving while HEIC conversion is in progress", async () => {
    let finishConversion!: (
      value: Blob,
    ) => void;

    const pending = new Promise<Blob>(
      (resolve) => {
        finishConversion = resolve;
      },
    );

    mocks.heicTo.mockReturnValue(pending);

    renderForm();

    fillValidFields();

    chooseFile(
      imageFile(
        "pending.heif",
        "image/heif",
      ),
    );

    expect(
      screen.getByRole("button", {
        name: "Converting HEIC...",
      }).hasAttribute("disabled"),
    ).toBe(true);

    expect(
      screen.getByRole("button", {
        name: "Save",
      }).hasAttribute("disabled"),
    ).toBe(true);

    expect(onSave).not.toHaveBeenCalled();

    finishConversion(
      new Blob(
        ["converted"],
        { type: "image/jpeg" },
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "pending.jpg",
        ),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("button", {
        name: "Save",
      }).hasAttribute("disabled"),
    ).toBe(false);

    submitForm();

    expect(onSave).toHaveBeenCalledOnce();
  });
});
