
import ListView from "@/app/admin/components/admin-list-view"
import  AdminMenuClient from "@/app/admin/menu/components/admin-menu-client"
import { MenuItem } from "@/app/(site)/components/menu-item-card"

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
    category_id: item.categoryId ?? "",
    category_name: item.categoryName ?? "No Category"
  }));
}

function getUniqueCategories(items: ReturnType<typeof filterMenuItems>) {
  const map = new Map<string, string>();

  for (const item of items) {
    if (item.category_id && !map.has(item.category_id)) {
      map.set(item.category_id, item.category_name);
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