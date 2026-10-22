
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
  listSettingsAdmins,
  removeSettingsAdmin,
} from "./settings";

describe("Admin Settings database queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
  });

  it("lists only non-deleted administrators", async () => {
    mocks.all.mockResolvedValue({
      results: [
        {
          id: "owner-id",
          username: "Test Owner",
          email: "owner@example.invalid",
          role: 1,
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
  });

  it("always inserts new accounts as Admin without management privileges", async () => {
    mocks.first.mockResolvedValue({
      id: "new-admin-id",
      username: "Disposable Admin",
      email: "disposable@example.invalid",
      role: 2,
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
});
