import { cacheLife, cacheTag } from "next/cache";
import { ADMIN_CACHE_TAGS } from "@/app/lib/admin-cache";

export async function getCachedAdminProducts() {
  "use cache";

  cacheLife({
    stale: 0,
    revalidate: 30,
    expire: 60,
  });

  cacheTag(ADMIN_CACHE_TAGS.products);

}