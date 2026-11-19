/**
 * Mobile browser coverage for Teazo Owner account management.
 *
 * Exercises account creation, username editing, administrator deletion,
 * and invitation resending at a mobile viewport.
 *
 * All administrator API writes are intercepted and simulated.
 * No real administrator records or emails are changed.
 */

import { existsSync } from "node:fs";

import {
  expect,
  test,
  type Route,
} from "@playwright/test";

// Use the established locally saved Owner authentication session.
const statePath =
  process.env.TEAZO_E2E_OWNER_STORAGE_STATE ??
  process.env.TEAZO_E2E_ADMIN_STORAGE_STATE;

const hasOwnerState = Boolean(statePath) && existsSync(statePath!);

test.use({
  storageState:
    hasOwnerState && statePath
      ? statePath
      : { cookies: [], origins: [] },
});

type TestAdmin = {
  id: string;
  username: string;
  email: string;
  role: 1 | 2;
  canManageAdmins: boolean;
  canResendInvitation: boolean;
  canReceiveOwnership: boolean;
};

const owner: TestAdmin = {
  id: "mobile-owner",
  username: "Mobile Owner",
  email: "owner@example.invalid",
  role: 1,
  canManageAdmins: true,
  canResendInvitation: false,
  canReceiveOwnership: false,
};

const invited: TestAdmin = {
  id: "mobile-invited",
  username: "Mobile Invited Admin",
  email: "invited@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: true,
  canReceiveOwnership: false,
};

const newAdminId = "mobile-created-admin";

// Fail closed for every unexpected browser write.
async function blockUnexpectedWrites(route: Route) {
  if (
    ["GET", "HEAD", "OPTIONS"].includes(
      route.request().method(),
    )
  ) {
    await route.continue();
    return;
  }

  await route.abort("blockedbyclient");
}

