import ListView from "@/app/admin/components/admin-list-view"

import { MenuItem } from "@/app/(site)/components/menu-item-card"

async function getMenuItems(): Promise<MenuItem[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/square/products`, {
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
    img: item.imageUrl ?? "TEAZO_logo.png",
    name: item.name ?? "Unnamed item", 
    price: item.priceCents / 100,
    description: item.description ?? "",
    category_id: item.categoryId ?? "",
    category_name: item.categoryName ?? "No Category"
  }));
}

export default async function AdminMenuPage(){
  const menuItems = await getMenuItems();
  const displayedMenuItems = filterMenuItems(menuItems);

  return (
    <div>
      <ListView items={displayedMenuItems}/>
    </div>
  )
}