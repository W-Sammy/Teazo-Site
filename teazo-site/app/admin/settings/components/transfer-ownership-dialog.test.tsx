// @vitest-environment jsdom

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
import TransferOwnershipDialog from "./transfer-ownership-dialog";

// Use an unusual username to verify that confirmation wording
// does not depend on the receiving Admin's display name.
const testAdmin: Admin = {
  id: "test-admin-id",
  username: "you",
  email: "recipient@example.invalid",
  role: 2,
  canManageAdmins: false,
  canResendInvitation: false,
  canReceiveOwnership: true,
};

function renderDialog(
  overrides: Partial<
    React.ComponentProps<typeof TransferOwnershipDialog>
  > = {},
) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();

  render(
    <TransferOwnershipDialog
      admin={testAdmin}
      isSubmitting={false}
      errorMessage=""
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );

  return { onCancel, onConfirm };
}

describe("Ownership transfer confirmation dialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Verify that unusual usernames appear as separately labeled
  // values instead of being inserted into grammatical sentences.
  it("uses neutral wording and identifies the receiving Admin", () => {
    renderDialog();

    expect(
      screen.getByRole("dialog", {
        name: "Transfer Ownership",
      }),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /An ownership offer will be sent to the following Admin account/,
      ),
    ).toBeTruthy();

    expect(
      screen.getByText("Username:").parentElement?.textContent,
    ).toContain("you");

    expect(
      screen.getByText("Email:").parentElement?.textContent,
    ).toContain("recipient@example.invalid");

    const warning = screen.getByText(
      /Warning: If this offer is accepted/,
    );

    expect(warning.textContent).toContain(
      "Owner-only Admin page",
    );

    expect(warning.textContent).not.toContain(
      "Owner-only Settings",
    );
  });

  // Sending an offer requires explicit acknowledgment.
  it("requires acknowledgment before enabling Send Ownership Offer", () => {
    const { onConfirm } = renderDialog();

    const submit = screen.getByRole("button", {
      name: "Send Ownership Offer",
    });

    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(submit.hasAttribute("disabled")).toBe(false);

    fireEvent.click(submit);

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  // Cancel must close the dialog without submitting anything.
  it("allows cancellation without sending an offer", () => {
    const { onCancel, onConfirm } = renderDialog();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Escape should work when no transfer submission is active.
  it("supports Escape to cancel the dialog", () => {
    const { onCancel } = renderDialog();

    fireEvent.keyDown(document, {
      key: "Escape",
    });

    expect(onCancel).toHaveBeenCalledOnce();
  });

  // During submission, the dialog must prevent repeated actions
  // and accidental dismissal.
  it("disables actions while submitting", () => {
    const { onCancel, onConfirm } = renderDialog({
      isSubmitting: true,
    });

    expect(
      screen.getByRole("button", {
        name: "Sending...",
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
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Server errors must remain visible to the current Owner.
  it("displays a transfer submission error", () => {
    renderDialog({
      errorMessage: "Unable to create ownership offer.",
    });

    expect(
      screen.getByRole("alert").textContent,
    ).toContain("Unable to create ownership offer.");
  });
});