test("completes synthetic mobile add, edit, invitation, and delete workflows", async ({
  page,
}) => {
  test.skip(
    !hasOwnerState,
    "A locally saved Owner session is required.",
  );

  await page.setViewportSize({
    width: 390,
    height: 844,
  });

  const records: TestAdmin[] = [
    { ...owner },
    { ...invited },
  ];

  const operations: string[] = [];

  await page.route("**/*", blockUnexpectedWrites);

  // Intercept all administrator-list reads and writes.
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
        await route.fulfill({
          status: 200,
          json: {
            admins: records,
            canEdit: true,
          },
        });
        return;
      }

      if (
        path === "/api/admin/settings/admins" &&
        method === "POST"
      ) {
        operations.push("create");

        const input = request.postDataJSON() as {
          username: string;
          email: string;
        };

        const created: TestAdmin = {
          id: newAdminId,
          username: input.username,
          email: input.email,
          role: 2,
          canManageAdmins: false,
          canResendInvitation: true,
          canReceiveOwnership: false,
        };

        records.push(created);

        await route.fulfill({
          status: 201,
          json: {
            admin: created,
            invitation: {
              submitted: true,
              message: "Mobile test invitation submitted.",
            },
          },
        });
        return;
      }

      const accountPath =
        `/api/admin/settings/admins/${newAdminId}`;

      if (path === accountPath && method === "PATCH") {
        operations.push("edit");

        const input = request.postDataJSON() as {
          username: string;
        };

        const account = records.find(
          (record) => record.id === newAdminId,
        );

        if (!account) {
          await route.fulfill({
            status: 404,
            json: { error: "Synthetic account not found." },
          });
          return;
        }

        account.username = input.username;

        await route.fulfill({
          status: 200,
          json: { admin: account },
        });
        return;
      }

      if (path === accountPath && method === "DELETE") {
        operations.push("delete");

        const index = records.findIndex(
          (record) => record.id === newAdminId,
        );

        if (index !== -1) {
          records.splice(index, 1);
        }

        await route.fulfill({
          status: 200,
          json: { message: "Synthetic account deleted." },
        });
        return;
      }

      await route.abort("blockedbyclient");
    },
  );

  // Simulate email delivery without contacting the invitation service.
  await page.route(
    "**/api/admin/*/resend-invitation",
    async (route) => {
      const path = new URL(route.request().url()).pathname;

      if (
        route.request().method() !== "POST" ||
        path !== `/api/admin/${invited.id}/resend-invitation`
      ) {
        await route.abort("blockedbyclient");
        return;
      }

      operations.push("resend");

      await route.fulfill({
        status: 200,
        json: {
          message: "Mobile test invitation resent.",
        },
      });
    },
  );

  // Ownership-transfer writes are outside this mobile test.
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

  // Navigate through the real server-side Owner session guard.
  await page.goto("/admin/settings");

  expect(new URL(page.url()).pathname).not.toBe("/login");

  await expect(
    page.getByRole("heading", {
      name: "Owner",
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: /New User/ }),
  ).toBeVisible();

  // Create a synthetic regular Admin through the mobile dialog.
  await page.getByRole("button", {
    name: /New User/,
  }).click();

  const addDialog = page.getByRole("dialog", {
    name: "Add New User",
  });

  await addDialog.getByRole("textbox", {
    name: /Username/,
  }).fill("Mobile Created Admin");

  await addDialog.getByRole("textbox", {
    name: /Email/,
  }).fill("mobile-created@example.invalid");

  await addDialog.getByRole("button", {
    name: "Add User",
  }).click();

  await expect(addDialog).toHaveCount(0);

  await expect(
    page.getByTitle("Mobile Created Admin", {
      exact: true,
    }),
  ).toBeVisible();

  // Edit the new account using its mobile action menu.
  await page.getByRole("button", {
    name: "Actions for Mobile Created Admin",
  }).click();

  await page.getByRole("menuitem", {
    name: "Edit Account",
  }).click();

  const editDialog = page.getByRole("dialog", {
    name: "Edit Account",
  });

  await editDialog.getByRole("textbox", {
    name: /Username/,
  }).fill("Mobile Updated Admin");

  await editDialog.getByRole("button", {
    name: "Save Changes",
  }).click();

  await expect(editDialog).toHaveCount(0);

  await expect(
    page.getByTitle("Mobile Updated Admin", {
      exact: true,
    }),
  ).toBeVisible();

  // Resend an eligible invitation using the existing mobile menu.
  await page.getByRole("button", {
    name: `Actions for ${invited.username}`,
  }).click();

  await page.getByRole("menuitem", {
    name: "Resend Invitation",
  }).click();

  await expect(
    page.getByRole("status").filter({
      hasText: "Mobile test invitation resent.",
    }),
  ).toBeVisible();

  // Check that the Owner cannot be removed from their action menu.
  await page.getByRole("button", {
    name: `Actions for ${owner.username}`,
  }).click();

  await expect(
    page.getByRole("menuitem", {
      name: "Delete",
    }),
  ).toHaveCount(0);

  // Close the Owner's action menu before opening another.
  await page.getByRole("button", {
    name: `Actions for ${owner.username}`,
  }).click();

  // Delete only the synthetic account created earlier in the test.
  await page.getByRole("button", {
    name: "Actions for Mobile Updated Admin",
  }).click();

  await page.getByRole("menuitem", {
    name: "Delete",
  }).click();

  const deleteDialog = page.getByRole("dialog", {
    name: "Delete admin?",
  });

  await expect(deleteDialog).toContainText(
    "Mobile Updated Admin",
  );

  await deleteDialog.getByRole("button", {
    name: "Delete",
    exact: true,
  }).click();

  await expect(deleteDialog).toHaveCount(0);

  await expect(
    page.getByTitle("Mobile Updated Admin", {
      exact: true,
    }),
  ).toHaveCount(0);

  await expect(
    page.getByTitle(owner.username, {
      exact: true,
    }),
  ).toBeVisible();

  // Confirm that all four mobile operations were intercepted,
  // each happened once, and the new account was removed.
  expect(operations).toEqual([
    "create",
    "edit",
    "resend",
    "delete",
  ]);

  expect(
    records.some((record) => record.id === newAdminId),
  ).toBe(false);

  expect(
    records.some((record) => record.id === owner.id),
  ).toBe(true);
});