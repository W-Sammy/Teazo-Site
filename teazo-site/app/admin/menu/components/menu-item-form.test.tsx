/**
 * Admin Menu item form interaction tests.
 *
 * Covers required field validation, currency formatting, item
 * creation and editing, category selection, cancellation,
 * asynchronous saving, error recovery, and duplicate submissions.
 *
 * Also verifies optional image validation, preview handling,
 * image removal, and restoration of existing images.
 *
 * No production data or external services are accessed.
 */

// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
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

import MenuItemForm, {
  type MenuItemFormValues,
} from "./menu-item-form";

// Avoid Next.js image optimization in the jsdom test environment.
// Keep image load and error handlers available for preview testing.
vi.mock("next/image", () => ({
  default: (props: {
    src: string;
    alt: string;
    onLoad?: () => void;
    onError?: () => void;
  }) =>
    createElement("img", {
      src: props.src,
      alt: props.alt,
      onLoad: props.onLoad,
      onError: props.onError,
    }),
}));

const categories = [
  { id: "tea", name: "Tea" },
  { id: "toppings", name: "Toppings" },
];

const existingItem = {
  name: "Original Milk Tea",
  description: "Original description",
  priceCents: 575,
  categoryIds: ["tea"],
  imageUrl: "",
};

const onSave = vi.fn<
  (values: MenuItemFormValues) => void | Promise<void>
>();

const onCancel = vi.fn<() => void>();

const createObjectURL = vi.fn<() => string>(
  () => "blob:teazo-menu-test",
);

const revokeObjectURL = vi.fn<(url: string) => void>();

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function renderForm(
  overrides: Partial<ComponentProps<typeof MenuItemForm>> = {},
) {
  return render(
    createElement(MenuItemForm, {
      categories,
      onSave,
      onCancel,
      ...overrides,
    }),
  );
}

function nameInput() {
  return screen.getByRole("textbox", {
    name: /^Name$/i,
  }) as HTMLInputElement;
}

function priceInput() {
  return screen.getByRole("textbox", {
    name: /Price \(USD\)/i,
  }) as HTMLInputElement;
}

function descriptionInput() {
  return screen.getByRole("textbox", {
    name: /Description/i,
  }) as HTMLTextAreaElement;
}

function enterPriceDigits(digits: string) {
  for (const key of digits) {
    fireEvent.keyDown(priceInput(), { key });
  }
}

function imageInput() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="menuItemImage"]',
  );

  if (!input) {
    throw new Error("Menu image input was not rendered.");
  }

  return input;
}

function chooseImage(file: File) {
  fireEvent.change(imageInput(), {
    target: { files: [file] },
  });
}

function validSavedValues(
  overrides: Partial<MenuItemFormValues> = {},
): MenuItemFormValues {
  return {
    name: "Milk Tea",
    description: "",
    priceCents: 500,
    currency: "USD",
    categoryIds: [],
    imageFile: null,
    removeImage: false,
    ...overrides,
  };
}

beforeEach(() => {
  onSave.mockReset();
  onCancel.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });

  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });
});

afterEach(() => {
  cleanup();

  if (originalCreateObjectURL) {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, "createObjectURL");
  }

  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    });
  } else {
    Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});

