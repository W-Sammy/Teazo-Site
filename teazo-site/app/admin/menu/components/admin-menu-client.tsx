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
    <div className="flex gap-6 h-screen">
      
      {/* LEFT FILTER SIDEBAR */}
      <div className="w-48 flex-shrink-0 space-y-2 border-r border-[#dbb082]">
        <h3 className="font-semibold text-sm mb-2">Categories</h3>

        {categories.map((category) => {
          const checked = selectedCategories.includes(category.id);

          return (
            <label key={category.id} className= "flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleCategory(category.id)}
              />
              {category.name}
            </label>
          );
        })}
      </div>

      {/* RIGHT CONTENT */}
      <div className="flex-1 space-y-4">
        {/* search bar */}
        <input
          type="text"
          placeholder="Search menu items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 w-full max-w-sm"
        />

        <ListView items={filteredItems} />
      </div>

    </div>
  );
}