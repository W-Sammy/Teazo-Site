// @vitest-environment jsdom

/**
 * Frontend component tests for the administrator account
 * creation and editing dialogs.
 *
 * These tests render the actual production components while
 * replacing callbacks with spies. No requests are sent to
 * administrator APIs, and no real accounts are modified.
 */

import type { ComponentProps } from "react";
import {
  afterEach,
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
} from "@testing-library/react";

import type { Admin } from "@/app/types/admin-perms";
import { AddAdminModal } from "./AddAdminModal";
import { EditAccountModal } from "./EditAccountModal";

// Synthetic administrator records are used throughout this file.
// The example.invalid addresses cannot receive real invitations.
const testOwner: Admin = {
  id: "test-owner-id",
  username: "Test Owner",
  email: "owner@example.invalid",
  role: 1,
  canManageAdmins: true,
  canResendInvitation: false,
  canReceiveOwnership: false,
};

const testAdmin: Admin = {
  id: "test-admin-id",
  username: "Test Admin",
  email: "admin@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: false,
  canReceiveOwnership: true,
};

// Render the real account-creation dialog with disposable
// callback spies so submissions and cancellation can be checked.
function renderAddModal(
  overrides: Partial<
    ComponentProps<typeof AddAdminModal>
  > = {},
) {
  const onAdd = vi.fn();
  const onCancel = vi.fn();

  render(
    <AddAdminModal
      onAdd={onAdd}
      onCancel={onCancel}
      errorMessage=""
      {...overrides}
    />,
  );

  return { onAdd, onCancel };
}

// Render the real account-editing dialog with synthetic
// account information and controlled callback spies.
function renderEditModal(
  overrides: Partial<
    ComponentProps<typeof EditAccountModal>
  > = {},
) {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  render(
    <EditAccountModal
      admin={testAdmin}
      isSaving={false}
      errorMessage=""
      onSave={onSave}
      onCancel={onCancel}
      {...overrides}
    />,
  );

  return { onSave, onCancel };
}

// Restore the DOM and spies after each test to prevent
// account-form state from leaking into subsequent tests.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Frontend administrator account creation", () => {
  // The Owner should receive a usable creation dialog with
  // separate username and email fields.
  it("renders the Add New User dialog and its controls", () => {
    renderAddModal();

    expect(
      screen.getByRole("dialog", {
        name: "Add New User",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("textbox", {
        name: "Username",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("textbox", {
        name: "Email",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Add User",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    ).toBeTruthy();
  });

  // Verify that users can enter values into both controlled
  // inputs before submitting the form.
  it("accepts username and email input", () => {
    renderAddModal();

    const username = screen.getByRole("textbox", {
      name: "Username",
    }) as HTMLInputElement;

    const email = screen.getByRole("textbox", {
      name: "Email",
    }) as HTMLInputElement;

    fireEvent.change(username, {
      target: { value: "New Test Admin" },
    });

    fireEvent.change(email, {
      target: { value: "new-admin@example.invalid" },
    });

    expect(username.value).toBe("New Test Admin");
    expect(email.value).toBe(
      "new-admin@example.invalid",
    );
  });

  // The modal passes entered values to the parent.
  // Input normalization and authorization are enforced by
  // the account-management hook and server API.
  it("submits the entered account information", () => {
    const { onAdd } = renderAddModal();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Username",
      }),
      {
        target: { value: "New Test Admin" },
      },
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Email",
      }),
      {
        target: {
          value: "new-admin@example.invalid",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Add User",
      }),
    );

    expect(onAdd).toHaveBeenCalledExactlyOnceWith({
      username: "New Test Admin",
      email: "new-admin@example.invalid",
    });
  });

  // New users must be assigned an Admin role by the
  // backend, not through a client-side role selector.
  it("does not expose role or permission selectors", () => {
    renderAddModal();

    expect(
      screen.queryByRole("combobox"),
    ).toBeNull();

    expect(
      screen.queryByRole("checkbox"),
    ).toBeNull();

    expect(
      screen.queryByText("Can Edit"),
    ).toBeNull();

    expect(
      screen.queryByText("Can View"),
    ).toBeNull();
  });

  // The email input should request native email validation
  // rather than behaving like an ordinary text field.
  it("uses an email-type input", () => {
    renderAddModal();

    const email = screen.getByRole("textbox", {
      name: "Email",
    }) as HTMLInputElement;

    expect(email.type).toBe("email");
    expect(email.name).toBe("newAdminEmail");
  });

  // Cancellation must not submit or create an account.
  it("cancels account creation without submitting", () => {
    const { onAdd, onCancel } = renderAddModal();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();
  });

  // The close button is an alternative cancellation path
  // and must not trigger the form's submit handler.
  it("closes the creation dialog without submitting", () => {
    const { onAdd, onCancel } = renderAddModal();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close Add New User form",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onAdd).not.toHaveBeenCalled();
  });

  // Server-side validation and invitation errors should
  // remain visible inside the creation dialog.
  it("displays account-creation errors", () => {
    renderAddModal({
      errorMessage: "Unable to add administrator.",
    });

    expect(
      screen.getByRole("alert").textContent,
    ).toContain("Unable to add administrator.");
  });
});

