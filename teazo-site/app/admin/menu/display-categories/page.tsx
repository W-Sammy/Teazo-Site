import { getSquareEnvironment } from "@/app/lib/square-config";
import type { Metadata } from "next";
import DisplayCategoriesClient from "./display-categories-client";
import { requireAdminPage } from "@/app/lib/admin";
import {
  getMenuDisplayState,
  initializeMenuDisplayItems,
} from "@/app/lib/queries/menu-display";
import { syncSquareMenuCategories } from "@/app/lib/sync-menu-categories";
import type { MenuItem } from "@/app/types/menu-item";

export const metadata: Metadata = {
  title: { absolute: "TEAZO Public Menu Categories" },
};

async function getMenuItems(): Promise<MenuItem[]> {
  const response = await fetch(
    new URL("/api/square/products", process.env.NEXT_PUBLIC_BASE_URL?.trim()),
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Failed to fetch menu items");
  return response.json();
}

export default async function DisplayCategoriesPage() {
  await requireAdminPage(2);
  const [items] = await Promise.all([getMenuItems(), syncSquareMenuCategories()]);
  const displayState = await getMenuDisplayState();
  await initializeMenuDisplayItems(items, displayState.sections);
  const currentDisplayState = await getMenuDisplayState();

  return (
    <DisplayCategoriesClient
      squareEnvironment={getSquareEnvironment()}
      items={items}
      initialSections={currentDisplayState.sections}
      initialItemSettings={currentDisplayState.items}
    />
  );
}
