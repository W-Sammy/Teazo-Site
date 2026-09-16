"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemCategory } from "@/app/types/menu-item";
import ListView from "@/app/admin/components/admin-list-view";
import AdminForm from "@/app/admin/components/admin-form-page";
import AdminViewToggle, {
  GridViewIcon,
  ListViewIcon,
  type AdminViewOption,
} from "@/app/admin/components/admin-view-toggle";

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

type AdminMenuClientProps = {
  items: DisplayedMenuItem[];
  categories: Category[];
};

const menuViewOptions: readonly AdminViewOption<MenuViewMode>[] = [
  { value: "grid", label: "Card View", icon: <GridViewIcon /> },
  { value: "list", label: "List View", icon: <ListViewIcon /> },
];

export default function AdminMenuClient({
  items,
  categories,
}: AdminMenuClientProps) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<MenuSortOption>("name-asc");

  // Desktop starts in List View. Mobile defaults to cards.
  const [viewMode, setViewMode] = useState<MenuViewMode>("list");

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");

  const mobileFilterCloseRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!mobileFiltersOpen && !open) {
      return;
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (mobileFiltersOpen) {
      mobileFilterCloseRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setMobileFiltersOpen(false);
      setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [mobileFiltersOpen, open]);

  function toggleCategory(id: string) {
    setSelectedCategories((current) =>
      current.includes(id)
        ? current.filter((categoryId) => categoryId !== id)
        : [...current, id],
    );
  }

  const filteredItems = useMemo(() => {
    const query = search.toLowerCase();

    const filtered = items.filter((item) => {
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
  }, [items, search, selectedCategories, sortBy]);

  function openUploadForm() {
    setMobileFiltersOpen(false);
    setUploadFileName("");
    setOpen(true);
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
        } ${filtersOpen ? "md:w-48 md:p-4" : "md:w-10 md:p-2"}`}
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
            onClick={() => setFiltersOpen((current) => !current)}
            className="hidden cursor-pointer rounded py-1 text-lg font-bold hover:bg-gray-100 md:inline-flex"
            aria-label={filtersOpen ? "Collapse filters" : "Expand filters"}
            aria-expanded={filtersOpen}
            aria-controls="menu-filter-controls"
          >
            {filtersOpen ? "←" : "→"}
          </button>
        </div>

        <div
          id="menu-filter-controls"
          className={`space-y-3 ${filtersOpen ? "md:block" : "md:hidden"}`}
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
                setSortBy(event.target.value as MenuSortOption)
              }
              className="w-full min-w-0 cursor-pointer rounded bg-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
            >
              <option value="name-asc">Name A to Z</option>
              <option value="name-desc">Name Z to A</option>
              <option value="price-asc">Price Low to High</option>
              <option value="price-desc">Price High to Low</option>
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
                  checked={selectedCategories.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
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
        {/* Use two toolbar rows when the menu area is too narrow for one. */}
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
                id="menu-item-search"
                name="menuItemSearch"
                type="search"
                placeholder="Search menu items..."
                aria-label="Search menu items"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-[1_1_12rem] rounded bg-gray-200 px-3 py-2 text-base text-gray-900 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-[#FFBDC7]/50"
              />
            </div>

            <div className="flex min-w-0 flex-col gap-3 @min-[520px]/menu-toolbar:flex-row @min-[520px]/menu-toolbar:items-center @min-[520px]/menu-toolbar:justify-between @min-[800px]/menu-toolbar:flex-1">
              {/* Keep the existing mobile toolbar and cards unchanged. */}
              <div className="hidden min-w-0 md:block">
                <AdminViewToggle
                  value={viewMode}
                  options={menuViewOptions}
                  onChange={setViewMode}
                  ariaLabel="Menu view"
                  className="max-w-full @max-[260px]/menu-toolbar:flex-col @max-[260px]/menu-toolbar:[&>button]:w-full @max-[260px]/menu-toolbar:[&>button]:flex-wrap @max-[260px]/menu-toolbar:[&>button>span:last-child]:max-w-full @max-[260px]/menu-toolbar:[&>button>span:last-child]:whitespace-normal"
                />
              </div>

              <div className="grid w-full min-w-0 grid-cols-1 gap-2 @min-[260px]/menu-toolbar:grid-cols-2 @min-[520px]/menu-toolbar:ml-auto @min-[520px]/menu-toolbar:flex @min-[520px]/menu-toolbar:w-auto @min-[520px]/menu-toolbar:shrink-0">
                {/* Placeholder: no Add Item handler has been added. */}
                <button
                  type="button"
                  className="min-w-0 cursor-pointer rounded-lg px-4 py-2 text-center [overflow-wrap:anywhere]"
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
          <ListView items={filteredItems} viewMode={viewMode} />
        </div>
      </section>

      {/* Unmount the closed form so hidden controls cannot receive focus. */}
      {open && (
        <AdminForm
          isOpen={open}
          onClose={() => setOpen(false)}
          mobileFullscreen
        >
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
                  setUploadFileName(event.target.files?.[0]?.name ?? "")
                }
                className="hidden"
              />

              <div className="min-w-0 rounded border border-[#dbb082] bg-gray-200 p-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
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
                onClick={() => setOpen(false)}
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
        </AdminForm>
      )}
    </div>
  );
}