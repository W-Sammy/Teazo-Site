import "server-only";

import type { Category } from "@/app/types/menu-item";
import { batch, prepare } from "@/app/lib/d1";
import { getSquareEnvironment } from "@/app/lib/square-config";

export type MenuDisplaySection = {
  id: string;
  squareCategoryId: string | null;
  title: string;
  sectionType: "square" | "uncategorized" | "custom";
  sortOrder: number;
  isPublished: boolean;
  defaultItemVisible: boolean;
  itemIds: string[];
};

export type MenuDisplayItem = {
  squareCatalogObjectId: string;
  visible: boolean;
};

type CatalogItemForDisplay = {
  catalogObjectId: string;
  categories: Array<{ id: string }>;
};

type SectionRow = {
  id: string;
  square_category_id: string | null;
  title: string;
  section_type: MenuDisplaySection["sectionType"];
  sort_order: number;
  is_published: number;
  default_item_visible: number;
};

type ItemRow = {
  square_catalog_object_id: string;
  hide_on_website: number;
};

type SectionItemRow = {
  section_id: string;
  square_catalog_object_id: string;
};

export async function getMenuDisplayState() {
  const squareEnv = getSquareEnvironment();
  const [sections, items, sectionItems] = await Promise.all([
    prepare(
      `SELECT id, square_category_id, title, section_type, sort_order,
              is_published, default_item_visible
         FROM menu_section
        WHERE square_env = ?1
        ORDER BY sort_order, id`,
    ).bind(squareEnv).all<SectionRow>(),
    prepare(
      `SELECT square_catalog_object_id, hide_on_website
         FROM menu_item_display
        WHERE square_env = ?1`,
    ).bind(squareEnv).all<ItemRow>(),
    prepare(
      `SELECT section_id, square_catalog_object_id
         FROM menu_section_item
        WHERE square_env = ?1
        ORDER BY position, square_catalog_object_id`,
    ).bind(squareEnv).all<SectionItemRow>(),
  ]);

  const itemIdsBySection = new Map<string, string[]>();
  for (const row of sectionItems.results) {
    const ids = itemIdsBySection.get(row.section_id) ?? [];
    ids.push(row.square_catalog_object_id);
    itemIdsBySection.set(row.section_id, ids);
  }

  return {
    sections: sections.results.map((row) => ({
      id: row.id,
      squareCategoryId: row.square_category_id,
      title: row.title,
      sectionType: row.section_type,
      sortOrder: row.sort_order,
      isPublished: row.is_published === 1,
      defaultItemVisible: row.default_item_visible === 1,
      itemIds: itemIdsBySection.get(row.id) ?? [],
    })),
    items: items.results.map((row) => ({
      squareCatalogObjectId: row.square_catalog_object_id,
      visible: row.hide_on_website === 0,
    })),
  };
}

/**
 * Records Square items the website has seen for the first time. This makes a
 * category's default apply only to new items; existing items keep their own
 * visibility setting afterward.
 */
export async function initializeMenuDisplayItems(
  items: CatalogItemForDisplay[],
  sections: MenuDisplaySection[],
) {
  if (items.length === 0) return;

  const squareEnv = getSquareEnvironment();
  const existing = await prepare(
    `SELECT square_catalog_object_id
       FROM menu_item_display
      WHERE square_env = ?1`,
  ).bind(squareEnv).all<{ square_catalog_object_id: string }>();
  const existingIds = new Set(
    existing.results.map((row) => row.square_catalog_object_id),
  );
  const sectionByCategory = new Map(
    sections
      .filter((section) => section.squareCategoryId)
      .map((section) => [section.squareCategoryId as string, section]),
  );
  const uncategorized = sections.find(
    (section) => section.sectionType === "uncategorized",
  );
  const statements = items
    .filter((item) => !existingIds.has(item.catalogObjectId))
    .flatMap((item) => {
      const visible = item.categories.length === 0
        ? uncategorized?.defaultItemVisible ?? true
        : item.categories.some(
            (category) => sectionByCategory.get(category.id)?.defaultItemVisible ?? false,
          );

      return [
        prepare(`
          INSERT INTO catalog_item_cache (square_object_id, square_env)
          VALUES (?1, ?2)
          ON CONFLICT (square_object_id, square_env) DO NOTHING
        `).bind(item.catalogObjectId, squareEnv),
        prepare(`
          INSERT INTO menu_item_display
            (square_catalog_object_id, square_env, hide_on_website)
          VALUES (?1, ?2, ?3)
          ON CONFLICT (square_catalog_object_id, square_env) DO NOTHING
        `).bind(item.catalogObjectId, squareEnv, visible ? 0 : 1),
      ];
    });

  for (let offset = 0; offset < statements.length; offset += 40) {
    await batch(statements.slice(offset, offset + 40));
  }
}

/** Reconcile only after a complete, successful Square category listing. */
export async function reconcileSquareMenuCategories(categories: Category[]) {
  const squareEnv = getSquareEnvironment();
  const current = await getMenuDisplayState();
  const activeIds = new Set(categories.flatMap((category) => category.categoryId ? [category.categoryId] : []));
  const statements = current.sections
    .filter((section) => section.sectionType === "square" && section.squareCategoryId && !activeIds.has(section.squareCategoryId))
    .map((section) => prepare("DELETE FROM menu_section WHERE id = ?1 AND square_env = ?2 AND section_type = 'square'").bind(section.id, squareEnv));
  let nextOrder = Math.max(-1, ...current.sections.map((section) => section.sortOrder)) + 1;
  for (const category of categories) {
    if (!category.categoryId) continue;
    statements.push(prepare(`
      INSERT INTO menu_section
        (id, square_env, square_category_id, title, section_type, sort_order, is_published, default_item_visible)
      VALUES (?1, ?2, ?3, ?4, 'square', ?5, 0, 0)
      ON CONFLICT (square_category_id, square_env) WHERE square_category_id IS NOT NULL
      DO UPDATE SET title = excluded.title
    `).bind(`category:${squareEnv}:${category.categoryId}`, squareEnv, category.categoryId, category.categoryName?.trim() || "Unnamed category", nextOrder++));
  }
  for (let offset = 0; offset < statements.length; offset += 40) {
    await batch(statements.slice(offset, offset + 40));
  }
}
