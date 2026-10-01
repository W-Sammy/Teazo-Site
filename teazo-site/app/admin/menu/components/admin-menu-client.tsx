"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { ItemCategory, MenuItem } from "@/app/types/menu-item";
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
import {
  CURRENT_MENU_PDF_URL,
  getMenuFileError,
  isMenuUploadResponse,
  MENU_PDF_SIZE_LABEL,
} from "@/app/lib/menu-upload";

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
  canUploadMenu: boolean;
};

const fallbackImage = "/TEAZO_logo.svg";

// Validate only the response fields this page uses before displaying a saved item.
type SavedMenuItem = Pick<
  MenuItem,
  | "catalogObjectId"
  | "name"
  | "description"
  | "priceCents"
  | "currency"
  | "imageUrl"
  | "categories"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSavedMenuItem(value: unknown): value is SavedMenuItem {
  return (
    isRecord(value) &&
    typeof value.catalogObjectId === "string" &&
    value.catalogObjectId.trim().length > 0 &&
    (value.name == null || typeof value.name === "string") &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.priceCents === "number" &&
    Number.isSafeInteger(value.priceCents) &&
    value.priceCents >= 0 &&
    value.currency === "USD" &&
    (value.imageUrl === null || typeof value.imageUrl === "string") &&
    Array.isArray(value.categories) &&
    value.categories.every(
      (category) =>
        isRecord(category) &&
        typeof category.id === "string" &&
        category.id.trim().length > 0 &&
        (category.name === null || typeof category.name === "string"),
    )
  );
}

// A failed response may arrive after Square saved the item. Do not retry silently.
const unconfirmedCreateMessage =
  "The item creation could not be confirmed. Reload the menu and check for the item before trying again to avoid adding a duplicate.";

function getCreateErrorMessage(status: number, result: unknown): string {
  if (status === 401) {
    return "Your session has expired. Sign in again before adding an item.";
  }

  if (status === 403) {
    return "You do not have permission to add an item, or the request origin was rejected. Sign in with Owner or Can Edit access from the Teazo admin page.";
  }

  if (status === 400) {
    return isRecord(result) && typeof result.error === "string"
      ? result.error
      : "The item contains invalid data. Check the fields and try again.";
  }

  return unconfirmedCreateMessage;
}

// A failed update response does not prove that the saved item is unchanged.
const unconfirmedUpdateMessage =
  "The item update could not be confirmed. Reload the menu and check the item before trying again.";

