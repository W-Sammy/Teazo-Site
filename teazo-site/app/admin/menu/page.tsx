
import ListView from "@/app/admin/components/admin-list-view"
import  AdminMenuClient from "@/app/admin/menu/components/admin-menu-client"
import { MenuItem } from "@/app/types/menu-item"

async function getMenuItems(): Promise<MenuItem[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}api/square/products`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch Menu Items");
  }
  return res.json();
}

function filterMenuItems(menuItems: MenuItem[]){
  return menuItems.map((item) => ({
    id: item.catalogObjectId,
    img: item.imageUrl ?? "/TEAZO_logo.png",
    name: item.name ?? "Unnamed item", 
    price: item.priceCents / 100,
    description: item.description ?? "",
    categories: item.categories
  }));
}

function getUniqueCategories(items: ReturnType<typeof filterMenuItems>) {
  const map = new Map<string, string>();

  for (const item of items) {
    for (const category of item.categories) {
      if (category.id && !map.has(category.id)) {
        map.set(category.id, category.name ?? "Uncategorized");
      }
    }
  }

  return Array.from(map, ([id, name]) => ({ id, name }));
}

export default async function AdminMenuPage(){
  const menuItems = await getMenuItems();
  const displayedMenuItems = filterMenuItems(menuItems);
  //what will be used for the filters
  const categories = getUniqueCategories(displayedMenuItems);

  return (
    <div>
      <AdminMenuClient
        items={displayedMenuItems}
        categories={categories}
      />
    </div>
  )
}