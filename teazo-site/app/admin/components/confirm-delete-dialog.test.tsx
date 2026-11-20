// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ConfirmDeleteDialog from "./confirm-delete-dialog";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(cleanup);

it("focuses Cancel, blocks immediate repeated input and cancellation, then unlocks on failure", async () => {
  let finish!: (message: string) => void;
  const onCancel = vi.fn();
  const onConfirm = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
  render(<ConfirmDeleteDialog title="Delete event?" onCancel={onCancel} onConfirm={onConfirm}>Delete this event?</ConfirmDeleteDialog>);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  const button = screen.getByRole("button", { name: "Delete" });
  act(() => { button.click(); button.click(); });
  expect(onConfirm).toHaveBeenCalledOnce();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(onCancel).not.toHaveBeenCalled();
  await act(async () => finish("Database unavailable."));
  expect(screen.getByRole("alert").textContent).toBe("Database unavailable.");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("exposes conflict recovery inside the modal on revision conflict", async () => {
  const onCancel = vi.fn();
  const onReload = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue("The collection was modified. Reload this page to obtain current content.");

  render(
    <ConfirmDeleteDialog
      title="Delete holiday?"
      onCancel={onCancel}
      onConfirm={onConfirm}
      onReload={onReload}
      hasUnsavedEdits={false}
    >
      Delete this holiday?
    </ConfirmDeleteDialog>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByRole("alert");

  const reloadButton = screen.getByRole("button", { name: "Reload from storage" });
  expect(reloadButton).toBeTruthy();

  fireEvent.click(reloadButton);
  expect(onReload).toHaveBeenCalledOnce();
  expect(screen.queryByText(/Warning: You have unsaved changes/)).toBeNull();
});

it("warns when unsaved local form edits exist before reloading from storage", async () => {
  const onCancel = vi.fn();
  const onReload = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue("Stale revision. Reload this page.");

  render(
    <ConfirmDeleteDialog
      title="Delete link?"
      onCancel={onCancel}
      onConfirm={onConfirm}
      onReload={onReload}
      hasUnsavedEdits={true}
    >
      Delete this link?
    </ConfirmDeleteDialog>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByRole("alert");

  expect(
    screen.getByText(/You have unsaved changes in other sections\. Reloading will discard those local edits\./),
  ).toBeTruthy();

  const reloadButton = screen.getByRole("button", { name: "Discard edits & Reload" });
  expect(reloadButton).toBeTruthy();

  // Cancel allows administrator to dismiss dialog and preserve unsaved edits
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onReload).not.toHaveBeenCalled();
});