function getUpdateErrorMessage(status: number, result: unknown): string {
  const message =
    isRecord(result) &&
    typeof result.error === "string" &&
    result.error.trim()
      ? result.error
      : null;

  if (status === 401) {
    return "Your session has expired. Sign in again before saving changes.";
  }

  if (status === 403) {
    return "You do not have permission to edit an item, or the request origin was rejected. Sign in with Owner or Can Edit access from the Teazo admin page.";
  }

  if (status === 404) {
    return "This item is no longer available in Square. Reload the menu before continuing.";
  }

  if (status === 409) {
    return message ?? "This item changed while it was being saved. Reload the menu and try again.";
  }

  if (status === 400) {
    return message ?? "The item contains invalid data. Check the fields and try again.";
  }

  // Our PUT route returns safe messages, including saved-but-reload-failed cases.
  if (status === 500 || status === 502 || status === 503) {
    return message ?? unconfirmedUpdateMessage;
  }

  return unconfirmedUpdateMessage;
}

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
  canUploadMenu,
}: AdminMenuClientProps) {
  const [search, setSearch] = useState("");

  const [selectedCategories, setSelectedCategories] =
    useState<string[]>([]);

  const [sortBy, setSortBy] =
    useState<MenuSortOption>("name-asc");

  // Start in List View on both mobile and desktop.
  // Users can switch views without their choice changing on resize.
  const [viewMode, setViewMode] =
    useState<MenuViewMode>("list");

  const [filtersOpen, setFiltersOpen] = useState(true);

  const [mobileFiltersOpen, setMobileFiltersOpen] =
    useState(false);

  // Keep newly created Square items visible until the server-provided list reloads.
  const [createdItems, setCreatedItems] =
    useState<DisplayedMenuItem[]>([]);

  // Cache confirmed Square edits without mutating the incoming props.
  // Any selected replacement image remains a local preview only.
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
  const [itemSaveError, setItemSaveError] = useState("");
  const [itemSaveSuccess, setItemSaveSuccess] = useState("");
  const [isSavingItem, setIsSavingItem] = useState(false);
  const itemSavePendingRef = useRef(false);
  const [drawer, setDrawer] = useState<MenuDrawer>(null);
  // PDF uploads persist; keep their feedback separate from item saves.
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const uploadPendingRef = useRef(false);

  const mobileFilterCloseRef =
    useRef<HTMLButtonElement | null>(null);

  const searchInputRef =
    useRef<HTMLInputElement | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  const drawerContainerRef =
    useRef<HTMLDivElement | null>(null);

  const managedImageUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = managedImageUrls.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const allItems = useMemo(() => {
    // Avoid duplicate rows if a server refresh includes an item just created here.
    const byId = new Map(items.map((item) => [item.id, item]));

    createdItems.forEach((item) => {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    });

    return Array.from(byId.values())
      .map((item) => editedItems.get(item.id) ?? item)
      .filter((item) => !deletedItemIds.has(item.id));
  }, [items, editedItems, createdItems, deletedItemIds]);

  // Count category membership across the full current collection, not filtered results.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    allItems.forEach((item) => {
      // Count an item only once per category, even if its category ID is repeated.
      const itemCategoryIds = new Set(
        item.categories.map((category) => category.id),
      );

      itemCategoryIds.forEach((categoryId) => {
        counts.set(
          categoryId,
          (counts.get(categoryId) ?? 0) + 1,
        );
      });
    });

    return counts;
  }, [allItems]);

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
      ...createdItems.map((item) => item.img),
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
    createdItems,
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

      // Do not dismiss a form while its PDF upload or item save is pending.
      if (uploadPendingRef.current || itemSavePendingRef.current) {
        event.preventDefault();
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
    if (
      !canUploadMenu ||
      uploadPendingRef.current ||
      itemSavePendingRef.current
    ) return;
    setMobileFiltersOpen(false);
    setUploadFile(null);
    setUploadError("");
    setUploadSuccess("");
    setDrawer({ kind: "upload-menu" });
  }

  function closeDrawer() {
    if (uploadPendingRef.current || itemSavePendingRef.current) return;
    setDrawer(null);
    setItemSaveError("");
  }

  async function handleMenuUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadPendingRef.current || itemSavePendingRef.current) return;

    if (!canUploadMenu) {
      setUploadError("Owner or Can Edit access is required to upload a menu.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Please choose a PDF first.");
      return;
    }
    const fileError = getMenuFileError(uploadFile);
    if (fileError) {
      setUploadError(fileError);
      return;
    }

    uploadPendingRef.current = true;
    setIsUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const form = new FormData();
      form.append("file", uploadFile);

      // Do not set Content-Type manually; the browser adds the multipart boundary.
      const response = await fetch("/api/admin/menu/upload", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const result: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message = result && typeof result === "object" &&
          "error" in result && typeof result.error === "string"
          ? result.error
          : response.status === 413
            ? `The PDF must be ${MENU_PDF_SIZE_LABEL} or smaller.`
            : "The upload could not be confirmed. Check the public menu before retrying.";
        throw new Error(message);
      }
      if (!isMenuUploadResponse(result)) {
        throw new Error("The server returned an unexpected response. Check the public menu before retrying.");
      }

      setUploadSuccess(`“${uploadFile.name}” was uploaded and published as the PDF menu.`);
      setUploadFile(null);
      setDrawer(null);
    } catch (error) {
      setUploadError(error instanceof Error && !(error instanceof TypeError)
        ? error.message
        : "The upload could not be confirmed. Check the public menu before retrying.");
    } finally {
      uploadPendingRef.current = false;
      setIsUploading(false);
    }
  }

  function openAddItemForm() {
    // Item creation and PDF uploads currently use the same Owner/Can Edit roles.
    if (
      !canUploadMenu ||
      uploadPendingRef.current ||
      itemSavePendingRef.current
    ) return;
    setMobileFiltersOpen(false);
    setItemSaveError("");
    setItemSaveSuccess("");
    setDrawer({ kind: "add-item" });
  }

  function openEditItemForm(item: DisplayedMenuItem) {
    if (uploadPendingRef.current || itemSavePendingRef.current) return;
    setMobileFiltersOpen(false);
    setItemSaveError("");
    setDrawer({ kind: "edit-item", item });
  }

  function requestDeleteItem(item: DisplayedMenuItem) {
    if (uploadPendingRef.current || itemSavePendingRef.current) return;
    const currentItem = allItems.find(
      (entry) => entry.id === item.id,
    );

    if (currentItem) {
      setItemPendingDelete(currentItem);
    }
  }

  function confirmDeleteItem() {
    if (uploadPendingRef.current || itemSavePendingRef.current) return;
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

    // Remove the page's cached addition/edit, not the saved Square item.
    setCreatedItems((current) =>
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
    setItemSaveSuccess("");

    setLocalNotice(
      `Deleted “${item.name}” from this local preview.`,
    );
  }

  async function handleSaveItem(values: MenuItemFormValues): Promise<void> {
    if (
      !drawer ||
      drawer.kind === "upload-menu" ||
      uploadPendingRef.current ||
      itemSavePendingRef.current
    ) return;

    setItemSaveError("");

    // TZ-170: save edits through the protected PUT endpoint before changing the row.
    if (drawer.kind === "edit-item") {
      if (!canUploadMenu) {
        setItemSaveError("Owner or Can Edit access is required to edit a menu item.");
        return;
      }

      const original = allItems.find((item) => item.id === drawer.item.id);

      if (!original) {
        setItemSaveError("The menu item is no longer available. Reload the menu.");
        return;
      }

      // Capture the ID and lock this form immediately, before the next render.
      const itemId = original.id;
      itemSavePendingRef.current = true;
      setIsSavingItem(true);
      setItemSaveSuccess("");
      setLocalNotice("");

      try {
        const response = await fetch(
          `/api/square/products/${encodeURIComponent(itemId)}`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: values.name,
              description: values.description,
              priceCents: values.priceCents,
              categoryIds: values.categoryIds,
              // Omit currency, modifier lists, and images to preserve their saved settings.
            }),
          },
        );

        const result: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          setItemSaveError(getUpdateErrorMessage(response.status, result));
          return;
        }

        if (!isSavedMenuItem(result) || result.catalogObjectId !== itemId) {
          setItemSaveError(unconfirmedUpdateMessage);
          return;
        }

        /*
         * The route preserves Square's image IDs. Replacement/removal controls
         * affect the local preview only until TZ-171 is connected.
         */
        let imageUrl = result.imageUrl?.trim() || fallbackImage;
        let imageNotice = "";

        if (values.imageFile) {
          try {
            imageUrl = URL.createObjectURL(values.imageFile);
            managedImageUrls.current.add(imageUrl);
            imageNotice = " The selected image is a local preview only; the saved Square image was not changed.";
          } catch {
            // An image-preview failure must not turn a confirmed edit into a failed save.
            imageNotice = " The item was saved, but the replacement image preview could not be displayed. The saved Square image was not changed.";
          }
        } else if (values.removeImage) {
          imageUrl = fallbackImage;
          imageNotice = " The image was removed from this local preview only; the saved Square image was not changed.";
        } else if (managedImageUrls.current.has(original.img)) {
          // Retain an existing session-only preview without claiming it was uploaded.
          imageUrl = original.img;
          imageNotice = " The image shown is still a local preview and will not persist after a reload.";
        }

        const updatedItem: DisplayedMenuItem = {
          id: result.catalogObjectId,
          img: imageUrl,
          name: result.name?.trim() || "Unnamed item",
          price: result.priceCents / 100,
          description: result.description ?? "",
          // Use returned membership, even if Square returns an empty category list.
          categories: result.categories.map((category) => ({
            id: category.id,
            name:
              category.name ??
              formCategories.find((option) => option.id === category.id)?.name ??
              "Unnamed category",
          })),
        };

        // Replace the same ID; editing must never append a second row.
        setEditedItems((current) => {
          const next = new Map(current);
          next.set(itemId, updatedItem);
          return next;
        });
        setCreatedItems((current) =>
          current.map((item) => item.id === itemId ? updatedItem : item),
        );

        setItemSaveSuccess(`Updated “${updatedItem.name}” in Square.${imageNotice}`);
        setDrawer(null);
      } catch {
        // Keep the form and original row intact when the update cannot be confirmed.
        setItemSaveError(unconfirmedUpdateMessage);
      } finally {
        itemSavePendingRef.current = false;
        setIsSavingItem(false);
      }

      return;
    }

    if (!canUploadMenu) {
      setItemSaveError("Owner or Can Edit access is required to add a menu item.");
      return;
    }

    // A ref blocks duplicate submissions immediately, before the next render.
    itemSavePendingRef.current = true;
    setIsSavingItem(true);
    setItemSaveSuccess("");
    setLocalNotice("");

    try {
      const response = await fetch("/api/square/products", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          description: values.description,
          priceCents: values.priceCents,
          currency: "USD",
          categoryIds: values.categoryIds,
          modifierListIds: values.modifierListIds,
        }),
      });

      const result: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setItemSaveError(getCreateErrorMessage(response.status, result));
        return;
      }

      if (!isSavedMenuItem(result)) {
        setItemSaveError(unconfirmedCreateMessage);
        return;
      }

      /*
       * TZ-171 image upload is not connected yet.
       * A selected image is only a local preview; the returned item data is saved.
       */
      let imageUrl = result.imageUrl?.trim() || fallbackImage;
      let imageNotice = "";

      if (values.imageFile) {
        try {
          imageUrl = URL.createObjectURL(values.imageFile);
          managedImageUrls.current.add(imageUrl);
          imageNotice = " The selected image is a local preview only and will not persist after a reload.";
        } catch {
          // Preview failure must not report a successfully created Square item as failed.
          imageNotice = " The item was saved, but its local image preview could not be displayed.";
        }
      }

      const newItem: DisplayedMenuItem = {
        id: result.catalogObjectId,
        img: imageUrl,
        name: result.name?.trim() || "Unnamed item",
        price: result.priceCents / 100,
        description: result.description ?? "",
        // Keep returned category membership; only fill in missing display labels.
        categories: result.categories.map((category) => ({
          id: category.id,
          name:
            category.name ??
            formCategories.find((option) => option.id === category.id)?.name ??
            "Unnamed category",
        })),
      };

      setCreatedItems((current) => [
        ...current.filter((item) => item.id !== newItem.id),
        newItem,
      ]);
      setItemSaveSuccess(`Added “${newItem.name}” to Square.${imageNotice}`);
      setDrawer(null);
    } catch {
      // A network failure does not prove that Square rejected the creation.
      setItemSaveError(unconfirmedCreateMessage);
    } finally {
      itemSavePendingRef.current = false;
      setIsSavingItem(false);
    }
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

                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {category.name}
                </span>

                <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs tabular-nums text-gray-400">
                  ({categoryCounts.get(category.id) ?? 0})
                </span>
              </label>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Keep mobile sizing; match Gallery controls on desktop and stack when space is limited. */}
        <div className="@container/menu-toolbar shrink-0 border-b border-[#dbb082] p-3 sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 @min-[800px]/menu-toolbar:flex-row @min-[800px]/menu-toolbar:items-center">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:max-w-64 @min-[800px]/menu-toolbar:max-w-64 @min-[800px]/menu-toolbar:flex-1">
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
                className="min-w-0 flex-[1_1_12rem] rounded bg-gray-200 px-3 py-2 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3 md:@min-[520px]/menu-toolbar:flex-row md:@min-[520px]/menu-toolbar:items-center md:@min-[520px]/menu-toolbar:justify-between @min-[800px]/menu-toolbar:flex-1">
              {/* Mobile: full-width toggle below search and above the action buttons. */}
              <div className="w-full min-w-0 md:w-auto">
                {/* Both layouts share the same List View default and manual selection. */}
                <div className="md:hidden">
                  <AdminViewToggle
                    value={viewMode}
                    options={menuViewOptions}
                    onChange={setViewMode}
                    ariaLabel="Menu view"
                    className="max-w-full [&>button]:flex-wrap [&>button>span:last-child]:min-w-0 [&>button>span:last-child]:shrink [&>button>span:last-child]:whitespace-normal"
                  />
                </div>

                {/* A flex wrapper avoids extra baseline space below the desktop toggle. */}
                <div className="hidden md:flex">
                  <AdminViewToggle
                    value={viewMode}
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
                  disabled={!canUploadMenu || isUploading || isSavingItem}
                  title={canUploadMenu ? "Add a menu item" : "Owner or Can Edit access is required"}
                  className="min-w-0 cursor-pointer rounded-lg bg-[#dbb082] px-4 py-2 text-center font-bold text-white hover:bg-[#c99d70] disabled:cursor-not-allowed disabled:opacity-50 [overflow-wrap:anywhere] md:inline-flex md:items-center md:justify-center md:text-sm"
                >
                  Add Item
                </button>

                <button
                  type="button"
                  onClick={openUploadForm}
                  disabled={!canUploadMenu || isUploading || isSavingItem}
                  title={canUploadMenu ? "Upload a PDF menu" : "Owner or Can Edit access is required"}
                  className="min-w-0 cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-center font-bold text-white hover:bg-[#F59AA3] disabled:cursor-not-allowed disabled:opacity-50 [overflow-wrap:anywhere] md:inline-flex md:items-center md:justify-center md:text-sm"
                >
                  Upload Menu
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          {/* Count matching items in either view, including new items and local changes. */}
          {/* ListView supplies the gap below; offset its extra desktop padding by one spacing unit. */}
          <div className="flex items-center justify-between gap-3 px-3 pt-3 text-sm text-gray-500 sm:-mb-1 sm:px-4 sm:pt-4">
            <span role="status" aria-live="polite" aria-atomic="true">
              {filteredItems.length}{" "}
              {filteredItems.length === 1 ? "item" : "items"}
            </span>
          </div>

          {uploadSuccess && (
            <div className="m-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 sm:m-4">
              <p role="status" className="[overflow-wrap:anywhere]">{uploadSuccess}</p>
              <a
                href={CURRENT_MENU_PDF_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-semibold underline"
              >
                Open uploaded PDF
              </a>
            </div>
          )}

          {itemSaveSuccess && (
            <div className="m-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 sm:m-4">
              <p role="status" className="[overflow-wrap:anywhere]">{itemSaveSuccess}</p>
              {(search || selectedCategories.length > 0) && (
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

          {localNotice && (
            <div className="m-3 rounded-lg border border-[#dbb082]/60 bg-[#fffaf6] p-3 text-sm text-gray-700 sm:m-4">
              <p
                role="status"
                className="[overflow-wrap:anywhere]"
              >
                {localNotice} Deletion still only affects this page; it does
                not remove the item from Square. Reloading restores locally
                hidden items. Item additions and text/price/category edits are
                saved to Square; image-preview changes are not.
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
            viewMode={viewMode}
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
            onClose={closeDrawer}
            closeDisabled={isUploading || isSavingItem}
            mobileFullscreen
          >
            {drawer.kind !== "upload-menu" ? (
              <>
                <p className="mb-3 rounded-lg border border-[#dbb082]/60 bg-[#fffaf6] p-3 text-sm text-gray-700">
                  {drawer.kind === "edit-item"
                    ? "Name, price, description, and category changes are saved to Square. Replacing or removing an image only changes this page's preview; the saved Square image stays unchanged."
                    : "New items are saved to Square. Image upload is not connected yet, so a selected image is only a preview for this page."}
                </p>

                {itemSaveError && (
                  <div
                    role="alert"
                    className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]"
                  >
                    {itemSaveError}
                  </div>
                )}

                {isSavingItem && (
                  <p role="status" className="mb-3 text-sm text-gray-600">
                    {drawer.kind === "edit-item"
                      ? "Saving changes to Square. Please keep this page open."
                      : "Adding the item to Square. Please keep this page open."}
                  </p>
                )}

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
                  onCancel={closeDrawer}
                  onSave={handleSaveItem}
                  isSaving={isSavingItem}
                />
              </>
            ) : (
              <form
                className="flex min-h-full w-full min-w-0 flex-col gap-4 pt-4"
                aria-labelledby="menu-upload-heading"
                aria-busy={isUploading}
                onSubmit={handleMenuUpload}
              >
                <h2
                  id="menu-upload-heading"
                  className="mb-2 px-8 text-center text-xl font-semibold [overflow-wrap:anywhere]"
                >
                  Upload Menu
                </h2>

                <p id="menu-upload-help" className="text-sm text-gray-600">
                  Choose a PDF of {MENU_PDF_SIZE_LABEL} or less. A successful upload
                  replaces the public PDF menu, not the individual Square items.
                </p>
                {uploadError && (
                  <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 [overflow-wrap:anywhere]">
                    {uploadError}
                  </p>
                )}

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
                    accept="application/pdf,.pdf"
                    disabled={isUploading}
                    aria-describedby="menu-upload-help"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setUploadFile(file);
                      setUploadError(file ? getMenuFileError(file) ?? "" : "");
                    }}
                    className="hidden"
                  />

                  <div className="min-w-0 rounded border border-[#dbb082] bg-gray-200 p-3">
                    <button
                      type="button"
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      disabled={isUploading}
                      className="w-full cursor-pointer rounded bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Choose File
                    </button>

                    <p
                      aria-live="polite"
                      className="mt-2 text-sm text-gray-700 [overflow-wrap:anywhere]"
                    >
                      {uploadFile?.name || "No file chosen"}
                    </p>
                  </div>
                </div>

                {isUploading && (
                  <p role="status" className="text-sm text-gray-600">
                    Uploading and publishing the menu. Please keep this page open.
                  </p>
                )}

                <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                  <button
                    type="button"
                    onClick={closeDrawer}
                    disabled={isUploading}
                    className="min-w-0 cursor-pointer rounded bg-gray-400 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isUploading || !canUploadMenu || !uploadFile || !!getMenuFileError(uploadFile)}
                    className="min-w-0 cursor-pointer rounded bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? "Uploading…" : "Upload"}
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
