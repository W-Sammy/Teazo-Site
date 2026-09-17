"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ItemCategory } from "@/app/types/menu-item";
import ListView from "@/app/admin/components/admin-list-view";
import AdminForm from "@/app/admin/components/admin-form-page";
import AdminViewToggle, {
  GridViewIcon,
  ListViewIcon,
  type AdminViewOption,
} from "@/app/admin/components/admin-view-toggle";
import MenuItemForm, {
  type MenuItemFormValues,
} from "./menu-item-form";
import DeleteMenuItemDialog from "./delete-menu-item-dialog";

type DisplayedMenuItem = {
  id: string;
  img: string;
  name: string;
  price: number;
  description: string;
  categories: ItemCategory[];
};

type Category = {
  id: string;
  name: string;
};

type MenuSortOption =
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc";

type MenuViewMode = "grid" | "list";

type MenuDrawer =
  | { kind: "add-item" }
  | { kind: "edit-item"; item: DisplayedMenuItem }
  | { kind: "upload-menu" }
  | null;

type AdminMenuClientProps = {
  items: DisplayedMenuItem[];
  categories: Category[];
};

const fallbackImage = "/TEAZO_logo.svg";

const menuViewOptions: readonly AdminViewOption<MenuViewMode>[] = [
  {
    value: "grid",
    label: "Card View",
    icon: <GridViewIcon />,
  },
  {
    value: "list",
    label: "List View",
    icon: <ListViewIcon />,
  },
];