describe("Admin Menu Item Form", () => {
  describe("Create form and required fields", () => {
    it("renders a new item form with empty fields and required name and price", () => {
      renderForm();

      expect(
        screen.getByRole("heading", {
          name: "Create New Menu Item",
        }),
      ).toBeTruthy();

      expect(nameInput().value).toBe("");
      expect(priceInput().value).toBe("$0.00");
      expect(descriptionInput().value).toBe("");

      expect(nameInput().required).toBe(true);
      expect(priceInput().required).toBe(true);

      expect(
        screen.getByRole("button", { name: "Add Item" }),
      ).toBeTruthy();
    });

    it("rejects a completely empty submission", () => {
      renderForm();

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      expect(
        screen.getByText("Enter a menu item name."),
      ).toBeTruthy();

      expect(
        screen.getByText(
          "Enter a price using the number keys.",
        ),
      ).toBeTruthy();

      expect(onSave).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(nameInput());
    });

    it("rejects a whitespace-only item name", () => {
      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "   " },
      });

      enterPriceDigits("500");

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      expect(
        screen.getByText("Enter a menu item name."),
      ).toBeTruthy();

      expect(onSave).not.toHaveBeenCalled();
    });

    it("rejects an untouched price even when the name is valid", () => {
      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "Milk Tea" },
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      expect(
        screen.getByText(
          "Enter a price using the number keys.",
        ),
      ).toBeTruthy();

      expect(document.activeElement).toBe(priceInput());
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe("Currency formatting", () => {
    it("shifts typed digits into cents and supports Backspace and Delete", () => {
      renderForm();

      enterPriceDigits("1000");

      expect(priceInput().value).toBe("$10.00");

      fireEvent.keyDown(priceInput(), {
        key: "Backspace",
      });

      expect(priceInput().value).toBe("$1.00");

      fireEvent.keyDown(priceInput(), {
        key: "Delete",
      });

      expect(priceInput().value).toBe("$0.10");
    });

    it("accepts a pasted decimal currency amount", () => {
      renderForm();

      fireEvent.paste(priceInput(), {
        clipboardData: {
          getData: () => "$12.34",
        },
      });

      expect(priceInput().value).toBe("$12.34");
    });

    it("treats a pasted whole-dollar amount as dollars", () => {
      renderForm();

      fireEvent.paste(priceInput(), {
        clipboardData: {
          getData: () => "12",
        },
      });

      expect(priceInput().value).toBe("$12.00");
    });

    it("rejects malformed pasted currency without changing the amount", () => {
      renderForm();

      enterPriceDigits("500");

      fireEvent.paste(priceInput(), {
        clipboardData: {
          getData: () => "1.234",
        },
      });

      expect(priceInput().value).toBe("$5.00");

      expect(
        screen.getByText(
          "Paste a valid price, such as $10.00.",
        ),
      ).toBeTruthy();

      enterPriceDigits("0");

      expect(
        screen.queryByText(
          "Paste a valid price, such as $10.00.",
        ),
      ).toBeNull();
    });

    it("supports mobile-style input changes without keydown events", () => {
      renderForm();

      fireEvent.change(priceInput(), {
        target: { value: "1000" },
      });

      expect(priceInput().value).toBe("$10.00");
    });

    it("allows an explicitly entered zero-dollar price", async () => {
      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "Free Sample" },
      });

      enterPriceDigits("0");

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          validSavedValues({
            name: "Free Sample",
            priceCents: 0,
          }),
        );
      });
    });
  });

  describe("Item values and categories", () => {
    it("trims submitted text and preserves selected category IDs", async () => {
      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "  Milk Tea  " },
      });

      fireEvent.change(descriptionInput(), {
        target: { value: "  Freshly brewed  " },
      });

      enterPriceDigits("500");

      fireEvent.click(
        screen.getByRole("checkbox", { name: "Tea" }),
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          validSavedValues({
            name: "Milk Tea",
            description: "Freshly brewed",
            categoryIds: ["tea"],
          }),
        );
      });
    });

    it("allows multiple categories to be selected and deselected", async () => {
      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "Milk Tea" },
      });

      enterPriceDigits("500");

      const tea = screen.getByRole("checkbox", {
        name: "Tea",
      });

      const toppings = screen.getByRole("checkbox", {
        name: "Toppings",
      });

      fireEvent.click(tea);
      fireEvent.click(toppings);

      expect((tea as HTMLInputElement).checked).toBe(true);
      expect((toppings as HTMLInputElement).checked).toBe(
        true,
      );

      fireEvent.click(tea);

      expect((tea as HTMLInputElement).checked).toBe(false);

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          validSavedValues({
            categoryIds: ["toppings"],
          }),
        );
      });
    });

    it("prefills edit fields and submits the updated values", async () => {
      renderForm({
        initialItem: existingItem,
      });

      expect(
        screen.getByRole("heading", {
          name: "Edit Menu Item",
        }),
      ).toBeTruthy();

      expect(nameInput().value).toBe("Original Milk Tea");
      expect(priceInput().value).toBe("$5.75");

      expect(descriptionInput().value).toBe(
        "Original description",
      );

      expect(
        (
          screen.getByRole("checkbox", {
            name: "Tea",
          }) as HTMLInputElement
        ).checked,
      ).toBe(true);

      fireEvent.change(nameInput(), {
        target: { value: "Updated Milk Tea" },
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: "Updated Milk Tea",
          description: "Original description",
          priceCents: 575,
          currency: "USD",
          categoryIds: ["tea"],
          imageFile: null,
          removeImage: false,
        });
      });
    });

    it("excludes category IDs no longer available in the supplied options", async () => {
      renderForm({
        initialItem: {
          ...existingItem,
          categoryIds: ["tea", "retired"],
        },
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            categoryIds: ["tea"],
          }),
        );
      });
    });

    it("calls Cancel without saving changes", () => {
      renderForm({
        initialItem: existingItem,
      });

      fireEvent.change(nameInput(), {
        target: { value: "Unsaved Change" },
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Cancel" }),
      );

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe("Saving state and failure recovery", () => {
    it("disables fields and action buttons while the parent is saving", () => {
      renderForm({
        isSaving: true,
      });

      expect(nameInput().disabled).toBe(true);
      expect(priceInput().disabled).toBe(true);
      expect(descriptionInput().disabled).toBe(true);

      expect(
        (
          screen.getByRole("button", {
            name: "Adding...",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      expect(
        (
          screen.getByRole("button", {
            name: "Cancel",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it("blocks duplicate submissions while an asynchronous save is pending", async () => {
      const pending = {
        resolve: () => {},
      };

      const promise = new Promise<void>((resolve) => {
        pending.resolve = resolve;
      });

      onSave.mockReturnValue(promise);

      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "Milk Tea" },
      });

      enterPriceDigits("500");

      const form = screen.getByRole("form", {
        name: "Create New Menu Item",
      });

      fireEvent.submit(form);
      fireEvent.submit(form);

      expect(onSave).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve();
        await promise;
      });

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("shows an error and allows retrying after a rejected save", async () => {
      onSave.mockRejectedValueOnce(
        new Error("Square unavailable"),
      );

      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "Milk Tea" },
      });

      enterPriceDigits("500");

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      expect(
        await screen.findByText(
          "The item could not be confirmed. Check the menu before trying again.",
        ),
      ).toBeTruthy();

      expect(onSave).toHaveBeenCalledTimes(1);

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Optional item image handling", () => {
    it("rejects an unsupported image format", () => {
      renderForm();

      chooseImage(
        new File(["not an image"], "picture.gif", {
          type: "image/gif",
        }),
      );

      expect(
        screen.getByText(
          "Choose a JPG, PNG, or WEBP image.",
        ),
      ).toBeTruthy();

      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("rejects empty and oversized image files", () => {
      renderForm();

      const emptyImage = new File([], "empty.png", {
        type: "image/png",
      });

      chooseImage(emptyImage);

      expect(
        screen.getByText(
          "Choose a nonempty image that is 10 MB or smaller.",
        ),
      ).toBeTruthy();

      const oversizedImage = new File(
        ["sample"],
        "large.png",
        { type: "image/png" },
      );

      Object.defineProperty(oversizedImage, "size", {
        value: 10 * 1024 * 1024 + 1,
      });

      chooseImage(oversizedImage);

      expect(
        screen.getByText(
          "Choose a nonempty image that is 10 MB or smaller.",
        ),
      ).toBeTruthy();

      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("previews a valid image and waits for image loading before submission", async () => {
      renderForm();

      fireEvent.change(nameInput(), {
        target: { value: "Milk Tea" },
      });

      enterPriceDigits("500");

      const image = new File(
        ["test image"],
        "milk-tea.png",
        { type: "image/png" },
      );

      chooseImage(image);

      expect(createObjectURL).toHaveBeenCalledTimes(1);

      expect(
        screen.getByText("Checking image preview…"),
      ).toBeTruthy();

      expect(
        (
          screen.getByRole("button", {
            name: "Add Item",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      fireEvent.load(
        screen.getByRole("img", {
          name: "Milk Tea preview",
        }),
      );

      expect(
        (
          screen.getByRole("button", {
            name: "Add Item",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);

      fireEvent.click(
        screen.getByRole("button", { name: "Add Item" }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          validSavedValues({
            imageFile: image,
          }),
        );
      });
    });

    it("marks an existing image for removal when explicitly requested", async () => {
      renderForm({
        initialItem: {
          ...existingItem,
          imageUrl: "/old-image.png",
        },
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Remove image",
        }),
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            imageFile: null,
            removeImage: true,
          }),
        );
      });
    });

    it("restores the existing image without marking it for removal", async () => {
      renderForm({
        initialItem: {
          ...existingItem,
          imageUrl: "/old-image.png",
        },
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: "Remove image",
        }),
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Restore current image",
        }),
      );

      expect(
        screen.getByRole("img", {
          name: "Original Milk Tea preview",
        }),
      ).toBeTruthy();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            imageFile: null,
            removeImage: false,
          }),
        );
      });
    });
  });
});
