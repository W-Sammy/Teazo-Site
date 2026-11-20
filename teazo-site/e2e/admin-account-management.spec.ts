/**
 * Browser tests for Teazo administrator account management.
 *
 * Exercises the real Owner-only Settings interface with synthetic
 * administrator records and intercepted account-management APIs.
 *
 * All create, update, delete, invitation, and ownership-transfer
 * requests are mocked or blocked. No real accounts or emails change.
 *
 * Requires a locally authenticated Owner browser session.
 * Keep the storage-state JSON outside the repository.
 */

import { existsSync } from "node:fs";

import {
  expect,
  test,
  type Page,
  type Route,
} from "@playwright/test";

// Reuse the established local administrator session when it belongs
// to the Owner, or supply a separate Owner-specific session file.
const ownerStatePath =
  process.env.TEAZO_E2E_OWNER_STORAGE_STATE ??
  process.env.TEAZO_E2E_ADMIN_STORAGE_STATE;

const hasOwnerState =
  Boolean(ownerStatePath) &&
  existsSync(ownerStatePath!);

test.use({
  storageState:
    hasOwnerState && ownerStatePath
      ? ownerStatePath
      : { cookies: [], origins: [] },
});

// Keep the synthetic account shape consistent with admin-perms.ts.
type TestAdmin = {
  id: string;
  username: string;
  email: string;
  role: 1 | 2;
  canManageAdmins: boolean;
  canResendInvitation: boolean;
  canReceiveOwnership: boolean;
};

type ApiFailure = {
  status: number;
  message: string;
};

type RecordedWrite = {
  method: string;
  path: string;
  body: unknown;
};

type MockState = {
  records: TestAdmin[];
  writes: RecordedWrite[];
  canEdit: boolean;
  listFailure: ApiFailure | null;
  createFailure: ApiFailure | null;
  editFailure: ApiFailure | null;
  deleteFailure: ApiFailure | null;
  resendFailure: ApiFailure | null;
  holdResend: Promise<void> | null;
  revokeAfterResend: boolean;
};

const OWNER: TestAdmin = {
  id: "tz571-owner",
  username: "Browser Owner",
  email: "owner@example.invalid",
  role: 1,
  canManageAdmins: true,
  canResendInvitation: false,
  canReceiveOwnership: false,
};

const ADMIN: TestAdmin = {
  id: "tz571-admin",
  username: "Browser Admin",
  email: "admin@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: false,
  canReceiveOwnership: true,
};

const INVITED: TestAdmin = {
  id: "tz571-invited",
  username: "Invited Admin",
  email: "invited@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: true,
  canReceiveOwnership: false,
};

const NEW_ADMIN: TestAdmin = {
  id: "tz571-new",
  username: "New Browser Admin",
  email: "new@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: true,
  canReceiveOwnership: false,
};

// Block unexpected write methods across the browser session.
// More specific mocked API handlers are registered afterward.
async function blockUnexpectedWrites(route: Route) {
  const method = route.request().method();

  if (
    method === "GET" ||
    method === "HEAD" ||
    method === "OPTIONS"
  ) {
    await route.continue();
    return;
  }

  await route.abort("blockedbyclient");
}

