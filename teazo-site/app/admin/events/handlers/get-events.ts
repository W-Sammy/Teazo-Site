import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AdminEvent } from "@/app/types/admin-event";

/**
 * Loads the initial events for the admin page.
 * Replace this local file read with the database/API request later.
 */
export async function getEvents(): Promise<AdminEvent[]> {
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
