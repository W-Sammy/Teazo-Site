import "server-only";
import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { batch, prepare } from "@/app/lib/d1";
import { getSquareEnvironment } from "@/app/lib/square-config";

export async function getCatalogRevision(): Promise<string> {
  const row = await prepare(
    "SELECT revision FROM square_catalog_revision WHERE square_env = ?1",
  ).bind(getSquareEnvironment()).first<{ revision: string }>();
  return row?.revision ?? "";
}

export async function recordCatalogRevision(createdAt: string, eventId: string) {
  const environment = getSquareEnvironment();
  const revision = randomUUID();
  // Both statements commit together. A duplicate keeps its original token,
  // so only a newly inserted event can publish this request's fresh token.
  await batch([
    prepare(`
      INSERT INTO square_catalog_event (square_env, event_id, created_at, revision)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (square_env, event_id) DO NOTHING
    `).bind(environment, eventId, new Date(createdAt).toISOString(), revision),
    prepare(`
      INSERT INTO square_catalog_revision (square_env, revision)
      SELECT square_env, revision FROM square_catalog_event
      WHERE square_env = ?1 AND event_id = ?2 AND revision = ?3
      ON CONFLICT (square_env) DO UPDATE SET revision = excluded.revision
    `).bind(environment, eventId, revision),
  ]);
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