describe("Frontend administrator account editing", () => {
  // Editing should initially display the selected account's
  // existing username, role, and email address.
  it("renders existing account information", () => {
    renderEditModal();

    expect(
      screen.getByRole("dialog", {
        name: "Edit Account",
      }),
    ).toBeTruthy();

    const username = screen.getByRole("textbox", {
      name: "Username",
    }) as HTMLInputElement;

    expect(username.value).toBe("Test Admin");

    expect(
      screen.getByText("admin@example.invalid"),
    ).toBeTruthy();

    expect(
      screen.getByText("Admin", {
        exact: true,
      }),
    ).toBeTruthy();
  });

  // The existing design deliberately prevents changing
  // an account's email or role through the edit dialog.
  it("keeps account role and email read-only", () => {
    renderEditModal();

    expect(
      screen.queryByRole("combobox"),
    ).toBeNull();

    expect(
      screen.queryByRole("textbox", {
        name: "Email",
      }),
    ).toBeNull();

    expect(
      screen.getByText(
        "Email addresses cannot be changed here.",
      ),
    ).toBeTruthy();
  });

  // The Save button should remain disabled until the
  // username differs from the stored value.
  it("disables Save Changes when no changes exist", () => {
    const { onSave } = renderEditModal();

    const saveButton = screen.getByRole("button", {
      name: "Save Changes",
    });

    expect(
      saveButton.hasAttribute("disabled"),
    ).toBe(true);

    expect(onSave).not.toHaveBeenCalled();
  });

  // Whitespace-only changes should not count as a
  // meaningful account update.
  it("does not enable saving for whitespace-only changes", () => {
    renderEditModal();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Username",
      }),
      {
        target: { value: "  Test Admin  " },
      },
    );

    expect(
      screen.getByRole("button", {
        name: "Save Changes",
      }).hasAttribute("disabled"),
    ).toBe(true);
  });

  // The actual save callback must receive a normalized
  // username, not leading or trailing whitespace.
  it("trims the username before saving", () => {
    const { onSave } = renderEditModal();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Username",
      }),
      {
        target: {
          value: "  Updated Test Admin  ",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    );

    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      "Updated Test Admin",
    );
  });

  // Blank usernames are rejected locally before the
  // component calls its parent save handler.
  it("rejects an empty username", () => {
    const { onSave } = renderEditModal();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Username",
      }),
      {
        target: { value: "   " },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    );

    expect(onSave).not.toHaveBeenCalled();

    expect(
      screen.getByRole("alert").textContent,
    ).toContain("Username is required.");
  });

  // Changing the username should clear an earlier local
  // validation error so the user can retry.
  it("clears username validation errors after editing", () => {
    renderEditModal();

    const username = screen.getByRole("textbox", {
      name: "Username",
    });

    fireEvent.change(username, {
      target: { value: " " },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save Changes",
      }),
    );

    expect(
      screen.getByRole("alert"),
    ).toBeTruthy();

    fireEvent.change(username, {
      target: { value: "Corrected Admin" },
    });

    expect(
      screen.queryByRole("alert"),
    ).toBeNull();
  });

  // The Owner account can also have its username
  // edited without exposing a way to change its role.
  it("displays Owner status for the Owner account", () => {
    renderEditModal({ admin: testOwner });

    expect(
      screen.getByText("Owner", {
        exact: true,
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("combobox"),
    ).toBeNull();
  });

  // Cancel should dismiss an unsaved edit and must not
  // call the save handler.
  it("cancels editing without saving", () => {
    const { onSave, onCancel } = renderEditModal();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Username",
      }),
      {
        target: { value: "Unsaved Username" },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  // Escape is an additional dismissal method when no
  // account update is currently being submitted.
  it("supports Escape to cancel editing", () => {
    const { onSave, onCancel } = renderEditModal();

    fireEvent.keyDown(document, {
      key: "Escape",
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  // During a save, editing and dismissal are disabled
  // to prevent conflicting interactions.
  it("disables editing and dismissal while saving", () => {
    const { onSave, onCancel } = renderEditModal({
      isSaving: true,
    });

    const username = screen.getByRole("textbox", {
      name: "Username",
    });

    expect(
      username.hasAttribute("disabled"),
    ).toBe(true);

    expect(
      screen.getByRole("button", {
        name: "Saving...",
      }).hasAttribute("disabled"),
    ).toBe(true);

    expect(
      screen.getByRole("button", {
        name: "Cancel",
      }).hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.keyDown(document, {
      key: "Escape",
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  // Errors returned by the account-management API should
  // appear without falsely reporting a successful update.
  it("displays account-editing errors", () => {
    renderEditModal({
      errorMessage:
        "Administrator update was rejected.",
    });

    expect(
      screen.getByRole("alert").textContent,
    ).toContain(
      "Administrator update was rejected.",
    );
  });
});
