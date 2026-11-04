import "server-only";

import { recordMenuItemView as persistMenuItemView } from "@/app/lib/queries/analytics";

/** Backend hook used by the public menu-item analytics endpoint. */
export async function recordMenuItemView(
  date: string,
  itemId: string,
  itemName: string,
) {
  return persistMenuItemView(date, itemId, itemName);
}
