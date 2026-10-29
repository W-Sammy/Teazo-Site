import "server-only";
import type { CatalogObject } from "square";
import { squareClient } from "@/app/lib/square";

/** Fresh, fully paginated reads. Do not filter by location/stock: admin needs every item. */
export async function readCatalogItems(): Promise<CatalogObject.Item[]> {
  const items: CatalogObject.Item[] = [];
  let cursor: string | undefined;
  do {
    const page = await squareClient.catalog.searchItems({ archivedState: "ARCHIVED_STATE_ALL", cursor });
    for (const object of page.items ?? []) {
      if (object.type === "ITEM") items.push(object);
    }
    cursor = page.cursor;
  } while (cursor);
  return items;
}

export async function readCatalogModifierLists(): Promise<CatalogObject.ModifierList[]> {
  const lists: CatalogObject.ModifierList[] = [];
  const result = await squareClient.catalog.list({ types: "MODIFIER_LIST" });
  for await (const object of result) {
    if (object.type === "MODIFIER_LIST") lists.push(object);
  }
  return lists;
}
