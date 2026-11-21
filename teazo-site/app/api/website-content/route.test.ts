import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  updateWebsiteContent: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: vi.fn(),
  updateWebsiteContent: mocks.updateWebsiteContent,
  deleteWebsiteContentEntry: vi.fn(),
  WebsiteContentValidationError: class WebsiteContentValidationError extends Error {},
  WebsiteContentNotFoundError: class WebsiteContentNotFoundError extends Error {},
  WebsiteContentConflictError: class WebsiteContentConflictError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { PATCH } = await import("@/app/api/website-content/route");

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
});

// delivery tests
describe("additional delivery API tests", () => {
    // saves & permission results are mocked
    const platform = {
        id: "delivery-test", label: "Test Delivery", icon: "",
        url: "https://example.com/order", enabled: true,
    };

    function submit(deliveryLinks: unknown) {
        return patch({ deliveryLinks });
    }

    beforeEach(() => {
        vi.resetAllMocks();
        mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: "test-admin", role_id: 2 } });
        mocks.updateWebsiteContent.mockImplementation(async (patch) => patch);
    });

    afterEach(() => vi.restoreAllMocks());

    describe("delivery website-content API", () => {
        it.each([1, 2])("passes an approved role %i save to the content library", async (role) => {
            // checks how the route handles approval
            mocks.requireAdminApi.mockResolvedValue({ ok: true, admin: { id: "test-admin", role_id: role } });
            const response = await submit([platform]);

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ deliveryLinks: [platform] });
            expect(mocks.requireAdminApi).toHaveBeenCalledWith(expect.any(Request), 2);
            expect(mocks.updateWebsiteContent).toHaveBeenCalledExactlyOnceWith({ deliveryLinks: [platform] });
            expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
            expect(revalidatePath).toHaveBeenCalledWith("/admin/website-content");
        });

        it.each([401, 403])("does not save or clear caches when the guard returns %i", async (status) => {
            const denied = Response.json({ error: "Access denied" }, { status });
            mocks.requireAdminApi.mockResolvedValue({ ok: false, response: denied });
            const response = await submit([platform]);

            expect(response).toBe(denied);
            expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it.each([
            { label: "" }, { label: "   " }, { url: "" }, { url: "   " },
            { url: "tea@example.com" }, { url: "mailto:tea@example.com" },
            { url: "example.com" }, { url: "not a link" },
            { url: "javascript:alert(1)" }, { url: "data:text/html,test" },
            { url: "ftp://example.com/order" },
            { enabled: false, label: "", url: "https://example.com/order" },
            { enabled: false, url: "tea@example.com" },
        ])("rejects invalid delivery data sent directly to the API: %j", async (patch) => {
            const response = await submit([{ ...platform, ...patch }]);

            expect(response.status).toBe(400);
            expect(await response.json()).toMatchObject({ errors: expect.any(Array) });
            expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("accepts a complete hidden platform without removing it", async () => {
            const hidden = { ...platform, enabled: false };

            expect((await submit([hidden])).status).toBe(200);
            expect(mocks.updateWebsiteContent).toHaveBeenCalledWith({ deliveryLinks: [hidden] });
        });

        it("passes an empty list through so the final platform can be removed", async () => {
            expect((await submit([])).status).toBe(200);
            expect(mocks.updateWebsiteContent).toHaveBeenCalledExactlyOnceWith({ deliveryLinks: [] });
        });

        it("accepts a name at the 16 character boundary", async () => {
            expect((await submit([{ ...platform, label: "abcdefghijklmnop" }])).status).toBe(200);
        });

        it("returns a save error without clearing caches when the database library fails", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            mocks.updateWebsiteContent.mockRejectedValueOnce(new Error("Test database unavailable"));

            const response = await submit([platform]);
            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({
                error: "The write could not be confirmed. Reload this page to check current content before trying again.",
                requiresReload: true,
            });
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    // regression tests
    describe("delivery server validation gaps", () => {
        it("rejects a name longer than 16 characters even without the browser input limit", async () => {
            const response = await submit([{ ...platform, label: "abcdefghijklmnopq" }]);
            
            expect(response.status).toBe(400);
            expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
        });

        it.each([
            { name: "null list", value: null },
            { name: "string instead of a list", value: "not a list" },
            { name: "object instead of a list", value: {} },
            { name: "null entry", value: [null] },
            { name: "number instead of a name", value: [{ ...platform, label: 123 }] },
            { name: "number instead of a URL", value: [{ ...platform, url: 123 }] },
            { name: "string instead of a visibility boolean", value: [{ ...platform, enabled: "false" }] },
        ])("returns a validation error for $name", async ({ value }) => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            const response = await submit(value);

            // malformed client data should get a 400, rather than being saved or causing a 500
            expect(response.status).toBe(400);
            expect(mocks.updateWebsiteContent).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });
});