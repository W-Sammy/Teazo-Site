/**
 * Admin Menu UI integration tests.
 *
 * Covers List/Card views, searching, sorting, category filtering,
 * permissions, item creation, editing, deletion, and cancellation.
 *
 * Verifies Square API request handling, duplicate submission
 * prevention, deletion confirmation, error recovery, PDF uploads,
 * and refreshed menu data without duplicate items.
 *
 * All external network requests are mocked. No production
 * Square, database, or storage records are accessed.
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

import AdminMenuClient from "./admin-menu-client";

// Use ordinary images in jsdom rather than Next.js image optimization.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }) => createElement("img", { src, alt }),
}));

type MenuProps = ComponentProps<typeof AdminMenuClient>;
type DisplayItem = MenuProps["items"][number];

const categories = [
  { id: "tea", name: "Tea" },
  { id: "fruit", name: "Fruit" },
];

const initialItems: DisplayItem[] = [
  {
    id: "item-1",
    img: "/milk-tea.png",
    name: "Milk Tea",
    price: 5.75,
    description: "Classic black tea",
    categories: [{ id: "tea", name: "Tea" }],
    availability: "Available",
  },
  {
    id: "item-2",
    img: "/mango.png",
    name: "Mango Smoothie",
    price: 6.5,
    description: "Fresh mango drink",
    categories: [{ id: "fruit", name: "Fruit" }],
    availability: "Available",
  },
];

const fetchMock = vi.fn<typeof fetch>();

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function savedItem(overrides: Record<string, unknown> = {}) {
  return {
    catalogObjectId: "new-item",
    name: "Brown Sugar Tea",
    description: "Brown sugar milk tea",
    priceCents: 650,
    currency: "USD",
    imageUrl: null,
    categories: [{ id: "tea", name: "Tea" }],
    ...overrides,
  };
}

function renderMenu(overrides: Partial<MenuProps> = {}) {
  return render(
    <AdminMenuClient
      items={initialItems}
      categories={categories}
      canUploadMenu={true}
      {...overrides}
    />,
  );
}

function menuTable() {
  return screen.getByRole("region", {
    name: "Menu items list",
  });
}

function menuRow(name: string) {
  return within(menuTable()).getByRole("row", {
    name: new RegExp(name, "i"),
  });
}

function openAddForm() {
  fireEvent.click(
    screen.getByRole("button", { name: "Add Item" }),
  );

  return screen.getByRole("form", {
    name: "Create New Menu Item",
  });
}

function createForm() {
  return screen.getByRole("form", {
    name: "Create New Menu Item",
  });
}

function editForm() {
  return screen.getByRole("form", {
    name: "Edit Menu Item",
  });
}

function enterPrice(form: HTMLElement, digits: string) {
  const price = within(form).getByRole("textbox", {
    name: /Price \(USD\)/i,
  });

  for (const key of digits) {
    fireEvent.keyDown(price, { key });
  }
}

function fillCreateForm(
  name = "Brown Sugar Tea",
  priceDigits = "650",
) {
  const form = createForm();

  fireEvent.change(
    within(form).getByRole("textbox", { name: "Name" }),
    { target: { value: name } },
  );

  enterPrice(form, priceDigits);

  return form;
}

function submitCreateForm() {
  fireEvent.click(
    within(createForm()).getByRole("button", {
      name: "Add Item",
    }),
  );
}

function openEditForm(itemName = "Milk Tea") {
  fireEvent.click(
    within(menuRow(itemName)).getByRole("button", {
      name: `Edit ${itemName}`,
    }),
  );

  return editForm();
}

function openDeleteDialog(itemName = "Milk Tea") {
  fireEvent.click(
    within(menuRow(itemName)).getByRole("button", {
      name: `Delete ${itemName}`,
    }),
  );

  return screen.getByRole("dialog", {
    name: "Delete menu item?",
  });
}

function uploadForm() {
  return screen.getByRole("form", {
    name: "Upload Menu",
  });
}

function menuUploadInput() {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="menuUploadFile"]',
  );

  if (!input) {
    throw new Error("Menu PDF input was not rendered.");
  }

  return input;
}

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

  // jsdom does not implement the complete native modal dialog API.
  Object.defineProperty(
    HTMLDialogElement.prototype,
    "showModal",
    {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
  );

  Object.defineProperty(
    HTMLDialogElement.prototype,
    "close",
    {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();

  if (originalShowModal) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      {
        configurable: true,
        writable: true,
        value: originalShowModal,
      },
    );
  } else {
    Reflect.deleteProperty(
      HTMLDialogElement.prototype,
      "showModal",
    );
  }

  if (originalClose) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "close",
      {
        configurable: true,
        writable: true,
        value: originalClose,
      },
    );
  } else {
    Reflect.deleteProperty(
      HTMLDialogElement.prototype,
      "close",
    );
  }
});

describe("Admin Menu UI integration", () => {
  describe("Display, search, sorting, and permissions", () => {
    it("defaults to List View on both view controls", () => {
      renderMenu();

      const listButtons = screen.getAllByRole("button", {
        name: "List View",
      });

      const cardButtons = screen.getAllByRole("button", {
        name: "Card View",
      });

      expect(listButtons).toHaveLength(2);
      expect(cardButtons).toHaveLength(2);

      for (const button of listButtons) {
        expect(button.getAttribute("aria-pressed")).toBe(
          "true",
        );
      }

      for (const button of cardButtons) {
        expect(button.getAttribute("aria-pressed")).toBe(
          "false",
        );
      }

      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("switches between Card View and List View manually", () => {
      renderMenu();

      fireEvent.click(
        screen.getAllByRole("button", {
          name: "Card View",
        })[0],
      );

      for (const button of screen.getAllByRole("button", {
        name: "Card View",
      })) {
        expect(button.getAttribute("aria-pressed")).toBe(
          "true",
        );
      }

      fireEvent.click(
        screen.getAllByRole("button", {
          name: "List View",
        })[1],
      );

      for (const button of screen.getAllByRole("button", {
        name: "List View",
      })) {
        expect(button.getAttribute("aria-pressed")).toBe(
          "true",
        );
      }
    });

    it("searches menu item names and descriptions", () => {
      renderMenu();

      const search = screen.getByRole("searchbox", {
        name: "Search menu items",
      });

      fireEvent.change(search, {
        target: { value: "mango" },
      });

      expect(screen.getByText("1 item")).toBeTruthy();
      expect(menuRow("Mango Smoothie")).toBeTruthy();

      expect(
        within(menuTable()).queryByRole("row", {
          name: /Milk Tea/i,
        }),
      ).toBeNull();

      fireEvent.change(search, {
        target: { value: "classic black" },
      });

      expect(menuRow("Milk Tea")).toBeTruthy();

      fireEvent.change(search, {
        target: { value: "" },
      });

      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("filters by category and clears the selection", () => {
      renderMenu();

      const teaCategory = document.querySelector<HTMLInputElement>(
        'input[name="menuCategory"][value="tea"]',
      );

      expect(teaCategory).not.toBeNull();

      fireEvent.click(teaCategory!);

      expect(screen.getByText("1 item")).toBeTruthy();
      expect(menuRow("Milk Tea")).toBeTruthy();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Clear filters",
        }),
      );

      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("sorts items by price without modifying their data", () => {
      renderMenu();

      fireEvent.change(
        screen.getByRole("combobox", {
          name: /Sort by/i,
        }),
        { target: { value: "price-asc" } },
      );

      const rows = within(menuTable())
        .getAllByRole("row")
        .slice(1);

      expect(rows[0].textContent).toContain("Milk Tea");
      expect(rows[1].textContent).toContain(
        "Mango Smoothie",
      );

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("disables creation and uploads for read-only access", () => {
      renderMenu({ canUploadMenu: false });

      expect(
        (
          screen.getByRole("button", {
            name: "Add Item",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      expect(
        (
          screen.getByRole("button", {
            name: "Upload Menu",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      const form = openEditForm();

      fireEvent.click(
        within(form).getByRole("button", {
          name: "Save Changes",
        }),
      );

      expect(
        screen.getByText(
          "Owner or Can Edit access is required to edit a menu item.",
        ),
      ).toBeTruthy();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("Creating menu items", () => {
    it("cancels item creation without sending a request", () => {
      renderMenu();

      const form = openAddForm();

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: "Name",
        }),
        { target: { value: "Unsaved Tea" } },
      );

      fireEvent.click(
        within(form).getByRole("button", {
          name: "Cancel",
        }),
      );

      expect(
        screen.queryByRole("form", {
          name: "Create New Menu Item",
        }),
      ).toBeNull();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("creates an item using the Square endpoint and updates the list", async () => {
      fetchMock.mockResolvedValueOnce(
        response(201, savedItem()),
      );

      renderMenu();

      openAddForm();
      const form = fillCreateForm(
        "  Brown Sugar Tea  ",
        "650",
      );

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: /Description/i,
        }),
        {
          target: {
            value: "  Brown sugar milk tea  ",
          },
        },
      );

      fireEvent.click(
        within(form).getByRole("checkbox", {
          name: "Tea",
        }),
      );

      submitCreateForm();

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe("/api/square/products");
      expect(options?.method).toBe("POST");
      expect(options?.credentials).toBe("same-origin");

      expect(JSON.parse(String(options?.body))).toEqual({
        name: "Brown Sugar Tea",
        description: "Brown sugar milk tea",
        priceCents: 650,
        currency: "USD",
        categoryIds: ["tea"],
      });

      await waitFor(() => {
        expect(screen.getByText("3 items")).toBeTruthy();
        expect(menuRow("Brown Sugar Tea")).toBeTruthy();
      });

      expect(
        screen.queryByRole("form", {
          name: "Create New Menu Item",
        }),
      ).toBeNull();
    });

    it("does not duplicate a created item when refreshed server props contain its ID", async () => {
      fetchMock.mockResolvedValueOnce(
        response(201, savedItem()),
      );

      const view = renderMenu();

      openAddForm();
      fillCreateForm();
      submitCreateForm();

      await waitFor(() => {
        expect(menuRow("Brown Sugar Tea")).toBeTruthy();
      });

      const itemFromServer: DisplayItem = {
        id: "new-item",
        name: "Brown Sugar Tea",
        description: "Brown sugar milk tea",
        price: 6.5,
        img: "/TEAZO_logo.svg",
        categories: [{ id: "tea", name: "Tea" }],
        availability: "Available",
      };

      view.rerender(
        <AdminMenuClient
          items={[...initialItems, itemFromServer]}
          categories={categories}
          canUploadMenu={true}
        />,
      );

      expect(screen.getByText("3 items")).toBeTruthy();

      expect(
        within(menuTable()).getAllByRole("row", {
          name: /Brown Sugar Tea/i,
        }),
      ).toHaveLength(1);
    });

    it("keeps the form open when Square rejects invalid item data", async () => {
      fetchMock.mockResolvedValueOnce(
        response(400, {
          error: "Invalid menu item price.",
        }),
      );

      renderMenu();

      openAddForm();
      fillCreateForm();
      submitCreateForm();

      expect(
        await screen.findByText(
          "Invalid menu item price.",
        ),
      ).toBeTruthy();

      expect(createForm()).toBeTruthy();
      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("rejects a successful HTTP response without a valid saved item", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          success: true,
        }),
      );

      renderMenu();

      openAddForm();
      fillCreateForm();
      submitCreateForm();

      expect(
        await screen.findByText(
          /The item creation could not be confirmed/i,
        ),
      ).toBeTruthy();

      expect(screen.getByText("2 items")).toBeTruthy();
      expect(createForm()).toBeTruthy();
    });

    it("preserves the form after a network failure without automatically retrying", async () => {
      fetchMock.mockRejectedValueOnce(
        new TypeError("Network failure"),
      );

      renderMenu();

      openAddForm();
      fillCreateForm();
      submitCreateForm();

      expect(
        await screen.findByText(
          /The item creation could not be confirmed/i,
        ),
      ).toBeTruthy();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(createForm()).toBeTruthy();
      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("prevents duplicate creation requests during a pending save", async () => {
      const pending = deferred<Response>();

      fetchMock.mockReturnValueOnce(pending.promise);

      renderMenu();

      openAddForm();
      fillCreateForm();

      const form = createForm();

      fireEvent.submit(form);
      fireEvent.submit(form);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve(response(201, savedItem()));
        await pending.promise;
      });

      await waitFor(() => {
        expect(screen.getByText("3 items")).toBeTruthy();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Editing menu items", () => {
    it("cancels an edit without sending changes to Square", () => {
      renderMenu();

      const form = openEditForm();

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: "Name",
        }),
        {
          target: { value: "Unsaved Milk Tea" },
        },
      );

      fireEvent.click(
        within(form).getByRole("button", {
          name: "Cancel",
        }),
      );

      expect(menuRow("Milk Tea")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("saves an edit through PUT without creating another row", async () => {
      fetchMock.mockResolvedValueOnce(
        response(
          200,
          savedItem({
            catalogObjectId: "item-1",
            name: "Updated Milk Tea",
            description: "Updated description",
            priceCents: 625,
          }),
        ),
      );

      renderMenu();

      const form = openEditForm();

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: "Name",
        }),
        {
          target: { value: "Updated Milk Tea" },
        },
      );

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: /Description/i,
        }),
        {
          target: { value: "Updated description" },
        },
      );

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: /Price \(USD\)/i,
        }),
        {
          target: { value: "625" },
        },
      );

      fireEvent.click(
        within(form).getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe("/api/square/products/item-1");
      expect(options?.method).toBe("PUT");

      expect(JSON.parse(String(options?.body))).toEqual({
        name: "Updated Milk Tea",
        description: "Updated description",
        priceCents: 625,
        categoryIds: ["tea"],
      });

      await waitFor(() => {
        expect(menuRow("Updated Milk Tea")).toBeTruthy();
      });

      expect(screen.getByText("2 items")).toBeTruthy();

      expect(
        within(menuTable()).queryByRole("row", {
          name: /Classic black tea/i,
        }),
      ).toBeNull();
    });

    it("keeps original data and the edit form after a conflict", async () => {
      fetchMock.mockResolvedValueOnce(
        response(409, {
          error: "This item changed in Square.",
        }),
      );

      renderMenu();

      const form = openEditForm();

      fireEvent.change(
        within(form).getByRole("textbox", {
          name: "Name",
        }),
        {
          target: { value: "Conflicting Edit" },
        },
      );

      fireEvent.click(
        within(form).getByRole("button", {
          name: "Save Changes",
        }),
      );

      expect(
        await screen.findByText(
          "This item changed in Square.",
        ),
      ).toBeTruthy();

      expect(menuRow("Milk Tea")).toBeTruthy();
      expect(editForm()).toBeTruthy();
    });

    it("rejects a saved-item response with a different item ID", async () => {
      fetchMock.mockResolvedValueOnce(
        response(
          200,
          savedItem({
            catalogObjectId: "wrong-id",
          }),
        ),
      );

      renderMenu();

      const form = openEditForm();

      fireEvent.click(
        within(form).getByRole("button", {
          name: "Save Changes",
        }),
      );

      expect(
        await screen.findByText(
          /The item update could not be confirmed/i,
        ),
      ).toBeTruthy();

      expect(menuRow("Milk Tea")).toBeTruthy();
      expect(screen.getByText("2 items")).toBeTruthy();
    });
  });

  describe("Deleting menu items", () => {
    it("cancels deletion without calling Square", () => {
      renderMenu();

      const dialog = openDeleteDialog();

      expect(
        within(dialog).getByText(
          /Are you sure you want to delete/i,
        ),
      ).toBeTruthy();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Cancel",
        }),
      );

      expect(
        screen.queryByRole("dialog", {
          name: "Delete menu item?",
        }),
      ).toBeNull();

      expect(menuRow("Milk Tea")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("removes an item only after Square confirms its deletion", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          deletedObjectIds: ["item-1"],
        }),
      );

      renderMenu();

      const dialog = openDeleteDialog();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe("/api/square/products/item-1");
      expect(options?.method).toBe("DELETE");

      await waitFor(() => {
        expect(screen.getByText("1 item")).toBeTruthy();
      });

      expect(
        within(menuTable()).queryByRole("row", {
          name: /Milk Tea/i,
        }),
      ).toBeNull();

      expect(menuRow("Mango Smoothie")).toBeTruthy();
    });

    it("does not remove an item when Square confirms a different ID", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          deletedObjectIds: ["different-item"],
        }),
      );

      renderMenu();

      const dialog = openDeleteDialog();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      expect(
        await within(dialog).findByText(
          /The deletion could not be confirmed/i,
        ),
      ).toBeTruthy();

      expect(menuRow("Milk Tea")).toBeTruthy();
      expect(screen.getByText("2 items")).toBeTruthy();
    });

    it("allows retrying after a service failure without prematurely deleting", async () => {
      fetchMock
        .mockResolvedValueOnce(
          response(503, {
            error: "Square unavailable",
          }),
        )
        .mockResolvedValueOnce(
          response(200, {
            deletedObjectIds: ["item-1"],
          }),
        );

      renderMenu();

      const dialog = openDeleteDialog();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      expect(
        await within(dialog).findByText(
          /The service is temporarily unavailable/i,
        ),
      ).toBeTruthy();

      expect(menuRow("Milk Tea")).toBeTruthy();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(screen.getByText("1 item")).toBeTruthy();
      });
    });

    it("blocks duplicate deletion requests while one is pending", async () => {
      const pending = deferred<Response>();

      fetchMock.mockReturnValueOnce(pending.promise);

      renderMenu();

      const dialog = openDeleteDialog();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      expect(
        (
          within(dialog).getByRole("button", {
            name: "Deleting...",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        pending.resolve(
          response(200, {
            deletedObjectIds: ["item-1"],
          }),
        );
        await pending.promise;
      });

      await waitFor(() => {
        expect(screen.getByText("1 item")).toBeTruthy();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("PDF upload UI", () => {
    it("rejects invalid PDF selections before making a request", () => {
      renderMenu();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Upload Menu",
        }),
      );

      const form = uploadForm();

      expect(
        (
          within(form).getByRole("button", {
            name: "Upload",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      fireEvent.change(menuUploadInput(), {
        target: {
          files: [
            new File(["not a PDF"], "picture.png", {
              type: "image/png",
            }),
          ],
        },
      });

      expect(
        within(form).getByText(
          "Please choose a PDF file ending in .pdf.",
        ),
      ).toBeTruthy();

      expect(
        (
          within(form).getByRole("button", {
            name: "Upload",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uploads a valid PDF and displays a new-tab viewing link", async () => {
      fetchMock.mockResolvedValueOnce(
        response(200, {
          success: true,
          documentId: "menu-pdf-123",
        }),
      );

      renderMenu();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Upload Menu",
        }),
      );

      const pdf = new File(
        ["%PDF-1.7\nMock PDF content"],
        "updated-menu.pdf",
        { type: "application/pdf" },
      );

      fireEvent.change(menuUploadInput(), {
        target: { files: [pdf] },
      });

      fireEvent.click(
        within(uploadForm()).getByRole("button", {
          name: "Upload",
        }),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const [url, options] = fetchMock.mock.calls[0];

      expect(url).toBe("/api/admin/menu/upload");
      expect(options?.method).toBe("POST");
      expect(options?.credentials).toBe("same-origin");

      expect(options?.body).toBeInstanceOf(FormData);

      const sentFile = (options?.body as FormData).get(
        "file",
      );

      expect(sentFile).toBeInstanceOf(File);
      expect((sentFile as File).name).toBe(
        "updated-menu.pdf",
      );

      const link = await screen.findByRole("link", {
        name: "Open uploaded PDF",
      });

      expect(link.getAttribute("href")).toBe(
        "/api/menu/pdf",
      );

      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    });

    it("keeps the upload form open after a failed publication request", async () => {
      fetchMock.mockResolvedValueOnce(
        response(503, {
          error: "Menu publication unavailable.",
        }),
      );

      renderMenu();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Upload Menu",
        }),
      );

      fireEvent.change(menuUploadInput(), {
        target: {
          files: [
            new File(
              ["%PDF-1.7\nMock PDF content"],
              "menu.pdf",
              { type: "application/pdf" },
            ),
          ],
        },
      });

      fireEvent.click(
        within(uploadForm()).getByRole("button", {
          name: "Upload",
        }),
      );

      expect(
        await screen.findByText(
          "Menu publication unavailable.",
        ),
      ).toBeTruthy();

      expect(uploadForm()).toBeTruthy();

      expect(
        screen.queryByRole("link", {
          name: "Open uploaded PDF",
        }),
      ).toBeNull();
    });
  });
});
