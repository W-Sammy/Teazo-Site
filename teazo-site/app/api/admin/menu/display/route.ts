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

  if (action === "update-section") {
    const id = textValue(body.id);
    const title = textValue(body.title);
    const sectionType = body.sectionType;
    const isPublished = booleanValue(body.isPublished);
    const defaultItemVisible = booleanValue(body.defaultItemVisible);
    const sortOrder = typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder)
      ? body.sortOrder
      : null;
    const squareCategoryId = body.squareCategoryId === null
      ? null
      : textValue(body.squareCategoryId);
    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((itemId): itemId is string => typeof itemId === "string" && itemId.trim().length > 0)
      : null;

    if (
      !id || !title ||
      (sectionType !== "square" && sectionType !== "uncategorized" && sectionType !== "custom") ||
      isPublished === null || defaultItemVisible === null || sortOrder === null || itemIds === null
    ) {
      return Response.json({ error: "Invalid category settings." }, { status: 400 });
    }

    const existing = await prepare(
      `SELECT id FROM menu_section
        WHERE square_env = ?1 AND (id = ?2 OR (?3 IS NOT NULL AND square_category_id = ?3))
        LIMIT 1`,
    ).bind(squareEnv, id, squareCategoryId).first<{ id: string }>();

    if (existing) {
      const statements = [
        prepare(`
          UPDATE menu_section
             SET title = ?1, section_type = ?2, square_category_id = ?3,
                 sort_order = ?4, is_published = ?5, default_item_visible = ?6
           WHERE id = ?7 AND square_env = ?8
        `).bind(
          title, sectionType, squareCategoryId, sortOrder,
          isPublished ? 1 : 0, defaultItemVisible ? 1 : 0, existing.id, squareEnv,
        ),
      ];
      if (sectionType === "custom") {
        statements.push(
          prepare("DELETE FROM menu_section_item WHERE section_id = ?1 AND square_env = ?2")
            .bind(existing.id, squareEnv),
        );
        for (const [position, itemId] of [...new Set(itemIds)].entries()) {
          statements.push(
            prepare(`
              INSERT INTO catalog_item_cache (square_object_id, square_env)
              VALUES (?1, ?2)
              ON CONFLICT (square_object_id, square_env) DO NOTHING
            `).bind(itemId, squareEnv),
            prepare(`
              INSERT INTO menu_section_item
                (section_id, square_catalog_object_id, square_env, position)
              VALUES (?1, ?2, ?3, ?4)
            `).bind(existing.id, itemId, squareEnv, position),
          );
        }
      }
      for (let offset = 0; offset < statements.length; offset += 40) {
        await batch(statements.slice(offset, offset + 40));
      }
    } else {
      const statements = [prepare(`
        INSERT INTO menu_section
          (id, square_env, square_category_id, title, section_type, sort_order,
           is_published, default_item_visible)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      `).bind(
        id,
        squareEnv,
        squareCategoryId,
        title,
        sectionType,
        sortOrder,
        isPublished ? 1 : 0,
        defaultItemVisible ? 1 : 0,
      )];
      for (const [position, itemId] of [...new Set(itemIds)].entries()) {
        statements.push(
          prepare(`
            INSERT INTO catalog_item_cache (square_object_id, square_env)
            VALUES (?1, ?2)
            ON CONFLICT (square_object_id, square_env) DO NOTHING
          `).bind(itemId, squareEnv),
          prepare(`
            INSERT INTO menu_section_item
              (section_id, square_catalog_object_id, square_env, position)
            VALUES (?1, ?2, ?3, ?4)
          `).bind(id, itemId, squareEnv, position),
        );
      }
      for (let offset = 0; offset < statements.length; offset += 40) {
        await batch(statements.slice(offset, offset + 40));
      }
    }

    return Response.json({ ok: true });
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