export default function AdminMenuClient({
  items,
  categories,
}: AdminMenuClientProps) {
  const [search, setSearch] = useState("");

  const [selectedCategories, setSelectedCategories] =
    useState<string[]>([]);

  const [sortBy, setSortBy] =
    useState<MenuSortOption>("name-asc");

  // Until a view is chosen, show cards on mobile and a list on desktop.
  // A manual choice then stays selected when the screen size changes.
  const [viewMode, setViewMode] =
    useState<MenuViewMode | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(true);

  const [mobileFiltersOpen, setMobileFiltersOpen] =
    useState(false);

  // Keep temporary additions separate from the server-provided items.
  const [temporaryItems, setTemporaryItems] =
    useState<DisplayedMenuItem[]>([]);

  // Existing items get a local override instead of mutating the incoming props.
  const [editedItems, setEditedItems] =
    useState<Map<string, DisplayedMenuItem>>(
      () => new Map(),
    );

  // Hide existing items locally without sending deletion requests to Square.
  const [deletedItemIds, setDeletedItemIds] =
    useState<Set<string>>(
      () => new Set(),
    );

  const [itemPendingDelete, setItemPendingDelete] =
    useState<DisplayedMenuItem | null>(null);

  const [localNotice, setLocalNotice] = useState("");
  const [drawer, setDrawer] = useState<MenuDrawer>(null);
  const [uploadFileName, setUploadFileName] = useState("");

  const mobileFilterCloseRef =
    useRef<HTMLButtonElement | null>(null);

  const searchInputRef =
    useRef<HTMLInputElement | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const drawerContainerRef =
    useRef<HTMLDivElement | null>(null);

  const managedImageUrls = useRef<Set<string>>(new Set());
  const nextLocalId = useRef(0);

  useEffect(() => {
    const urls = managedImageUrls.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const allItems = useMemo(
    () =>
      [
        ...items.map(
          (item) => editedItems.get(item.id) ?? item,
        ),
        ...temporaryItems,
      ].filter((item) => !deletedItemIds.has(item.id)),
    [items, editedItems, temporaryItems, deletedItemIds],
  );

  const editingItem =
    drawer?.kind === "edit-item" ? drawer.item : null;

  // Include an edited item's existing categories even if a supplied option is missing.
  const formCategories = useMemo(() => {
    const options = new Map(
      categories.map((category) => [
        category.id,
        category,
      ]),
    );

    editingItem?.categories.forEach((category) => {
      if (!options.has(category.id)) {
        options.set(category.id, {
          id: category.id,
          name: category.name ?? "Unnamed category",
        });
      }
    });

    return Array.from(options.values());
  }, [categories, editingItem]);

  // Release replaced/deleted local images after their last reference is removed.
  useEffect(() => {
    const usedUrls = new Set([
      ...temporaryItems.map((item) => item.img),
      ...Array.from(
        editedItems.values(),
        (item) => item.img,
      ),
    ]);

    if (editingItem) {
      usedUrls.add(editingItem.img);
    }

    if (itemPendingDelete) {
      usedUrls.add(itemPendingDelete.img);
    }

    managedImageUrls.current.forEach((url) => {
      if (!usedUrls.has(url)) {
        URL.revokeObjectURL(url);
        managedImageUrls.current.delete(url);
      }
    });
  }, [
    temporaryItems,
    editedItems,
    editingItem,
    itemPendingDelete,
  ]);

  useEffect(() => {
    if (!mobileFiltersOpen && !drawer) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (mobileFiltersOpen) {
      mobileFilterCloseRef.current?.focus();
    } else {
      // Focus the close button rather than opening the mobile keyboard immediately.
      drawerContainerRef.current
        ?.querySelector<HTMLElement>('[role="dialog"] button')
        ?.focus({ preventScroll: true });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      // Escape inside the delete dialog must not also close an edit drawer.
      if (
        event.target instanceof Element &&
        event.target.closest("dialog[open]")
      ) {
        return;
      }

      setMobileFiltersOpen(false);
      setDrawer(null);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [mobileFiltersOpen, drawer]);

  function toggleCategory(id: string) {
    setSelectedCategories((current) =>
      current.includes(id)
        ? current.filter((categoryId) => categoryId !== id)
        : [...current, id],
    );
  }

  const filteredItems = useMemo(() => {
    const query = search.toLowerCase();

    const filtered = allItems.filter((item) => {
      const matchesCategory =
        selectedCategories.length === 0 ||
        item.categories.some((category) =>
          selectedCategories.includes(category.id),
        );

      const matchesSearch =
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-desc":
          return b.name.localeCompare(a.name);

        case "price-asc":
          return a.price - b.price;

        case "price-desc":
          return b.price - a.price;

        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [
    allItems,
    search,
    selectedCategories,
    sortBy,
  ]);

  function openUploadForm() {
    setMobileFiltersOpen(false);
    setUploadFileName("");
    setDrawer({ kind: "upload-menu" });
  }

  function openAddItemForm() {
    setMobileFiltersOpen(false);
    setDrawer({ kind: "add-item" });
  }

  function openEditItemForm(item: DisplayedMenuItem) {
    setMobileFiltersOpen(false);
    setDrawer({ kind: "edit-item", item });
  }

  function requestDeleteItem(item: DisplayedMenuItem) {
    const currentItem = allItems.find(
      (entry) => entry.id === item.id,
    );

    if (currentItem) {
      setItemPendingDelete(currentItem);
    }
  }

  function confirmDeleteItem() {
    if (!itemPendingDelete) {
      return;
    }

    const item = allItems.find(
      (entry) => entry.id === itemPendingDelete.id,
    );

    if (!item) {
      setItemPendingDelete(null);

      setLocalNotice(
        "This item is no longer in the local preview.",
      );

      return;
    }

    // Preserve incoming props and hide existing items by their stable IDs.
    setDeletedItemIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });

    // Remove a temporary addition and any saved local edit for the same ID.
    setTemporaryItems((current) =>
      current.filter((entry) => entry.id !== item.id),
    );

    setEditedItems((current) => {
      const next = new Map(current);
      next.delete(item.id);
      return next;
    });

    // Deleting a different item must not discard the form currently being edited.
    setDrawer((current) =>
      current?.kind === "edit-item" &&
      current.item.id === item.id
        ? null
        : current,
    );

    setItemPendingDelete(null);

    setLocalNotice(
      `Deleted “${item.name}” from this local preview.`,
    );
  }

  function handleSaveItem(values: MenuItemFormValues) {
    if (!drawer || drawer.kind === "upload-menu") {
      return;
    }

    const original =
      drawer.kind === "edit-item"
        ? allItems.find(
            (item) => item.id === drawer.item.id,
          )
        : undefined;

    if (drawer.kind === "edit-item" && !original) {
      throw new Error(
        "The menu item is no longer available.",
      );
    }

    // No selected file means keep the existing image, unless explicitly removed.
    let imageUrl = values.removeImage
      ? fallbackImage
      : original?.img || fallbackImage;

    if (values.imageFile) {
      imageUrl = URL.createObjectURL(values.imageFile);
      managedImageUrls.current.add(imageUrl);
    }

    const changedFields = {
      img: imageUrl,
      name: values.name,
      price: values.priceCents / 100,
      description: values.description,
      categories: formCategories.filter((category) =>
        values.categoryIds.includes(category.id),
      ),
    };

    if (original) {
      // Preserve the ID: editing replaces the item rather than adding a duplicate.
      const updatedItem: DisplayedMenuItem = {
        ...original,
        ...changedFields,
      };

      if (
        temporaryItems.some(
          (item) => item.id === original.id,
        )
      ) {
        setTemporaryItems((current) =>
          current.map((item) =>
            item.id === original.id
              ? updatedItem
              : item,
          ),
        );
      } else {
        setEditedItems((current) => {
          const next = new Map(current);
          next.set(original.id, updatedItem);
          return next;
        });
      }

      setLocalNotice(
        `Updated “${values.name}” locally.`,
      );
    } else {
      nextLocalId.current += 1;

      const newItem: DisplayedMenuItem = {
        id: `local-menu-${Date.now()}-${nextLocalId.current}`,
        ...changedFields,
      };

      setTemporaryItems((current) => [
        ...current,
        newItem,
      ]);

      setLocalNotice(
        `Added “${values.name}” locally.`,
      );
    }

    // No API call, database update, or browser storage write occurs here.
    setDrawer(null);
  }

  return (
    <div className="relative flex h-dvh w-full min-w-0 overflow-hidden bg-white">
      {/* Mobile filters overlay: it does not push the menu sideways. */}
      {mobileFiltersOpen && (
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(false)}
          className="absolute inset-0 z-30 bg-black/30 md:hidden"
          aria-label="Close menu filters"
          tabIndex={-1}
        />
      )}

      {/* Overlay on mobile; collapsible sidebar on desktop. */}
      <aside
        id="menu-filter-panel"
        aria-labelledby="menu-filter-heading"
        className={`absolute inset-y-0 left-0 z-40 h-full w-64 max-w-[calc(100%_-_1rem)] flex-col overflow-y-auto overscroll-contain border-r border-[#dbb082] bg-white p-4 shadow-xl md:static md:z-auto md:flex md:max-w-none md:shrink-0 md:shadow-none ${
          mobileFiltersOpen ? "flex" : "hidden"
        } ${
          filtersOpen
            ? "md:w-48 md:p-4"
            : "md:w-10 md:p-2"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2
            id="menu-filter-heading"
            className={`text-base font-semibold ${
              filtersOpen ? "md:block" : "md:sr-only"
            }`}
          >
            Filters
          </h2>

          <button
            ref={mobileFilterCloseRef}
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-gray-100 md:hidden"
            aria-label="Close filters"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() =>
              setFiltersOpen((current) => !current)
            }
            className="hidden cursor-pointer rounded py-1 text-lg font-bold hover:bg-gray-100 md:inline-flex"
            aria-label={
              filtersOpen
                ? "Collapse filters"
                : "Expand filters"
            }
            aria-expanded={filtersOpen}
            aria-controls="menu-filter-controls"
          >
            {filtersOpen ? "←" : "→"}
          </button>
        </div>

        <div
          id="menu-filter-controls"
          className={`space-y-3 ${
            filtersOpen ? "md:block" : "md:hidden"
          }`}
        >
          <div>
            <label
              htmlFor="menu-sort"
              className="mb-1 block text-sm text-gray-600"
            >
              Sort by:
            </label>

            <select
              id="menu-sort"
              name="menuSort"
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as MenuSortOption,
                )
              }
              className="w-full min-w-0 cursor-pointer rounded bg-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
            >
              <option value="name-asc">
                Name A to Z
              </option>

              <option value="name-desc">
                Name Z to A
              </option>

              <option value="price-asc">
                Price Low to High
              </option>

              <option value="price-desc">
                Price High to Low
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setSelectedCategories([])}
            className="cursor-pointer text-xs text-blue-500 hover:underline"
          >
            Clear filters
          </button>

          <div className="space-y-1">
            {categories.map((category) => (
              <label
                key={category.id}
                className="flex min-w-0 cursor-pointer items-start gap-2 py-2 text-sm md:py-1"
              >
                <input
                  type="checkbox"
                  name="menuCategory"
                  value={category.id}
                  checked={selectedCategories.includes(
                    category.id,
                  )}
                  onChange={() =>
                    toggleCategory(category.id)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#b98555]"
                />

                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {category.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Stack toolbar controls when there is not enough room for one row. */}
        <div className="@container/menu-toolbar shrink-0 border-b border-[#dbb082] p-3 sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 @min-[800px]/menu-toolbar:flex-row @min-[800px]/menu-toolbar:items-center">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 @min-[800px]/menu-toolbar:max-w-64 @min-[800px]/menu-toolbar:flex-1">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="shrink-0 cursor-pointer rounded-lg border border-[#dbb082] px-3 py-2 text-sm font-semibold text-[#9b6d43] hover:bg-[#fffaf6] md:hidden"
                aria-controls="menu-filter-panel"
                aria-expanded={mobileFiltersOpen}
              >
                Filters
              </button>

              <input
                ref={searchInputRef}
                id="menu-item-search"
                name="menuItemSearch"
                type="search"
                placeholder="Search menu items..."
                aria-label="Search menu items"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                className="min-w-0 flex-[1_1_12rem] rounded bg-gray-200 px-3 py-2 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-[#FFBDC7]/50"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3 md:@min-[520px]/menu-toolbar:flex-row md:@min-[520px]/menu-toolbar:items-center md:@min-[520px]/menu-toolbar:justify-between @min-[800px]/menu-toolbar:flex-1">
              {/* Mobile: full-width toggle below search and above the action buttons. */}
              <div className="w-full min-w-0 md:w-auto">
                {/* CSS selects the correct default without reading window during rendering. */}
                <div className="md:hidden">
                  <AdminViewToggle
                    value={viewMode ?? "grid"}
                    options={menuViewOptions}
                    onChange={setViewMode}
                    ariaLabel="Menu view"
                    className="max-w-full [&>button]:flex-wrap [&>button>span:last-child]:min-w-0 [&>button>span:last-child]:shrink [&>button>span:last-child]:whitespace-normal"
                  />
                </div>

                {/* Desktop: keep the existing compact toggle and toolbar layout. */}
                <div className="hidden md:block">
                  <AdminViewToggle
                    value={viewMode ?? "list"}
                    options={menuViewOptions}
                    onChange={setViewMode}
                    ariaLabel="Menu view"
                    className="max-w-full @max-[260px]/menu-toolbar:flex-col @max-[260px]/menu-toolbar:[&>button]:w-full @max-[260px]/menu-toolbar:[&>button]:flex-wrap @max-[260px]/menu-toolbar:[&>button>span:last-child]:max-w-full @max-[260px]/menu-toolbar:[&>button>span:last-child]:whitespace-normal"
                  />
                </div>
              </div>

              <div className="grid w-full min-w-0 grid-cols-1 gap-2 @min-[260px]/menu-toolbar:grid-cols-2 md:@min-[520px]/menu-toolbar:ml-auto md:@min-[520px]/menu-toolbar:flex md:@min-[520px]/menu-toolbar:w-auto md:@min-[520px]/menu-toolbar:shrink-0">
                <button
                  type="button"
                  onClick={openAddItemForm}
                  className="min-w-0 cursor-pointer rounded-lg bg-[#dbb082] px-4 py-2 text-center font-bold text-white hover:bg-[#c99d70] [overflow-wrap:anywhere]"
                >
                  Add Item
                </button>

                <button
                  type="button"
                  onClick={openUploadForm}
                  className="min-w-0 cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-center font-bold text-white hover:bg-[#F59AA3] [overflow-wrap:anywhere]"
                >
                  Upload Menu
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {localNotice && (
            <div className="m-3 rounded-lg border border-[#dbb082]/60 bg-[#fffaf6] p-3 text-sm text-gray-700 sm:m-4">
              <p
                role="status"
                className="[overflow-wrap:anywhere]"
              >
                {localNotice} Additions, edits, and deletions only affect
                this page. Square and the database are unchanged.
                Reloading restores saved menu items and discards
                temporary additions and edits.
              </p>

              {(search ||
                selectedCategories.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedCategories([]);
                  }}
                  className="mt-2 cursor-pointer text-blue-500 hover:underline"
                >
                  Clear search and filters to show all items
                </button>
              )}
            </div>
          )}

          <ListView
            items={filteredItems}
            viewMode={viewMode ?? "responsive"}
            onEdit={openEditItemForm}
            onDelete={requestDeleteItem}
          />
        </div>
      </section>

      {/* Unmount the closed form so hidden controls cannot receive focus. */}
      {drawer && (
        <div
          ref={drawerContainerRef}
          className="contents"
        >
          <AdminForm
            key={
              editingItem
                ? `edit-${editingItem.id}`
                : drawer.kind
            }
            isOpen
            onClose={() => setDrawer(null)}
            mobileFullscreen
          >
            {drawer.kind !== "upload-menu" ? (
              <MenuItemForm
                initialItem={
                  editingItem
                    ? {
                        name: editingItem.name,
                        description: editingItem.description,
                        priceCents: Math.round(
                          editingItem.price * 100,
                        ),
                        categoryIds: editingItem.categories.map(
                          (category) => category.id,
                        ),
                        imageUrl: editingItem.img,
                      }
                    : null
                }
                categories={formCategories}
                onCancel={() => setDrawer(null)}
                onSave={handleSaveItem}
              />
            ) : (
              <form
                className="flex min-h-full w-full min-w-0 flex-col gap-4 pt-4"
                aria-labelledby="menu-upload-heading"
                onSubmit={(event) => {
                  event.preventDefault();

                  // Placeholder: No upload request is sent.
                  console.log("upload logic here");
                }}
              >
                <h2
                  id="menu-upload-heading"
                  className="mb-2 px-8 text-center text-xl font-semibold [overflow-wrap:anywhere]"
                >
                  Upload Menu
                </h2>

                <div className="min-w-0">
                  <label
                    htmlFor="menu-upload-file"
                    className="mb-2 block text-sm text-gray-700"
                  >
                    Menu file
                  </label>

                  <input
                    ref={fileInputRef}
                    id="menu-upload-file"
                    name="menuUploadFile"
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(event) =>
                      setUploadFileName(
                        event.target.files?.[0]?.name ?? "",
                      )
                    }
                    className="hidden"
                  />

                  <div className="min-w-0 rounded border border-[#dbb082] bg-gray-200 p-3">
                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      className="w-full cursor-pointer rounded bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
                    >
                      Choose File
                    </button>

                    <p
                      aria-live="polite"
                      className="mt-2 text-sm text-gray-700 [overflow-wrap:anywhere]"
                    >
                      {uploadFileName || "No file chosen"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setDrawer(null)}
                    className="min-w-0 cursor-pointer rounded bg-gray-400 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-500"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="min-w-0 cursor-pointer rounded bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
                  >
                    Upload
                  </button>
                </div>
              </form>
            )}
          </AdminForm>
        </div>
      )}

      {itemPendingDelete && (
        <DeleteMenuItemDialog
          key={itemPendingDelete.id}
          itemName={itemPendingDelete.name}
          onCancel={() => setItemPendingDelete(null)}
          onConfirm={confirmDeleteItem}
          fallbackFocusRef={searchInputRef}
        />
      )}
    </div>
  );
}