import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { getWebsiteContent, updateWebsiteContent } from "./website-content";
import { getWebsiteContentPatchByteSize, MAX_WEBSITE_CONTENT_PAYLOAD_BYTES, validateWebsiteContentPatch } from "./website-content-validators";
import { PATCH } from "@/app/api/website-content/route";
import { revalidatePath } from "next/cache";

vi.mock("@/app/lib/admin", () => ({ requireAdminApi: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const proxyFetch = vi.fn();
beforeEach(() => {
  sqliteD1.reset();
  vi.clearAllMocks();
  vi.stubEnv("D1_PROXY_URL", "http://d1.test");
  vi.stubEnv("PROXY_TOKEN", "test-token");
  vi.spyOn(console, "error").mockImplementation(() => {});
  proxyFetch.mockImplementation(async (url: string, init: RequestInit) => {
    const json = String(init.body);
    // Enforce the Worker's actual JSON-body limit, including the SQL envelope.
    if (Buffer.byteLength(json, "utf8") > MAX_WEBSITE_CONTENT_PAYLOAD_BYTES) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }
    const body = JSON.parse(json);
    if (url.endsWith("/batch")) {
      return Response.json(await sqliteD1.module.batch(body.statements.map(
        (s: { sql: string; params: unknown[] }) => sqliteD1.module.prepare(s.sql).bind(...s.params),
      )));
    }
    return Response.json(await sqliteD1.module.prepare(body.sql).bind(...body.params).all());
  });
  vi.stubGlobal("fetch", proxyFetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("website content budgets through the API and production D1 adapter", () => {
  it.each([1_000_000, 1_000_001])("handles an actual %i-byte batch before transport", async (batchBytes) => {
    const patch = { collectionsRevision: 0, holidays: [{ id: "holiday", name: "a", date: "12-25", closed: true }] };
    // Measure the actual production request once, then pad only the saved name.
    await updateWebsiteContent(patch);
    const baseline = String(proxyFetch.mock.calls.find(([url]) => url.endsWith("/batch"))![1].body);
    patch.holidays[0].name = "茶".repeat(Math.floor((batchBytes - Buffer.byteLength(baseline)) / 3)) +
      "a".repeat(1 + (batchBytes - Buffer.byteLength(baseline)) % 3);
    expect(getWebsiteContentPatchByteSize(patch)).toBeLessThan(MAX_WEBSITE_CONTENT_PAYLOAD_BYTES);
    expect(validateWebsiteContentPatch(patch).valid).toBe(true);
    sqliteD1.reset();
    proxyFetch.mockClear();
    const before = await getWebsiteContent();

    const response = await PATCH(new Request("http://localhost/api/website-content", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
    }));
    const result = await response.json();
    const batches = proxyFetch.mock.calls.filter(([url]) => url.endsWith("/batch"));
    if (batchBytes === MAX_WEBSITE_CONTENT_PAYLOAD_BYTES) {
      expect(response.status).toBe(200);
      expect(batches).toHaveLength(1);
      expect(Buffer.byteLength(String(batches[0][1].body), "utf8")).toBe(batchBytes);
      expect((await getWebsiteContent()).holidays[0].name).toBe(patch.holidays[0].name);
      expect(result.collectionsRevision).toBe(1);
    } else {
      expect(response.status).toBe(400);
      expect(result.error).toContain("1000000 bytes");
      expect(result.requiresReload).not.toBe(true);
      expect(batches).toEqual([]);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(await getWebsiteContent()).toEqual(before);
    }
  });
});
