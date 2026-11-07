import { afterEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  updateWebsiteContent: vi.fn(),
  deleteWebsiteContentEntry: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: vi.fn(),
  updateWebsiteContent: mocks.updateWebsiteContent,
  deleteWebsiteContentEntry: mocks.deleteWebsiteContentEntry,
  WebsiteContentConflictError: class WebsiteContentConflictError extends Error {},
  WebsiteContentNotFoundError: class WebsiteContentNotFoundError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { DELETE, PATCH } = await import("@/app/api/website-content/route");
const { WebsiteContentConflictError, WebsiteContentNotFoundError } = await import("@/app/lib/website-content");

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost:3000/api/website-content", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    }),
  );
}

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/website-content", () => {
  it("refuses anyone who is not an admin with edit rights, and saves nothing", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Authentication required." }, { status: 401 }),
    });
    const res = await patch({ onlineOrderingEnabled: false });
    expect(res.status).toBe(401);
    expect(mocks.requireAdminApi).toHaveBeenCalledWith(expect.any(Request), 2);
    expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
  });

  it("saves the online ordering switch for an admin", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: 1 } });
    mocks.updateWebsiteContent.mockResolvedValue({ onlineOrderingEnabled: false });
    const res = await patch({ onlineOrderingEnabled: false });
    expect(res.status).toBe(200);
    expect(mocks.updateWebsiteContent).toHaveBeenCalledWith({ onlineOrderingEnabled: false });
  });

  it("refuses a switch value that is not true or false", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: 1 } });
    const res = await patch({ onlineOrderingEnabled: "off" });
    expect(res.status).toBe(400);
    expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
  });

  it("strictly rejects base64 and data URLs in logo text patch with status 400", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: 1 } });
    const res = await patch({
      logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Embedded image data and data URLs are not permitted");
    expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
  });

  it("saves a valid logo reference for an admin", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: 1 } });
    mocks.updateWebsiteContent.mockResolvedValue({ logo: "https://r2.teazo.com/logo/test.webp" });
    const res = await patch({ logo: "https://r2.teazo.com/logo/test.webp" });
    expect(res.status).toBe(200);
    expect(mocks.updateWebsiteContent).toHaveBeenCalledWith({ logo: "https://r2.teazo.com/logo/test.webp" });
  });
});

function remove(body: unknown) {
  return DELETE(new Request("http://localhost:3000/api/website-content", {
    method: "DELETE",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  }));
}

describe("DELETE /api/website-content", () => {
  it.each([401, 403])("rejects unauthorized deletion with %i before accessing storage", async (status) => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: new Response(null, { status }) });
    const response = await remove({ collection: "socialLinks", id: "facebook", revision: 0 });
    expect(response.status).toBe(status);
    expect(mocks.requireAdminApi).toHaveBeenCalledWith(expect.any(Request), 2);
    expect(mocks.deleteWebsiteContentEntry).not.toHaveBeenCalled();
  });

  it.each(["socialLinks", "holidays"])("deletes %s and invalidates public pages", async (collection) => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: "editor" } });
    mocks.deleteWebsiteContentEntry.mockResolvedValue(4);
    const response = await remove({ collection, id: "entry", revision: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ collectionsRevision: 4 });
    expect(mocks.deleteWebsiteContentEntry).toHaveBeenCalledWith(collection, "entry", 3);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it.each([null, {}, { collection: "other", id: "x", revision: 0 },
    { collection: "socialLinks", id: "", revision: 0 },
    { collection: "socialLinks", id: "x", revision: -1 },
    { collection: "socialLinks", id: "x" },
  ])("rejects malformed deletion data %j", async (body) => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    expect((await remove(body)).status).toBe(400);
    expect(mocks.deleteWebsiteContentEntry).not.toHaveBeenCalled();
  });

  it("returns a conflict for stale or duplicate deletion attempts", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    mocks.deleteWebsiteContentEntry.mockRejectedValueOnce(new WebsiteContentConflictError());
    const response = await remove({ collection: "socialLinks", id: "facebook", revision: 0 });
    expect(response.status).toBe(409);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing target without invalidating pages", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    mocks.deleteWebsiteContentEntry.mockRejectedValueOnce(new WebsiteContentNotFoundError());
    const response = await remove({ collection: "holidays", id: "12-25", revision: 0 });
    expect(response.status).toBe(404);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("requires reconciliation when cache invalidation fails after commit", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    mocks.deleteWebsiteContentEntry.mockResolvedValueOnce(1);
    vi.mocked(revalidatePath).mockImplementationOnce(() => { throw new Error("cache failure"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await remove({ collection: "holidays", id: "12-25", revision: 0 });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual(expect.objectContaining({ requiresReload: true }));
    log.mockRestore();
  });

  it("returns a safe error without exposing database details", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: true });
    mocks.deleteWebsiteContentEntry.mockRejectedValueOnce(new Error("private database details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await remove({ collection: "socialLinks", id: "facebook", revision: 0 });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database details");
    expect(revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
