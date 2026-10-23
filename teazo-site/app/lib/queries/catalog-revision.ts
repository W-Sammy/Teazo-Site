import "server-only";
import { unstable_rethrow } from "next/navigation";
import { prepare } from "@/app/lib/d1";

// Keep aligned with the Square client in app/lib/square.ts.
const squareEnv = "sandbox";

export async function getCatalogRevision(): Promise<string> {
  const row = await prepare(
    "SELECT revision FROM square_catalog_revision WHERE square_env = ?1",
  ).bind(squareEnv).first<{ revision: string }>();
  return row?.revision ?? "";
}

export async function recordCatalogRevision(createdAt: string, eventId: string) {
  const revision = `${new Date(createdAt).toISOString()}:${eventId}`;
  // Duplicate deliveries and older events cannot move the marker backwards.
  await prepare(`
    INSERT INTO square_catalog_revision (square_env, revision) VALUES (?1, ?2)
    ON CONFLICT (square_env) DO UPDATE SET revision = excluded.revision
    WHERE excluded.revision > square_catalog_revision.revision
  `).bind(squareEnv, revision).run();
}

export async function getMenuRevision(): Promise<string | null> {
  try {
    return await getCatalogRevision();
  } catch (error) {
    unstable_rethrow(error);
    // A failed notice lookup must not prevent browsing or editing the menu.
    console.error("Menu change marker could not be loaded:", error);
    return null;
  }
}
