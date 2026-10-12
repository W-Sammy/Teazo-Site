import "server-only";

import { recordMenuItemView as persistMenuItemView } from "@/app/lib/queries/analytics";

/**
 * Backend hook for the future menu-item detail view.
 *
 * Keep the public menu page free of this call until item cards navigate to a
 * detail view. The eventual server component/API handler only needs to import
 * this function and call recordMenuItemView(date, itemId, itemName).
 */
export async function recordMenuItemView(
  date: string,
  itemId: string,
  itemName: string,
) {
  return persistMenuItemView(date, itemId, itemName);
}
