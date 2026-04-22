"use client";

import { useMemo, useState } from "react";
import ListView from "@/app/admin/components/admin-list-view";

type DisplayedMenuItem = {
  id: string;
  img: string;
  name: string;
  price: number;
  description: string;
  category_id: string;
  category_name: string;
};

type Category = {
  id: string;
  name: string;
};

//adds section for filters.
//filters are dynamically created based on category
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
    "category-asc" | "category-desc" |
    "price-asc" | "price-desc"
  >("name-asc");

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id) // remove
        : [...prev, id] // add
    );
  }

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      //filters based on the selected categories
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(item.category_id);
      
      //for the search bar
      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });

    // sortin filterdd values
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "category-asc":
          return a.category_name.localeCompare(b.category_name);
        case "category-desc":
          return b.category_name.localeCompare(a.category_name);
        case "price-asc":
          return a.price - b.price;
        case "price-desc":
          return b.price - a.price;
        default:
          return 0;
      }
    });

    return sorted;
  }, [items, search, selectedCategories, sortBy]);

  return (
    <div className="flex">
      
      {/* menu sidebar*/}
      <div className="w-48 fixed top-0 pt-8 pr-4 pl-2 h-screen space-y-2 border-[#dbb082] border-r overflow-y-auto">
        
        <h3 className="font-semibold text-base mb-2">Filters</h3>

        {/* sorting section */}
        <div className="pt-2">
          <label className="text-sm text-gray-600">
            Sort by:
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as
                    | "name-asc"
                    | "name-desc"
                    | "category-asc"
                    | "category-desc"
                    | "price-asc"
                    | "price-desc"
                )
              }
              className="bg-gray-200 rounded px-3 py-2 text-sm"
            >
              <option value="name-asc">Name A to Z</option>
              <option value="name-desc">Name Z to A</option>
              <option value="category-asc">Category A to Z</option>
              <option value="category-desc">Category Z to A</option>
              <option value="price-asc">Price Low to High</option>
              <option value="price-desc">Price High to Low</option>
            </select>
          </label>
        </div>

        <button
          onClick={() => setSelectedCategories([])}
          className="text-xs text-blue-500 hover:underline"
        >
          Clear filters
        </button>
        
        {/*mapping other filters */}
        {categories.map((category) => {
          const checked = selectedCategories.includes(category.id);

          return (
            <label key={category.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-[#b98555] scale-125 "
                checked={checked}
                onChange={() => toggleCategory(category.id)}
              />
              {category.name}
            </label>
          );
        })}
      </div>

      {/* right side "children"*/}
      <div className="flex-1 ml-48 space-y-4 ">
        <div className="pl-8 pt-4">
      <input
        type="search"
        placeholder="Search menu items..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="bg-gray-200 rounded px-3 py-2 w-64"
      />
        </div>
        <ListView items={filteredItems} />
      </div>

    </div>
  );
}