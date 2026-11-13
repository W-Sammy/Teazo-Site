import { randomUUID } from "node:crypto";

import { requireAdminApi } from "@/app/lib/admin";
import { batch, prepare } from "@/app/lib/d1";
import { getMenuDisplayState } from "@/app/lib/queries/menu-display";
import { getSquareEnvironment } from "@/app/lib/square-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) return access.response;

  return Response.json(await getMenuDisplayState(), {
    headers: { "Cache-Control": "no-store" },
  });
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2);
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const action = body.action;
  const squareEnv = getSquareEnvironment();

  if (action === "update-item") {
    const itemId = textValue(body.itemId);
    const visible = booleanValue(body.visible);
    if (!itemId || visible === null) {
      return Response.json({ error: "Item ID and visibility are required." }, { status: 400 });
    }

    await batch([
      prepare(`
        INSERT INTO catalog_item_cache (square_object_id, square_env)
        VALUES (?1, ?2)
        ON CONFLICT (square_object_id, square_env) DO NOTHING
      `).bind(itemId, squareEnv),
      prepare(`
        INSERT INTO menu_item_display
          (square_catalog_object_id, square_env, hide_on_website, updated_by)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT (square_catalog_object_id, square_env) DO UPDATE SET
          hide_on_website = excluded.hide_on_website,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          updated_by = excluded.updated_by
      `).bind(itemId, squareEnv, visible ? 0 : 1, access.admin.id),
    ]);

    return Response.json({ ok: true });
  }

  if (action === "reorder-sections") {
    const sectionIds = body.sectionIds;
    if (!Array.isArray(sectionIds) || sectionIds.length === 0 ||
        !sectionIds.every((id): id is string => typeof id === "string" && id.trim().length > 0) ||
        new Set(sectionIds).size !== sectionIds.length) {
      return Response.json({ error: "Provide unique category IDs in the desired order." }, { status: 400 });
    }
    const state = await getMenuDisplayState();
    const knownIds = new Set(state.sections.map((section) => section.id));
    const uncategorizedId = `category:${squareEnv}:uncategorized`;
    if (sectionIds.some((id) => !knownIds.has(id) && id !== uncategorizedId) ||
        (sectionIds.includes(uncategorizedId) && state.sections.some((section) => section.sectionType === "uncategorized" && section.id !== uncategorizedId))) {
      return Response.json({ error: "Categories changed. Refresh the page before reordering." }, { status: 409 });
    }
    // One statement in one transaction, regardless of the number of categories.
    // Only order is updated on conflict; concurrent visibility edits are preserved.
    await batch([prepare(`
      INSERT INTO menu_section
        (id, square_env, square_category_id, title, section_type, sort_order, is_published, default_item_visible)
      SELECT entry.value, ?2, section.square_category_id,
             COALESCE(section.title, 'Uncategorized'), COALESCE(section.section_type, 'uncategorized'),
             CAST(entry.key AS INTEGER), COALESCE(section.is_published, 1), COALESCE(section.default_item_visible, 1)
        FROM json_each(?1) AS entry
        LEFT JOIN menu_section AS section ON section.id = entry.value AND section.square_env = ?2
       WHERE section.id IS NOT NULL OR entry.value = ?3
      ON CONFLICT (id) DO UPDATE SET sort_order = excluded.sort_order
      WHERE menu_section.square_env = excluded.square_env
    `).bind(JSON.stringify(sectionIds), squareEnv, uncategorizedId)]);
    return Response.json({ ok: true });
  }

  if (action === "update-section") {
    const requestedId = textValue(body.id);
    const title = textValue(body.title);
    const sectionType = body.sectionType;
    const isPublished = booleanValue(body.isPublished);
    const defaultItemVisible = booleanValue(body.defaultItemVisible);
    const sortOrder = typeof body.sortOrder === "number" && Number.isSafeInteger(body.sortOrder) && body.sortOrder >= 0
      ? body.sortOrder : null;
    const squareCategoryId = body.squareCategoryId === null ? null : textValue(body.squareCategoryId);
    const itemIds = Array.isArray(body.itemIds) && body.itemIds.every((id) => typeof id === "string" && id.trim().length > 0)
      ? [...new Set((body.itemIds as string[]).map((id) => id.trim()))] : null;

    if (!requestedId || !title ||
        (sectionType !== "square" && sectionType !== "uncategorized" && sectionType !== "custom") ||
        isPublished === null || defaultItemVisible === null || sortOrder === null || itemIds === null ||
        (sectionType === "square" ? !squareCategoryId : body.squareCategoryId !== null)) {
      return Response.json({ error: "Invalid category settings." }, { status: 400 });
    }
    if (sectionType === "custom" && title.length > 100) {
      return Response.json({ error: "Category name must be 1–100 characters." }, { status: 400 });
    }
    const state = await getMenuDisplayState();
    const existing = state.sections.find((section) => section.id === requestedId) ??
      (sectionType === "uncategorized" ? state.sections.find((section) => section.sectionType === "uncategorized") : undefined);
    if (existing && (existing.sectionType !== sectionType || existing.squareCategoryId !== squareCategoryId)) {
      return Response.json({ error: "Category type and Square identity cannot be changed." }, { status: 409 });
    }
    if (sectionType === "square" && !existing) {
      return Response.json({ error: "Square category not found. Refresh the page." }, { status: 404 });
    }
    if (sectionType !== "custom" &&
        (title !== (existing?.title ?? "Uncategorized") || itemIds.length > 0)) {
      return Response.json({ error: "Square category names and memberships cannot be changed here." }, { status: 409 });
    }
    const id = existing?.id ?? (sectionType === "uncategorized" ? `category:${squareEnv}:uncategorized` : requestedId);
    const existingItemIds = new Set(existing?.itemIds ?? []);
    const addedItemIds = sectionType === "custom"
      ? itemIds.filter((itemId) => !existingItemIds.has(itemId))
      : [];
    const statements = [];
    if (existing && sectionType !== "custom") {
      // Protected names, types and memberships never appear in the UPDATE.
      statements.push(prepare(`
        UPDATE menu_section SET sort_order = ?1, is_published = ?2, default_item_visible = ?3
        WHERE id = ?4 AND square_env = ?5
      `).bind(sortOrder, isPublished ? 1 : 0, defaultItemVisible ? 1 : 0, id, squareEnv));
    } else {
      // Reject IDs already owned by another environment rather than overwriting them.
      const collision = await prepare("SELECT id FROM menu_section WHERE id = ?1 AND square_env <> ?2")
        .bind(id, squareEnv).first();
      if (collision) return Response.json({ error: "Category ID belongs to another environment." }, { status: 409 });
      statements.push(prepare(`
        INSERT INTO menu_section
          (id, square_env, square_category_id, title, section_type, sort_order, is_published, default_item_visible)
        VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT (id) DO UPDATE SET title = excluded.title, sort_order = excluded.sort_order,
          is_published = excluded.is_published, default_item_visible = excluded.default_item_visible
        WHERE menu_section.square_env = excluded.square_env AND menu_section.section_type = excluded.section_type
      `).bind(id, squareEnv, title, sectionType, sortOrder, isPublished ? 1 : 0, defaultItemVisible ? 1 : 0));
    }
    if (sectionType === "custom") {
      // JSON keeps even large item lists inside one batch, avoiding partial membership saves.
      const serializedIds = JSON.stringify(itemIds);
      statements.push(
        prepare("DELETE FROM menu_section_item WHERE section_id = ?1 AND square_env = ?2").bind(id, squareEnv),
        prepare(`
          INSERT INTO catalog_item_cache (square_object_id, square_env)
          SELECT value, ?2 FROM json_each(?1) WHERE true
          ON CONFLICT (square_object_id, square_env) DO NOTHING
        `).bind(serializedIds, squareEnv),
        // Adding an item to a custom category applies that category's default
        // once. Saving defaults or editing existing members preserves visibility.
        prepare(`
          INSERT INTO menu_item_display
            (square_catalog_object_id, square_env, hide_on_website, updated_by)
          SELECT value, ?2, ?3, ?4 FROM json_each(?1) WHERE true
          ON CONFLICT (square_catalog_object_id, square_env) DO UPDATE SET
            hide_on_website = excluded.hide_on_website,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
            updated_by = excluded.updated_by
        `).bind(JSON.stringify(addedItemIds), squareEnv, defaultItemVisible ? 0 : 1, access.admin.id),
        prepare(`
          INSERT INTO menu_section_item (section_id, square_catalog_object_id, square_env, position)
          SELECT ?1, value, ?2, CAST(key AS INTEGER) FROM json_each(?3)
        `).bind(id, squareEnv, serializedIds),
      );
    }
    await batch(statements);
    return Response.json({ ok: true, section: {
      id, title, sectionType, squareCategoryId, sortOrder, isPublished, defaultItemVisible, itemIds,
    }, itemSettings: addedItemIds.map((itemId) => ({
      squareCatalogObjectId: itemId, visible: defaultItemVisible,
    })) });
  }

  if (action === "create-category") {
    const title = textValue(body.title);
    if (!title || title.length > 100) {
      return Response.json({ error: "Category name must be 1–100 characters." }, { status: 400 });
    }

    const order = await prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM menu_section WHERE square_env = ?1",
    ).bind(squareEnv).first<{ next_order: number }>();
    const id = randomUUID();

    await prepare(`
      INSERT INTO menu_section
        (id, square_env, square_category_id, title, section_type, sort_order,
         is_published, default_item_visible)
      VALUES (?1, ?2, NULL, ?3, 'custom', ?4, 1, 1)
    `).bind(id, squareEnv, title, order?.next_order ?? 0).run();

    return Response.json({
      ok: true,
      section: {
        id,
        squareCategoryId: null,
        title,
        sectionType: "custom",
        sortOrder: order?.next_order ?? 0,
        isPublished: true,
        defaultItemVisible: true,
        itemIds: [],
      },
    }, { status: 201 });
  }

  if (action === "delete-category") {
    const id = textValue(body.id);
    if (!id) return Response.json({ error: "Category ID is required." }, { status: 400 });
    const section = await prepare(
      "SELECT section_type FROM menu_section WHERE id = ?1 AND square_env = ?2",
    ).bind(id, squareEnv).first<{ section_type: string }>();
    if (!section) return Response.json({ error: "Category not found." }, { status: 404 });
    if (section.section_type !== "custom") {
      return Response.json({ error: "This is a category that is pulled from Square and can only be deleted from the square dashboard" }, { status: 409 });
    }
    await prepare("DELETE FROM menu_section WHERE id = ?1 AND square_env = ?2").bind(id, squareEnv).run();
    return Response.json({ ok: true });
  }

  if (action === "remove-item") {
    const sectionId = textValue(body.sectionId);
    const itemId = textValue(body.itemId);
    if (!sectionId || !itemId) {
      return Response.json({ error: "Category and item IDs are required." }, { status: 400 });
    }
    const section = await prepare(
      "SELECT section_type FROM menu_section WHERE id = ?1 AND square_env = ?2",
    ).bind(sectionId, squareEnv).first<{ section_type: string }>();
    if (!section) return Response.json({ error: "Category not found." }, { status: 404 });
    if (section.section_type !== "custom") {
      return Response.json({ error: "Square category memberships must be changed in Square." }, { status: 409 });
    }
    await prepare(
      "DELETE FROM menu_section_item WHERE section_id = ?1 AND square_catalog_object_id = ?2 AND square_env = ?3",
    ).bind(sectionId, itemId, squareEnv).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown menu display action." }, { status: 400 });
}
