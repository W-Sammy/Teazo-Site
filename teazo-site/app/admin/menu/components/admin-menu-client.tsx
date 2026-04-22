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

  function toggleCategory(id: string) {
    setSelectedCategories((prev) =>
      prev.includes(id)
        ? prev.filter((c) => c !== id) // remove
        : [...prev, id] // add
    );
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        selectedCategories.length === 0 ||
        selectedCategories.includes(item.category_id);

      const matchesSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [items, search, selectedCategories]);

  return (
    <div className="flex">
      
      {/* menu sidebar*/}
      <div className="w-48 fixed top-0 pt-4 pr-4 pl-2 h-screen space-y-2 border-[#dbb082] border-r overflow-y-auto">
        
        <h3 className="font-semibold text-base mb-2">Filters</h3>

        <button
          onClick={() => setSelectedCategories([])}
          className="text-xs text-blue-500 hover:underline"
        >
          Clear filters
        </button>

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
            type="text"
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