// Create independent synthetic account storage for each test.
// Nothing is read from or written to the real accounts API.
async function installMockAccounts(page: Page) {
  const state: MockState = {
    records: [OWNER, ADMIN, INVITED].map((record) => ({
      ...record,
    })),
    writes: [],
    canEdit: true,
    listFailure: null,
    createFailure: null,
    editFailure: null,
    deleteFailure: null,
    resendFailure: null,
    holdResend: null,
    revokeAfterResend: false,
  };

  // Intercept administrator listing, creation, editing, and deletion.
  await page.route(
    "**/api/admin/settings/admins**",
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;

      if (
        path === "/api/admin/settings/admins" &&
        method === "GET"
      ) {
        if (state.listFailure) {
          await route.fulfill({
            status: state.listFailure.status,
            json: { error: state.listFailure.message },
          });
          return;
        }

        await route.fulfill({
          status: 200,
          json: {
            admins: state.records,
            canEdit: state.canEdit,
          },
        });
        return;
      }

      // Record every account write before returning a mock response.
      if (
        method === "POST" ||
        method === "PATCH" ||
        method === "DELETE"
      ) {
        state.writes.push({
          method,
          path,
          body:
            method === "DELETE"
              ? null
              : request.postDataJSON(),
        });
      }

      if (
        path === "/api/admin/settings/admins" &&
        method === "POST"
      ) {
        if (state.createFailure) {
          await route.fulfill({
            status: state.createFailure.status,
            json: { error: state.createFailure.message },
          });
          return;
        }

        const input = request.postDataJSON() as {
          username: string;
          email: string;
        };

        const created: TestAdmin = {
          ...NEW_ADMIN,
          username: input.username,
          email: input.email,
        };

        state.records.push(created);

        await route.fulfill({
          status: 201,
          json: {
            admin: created,
            invitation: {
              submitted: true,
              message: "Test invitation submitted.",
            },
          },
        });
        return;
      }

      const prefix = "/api/admin/settings/admins/";

      if (path.startsWith(prefix) && method === "PATCH") {
        if (state.editFailure) {
          await route.fulfill({
            status: state.editFailure.status,
            json: { error: state.editFailure.message },
          });
          return;
        }

        const id = decodeURIComponent(path.slice(prefix.length));
        const input = request.postDataJSON() as {
          username: string;
        };

        const index = state.records.findIndex(
          (record) => record.id === id,
        );

        if (index < 0) {
          await route.fulfill({
            status: 404,
            json: { error: "Test account not found." },
          });
          return;
        }

        state.records[index] = {
          ...state.records[index],
          username: input.username,
        };

        await route.fulfill({
          status: 200,
          json: { admin: state.records[index] },
        });
        return;
      }

      if (path.startsWith(prefix) && method === "DELETE") {
        if (state.deleteFailure) {
          await route.fulfill({
            status: state.deleteFailure.status,
            json: { error: state.deleteFailure.message },
          });
          return;
        }

        const id = decodeURIComponent(path.slice(prefix.length));

        state.records = state.records.filter(
          (record) => record.id !== id,
        );

        await route.fulfill({
          status: 200,
          json: { message: "Test account removed." },
        });
        return;
      }

      // Unknown requests to administrator management fail closed.
      await route.abort("blockedbyclient");
    },
  );

  // Resend invitations without contacting the email provider.
  await page.route(
    "**/api/admin/*/resend-invitation",
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (request.method() !== "POST") {
        await route.abort("blockedbyclient");
        return;
      }

      state.writes.push({
        method: "POST",
        path,
        body: null,
      });

      if (state.holdResend) {
        await state.holdResend;
      }

      if (state.resendFailure) {
        await route.fulfill({
          status: state.resendFailure.status,
          json: { error: state.resendFailure.message },
        });
        return;
      }

      // Simulate a permission change detected on the following
      // administrator-list refresh, not a real session change.
      if (state.revokeAfterResend) {
        state.listFailure = {
          status: 403,
          message: "Owner authorization has expired.",
        };
      }

      await route.fulfill({
        status: 200,
        json: { message: "Test invitation resent." },
      });
    },
  );

  // Ownership-transfer-specific behavior already has dedicated tests.
  // Supply only a harmless empty status response here.
  await page.route(
    "**/api/admin/ownership-transfer",
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          json: { transfer: null },
        });
        return;
      }

      await route.abort("blockedbyclient");
    },
  );

  return state;
}

// Navigate through the real server-side Owner authorization guard.
// Never try to bypass it with mocked browser API responses.
async function openSettings(page: Page) {
  await page.goto("/admin/settings");

  if (new URL(page.url()).pathname === "/login") {
    throw new Error(
      "The saved Owner session is missing or expired. Export a new local Owner session.",
    );
  }

  if (
    await page
      .getByRole("heading", { name: "Access denied" })
      .isVisible()
  ) {
    throw new Error(
      "The saved session is an Admin session, not an Owner session.",
    );
  }

  await expect(
    page.getByRole("heading", {
      name: "Owner",
      exact: true,
    }),
  ).toBeVisible();
}

// Open the administrator's real three-dot action menu.
async function openActions(page: Page, username: string) {
  await page.getByRole("button", {
    name: `Actions for ${username}`,
  }).click();
}

// Count intercepted requests for a particular API operation.
function countWrites(
  state: MockState,
  method: string,
  path: string,
) {
  return state.writes.filter(
    (write) =>
      write.method === method &&
      write.path === path,
  ).length;
}

