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
