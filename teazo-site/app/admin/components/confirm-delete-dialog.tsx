"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { adminButtonStyles } from "./admin-button-styles";

/** A native modal keeps the background inert and traps keyboard focus. */
export default function ConfirmDeleteDialog({ title, children, onCancel, onConfirm }: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  function cancel() {
    if (!pendingRef.current) onCancel();
  }

  async function confirm() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      setError(await onConfirm());
    } catch {
      setError("The deletion could not be confirmed. Please try again.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-[#dbb082]/60 bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/45"
      onCancel={(event) => { event.preventDefault(); cancel(); }}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}>
      <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
      <div id={descriptionId} className="mt-3 text-sm leading-6 text-gray-600 [overflow-wrap:anywhere]">{children}</div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {pending && <p role="status" className="mt-4 text-sm text-gray-600">Deleting…</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button ref={cancelRef} type="button" disabled={pending} onClick={cancel}
          className={adminButtonStyles.secondary}>Cancel</button>
        <button type="button" disabled={pending} onClick={confirm}
          className={adminButtonStyles.danger}>
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </dialog>, document.body,
  );
}
