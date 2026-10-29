import { availabilityDescription } from "@/app/lib/storefront-catalog";
import type { Metadata } from "next";

import { requireAdminPage } from "@/app/lib/admin";
import AdminMenuClient from "@/app/admin/menu/components/admin-menu-client";
import type { MenuItem } from "@/app/types/menu-item";
import CatalogChangeNotice from "@/app/components/catalog-change-notice";
import { getMenuRevision } from "@/app/lib/queries/catalog-revision";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Menu Admin",
  },
};

async function getMenuItems(): Promise<MenuItem[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}api/square/products`,
    {
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error("Failed to fetch Menu Items");
  }

  return res.json();
}

function filterMenuItems(menuItems: MenuItem[]) {
  return menuItems.map((item) => ({
    id: item.catalogObjectId,
    img: item.imageUrl ?? "/TEAZO_logo.svg",
    name: item.name ?? "Unnamed item",
    price: item.priceCents / 100,
    description: item.description ?? "",
    availability: availabilityDescription(item),
    categories: item.categories,
  }));
}

function getUniqueCategories(
  items: ReturnType<typeof filterMenuItems>,
) {
  const map = new Map<string, string>();

  for (const item of items) {
    for (const category of item.categories) {
      if (category.id && !map.has(category.id)) {
        map.set(
          category.id,
          category.name ?? "Uncategorized",
        );
      }
    }
  }

  return Array.from(
    map,
    ([id, name]) => ({ id, name }),
  );
}

export default async function AdminMenuPage() {
  // Owner and Admin both have menu management access.
  await requireAdminPage(2);

  const revision = await getMenuRevision();
  const menuItems = await getMenuItems();
  const displayedMenuItems = filterMenuItems(menuItems);

  // Categories populate the menu filters.
  const categories = getUniqueCategories(displayedMenuItems);

  return (
    <div>
      <CatalogChangeNotice initialRevision={revision} />
      <AdminMenuClient
        items={displayedMenuItems}
        categories={categories}
        canUploadMenu
      />
    </div>
  );
}
