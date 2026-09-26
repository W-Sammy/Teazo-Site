import { readFile } from "node:fs/promises";
import path from "node:path";
import type { StorageUsage } from "@/app/types/storage-usage";

const D1_MAX_BYTES = 500 * 1024 * 1024;
const R2_MAX_BYTES = 10 * 1024 * 1024 * 1024;

type StorageUsageFixture = {
  d1Bytes: number;
  r2Bytes: number;
};

/**
 * Loads storage usage from a temporary byte-based fixture.
 * Replace this file read with the D1/R2 usage API calls later.
 */
export async function getStorageUsage(): Promise<StorageUsage[]> {
  const fixturePath = path.join(
    process.cwd(),
    "app",
    "admin",
    "storage-usage-sample.txt",
  );
  const contents = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(contents) as StorageUsageFixture;

  return [
    { service: "D1", currentBytes: fixture.d1Bytes, maxBytes: D1_MAX_BYTES },
    { service: "R2", currentBytes: fixture.r2Bytes, maxBytes: R2_MAX_BYTES },
  ];
}