// Wait until the synthetic administrator list has loaded.
async function waitForAccounts(page: Page) {
  await expect(
    page.getByRole("button", { name: /New User/ }),
  ).toBeVisible();

  await expect(
    page.getByTitle(ADMIN.username),
  ).toBeVisible();
}

// Every browser case requires a local Owner session and a
// fail-closed policy for unexpected writes.
test.beforeEach(async ({ page }) => {
  test.skip(
    !hasOwnerState,
    "Set TEAZO_E2E_OWNER_STORAGE_STATE to a local Owner browser session.",
  );

  await page.route("**/*", blockUnexpectedWrites);
});

test.describe("Frontend administrator account management", () => {
  test("displays separate Owner and Admin accounts with protected Owner actions", async ({
    page,
  }) => {
    await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await expect(page.getByTitle(OWNER.username)).toBeVisible();
    await expect(page.getByTitle(ADMIN.username)).toBeVisible();

    await openActions(page, OWNER.username);

    await expect(
      page.getByRole("menuitem", { name: "Edit Account" }),
    ).toBeVisible();

    await expect(
      page.getByRole("menuitem", { name: "Delete" }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("menuitem", {
        name: "Transfer Ownership",
      }),
    ).toHaveCount(0);
  });

  test("cancels Add New User without creating an account", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await page.getByRole("button", {
      name: /New User/,
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Add New User",
    });

    await dialog.getByRole("textbox", {
      name: /Username/,
    }).fill("Unsaved Administrator");

    await dialog.getByRole("textbox", {
      name: /Email/,
    }).fill("unsaved@example.invalid");

    await dialog.getByRole("button", {
      name: "Cancel",
    }).click();

    await expect(dialog).toHaveCount(0);

    expect(
      countWrites(
        state,
        "POST",
        "/api/admin/settings/admins",
      ),
    ).toBe(0);
  });

  test("creates a normalized Admin and displays invitation confirmation", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await page.getByRole("button", {
      name: /New User/,
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Add New User",
    });

    await dialog.getByRole("textbox", {
      name: /Username/,
    }).fill("  New Browser Admin  ");

    await dialog.getByRole("textbox", {
      name: /Email/,
    }).fill("  new@example.invalid  ");

    await dialog.getByRole("button", {
      name: "Add User",
    }).click();

    await expect(dialog).toHaveCount(0);

    await expect(
      page.getByTitle(NEW_ADMIN.username),
    ).toBeVisible();

    await expect(
      page.getByRole("status").filter({
        hasText: "Test invitation submitted.",
      }),
    ).toBeVisible();

    const request = state.writes.find(
      (write) =>
        write.method === "POST" &&
        write.path === "/api/admin/settings/admins",
    );

    expect(request?.body).toEqual({
      username: NEW_ADMIN.username,
      email: NEW_ADMIN.email,
    });

    // New accounts must remain regular Admins, not Owners.
    const created = state.records.find(
      (record) => record.id === NEW_ADMIN.id,
    );

    expect(created?.role).toBe(2);
    expect(created?.canManageAdmins).toBe(false);
  });

  test("rejects an empty Add User form without creating an account", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await page.getByRole("button", {
      name: /New User/,
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Add New User",
    });

    await dialog.getByRole("button", {
      name: "Add User",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toContainText("Please enter both a username and email.");

    expect(
      countWrites(
        state,
        "POST",
        "/api/admin/settings/admins",
      ),
    ).toBe(0);
  });

  test("preserves Add User inputs after an account-creation conflict", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);

    state.createFailure = {
      status: 409,
      message: "This email address is already registered.",
    };

    await openSettings(page);
    await waitForAccounts(page);

    await page.getByRole("button", {
      name: /New User/,
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Add New User",
    });

    await dialog.getByRole("textbox", {
      name: /Username/,
    }).fill("Duplicate Account");

    await dialog.getByRole("textbox", {
      name: /Email/,
    }).fill("duplicate@example.invalid");

    await dialog.getByRole("button", {
      name: "Add User",
    }).click();

    await expect(dialog.getByRole("alert")).toContainText(
      "This email address is already registered.",
    );

    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByRole("textbox", {
        name: /Username/,
      }),
    ).toHaveValue("Duplicate Account");

    await expect(
      page.getByTitle("Duplicate Account"),
    ).toHaveCount(0);
  });

  test("keeps account editing unchanged when canceled", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Edit Account",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Edit Account",
    });

    const username = dialog.getByRole("textbox", {
      name: /Username/,
    });

    await expect(
      dialog.getByRole("button", {
        name: "Save Changes",
      }),
    ).toBeDisabled();

    await username.fill("Unsaved Username");

    await dialog.getByRole("button", {
      name: "Cancel",
    }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByTitle(ADMIN.username)).toBeVisible();

    expect(
      countWrites(
        state,
        "PATCH",
        `/api/admin/settings/admins/${ADMIN.id}`,
      ),
    ).toBe(0);
  });

  test("validates an empty edited username without sending PATCH", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Edit Account",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Edit Account",
    });

    await dialog.getByRole("textbox", {
      name: /Username/,
    }).fill("   ");

    await dialog.getByRole("button", {
      name: "Save Changes",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toContainText("Username is required.");

    expect(
      countWrites(
        state,
        "PATCH",
        `/api/admin/settings/admins/${ADMIN.id}`,
      ),
    ).toBe(0);
  });

  test("updates an Admin username only after successful PATCH", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Edit Account",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Edit Account",
    });

    await dialog.getByRole("textbox", {
      name: /Username/,
    }).fill("  Updated Browser Admin  ");

    await dialog.getByRole("button", {
      name: "Save Changes",
    }).click();

    await expect(dialog).toHaveCount(0);

    await expect(
      page.getByTitle("Updated Browser Admin"),
    ).toBeVisible();

    await expect(
        page.getByTitle(ADMIN.username, { exact: true }),
    ).toHaveCount(0);

    const request = state.writes.find(
      (write) =>
        write.method === "PATCH" &&
        write.path ===
          `/api/admin/settings/admins/${ADMIN.id}`,
    );

    expect(request?.body).toEqual({
      username: "Updated Browser Admin",
    });

    const updated = state.records.find(
      (record) => record.id === ADMIN.id,
    );

    expect(updated?.role).toBe(2);
    expect(updated?.email).toBe(ADMIN.email);
  });

  test("preserves the edit dialog and username after a rejected PATCH", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);

    state.editFailure = {
      status: 403,
      message: "You cannot edit this administrator.",
    };

    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Edit Account",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Edit Account",
    });

    await dialog.getByRole("textbox", {
      name: /Username/,
    }).fill("Rejected Username");

    await dialog.getByRole("button", {
      name: "Save Changes",
    }).click();

    await expect(
      dialog.getByRole("alert"),
    ).toContainText("You cannot edit this administrator.");

    await expect(dialog).toBeVisible();
    await expect(page.getByTitle(ADMIN.username)).toBeVisible();

    await expect(
      page.getByTitle("Rejected Username"),
    ).toHaveCount(0);
  });

  test("cancels administrator deletion without a DELETE request", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Delete",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Delete admin?",
    });

    await expect(dialog).toContainText(ADMIN.username);

    await dialog.getByRole("button", {
      name: "Cancel",
    }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByTitle(ADMIN.username)).toBeVisible();

    expect(
      countWrites(
        state,
        "DELETE",
        `/api/admin/settings/admins/${ADMIN.id}`,
      ),
    ).toBe(0);
  });

  test("removes a regular administrator after confirmed deletion", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Delete",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Delete admin?",
    });

   await dialog.getByRole("button", {
        name: "Delete",
        exact: true,
    }).click();

    await expect(dialog).toHaveCount(0);

    await expect(
      page.getByTitle(ADMIN.username),
    ).toHaveCount(0);

    await expect(
      page.getByTitle(OWNER.username),
    ).toBeVisible();

    expect(
      countWrites(
        state,
        "DELETE",
        `/api/admin/settings/admins/${ADMIN.id}`,
      ),
    ).toBe(1);
  });

  test("retains an administrator when deletion fails", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);

    state.deleteFailure = {
      status: 503,
      message: "Administrator removal unavailable.",
    };

    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Delete",
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Delete admin?",
    });

    await dialog.getByRole("button", {
        name: "Delete",
        exact: true,
    }).click();

    await expect(dialog).toBeVisible();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Administrator removal unavailable.",
      }),
    ).toBeVisible();

    await expect(
      page.getByTitle(ADMIN.username),
    ).toBeVisible();

    expect(
      state.records.some((record) => record.id === ADMIN.id),
    ).toBe(true);
  });

  test("resends an eligible invitation without sending real email", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, INVITED.username);

    await page.getByRole("menuitem", {
      name: "Resend Invitation",
    }).click();

    await expect(
      page.getByRole("status").filter({
        hasText: "Test invitation resent.",
      }),
    ).toBeVisible();

    expect(
      countWrites(
        state,
        "POST",
        `/api/admin/${INVITED.id}/resend-invitation`,
      ),
    ).toBe(1);
  });

  test("reports invitation resend failures without a success notice", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);

    state.resendFailure = {
      status: 503,
      message: "Invitation email unavailable.",
    };

    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, INVITED.username);

    await page.getByRole("menuitem", {
      name: "Resend Invitation",
    }).click();

    await expect(
      page.getByRole("alert").filter({
        hasText: "Invitation email unavailable.",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("status").filter({
        hasText: "Test invitation resent.",
      }),
    ).toHaveCount(0);
  });

  test("prevents duplicate invitation resends while a request is pending", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);

    let release!: () => void;

    state.holdResend = new Promise<void>((resolve) => {
      release = resolve;
    });

    await openSettings(page);
    await waitForAccounts(page);

    try {
      await openActions(page, INVITED.username);

      await page.getByRole("menuitem", {
        name: "Resend Invitation",
      }).click();

      const actions = page.getByRole("button", {
        name: `Actions for ${INVITED.username}`,
      });

      await expect(actions).toBeDisabled();

      expect(
        countWrites(
          state,
          "POST",
          `/api/admin/${INVITED.id}/resend-invitation`,
        ),
      ).toBe(1);
    } finally {
      release();
    }

    await expect(
      page.getByRole("status").filter({
        hasText: "Test invitation resent.",
      }),
    ).toBeVisible();

    expect(
      countWrites(
        state,
        "POST",
        `/api/admin/${INVITED.id}/resend-invitation`,
      ),
    ).toBe(1);
  });

  // These cases exercise failed account-list authorization.
  // They do not bypass or replace the server-side page guard.
  for (const failure of [
    { status: 401, message: "Administrator session expired." },
    { status: 403, message: "Owner access required." },
  ]) {
    test(`hides management actions when administrator API returns ${failure.status}`, async ({
      page,
    }) => {
      const state = await installMockAccounts(page);
      state.listFailure = failure;

      await openSettings(page);

      await expect(
        page.getByRole("alert").filter({
          hasText: failure.message,
        }),
      ).toBeVisible();

      await expect(
        page.getByRole("button", { name: /New User/ }),
      ).toHaveCount(0);

      await expect(
        page.getByRole("button", {
          name: /Actions for/,
        }),
      ).toHaveCount(0);

      await expect(
        page.getByTitle(ADMIN.username),
      ).toHaveCount(0);
    });
  }

  test("withdraws account-management actions after a failed authorization refresh", async ({
    page,
  }) => {
    const state = await installMockAccounts(page);
    state.revokeAfterResend = true;

    await openSettings(page);
    await waitForAccounts(page);

    await openActions(page, INVITED.username);

    await page.getByRole("menuitem", {
      name: "Resend Invitation",
    }).click();

    await expect(
      page.getByRole("button", { name: /New User/ }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("button", {
        name: /Actions for/,
      }),
    ).toHaveCount(0);

    expect(state.listFailure?.status).toBe(403);
  });

  test("keeps Add and Edit Account controls usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await installMockAccounts(page);
    await openSettings(page);
    await waitForAccounts(page);

    await page.getByRole("button", {
      name: /New User/,
    }).click();

    const addDialog = page.getByRole("dialog", {
      name: "Add New User",
    });

    await expect(addDialog).toBeVisible();

    await expect(
      addDialog.getByRole("textbox", {
        name: /Username/,
      }),
    ).toBeVisible();

    await expect(
      addDialog.getByRole("button", {
        name: "Add User",
      }),
    ).toBeVisible();

    await addDialog.getByRole("button", {
      name: "Cancel",
    }).click();

    await openActions(page, ADMIN.username);

    await page.getByRole("menuitem", {
      name: "Edit Account",
    }).click();

    const editDialog = page.getByRole("dialog", {
      name: "Edit Account",
    });

    await expect(editDialog).toBeVisible();

    await expect(
      editDialog.getByRole("textbox", {
        name: /Username/,
      }),
    ).toBeVisible();

    await expect(
      editDialog.getByRole("button", {
        name: "Cancel",
      }),
    ).toBeVisible();
  });
});