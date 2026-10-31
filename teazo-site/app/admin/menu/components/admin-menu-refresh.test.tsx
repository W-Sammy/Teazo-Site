/**
 * Admin Menu fresh-load and persistence behavior tests.
 *
 * Covers newly created, edited, and deleted menu items after
 * remounting the component with updated server-provided data.
 *
 * No production data or external services are accessed.
 */

// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import {
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

const createdItem: DisplayItem = {
  id: "item-3",
  img: "/TEAZO_logo.svg",
  name: "Brown Sugar Tea",
  price: 6.5,
  description: "Brown sugar milk tea",
  categories: [{ id: "tea", name: "Tea" }],
  availability: "Available",
};

const updatedItem: DisplayItem = {
  ...initialItems[0],
  name: "Rose Milk Tea",
  price: 7.25,
  description: "Rose syrup",
};

const fetchMock = vi.fn<typeof fetch>();

const originalShowModal =
  HTMLDialogElement.prototype.showModal;

const originalClose =
  HTMLDialogElement.prototype.close;

function response(
  status: number,
  body: unknown,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function savedItem(
  item: DisplayItem,
) {
  return {
    catalogObjectId: item.id,
    name: item.name,
    description: item.description,
    priceCents: Math.round(item.price * 100),
    currency: "USD",
    imageUrl: null,
    categories: item.categories,
  };
}

function renderMenu(
  items: DisplayItem[] = initialItems,
) {
  return render(
    <AdminMenuClient
      items={items}
      categories={categories}
      canUploadMenu={true}
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

function enterPrice(
  form: HTMLElement,
  digits: string,
) {
  const input = within(form).getByRole("textbox", {
    name: /Price \(USD\)/i,
  });

  for (const key of digits) {
    fireEvent.keyDown(input, { key });
  }
}

async function createMenuItem() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Add Item",
    }),
  );

  const form = screen.getByRole("form", {
    name: "Create New Menu Item",
  });

  fireEvent.change(
    within(form).getByRole("textbox", {
      name: "Name",
    }),
    {
      target: {
        value: "Brown Sugar Tea",
      },
    },
  );

  enterPrice(form, "650");

  fireEvent.click(
    within(form).getByRole("button", {
      name: "Add Item",
    }),
  );

  await waitFor(() => {
    expect(menuRow("Brown Sugar Tea")).toBeTruthy();
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

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

describe("Admin Menu fresh-load behavior", () => {
  it("displays a newly created item after remounting with an updated server snapshot", async () => {
    fetchMock.mockResolvedValueOnce(
      response(201, savedItem(createdItem)),
    );

    const firstView = renderMenu();

    await createMenuItem();

    expect(screen.getByText("3 items")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate leaving the page, then loading server data again.
    firstView.unmount();

    renderMenu([...initialItems, createdItem]);

    expect(screen.getByText("3 items")).toBeTruthy();

    expect(
      within(menuTable()).getAllByRole("row", {
        name: /Brown Sugar Tea/i,
      }),
    ).toHaveLength(1);

    expect(
      within(menuRow("Brown Sugar Tea")).getByText(
        "$6.50",
      ),
    ).toBeTruthy();

    // Rendering an updated server snapshot does not send a
    // second creation request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("displays confirmed edited values after a fresh mount with updated server data", async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, savedItem(updatedItem)),
    );

    const firstView = renderMenu();

    fireEvent.click(
      within(menuRow("Milk Tea")).getByRole(
        "button",
        { name: "Edit Milk Tea" },
      ),
    );

    const form = screen.getByRole("form", {
      name: "Edit Menu Item",
    });

    fireEvent.change(
      within(form).getByRole("textbox", {
        name: "Name",
      }),
      {
        target: {
          value: "Rose Milk Tea",
        },
      },
    );

    fireEvent.change(
      within(form).getByRole("textbox", {
        name: /Price \(USD\)/i,
      }),
      {
        target: { value: "725" },
      },
    );

    fireEvent.click(
      within(form).getByRole("button", {
        name: "Save Changes",
      }),
    );

    await waitFor(() => {
      expect(menuRow("Rose Milk Tea")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstView.unmount();

    renderMenu([
      updatedItem,
      initialItems[1],
    ]);

    expect(screen.getByText("2 items")).toBeTruthy();

    const updatedRow = menuRow("Rose Milk Tea");

    expect(
      within(updatedRow).getByText("$7.25"),
    ).toBeTruthy();

    expect(
      within(updatedRow).getByText("Rose syrup"),
    ).toBeTruthy();

    expect(
      within(menuTable()).queryByText("Milk Tea"),
    ).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed deletion absent after remounting with the updated server list", async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, {
        deletedObjectIds: ["item-1"],
      }),
    );

    const firstView = renderMenu();

    fireEvent.click(
      within(menuRow("Milk Tea")).getByRole(
        "button",
        { name: "Delete Milk Tea" },
      ),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Delete menu item?",
    });

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete",
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("1 item")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    firstView.unmount();

    // The next server snapshot omits the deleted record.
    renderMenu([initialItems[1]]);

    expect(screen.getByText("1 item")).toBeTruthy();

    expect(menuRow("Mango Smoothie")).toBeTruthy();

    expect(
      within(menuTable()).queryByRole("row", {
        name: /Milk Tea/i,
      }),
    ).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not mistake local creation state for persisted server data when a fresh snapshot omits the item", async () => {
    fetchMock.mockResolvedValueOnce(
      response(201, savedItem(createdItem)),
    );

    const firstView = renderMenu();

    await createMenuItem();

    expect(screen.getByText("3 items")).toBeTruthy();
    expect(menuRow("Brown Sugar Tea")).toBeTruthy();

    firstView.unmount();

    // An unchanged server snapshot is deliberately supplied.
    // The client must not invent persistence from its old state.
    renderMenu(initialItems);

    expect(screen.getByText("2 items")).toBeTruthy();

    expect(
      within(menuTable()).queryByRole("row", {
        name: /Brown Sugar Tea/i,
      }),
    ).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
