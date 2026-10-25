import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdminApi } from "@/app/lib/admin";
import { sendAdminInvite } from "@/app/lib/admin-invite";
import { findSettingsAdminForInvitation } from "@/app/lib/queries/settings";
import { consumePasswordRequestLimit } from "@/app/lib/password-request-rate-limit";
import { POST } from "./route";

vi.mock("@/app/lib/admin", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/app/lib/admin-invite", () => ({
  sendAdminInvite: vi.fn(),
}));

vi.mock("@/app/lib/queries/settings", () => ({
  findSettingsAdminForInvitation: vi.fn(),
}));

vi.mock("@/app/lib/password-request-rate-limit", () => ({
  consumePasswordRequestLimit: vi.fn(),
}));

const owner = {
  id: "owner-id",
  username: "owner",
  role_id: 1,
  can_invite_users: 1,
};

const eligibleAdmin = {
  id: "target-id",
  username: "test admin",
  email: "test@example.com",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: true,
};

function makeRequest() {
  return new Request(
    "http://localhost:3000/api/admin/target-id/resend-invitation",
    {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
      },
    },
  );
}

function context(id = "target-id") {
  return {
    params: Promise.resolve({ id }),
  };
}

describe("POST /api/admin/[id]/resend-invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(requireAdminApi).mockResolvedValue({
      ok: true,
      admin: owner,
    } as never);

    vi.mocked(findSettingsAdminForInvitation).mockResolvedValue(
      eligibleAdmin as never,
    );

    vi.mocked(consumePasswordRequestLimit).mockResolvedValue(true);
    vi.mocked(sendAdminInvite).mockResolvedValue("sent");
  });

  it("rejects unauthenticated requests", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    });

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(401);
    expect(sendAdminInvite).not.toHaveBeenCalled();
  });

  it("rejects unauthorized administrators", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: true,
      admin: {
        ...owner,
        role_id: 2,
        can_invite_users: 0,
      },
    } as never);

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(403);
    expect(sendAdminInvite).not.toHaveBeenCalled();
  });

  it("allows Owner accounts", async () => {
    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(200);
    expect(sendAdminInvite).toHaveBeenCalledOnce();
  });

  it("allows Can Edit accounts with invitation permission", async () => {
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: true,
      admin: {
        ...owner,
        role_id: 2,
        can_invite_users: 1,
      },
    } as never);

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(200);
  });

  it("rejects accounts that are no longer eligible", async () => {
    vi.mocked(findSettingsAdminForInvitation).mockResolvedValueOnce(
      null,
    );

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(409);
    expect(sendAdminInvite).not.toHaveBeenCalled();
  });

  it("limits excessive requests from one administrator", async () => {
    vi.mocked(consumePasswordRequestLimit).mockResolvedValueOnce(
      false,
    );

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");

    expect(sendAdminInvite).not.toHaveBeenCalled();
  });

  it("limits excessive invitations to the same target", async () => {
    vi.mocked(consumePasswordRequestLimit)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(429);
    expect(sendAdminInvite).not.toHaveBeenCalled();
  });

  it("checks requester and recipient rate limits separately", async () => {
    await POST(makeRequest(), context());

    expect(consumePasswordRequestLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "admin-invite-resend-requester",
        limit: 10,
      }),
      "owner-id",
    );

    expect(consumePasswordRequestLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "admin-invite-resend-target",
        limit: 3,
      }),
      "target-id",
    );
  });

  it("uses the server-authorized invitation sender", async () => {
    await POST(makeRequest(), context());

    expect(sendAdminInvite).toHaveBeenCalledWith({
      adminId: "target-id",
      email: "test@example.com",
      username: "test admin",
      role: 2,
      canManageAdmins: false,
      invitedBy: "owner",
    });
  });

  it("returns a success message when delivery is submitted", async () => {
    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      message: "Invitation submitted for delivery.",
    });
  });

  it("reports failed email delivery", async () => {
    vi.mocked(sendAdminInvite).mockResolvedValueOnce("failed");

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(503);

    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("could not be sent"),
    });
  });

  it("rejects skipped invitations", async () => {
    vi.mocked(sendAdminInvite).mockResolvedValueOnce("skipped");

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(503);
  });

  it("distinguishes local email output from real delivery", async () => {
    vi.mocked(sendAdminInvite).mockResolvedValueOnce("printed");

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(200);

    expect(await response.json()).toEqual({
      message: "Invitation generated. Check your local email output.",
    });
  });

  it("returns no-store on successful responses", async () => {
    const response = await POST(makeRequest(), context());

    expect(response.headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  it("returns a service error for unexpected failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.mocked(findSettingsAdminForInvitation).mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const response = await POST(makeRequest(), context());

    expect(response.status).toBe(503);
  });
});
