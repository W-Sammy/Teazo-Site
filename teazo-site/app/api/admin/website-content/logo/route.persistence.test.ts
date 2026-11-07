import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { getWebsiteContent } from "@/app/lib/website-content";
import { POST } from "./route";

vi.mock("@/app/lib/admin", () => ({ requireAdminApi: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  sqliteD1.reset();
  vi.stubEnv("D1_PROXY_URL", "http://d1.test");
  vi.stubEnv("PROXY_TOKEN", "test-token");
  vi.stubEnv("R2_PUBLIC_BASE", "https://media.teazo.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logo persistence through the D1 HTTP adapter and SQLite", () => {
  it.each(["success", "rejected", "lost response", "server error"] as const)(
    "preserves the media/storage relationship after %s",
    async (outcome) => {
      const objects = new Set<string>();
      const deleted: string[] = [];
      // Emulate only the proxy endpoints; route, media, and content persistence
      // use their production code. Failed responses can follow a real commit.
      vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
        const path = new URL(input).pathname;
        if (path.startsWith("/media/")) {
          const key = path.slice("/media/".length);
          if (init.method === "PUT") {
            objects.add(key);
            return Response.json({ key, bucket: "test", size: 4 });
          }
          deleted.push(key);
          objects.delete(key);
          return new Response(null, { status: 204 });
        }
        const body = JSON.parse(String(init.body));
        if (path === "/batch") {
          if (outcome === "rejected") {
            return Response.json({ error: "d1_error", message: "Write refused" }, { status: 400 });
          }
          const result = await sqliteD1.module.batch(body.statements.map((s: { sql: string; params: unknown[] }) =>
            sqliteD1.module.prepare(s.sql).bind(...s.params)));
          if (outcome === "lost response") throw new TypeError("Connection lost after commit");
          if (outcome === "server error") return Response.json({ error: "upstream unavailable" }, { status: 503 });
          return Response.json(result);
        }
        return Response.json(await sqliteD1.module.prepare(body.sql).bind(...body.params).all());
      });

      const form = new FormData();
      form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "logo.png", { type: "image/png" }));
      const response = await POST(new Request("http://localhost/api/admin/website-content/logo", {
        method: "POST", body: form,
      }));
      const result = await response.json();
      const fresh = await getWebsiteContent();

      expect(response.status).toBe(outcome === "success" ? 200 : 503);
      if (outcome === "rejected") {
        expect(fresh.logo).toBe("/TEAZO_logo.svg");
        expect(deleted).toHaveLength(1);
        expect(objects.size).toBe(0);
        expect(result.requiresReload).not.toBe(true);
      } else {
        expect(fresh.logo).toMatch(/^https:\/\/media.teazo.test\/logo\//);
        expect(objects.has(new URL(fresh.logo).pathname.slice(1))).toBe(true);
        expect(deleted).toEqual([]);
        if (outcome === "success") expect(result.url).toBe(fresh.logo);
        else {
          expect(result.requiresReload).toBe(true);
          expect(result.error).toMatch(/Reload/);
          expect(console.error).toHaveBeenCalledWith(
            expect.any(String), expect.stringMatching(/^logo\//), expect.anything(),
          );
        }
      }
    },
  );
});
