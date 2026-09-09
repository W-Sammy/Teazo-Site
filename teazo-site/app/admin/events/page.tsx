import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdminEventsClient from "./components/admin-events-client";
import type { AdminEvent, EventCatalogItem } from "@/app/types/admin-event";
import type { MenuItem } from "@/app/types/menu-item";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Events Admin",
  },
};

async function getMenuItems(): Promise<MenuItem[]> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}api/square/products`,
    { cache: "no-store" },
  );

  if (!response.ok) throw new Error("Failed to fetch menu items for events");
  return response.json();
}

async function getSampleEvents(): Promise<AdminEvent[]> {
  const filePath = path.join(
    process.cwd(),
    "app",
    "admin",
    "events",
    "components",
    "sample-events.txt",
  );
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as AdminEvent[];
}

export default async function AdminEventsPage() {
  const [menuItems, initialEvents] = await Promise.all([
    getMenuItems(),
    getSampleEvents(),
  ]);
  const items: EventCatalogItem[] = menuItems.map((item) => ({
    id: item.catalogObjectId,
    name: item.name ?? "Unnamed item",
    categoryIds: item.categories.map((category) => category.id),
  }));

  const categoryMap = new Map<string, string>();
  menuItems.forEach((item) => {
    item.categories.forEach((category) => {
      categoryMap.set(category.id, category.name ?? "Unnamed category");
    });
  });

  const categories = Array.from(categoryMap, ([id, name]) => ({ id, name })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  return (
    <AdminEventsClient
      initialEvents={initialEvents}
      categories={categories}
      items={items}
    />
  );
}
