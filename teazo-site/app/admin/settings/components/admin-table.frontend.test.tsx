 // @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type { Admin } from "@/app/types/admin-perms";
import {
  ADMIN_ROLE,
  OWNER_ROLE,
} from "@/app/types/admin-perms";

// Keep administrator operations and API requests isolated from real services.
// The actual table, action menus, and confirmation dialogs remain under test.
const mocks = vi.hoisted(() => ({
  useAdmins: vi.fn(),
  fetch: vi.fn(),
  resendAdminInvitation: vi.fn(),
}));

vi.mock("@/app/admin/settings/handlers/use-admins", () => ({
  useAdmins: mocks.useAdmins,
}));

vi.mock("@/app/api/admin/settings/admins-api", () => ({
  resendAdminInvitation: mocks.resendAdminInvitation,
}));

import AdminsTable from "./admin-table";

// All records use synthetic account IDs and reserved example addresses.
const owner: Admin = {
  id: "test-owner",
  username: "Test Owner",
  email: "owner@example.invalid",
  role: OWNER_ROLE,
  canManageAdmins: true,
  canResendInvitation: false,
  canReceiveOwnership: false,
};

const admin: Admin = {
  id: "test-admin",
  username: "Test Admin",
  email: "admin@example.invalid",
  role: ADMIN_ROLE,
  canManageAdmins: false,
  canResendInvitation: false,
  canReceiveOwnership: true,
};

const invitedAdmin: Admin = {
  id: "test-invited-admin",
  username: "Invited Admin",
  email: "invited@example.invalid",
  role: ADMIN_ROLE,
  canManageAdmins: false,
  canResendInvitation: true,
  canReceiveOwnership: false,
};

// A pending offer must remain in the future to avoid expiration refreshes.
const pendingTransfer = {
  id: "test-transfer",
  recipientAdminId: admin.id,
  recipientUsername: admin.username,
  recipientEmail: admin.email,
  createdAt: 1893369600,
  expiresAt: 1893456000,
  status: "pending" as const,
};

// Provide a controllable Promise for verifying in-progress operations.
function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

// Mock only the Response fields consumed by the ownership-transfer client.
function apiResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

// Supply stable hook functions while allowing each test to change permissions
// or the results of account-management operations independently.
function mockAdminHook(
  options: {
    admins?: Admin[];
    canManageAdmins?: boolean;
    errorMessage?: string;
  } = {},
) {
  const result = {
    admins: options.admins ?? [owner, admin],
    canManageAdmins: options.canManageAdmins ?? true,
    errorMessage: options.errorMessage ?? "",
    clearError: vi.fn(),
    setError: vi.fn(),
    loadAdmins: vi.fn().mockResolvedValue(undefined),
    addAdmin: vi.fn(),
    deleteAdmin: vi.fn(),
    editAdminUsername: vi.fn(),
  };

  mocks.useAdmins.mockReturnValue(result);

  return result;
}

// Open the real three-dot menu for a particular administrator.
function openActions(username: string) {
  fireEvent.click(
    screen.getByRole("button", {
      name: `Actions for ${username}`,
    }),
  );
}

// The native dialog methods are not consistently implemented in jsdom.
// Preserve their original descriptors and restore them after each test.
const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);

const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);

