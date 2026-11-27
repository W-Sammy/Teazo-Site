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
  /** Missing only for legacy settings retained during the visibility migration. */
  sectionId?: string;
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
  section_id: string | null;
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
      `SELECT NULL AS section_id, square_catalog_object_id, hide_on_website
         FROM menu_item_display WHERE square_env = ?1
       UNION ALL
       SELECT section_id, square_catalog_object_id, hide_on_website
         FROM menu_section_item_display WHERE square_env = ?1`,
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
      ...(row.section_id ? { sectionId: row.section_id } : {}),
      squareCatalogObjectId: row.square_catalog_object_id,
      visible: row.hide_on_website === 0,
    })),
  };
}

/** Freeze each category's default when an item first appears in that category. */
export async function initializeMenuDisplayItems(
  items: CatalogItemForDisplay[],
  sections: MenuDisplaySection[],
) {
  if (items.length === 0) return;
  const squareEnv = getSquareEnvironment();
  const state = await getMenuDisplayState();
  const existing = new Set(state.items.filter((item) => item.sectionId)
    .map((item) => JSON.stringify([item.sectionId, item.squareCatalogObjectId])));
  const statements = [];
  for (const item of items) {
    const memberships = sections.filter((section) => section.sectionType === "custom"
      ? section.itemIds.includes(item.catalogObjectId)
      : section.sectionType === "uncategorized"
        ? item.categories.length === 0
        : item.categories.some((category) => category.id === section.squareCategoryId));
    for (const section of memberships) {
      if (existing.has(JSON.stringify([section.id, item.catalogObjectId]))) continue;
      statements.push(
        prepare(`INSERT INTO catalog_item_cache (square_object_id, square_env)
          VALUES (?1, ?2) ON CONFLICT (square_object_id, square_env) DO NOTHING`)
          .bind(item.catalogObjectId, squareEnv),
        prepare(`INSERT INTO menu_section_item_display
          (section_id, square_catalog_object_id, square_env, hide_on_website)
          VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT (section_id, square_catalog_object_id, square_env) DO NOTHING`)
          .bind(section.id, item.catalogObjectId, squareEnv, section.defaultItemVisible ? 0 : 1),
      );
    }
  }
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
