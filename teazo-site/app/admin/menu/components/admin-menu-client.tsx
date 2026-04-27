"use client";

import { useMemo, useState } from "react";
import { ItemCategory } from "@/app/types/menu-item";
import ListView from "@/app/admin/components/admin-list-view";
import AdminForm from "@/app/admin/components/admin-form-page";

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

export default function AdminMenuClient({
  items,
  categories,
}: {
  items: DisplayedMenuItem[];
  categories: Category[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<
    "name-asc" | "name-desc" |
    "price-asc" | "price-desc"
  >("name-asc");

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [open, setOpen] = useState(false);

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id)
        : [...prev, id]
    );
  }

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesCategory =
        selectedCategories.length === 0 ||
        item.categories.some((category) =>
          selectedCategories.includes(category.id)
        );

      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        default:
          return 0;
      }
    });
  }, [items, search, selectedCategories, sortBy]);

  return (
    <div className="flex w-full h-screen min-w-0">
      {/* filters */}
      <div
        className={`shrink-0 h-full border-r border-[#dbb082] bg-white transition-all duration-300 overflow-y-auto ${
          filtersOpen ? "w-48 p-4" : "w-10 p-2"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          {filtersOpen && <h3 className="font-semibold text-base">Filters</h3>}

          <button
            onClick={() => setFiltersOpen((prev) => !prev)}
            className="text-lg font-bold cursor-pointer pr-2 py-1 rounded hover:bg-gray-100"
            aria-label="Toggle filters"
          >
            {filtersOpen ? "←" : "→"}
          </button>
        </div>

        {filtersOpen && (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | "name-asc"
                      | "name-desc"
                      | "price-asc"
                      | "price-desc"
                  )
                }
                className="bg-gray-200 rounded px-3 py-2 text-sm w-full"
              >
                <option value="name-asc">Name A to Z</option>
                <option value="name-desc">Name Z to A</option>
                <option value="price-asc">Price Low to High</option>
                <option value="price-desc">Price High to Low</option>
              </select>
            </div>

            <button
              onClick={() => setSelectedCategories([])}
              className="text-xs text-blue-500 hover:underline"
            >
              Clear filters
            </button>

            <div className="space-y-1">
              {categories.map((category) => {
                const checked = selectedCategories.includes(category.id);

                return (
                  <label
                    key={category.id}
                    className="flex items-center gap-2 pb-1 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="accent-[#b98555] scale-125"
                      checked={checked}
                      onChange={() => toggleCategory(category.id)}
                    />
                    {category.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* main content */}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        <div className="pl-4 pr-4 pt-4 pb-4 flex items-center justify-between shrink-0 border-b border-[#dbb082]">
          <input
            type="search"
            placeholder="Search menu items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-200 rounded px-3 py-2 w-64"
          />

          <div className="flex gap-2 shrink-0">
            {/* probably needs some adjustments sooner or later */}
            <button className="shrink-0 rounded-lg px-4 py-2">
              Add Item
            </button>

            <button
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-lg font-bold bg-[#FFBDC7] px-4 py-2 text-white cursor-pointer hover:bg-[#F59AA3] whitespace-nowrap"
            >
              Upload Menu
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <ListView items={filteredItems} />
        </div>
      </div>

      {/* right drawer */}
      <AdminForm isOpen={open} onClose={() => setOpen(false)}>
        <h2 className="mb-4 text-xl text-center font-semibold">Upload Menu</h2>

        <form 
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            console.log("upload logic here");
          }}
        >
          <input
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.pdf"
            className="rounded bg-gray-200 p-2"
          />

          <button className="mt-2 rounded bg-[#FFBDC7] p-2 text-white hover:bg-[#F59AA3]">
            Upload
          </button>
        </form>
      </AdminForm>
    </div>
  );
}