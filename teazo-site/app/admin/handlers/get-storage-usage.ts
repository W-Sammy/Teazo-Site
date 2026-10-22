import type { StorageUsage } from "@/app/types/storage-usage";
import { getStorageUsage as getLiveStorageUsage } from "@/app/lib/usage";

/** Load the current D1 and R2 usage from the proxy Worker. */
export async function getStorageUsage(): Promise<StorageUsage[]> {
  const usage = await getLiveStorageUsage();

  return [
    { service: "D1", currentBytes: usage.d1.bytes, maxBytes: usage.d1.limitBytes },
    { service: "R2", currentBytes: usage.r2.bytes, maxBytes: usage.r2.limitBytes },
  ];
}
