import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  bind: vi.fn(),
  run: vi.fn(),
  first: vi.fn(),
  all: vi.fn(),
}));

vi.mock("@/app/lib/d1", () => ({
  prepare: mocks.prepare,
}));

import {
  createSettingsAdmin,
  findSettingsAdminForInvitation,
  listSettingsAdmins,
  removeSettingsAdmin,
  updateSettingsAdminUsername,
} from "./settings";

describe("Admin Settings database queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.prepare.mockReturnValue({
      bind: mocks.bind,
      all: mocks.all,
    });

    mocks.bind.mockReturnValue({
      run: mocks.run,
      first: mocks.first,
    });

    mocks.run.mockResolvedValue({
      success: true,
    });

    mocks.all.mockResolvedValue({
      results: [],
    });

    mocks.first.mockResolvedValue(null);
  });

  it("lists only non-deleted administrators", async () => {
    mocks.all.mockResolvedValue({
      results: [
        {
          id: "owner-id",
          username: "Test Owner",
          email: "owner@example.invalid",
          role: 1,
          canResendInvitation: 0,
          canReceiveOwnership: 0,
        },
      ],
    });

    const admins = await listSettingsAdmins();

    expect(mocks.prepare).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE deleted_at IS NULL",
      ),
    );

    expect(admins).toHaveLength(1);
    expect(admins[0].role).toBe(1);
    expect(admins[0].canManageAdmins).toBe(true);
    expect(admins[0].canResendInvitation).toBe(false);
    expect(admins[0].canReceiveOwnership).toBe(false);
  });

  it("assigns management permissions according to role rather than legacy flags", async () => {
    mocks.all.mockResolvedValue({
      results: [
        {
          id: "owner-id",
          username: "Test Owner",
          email: "owner@example.invalid",
          role: 1,
          canManageAdmins: 0,
          canResendInvitation: 0,
          canReceiveOwnership: 0,
        },
        {
          id: "admin-id",
          username: "Test Admin",
          email: "admin@example.invalid",
          role: 2,
          canManageAdmins: 1,
          canResendInvitation: 1,
          canReceiveOwnership: 1,
        },
      ],
    });

    const admins = await listSettingsAdmins();

    expect(admins).toEqual([
      {
        id: "owner-id",
        username: "Test Owner",
        email: "owner@example.invalid",
        role: 1,
        canManageAdmins: true,
        canResendInvitation: false,
        canReceiveOwnership: false,
      },
      {
        id: "admin-id",
        username: "Test Admin",
        email: "admin@example.invalid",
        role: 2,
        canManageAdmins: false,
        canResendInvitation: true,
        canReceiveOwnership: true,
      },
    ]);
  });

  it("limits invitation eligibility to the two supported roles", async () => {
    await listSettingsAdmins();

    const sql = mocks.prepare.mock.calls[0][0] as string;

    expect(sql).toMatch(
      /role_id\s+IN\s*\(\s*1\s*,\s*2\s*\)/i,
    );

    expect(sql).not.toMatch(
      /role_id\s+IN\s*\(\s*1\s*,\s*2\s*,\s*3\s*\)/i,
    );

    expect(sql).toMatch(
      /CASE[\s\S]*?password_hash\s+IS\s+NULL[\s\S]*?THEN\s+1/i,
    );
  });

  it("requires an active role-2 Admin for ownership-transfer eligibility", async () => {
    await listSettingsAdmins();

    const sql = mocks.prepare.mock.calls[0][0] as string;

    // Ownership eligibility is derived by SQL rather
    // than supplied by the browser.
    expect(sql).toMatch(
      /WHEN\s+role_id\s*=\s*2\s+AND\s+status\s*=\s*'active'\s+THEN\s+1/i,
    );

    expect(sql).toMatch(
      /END\s+AS\s+canReceiveOwnership/i,
    );

    // Deleted administrators are excluded from the list.
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("maps ownership-transfer eligibility from the database flag", async () => {
    mocks.all.mockResolvedValue({
      results: [
        {
          id: "active-admin-id",
          username: "Active Admin",
          email: "active@example.invalid",
          role: 2,
          canResendInvitation: 0,
          canReceiveOwnership: 1,
        },
        {
          id: "invited-admin-id",
          username: "Invited Admin",
          email: "invited@example.invalid",
          role: 2,
          canResendInvitation: 1,
          canReceiveOwnership: 0,
        },
        {
          id: "owner-id",
          username: "Test Owner",
          email: "owner@example.invalid",
          role: 1,
          canResendInvitation: 0,
          canReceiveOwnership: 0,
        },
      ],
    });

    const admins = await listSettingsAdmins();

    expect(admins[0].canReceiveOwnership).toBe(true);
    expect(admins[1].canReceiveOwnership).toBe(false);
    expect(admins[2].canReceiveOwnership).toBe(false);

    // Receiving ownership does not grant the Admin
    // permission to manage other administrators.
    expect(admins[0].canManageAdmins).toBe(false);
    expect(admins[2].canManageAdmins).toBe(true);
  });

  it("always inserts new accounts as Admin without management privileges", async () => {
    mocks.first.mockResolvedValue({
      id: "new-admin-id",
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 2,
      canResendInvitation: 1,
      canReceiveOwnership: 0,
    });

    const admin = await createSettingsAdmin({
      username: " Disposable Admin ",
      email: " Disposable@Example.Invalid ",
    });

    const insertSql = mocks.prepare.mock.calls[0][0] as string;

    expect(insertSql).toContain("INSERT INTO admin_user");

    // The SQL hardcodes role 2 and can_invite_users 0.
    expect(insertSql).toMatch(
      /VALUES\s*\(\?1,\s*\?2,\s*\?3,\s*\?4,\s*2,\s*0,\s*'invited'\)/,
    );

    // SQL columns:
    // ?1 = id
    // ?2 = email
    // ?3 = email_normalized
    // ?4 = username
    expect(mocks.bind).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      "Disposable@Example.Invalid",
      "disposable@example.invalid",
      "Disposable Admin",
    );

    expect(mocks.run).toHaveBeenCalledOnce();

    expect(admin.role).toBe(2);
    expect(admin.canManageAdmins).toBe(false);
    expect(admin.canResendInvitation).toBe(true);
    expect(admin.canReceiveOwnership).toBe(false);
  });

  it("ignores client-supplied Owner roles and management permissions", async () => {
    mocks.first.mockResolvedValue({
      id: "new-admin-id",
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 2,
      canResendInvitation: 1,
      canReceiveOwnership: 0,
    });

    // Simulate elevated properties supplied by an untrusted client.
    const input = {
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 1,
      canManageAdmins: true,
      canReceiveOwnership: true,
      can_invite_users: 1,
    };

    const admin = await createSettingsAdmin(input);

    const insertSql = mocks.prepare.mock.calls[0][0] as string;

    expect(insertSql).toMatch(
      /VALUES\s*\(\?1,\s*\?2,\s*\?3,\s*\?4,\s*2,\s*0,\s*'invited'\)/,
    );

    expect(mocks.bind).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      "disposable@example.invalid",
      "disposable@example.invalid",
      "Disposable Admin",
    );

    expect(admin.role).toBe(2);
    expect(admin.canManageAdmins).toBe(false);
    expect(admin.canReceiveOwnership).toBe(false);
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it.each([
    { id: "owner-id", role: 1, username: "Ben" },
    { id: "admin-id", role: 2, username: "Updated Admin" },
  ])(
    "updates only the username of a role-$role account",
    async ({ id, role, username }) => {
      mocks.first.mockResolvedValue({
        id,
        username,
        email: "original@example.invalid",
        role,
        canResendInvitation: 0,
        canReceiveOwnership: role === 2 ? 1 : 0,
      });

      const updated = await updateSettingsAdminUsername(
        id,
        `  ${username}  `,
      );

      expect(mocks.prepare).toHaveBeenCalledTimes(2);

      const sql = mocks.prepare.mock.calls[0][0] as string;

      expect(sql).toMatch(/UPDATE\s+admin_user/i);
      expect(sql).toMatch(/WHERE\s+id\s*=\s*\?1/i);
      expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
      expect(sql).toMatch(
        /role_id\s+IN\s*\(\s*1\s*,\s*2\s*\)/i,
      );

      // No identity, role, permission, or credential changes.
      const setClause =
        sql.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0] ?? "";

      expect(setClause).toMatch(/username\s*=\s*\?2/i);
      expect(setClause).toMatch(/updated_at\s*=/i);
      expect(setClause).not.toMatch(
        /\b(?:id|email|email_normalized|role_id|can_invite_users|password_hash|session_version|status|deleted_at)\s*=/i,
      );

      expect(mocks.bind).toHaveBeenNthCalledWith(
        1,
        id,
        username,
      );
      expect(mocks.run).toHaveBeenCalledOnce();
      expect(mocks.bind).toHaveBeenNthCalledWith(2, id);
      expect(mocks.first).toHaveBeenCalledOnce();

      expect(updated).toEqual({
        id,
        username,
        email: "original@example.invalid",
        role,
        canManageAdmins: role === 1,
        canResendInvitation: false,
        canReceiveOwnership: role === 2,
      });
    },
  );

  it("accepts a username with exactly 40 characters", async () => {
    const username = "x".repeat(40);

    mocks.first.mockResolvedValue({
      id: "admin-id",
      username,
      email: "test@example.invalid",
      role: 2,
      canResendInvitation: 0,
      canReceiveOwnership: 0,
    });

    const result = await updateSettingsAdminUsername(
      "admin-id",
      username,
    );

    expect(result.username).toBe(username);
    expect(mocks.bind).toHaveBeenNthCalledWith(
      1,
      "admin-id",
      username,
    );
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it.each(["", "  ", "\n\t"])(
    "rejects an invalid administrator ID %j without querying D1",
    async (id) => {
      await expect(
        updateSettingsAdminUsername(id, "Updated Admin"),
      ).rejects.toThrow(
        "Admin not found or cannot be changed.",
      );

      expect(mocks.prepare).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      description: "non-string username",
      username: 123 as unknown as string,
      error: "Username must be a string.",
    },
    {
      description: "empty username",
      username: "",
      error: "Username is required.",
    },
    {
      description: "whitespace username",
      username: "  ",
      error: "Username is required.",
    },
    {
      description: "overlong username",
      username: "x".repeat(41),
      error: "Username must be 40 characters or fewer.",
    },
  ])(
    "rejects $description without querying D1",
    async ({ username, error }) => {
      await expect(
        updateSettingsAdminUsername("admin-id", username),
      ).rejects.toThrow(error);

      expect(mocks.prepare).not.toHaveBeenCalled();
    },
  );

  it("rejects a nonexistent or deleted administrator after attempting the update", async () => {
    mocks.first.mockResolvedValue(null);

    await expect(
      updateSettingsAdminUsername(
        "missing-id",
        "Updated Admin",
      ),
    ).rejects.toThrow(
      "Admin not found or cannot be changed.",
    );

    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.first).toHaveBeenCalledOnce();
  });

  it("rejects an update when the username cannot be verified after rereading", async () => {
    mocks.first.mockResolvedValue({
      id: "admin-id",
      username: "Original Admin",
      email: "original@example.invalid",
      role: 2,
      canResendInvitation: 0,
      canReceiveOwnership: 1,
    });

    await expect(
      updateSettingsAdminUsername(
        "admin-id",
        "Updated Admin",
      ),
    ).rejects.toThrow(
      "Admin not found or cannot be changed.",
    );

    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.first).toHaveBeenCalledOnce();
  });

  it("propagates database update failures", async () => {
    mocks.run.mockRejectedValue(
      new Error("Database unavailable"),
    );

    await expect(
      updateSettingsAdminUsername(
        "admin-id",
        "Updated Admin",
      ),
    ).rejects.toThrow("Database unavailable");

    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.first).not.toHaveBeenCalled();
  });

  it("uses a soft delete instead of removing the database record", async () => {
    await removeSettingsAdmin("disposable-admin-id");

    const sql = mocks.prepare.mock.calls[0][0] as string;

    expect(sql).toContain("UPDATE admin_user");
    expect(sql).toContain("SET deleted_at");
    expect(sql).toContain("updated_at");
    expect(sql).toContain("deleted_at IS NULL");

    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);

    expect(mocks.bind).toHaveBeenCalledWith(
      "disposable-admin-id",
    );

    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it("includes the Owner-deletion safeguard in SQL", async () => {
    await removeSettingsAdmin("owner-id");

    const sql = mocks.prepare.mock.calls[0][0] as string;

    // The query excludes Owner records from the UPDATE,
    // even if an Owner ID is supplied.
    expect(sql).toMatch(/role_id\s*<>\s*1/);

    expect(sql).toMatch(/WHERE\s+id\s*=\s*\?1/i);

    expect(mocks.bind).toHaveBeenCalledWith(
      "owner-id",
    );
  });

  it("finds an eligible Admin for invitation resending", async () => {
    mocks.first.mockResolvedValue({
      id: "eligible-admin-id",
      username: "Eligible Admin",
      email: "eligible@example.invalid",
      role: 2,
      canResendInvitation: 1,
      canReceiveOwnership: 0,
    });

    const admin = await findSettingsAdminForInvitation(
      "eligible-admin-id",
    );

    expect(mocks.bind).toHaveBeenCalledWith(
      "eligible-admin-id",
    );

    expect(mocks.first).toHaveBeenCalledOnce();

    expect(admin).toEqual({
      id: "eligible-admin-id",
      username: "Eligible Admin",
      email: "eligible@example.invalid",
      role: 2,
      canManageAdmins: false,
      canResendInvitation: true,
      canReceiveOwnership: false,
    });
  });

  it("requires an eligible status and no existing password for invitation resending", async () => {
    await findSettingsAdminForInvitation("test-admin-id");

    const sql = mocks.prepare.mock.calls[0][0] as string;

    expect(sql).toMatch(
      /password_hash\s+IS\s+NULL/i,
    );

    expect(sql).toMatch(
      /status\s+IN\s*\(\s*'active'\s*,\s*'invited'\s*\)/i,
    );

    expect(sql).toContain("deleted_at IS NULL");

    expect(mocks.bind).toHaveBeenCalledWith(
      "test-admin-id",
    );

    // The query does not include suspended accounts.
    expect(sql).not.toMatch(
      /status\s+IN\s*\([^)]*'suspended'/i,
    );
  });

  it("excludes the retired Can View role from invitation eligibility", async () => {
    await findSettingsAdminForInvitation("legacy-viewer-id");

    const sql = mocks.prepare.mock.calls[0][0] as string;

    expect(sql).toMatch(
      /role_id\s+IN\s*\(\s*1\s*,\s*2\s*\)/i,
    );

    expect(sql).not.toMatch(
      /role_id\s+IN\s*\(\s*1\s*,\s*2\s*,\s*3\s*\)/i,
    );
  });

  it("returns null when no eligible invitation account is found", async () => {
    mocks.first.mockResolvedValue(null);

    const admin = await findSettingsAdminForInvitation(
      "ineligible-admin-id",
    );

    expect(admin).toBeNull();

    expect(mocks.bind).toHaveBeenCalledWith(
      "ineligible-admin-id",
    );

    expect(mocks.first).toHaveBeenCalledOnce();
  });
});
