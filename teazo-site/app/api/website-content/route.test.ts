import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  updateWebsiteContent: vi.fn(),
}));

vi.mock("@/app/lib/admin", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/app/lib/website-content", () => ({
  getWebsiteContent: vi.fn(),
  updateWebsiteContent: mocks.updateWebsiteContent,
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
