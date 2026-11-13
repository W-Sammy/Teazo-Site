import "server-only";
import { reconcileSquareMenuCategories } from "@/app/lib/queries/menu-display";
import type { Category } from "@/app/types/menu-item";

export async function syncSquareMenuCategories() {
  const { squareClient } = await import("@/app/lib/square");
  const result = await squareClient.catalog.list({ types: "CATEGORY" });
  const categories: Category[] = [];
  // Finish every page before reconciling, so a failed request cannot prune rows.
  for await (const category of result) {
    if (!category.id) throw new Error("Square returned a category without an ID");
    if (category.id && category.type === "CATEGORY" && !category.isDeleted) {
      categories.push({ categoryId: category.id, categoryName: category.categoryData?.name ?? null });
    }
  }
  await reconcileSquareMenuCategories(categories);
}