beforeEach(() => {
  vi.resetAllMocks();

  Object.defineProperty(
    HTMLDialogElement.prototype,
    "showModal",
    {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
  );

  Object.defineProperty(
    HTMLDialogElement.prototype,
    "close",
    {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  );

  vi.stubGlobal("fetch", mocks.fetch);

  mockAdminHook();

  // Initial ownership-transfer checks are synthetic and read-only.
  mocks.fetch.mockImplementation(
    async (url: string, options?: RequestInit) => {
      if (
        url === "/api/admin/ownership-transfer" &&
        !options?.method
      ) {
        return apiResponse({ transfer: null });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();

  if (originalShowModal) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "showModal",
      originalShowModal,
    );
  } else {
    Reflect.deleteProperty(
      HTMLDialogElement.prototype,
      "showModal",
    );
  }

  if (originalClose) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      "close",
      originalClose,
    );
  } else {
    Reflect.deleteProperty(
      HTMLDialogElement.prototype,
      "close",
    );
  }
});

describe("Frontend administrator account table", () => {
  describe("Account display and permissions", () => {
    it("separates the Owner from regular administrators", () => {
      render(<AdminsTable />);

      const ownerSection = screen
        .getByRole("heading", { name: "Owner" })
        .closest("section");

      const adminsSection = screen
        .getByRole("heading", { name: "Admins" })
        .closest("section");

      expect(ownerSection?.textContent).toContain(owner.username);
      expect(ownerSection?.textContent).toContain(owner.email);
      expect(ownerSection?.textContent).not.toContain(admin.email);

      expect(adminsSection?.textContent).toContain(admin.username);
      expect(adminsSection?.textContent).toContain(admin.email);
      expect(adminsSection?.textContent).not.toContain(owner.email);
    });

    it("shows separate empty states when accounts are absent", () => {
      mockAdminHook({ admins: [] });

      render(<AdminsTable />);

      expect(
        screen.getByText("No Owner account was found."),
      ).toBeTruthy();

      expect(
        screen.getByText("No administrators have been added."),
      ).toBeTruthy();
    });

    it("hides account-management actions without Owner permission", () => {
      mockAdminHook({ canManageAdmins: false });

      render(<AdminsTable />);

      expect(screen.getByText(owner.email)).toBeTruthy();
      expect(screen.getByText(admin.email)).toBeTruthy();

      expect(
        screen.queryByRole("button", { name: /New User/ }),
      ).toBeNull();

      expect(
        screen.queryByRole("button", {
          name: /Actions for/,
        }),
      ).toBeNull();

      expect(
        screen.queryByRole("dialog"),
      ).toBeNull();
    });

    it("allows Owner editing but never offers Owner deletion", () => {
      render(<AdminsTable />);

      openActions(owner.username);

      expect(
        screen.getByRole("menuitem", {
          name: "Edit Account",
        }),
      ).toBeTruthy();

      expect(
        screen.queryByRole("menuitem", {
          name: "Delete",
        }),
      ).toBeNull();

      expect(
        screen.queryByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      ).toBeNull();
    });

    it("hides invitation and transfer actions for ineligible accounts", () => {
      mockAdminHook({
        admins: [owner, invitedAdmin],
      });

      render(<AdminsTable />);

      openActions(invitedAdmin.username);

      expect(
        screen.getByRole("menuitem", {
          name: "Edit Account",
        }),
      ).toBeTruthy();

      expect(
        screen.getByRole("menuitem", {
          name: "Resend Invitation",
        }),
      ).toBeTruthy();

      expect(
        screen.queryByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      ).toBeNull();
    });

    it("removes account-management controls when Owner permission is lost", () => {
      const hook = mockAdminHook();

      const { rerender } = render(<AdminsTable />);

      // Open an account editor while permission is available.
      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Edit Account",
        }),
      );

      expect(
        screen.getByRole("dialog", {
          name: "Edit Account",
        }),
      ).toBeTruthy();

      // Simulate a refreshed session or administrator response
      // withdrawing permission while the component is mounted.
      mocks.useAdmins.mockReturnValue({
        ...hook,
        canManageAdmins: false,
      });

      rerender(<AdminsTable />);

      expect(
        screen.queryByRole("dialog", {
          name: "Edit Account",
        }),
      ).toBeNull();

      expect(
        screen.queryByRole("button", { name: /New User/ }),
      ).toBeNull();

      expect(
        screen.queryByRole("button", {
          name: /Actions for/,
        }),
      ).toBeNull();

      expect(hook.editAdminUsername).not.toHaveBeenCalled();
    });
  });

  describe("Add administrator interactions", () => {
    it("opens and cancels the Add New User dialog without saving", () => {
      const hook = mockAdminHook();

      render(<AdminsTable />);

      fireEvent.click(
        screen.getByRole("button", { name: /New User/ }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Add New User",
      });

      expect(
        within(dialog).getByRole("textbox", {
          name: /Username/,
        }),
      ).toBeTruthy();

      expect(
        within(dialog).getByRole("textbox", {
          name: /Email/,
        }),
      ).toBeTruthy();

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Cancel",
        }),
      );

      expect(
        screen.queryByRole("dialog", {
          name: "Add New User",
        }),
      ).toBeNull();

      expect(hook.addAdmin).not.toHaveBeenCalled();
    });

    it("submits account data and closes only after successful creation", async () => {
      const hook = mockAdminHook();

      hook.addAdmin.mockResolvedValue({
        success: true,
        invitation: {
          submitted: true,
          message: "Invitation submitted.",
        },
      });

      render(<AdminsTable />);

      fireEvent.click(
        screen.getByRole("button", { name: /New User/ }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Add New User",
      });

      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: /Username/,
        }),
        { target: { value: "New Administrator" } },
      );

      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: /Email/,
        }),
        { target: { value: "new@example.invalid" } },
      );

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Add User",
        }),
      );

      await waitFor(() => {
        expect(hook.addAdmin).toHaveBeenCalledWith({
          username: "New Administrator",
          email: "new@example.invalid",
        });
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "Add New User",
          }),
        ).toBeNull();
      });

      expect(
        screen.getByRole("status").textContent,
      ).toContain("Invitation submitted.");
    });

    it("keeps the Add New User dialog open after a rejected creation", async () => {
      const hook = mockAdminHook();

      hook.addAdmin.mockResolvedValue({
        success: false,
        error: "This email is already registered.",
      });

      render(<AdminsTable />);

      fireEvent.click(
        screen.getByRole("button", { name: /New User/ }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Add New User",
      });

      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: /Username/,
        }),
        { target: { value: "Duplicate Admin" } },
      );

      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: /Email/,
        }),
        { target: { value: "duplicate@example.invalid" } },
      );

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Add User",
        }),
      );

      await waitFor(() => {
        expect(
          within(dialog).getByRole("alert").textContent,
        ).toContain("This email is already registered.");
      });

      expect(
        screen.getByRole("dialog", {
          name: "Add New User",
        }),
      ).toBeTruthy();

      expect(
        screen.queryByRole("status"),
      ).toBeNull();
    });

    it("shows a dismissible notice when account creation succeeds but the invitation is not submitted", async () => {
      const hook = mockAdminHook();

      hook.addAdmin.mockResolvedValue({
        success: true,
        invitation: {
          submitted: false,
          message: "Account created, but invitation delivery failed.",
        },
      });

      render(<AdminsTable />);

      fireEvent.click(
        screen.getByRole("button", { name: /New User/ }),
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Add User",
        }),
      );

      const alert = await screen.findByRole("alert");

      expect(alert.textContent).toContain(
        "Account created, but invitation delivery failed.",
      );

      expect(
        screen.queryByRole("dialog", {
          name: "Add New User",
        }),
      ).toBeNull();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Dismiss",
        }),
      );

      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("Edit administrator interactions", () => {
    it.each([
      { label: "Owner", account: owner },
      { label: "Admin", account: admin },
    ])(
      "supports successful username editing for an $label account",
      async ({ account }) => {
        const hook = mockAdminHook();

        hook.editAdminUsername.mockResolvedValue({
          success: true,
          admin: {
            ...account,
            username: "Updated Account",
          },
        });

        render(<AdminsTable />);

        openActions(account.username);

        fireEvent.click(
          screen.getByRole("menuitem", {
            name: "Edit Account",
          }),
        );

        const dialog = screen.getByRole("dialog", {
          name: "Edit Account",
        });

        const usernameInput = within(dialog).getByRole(
          "textbox",
          { name: /Username/ },
        );

        expect(
          (usernameInput as HTMLInputElement).value,
        ).toBe(account.username);

        fireEvent.change(usernameInput, {
          target: { value: "  Updated Account  " },
        });

        fireEvent.click(
          within(dialog).getByRole("button", {
            name: "Save Changes",
          }),
        );

        await waitFor(() => {
          expect(
            hook.editAdminUsername,
          ).toHaveBeenCalledWith(
            account,
            "Updated Account",
          );
        });

        await waitFor(() => {
          expect(
            screen.queryByRole("dialog", {
              name: "Edit Account",
            }),
          ).toBeNull();
        });

        expect(
          screen.getByRole("status").textContent,
        ).toContain("Administrator username updated.");
      },
    );

    it("preserves the edit dialog when the update is rejected", async () => {
      const hook = mockAdminHook();

      hook.editAdminUsername.mockResolvedValue({
        success: false,
        error: "The administrator username is already in use.",
      });

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Edit Account",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Edit Account",
      });

      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: /Username/,
        }),
        { target: { value: "Existing Username" } },
      );

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(
          within(dialog).getByRole("alert").textContent,
        ).toContain(
          "The administrator username is already in use.",
        );
      });

      expect(
        screen.getByRole("dialog", {
          name: "Edit Account",
        }),
      ).toBeTruthy();

      expect(
        screen.queryByRole("status"),
      ).toBeNull();
    });

    it("disables editing and prevents duplicate saves while an update is pending", async () => {
      const hook = mockAdminHook();

      const save = deferred<{
        success: true;
        admin: Admin;
      }>();

      hook.editAdminUsername.mockReturnValue(save.promise);

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Edit Account",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Edit Account",
      });

      fireEvent.change(
        within(dialog).getByRole("textbox", {
          name: /Username/,
        }),
        { target: { value: "Pending Update" } },
      );

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Save Changes",
        }),
      );

      await waitFor(() => {
        expect(
          within(dialog).getByRole("button", {
            name: "Saving...",
          }).hasAttribute("disabled"),
        ).toBe(true);
      });

      expect(
        within(dialog).getByRole("textbox", {
          name: /Username/,
        }).hasAttribute("disabled"),
      ).toBe(true);

      expect(
        within(dialog).getByRole("button", {
          name: "Cancel",
        }).hasAttribute("disabled"),
      ).toBe(true);

      // Submitting again must not invoke a second operation.
      fireEvent.submit(dialog);

      expect(
        hook.editAdminUsername,
      ).toHaveBeenCalledTimes(1);

      save.resolve({
        success: true,
        admin: {
          ...admin,
          username: "Pending Update",
        },
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "Edit Account",
          }),
        ).toBeNull();
      });
    });
  });

  describe("Delete administrator interactions", () => {
    it("cancels deletion without calling the removal handler", () => {
      const hook = mockAdminHook();

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Delete",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Delete admin?",
      });

      expect(dialog.textContent).toContain(admin.username);

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Cancel",
        }),
      );

      expect(
        screen.queryByRole("dialog", {
          name: "Delete admin?",
        }),
      ).toBeNull();

      expect(hook.deleteAdmin).not.toHaveBeenCalled();
    });

    it("closes deletion confirmation after successful removal", async () => {
      const hook = mockAdminHook();

      hook.deleteAdmin.mockResolvedValue(true);

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Delete",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Delete admin?",
      });

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      await waitFor(() => {
        expect(
          hook.deleteAdmin,
        ).toHaveBeenCalledWith(admin);
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "Delete admin?",
          }),
        ).toBeNull();
      });
    });

    it("keeps deletion confirmation open after failed removal", async () => {
      const hook = mockAdminHook();

      hook.deleteAdmin.mockResolvedValue(false);

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Delete",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Delete admin?",
      });

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Delete",
        }),
      );

      await waitFor(() => {
        expect(
          hook.deleteAdmin,
        ).toHaveBeenCalledTimes(1);
      });

      expect(
        screen.getByRole("dialog", {
          name: "Delete admin?",
        }),
      ).toBeTruthy();

      // The mocked hook does not change the displayed list.
      // Real removal and list mutation are covered at the hook level.
      expect(screen.getByTitle(admin.username)).toBeTruthy();
    });

    it("prevents duplicate deletion confirmations", async () => {
      const hook = mockAdminHook();
      const removal = deferred<boolean>();

      hook.deleteAdmin.mockReturnValue(removal.promise);

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Delete",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Delete admin?",
      });

      const confirmButton = within(dialog).getByRole(
        "button",
        { name: "Delete" },
      );

      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);

      expect(
        hook.deleteAdmin,
      ).toHaveBeenCalledTimes(1);

      removal.resolve(true);

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "Delete admin?",
          }),
        ).toBeNull();
      });
    });
  });

  describe("Resend invitation interactions", () => {
    it("resends an eligible invitation and refreshes administrator data", async () => {
      const hook = mockAdminHook({
        admins: [owner, invitedAdmin],
      });

      mocks.resendAdminInvitation.mockResolvedValue({
        message: "Invitation resent successfully.",
      });

      render(<AdminsTable />);

      openActions(invitedAdmin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Resend Invitation",
        }),
      );

      await waitFor(() => {
        expect(
          mocks.resendAdminInvitation,
        ).toHaveBeenCalledWith(invitedAdmin.id);
      });

      await waitFor(() => {
        expect(
          hook.loadAdmins,
        ).toHaveBeenCalledTimes(2);
      });

      expect(
        screen.getByRole("status").textContent,
      ).toContain("Invitation resent successfully.");
    });

    it("refreshes the list and reports a failed invitation resend", async () => {
      const hook = mockAdminHook({
        admins: [owner, invitedAdmin],
      });

      mocks.resendAdminInvitation.mockRejectedValue(
        new Error("Invitation service unavailable."),
      );

      render(<AdminsTable />);

      openActions(invitedAdmin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Resend Invitation",
        }),
      );

      await waitFor(() => {
        expect(hook.setError).toHaveBeenCalledWith(
          "Invitation service unavailable.",
        );
      });

      expect(
        hook.loadAdmins,
      ).toHaveBeenCalledTimes(2);

      expect(
        screen.queryByRole("status"),
      ).toBeNull();
    });

    it("disables account actions and blocks duplicate resends while pending", async () => {
      mockAdminHook({
        admins: [owner, invitedAdmin],
      });

      const resend = deferred<{ message: string }>();

      mocks.resendAdminInvitation.mockReturnValue(
        resend.promise,
      );

      render(<AdminsTable />);

      openActions(invitedAdmin.username);

      fireEvent.click(
        screen.getByRole("menuitem", {
          name: "Resend Invitation",
        }),
      );

      const actionsButton = screen.getByRole("button", {
        name: `Actions for ${invitedAdmin.username}`,
      });

      await waitFor(() => {
        expect(
          actionsButton.hasAttribute("disabled"),
        ).toBe(true);
      });

      fireEvent.click(actionsButton);

      expect(
        mocks.resendAdminInvitation,
      ).toHaveBeenCalledTimes(1);

      resend.resolve({
        message: "Invitation sent.",
      });

      await waitFor(() => {
        expect(
          actionsButton.hasAttribute("disabled"),
        ).toBe(false);
      });
    });
  });

  describe("Ownership-transfer safety at the account table", () => {
    it("blocks transfer initiation while pending status cannot be verified", async () => {
      let attempts = 0;

      mocks.fetch.mockImplementation(async () => {
        attempts += 1;

        if (attempts === 1) {
          return apiResponse(
            { error: "Ownership status unavailable." },
            false,
          );
        }

        return apiResponse({ transfer: null });
      });

      render(<AdminsTable />);

      await screen.findByText(
        "Ownership status unavailable.",
      );

      openActions(admin.username);

      expect(
        screen.queryByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      ).toBeNull();

      // Close the menu, then explicitly refresh the failed lookup.
      openActions(admin.username);

      fireEvent.click(
        screen.getByRole("button", {
          name: "Refresh Status",
        }),
      );

      await waitFor(() => {
        expect(attempts).toBe(2);
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", {
            name: "Pending Ownership Transfer",
          }),
        ).toBeNull();
      });

      openActions(admin.username);

      expect(
        screen.getByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      ).toBeTruthy();
    });

    it("keeps the transfer dialog open when a failed offer has no pending record", async () => {
      mocks.fetch.mockImplementation(
        async (_url: string, options?: RequestInit) => {
          if (options?.method === "POST") {
            return apiResponse(
              { error: "Unable to send ownership offer." },
              false,
            );
          }

          return apiResponse({ transfer: null });
        },
      );

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        await screen.findByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Transfer Ownership",
      });

      fireEvent.click(
        within(dialog).getByRole("checkbox"),
      );

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Send Ownership Offer",
        }),
      );

      await waitFor(() => {
        expect(
          within(dialog).getByRole("alert").textContent,
        ).toContain("Unable to send ownership offer.");
      });

      expect(
        screen.getByRole("dialog", {
          name: "Transfer Ownership",
        }),
      ).toBeTruthy();
    });

    it("does not allow a second transfer offer when an ambiguous failure leaves a pending offer", async () => {
      let pending = false;
      let postCount = 0;

      mocks.fetch.mockImplementation(
        async (_url: string, options?: RequestInit) => {
          if (options?.method === "POST") {
            postCount += 1;
            pending = true;

            // Simulate a failed response after the server
            // may already have created the ownership offer.
            return apiResponse(
              { error: "Request result uncertain." },
              false,
            );
          }

          return apiResponse({
            transfer: pending ? pendingTransfer : null,
          });
        },
      );

      render(<AdminsTable />);

      openActions(admin.username);

      fireEvent.click(
        await screen.findByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      );

      const dialog = screen.getByRole("dialog", {
        name: "Transfer Ownership",
      });

      fireEvent.click(
        within(dialog).getByRole("checkbox"),
      );

      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Send Ownership Offer",
        }),
      );

      await screen.findByRole("heading", {
        name: "Pending Ownership Transfer",
      });

      expect(postCount).toBe(1);

      expect(
        screen.queryByRole("dialog", {
          name: "Transfer Ownership",
        }),
      ).toBeNull();

      expect(
        screen.getByRole("status").textContent,
      ).toContain("A transfer remains pending.");

      // The account menu remains usable for normal editing,
      // but no second transfer can be initiated.
      openActions(admin.username);

      expect(
        screen.getByRole("menuitem", {
          name: "Edit Account",
        }),
      ).toBeTruthy();

      expect(
        screen.queryByRole("menuitem", {
          name: "Transfer Ownership",
        }),
      ).toBeNull();

      expect(postCount).toBe(1);
    });
  });
});
