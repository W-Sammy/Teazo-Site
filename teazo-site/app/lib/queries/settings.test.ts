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
        },
        {
          id: "admin-id",
          username: "Test Admin",
          email: "admin@example.invalid",
          role: 2,
          canManageAdmins: 1,
          canResendInvitation: 1,
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
      },
      {
        id: "admin-id",
        username: "Test Admin",
        email: "admin@example.invalid",
        role: 2,
        canManageAdmins: false,
        canResendInvitation: true,
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

  it("always inserts new accounts as Admin without management privileges", async () => {
    mocks.first.mockResolvedValue({
      id: "new-admin-id",
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 2,
      canResendInvitation: 1,
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
  });

  it("ignores client-supplied Owner roles and management permissions", async () => {
    mocks.first.mockResolvedValue({
      id: "new-admin-id",
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 2,
      canResendInvitation: 1,
    });

    // Simulate additional properties supplied by an untrusted client.
    const input = {
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 1,
      canManageAdmins: true,
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
    expect(mocks.run).toHaveBeenCalledOnce();
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
