import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getMenuDisplayState, initializeMenuDisplayItems } from "./menu-display";
import { POST } from "@/app/api/admin/menu/display/route";

type SQLInputValue = null | number | bigint | string | Uint8Array;
let db: DatabaseSync;
vi.mock("@/app/lib/square-config", () => ({ getSquareEnvironment: () => "sandbox" }));
vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: async () => ({ ok: true, admin: { id: "admin-test" } }),
}));
vi.mock("@/app/lib/d1", () => ({
  prepare: (sql: string) => {
    let params: SQLInputValue[] = [];
    const statement = {
      bind: (...values: SQLInputValue[]) => { params = values; return statement; },
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      first: async () => db.prepare(sql).get(...params) ?? null,
      run: async () => db.prepare(sql).run(...params),
      toStmt: () => ({ sql, params }),
    };
    return statement;
  },
  batch: async (statements: Array<{ toStmt(): { sql: string; params: SQLInputValue[] } }>) => {
    db.exec("BEGIN");
    try {
      for (const statement of statements) {
        const { sql, params } = statement.toStmt();
        db.prepare(sql).run(...params);
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  },
}));

const migration = "0016_category_item_visibility.sql";
const apply = (file: string) => db.exec(readFileSync(`migrations/${file}`, "utf8"));
const sharedItem = { catalogObjectId: "tea", categories: [{ id: "a" }, { id: "b" }] };
const post = (body: object) => POST(new Request("https://teazo.test/api/admin/menu/display", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const file of readdirSync("migrations").filter((file) => file.endsWith(".sql") && file !== migration).sort()) apply(file);
  db.exec(`
    INSERT INTO admin_user (id, email, email_normalized, username, role_id)
      VALUES ('admin-test', 'admin@test.example', 'admin@test.example', 'Admin', 1);
    INSERT INTO menu_section (id, square_env, square_category_id, title, section_type, default_item_visible)
      VALUES ('a', 'sandbox', 'a', 'Tea', 'square', 1),
             ('b', 'sandbox', 'b', 'Specials', 'square', 0);
  `);
});
afterEach(() => db.close());

it("migrates existing visibility without coupling subsequent category edits", async () => {
  db.exec(`INSERT INTO catalog_item_cache (square_object_id, square_env) VALUES ('tea', 'sandbox');
    INSERT INTO menu_item_display (square_catalog_object_id, square_env, hide_on_website) VALUES ('tea', 'sandbox', 0);`);
  apply(migration);
  expect((await post({ action: "update-item", sectionId: "a", itemId: "tea", visible: false })).status).toBe(200);
  const { items } = await getMenuDisplayState();
  expect(items).toContainEqual({ sectionId: "a", squareCatalogObjectId: "tea", visible: false });
  expect(items).toContainEqual({ sectionId: "b", squareCatalogObjectId: "tea", visible: true });
});

it("freezes defaults separately for each category and preserves explicit edits", async () => {
  apply(migration);
  const { sections } = await getMenuDisplayState();
  await initializeMenuDisplayItems([sharedItem], sections);
  let state = await getMenuDisplayState();
  expect(state.items).toContainEqual({ sectionId: "a", squareCatalogObjectId: "tea", visible: true });
  expect(state.items).toContainEqual({ sectionId: "b", squareCatalogObjectId: "tea", visible: false });
  await post({ action: "update-item", sectionId: "b", itemId: "tea", visible: true });
  await initializeMenuDisplayItems([sharedItem], sections);
  state = await getMenuDisplayState();
  expect(state.items).toContainEqual({ sectionId: "b", squareCatalogObjectId: "tea", visible: true });
});

it("adding to a hidden custom category leaves Square category visibility alone", async () => {
  apply(migration);
  await initializeMenuDisplayItems([sharedItem], (await getMenuDisplayState()).sections);
  const response = await post({ action: "update-section", id: "custom", title: "Favorites",
    sectionType: "custom", squareCategoryId: null, sortOrder: 1, isPublished: true,
    defaultItemVisible: false, itemIds: ["tea"] });
  expect(response.status).toBe(200);
  expect((await response.json()).itemSettings).toEqual([
    { sectionId: "custom", squareCatalogObjectId: "tea", visible: false },
  ]);
  const { items } = await getMenuDisplayState();
  expect(items).toContainEqual({ sectionId: "a", squareCatalogObjectId: "tea", visible: true });
  expect(items).toContainEqual({ sectionId: "custom", squareCatalogObjectId: "tea", visible: false });
});

it("rejects item visibility updates without a valid category in the active environment", async () => {
  apply(migration);
  expect((await post({ action: "update-item", itemId: "tea", visible: false })).status).toBe(400);
  expect((await post({ action: "update-item", sectionId: "missing", itemId: "tea", visible: false })).status).toBe(404);
});
