"use client";

import { useEffect, useId, useState } from "react";
import type { Admin } from "@/app/types/admin-perms";
import { adminButtonStyles } from "@/app/admin/components/admin-button-styles";

type TransferOwnershipDialogProps = {
  admin: Admin;
  isSubmitting: boolean;
  errorMessage: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function TransferOwnershipDialog({
  admin,
  isSubmitting,
  errorMessage,
  onCancel,
  onConfirm,
}: TransferOwnershipDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isSubmitting, onCancel]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-lg rounded-xl border border-[#dbb082] bg-white p-6 text-gray-900 shadow-2xl"
      >
        <h2 id={titleId} className="text-xl font-semibold">
          Transfer Ownership
        </h2>

        <div id={descriptionId} className="mt-4 space-y-3 text-sm">
          <p>
            You are offering the Owner role to <strong>{admin.username}</strong>
            {` (${admin.email}).`}
          </p>
          <p>
            They will receive an email with a link valid for 24 hours. They
            must sign in and explicitly accept before anything changes.
          </p>
          <p className="font-semibold text-red-700">
            Warning: After they accept, you will immediately lose Owner
            privileges and access to Settings. This transfer cannot be
            automatically reversed.
          </p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            disabled={isSubmitting}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>I understand what happens if this offer is accepted.</span>
        </label>

        {errorMessage && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={adminButtonStyles.secondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!acknowledged || isSubmitting}
            className={adminButtonStyles.primary}
          >
            {isSubmitting ? "Sending..." : "Send Ownership Offer"}
          </button>
        </div>
      </section>
    </div>
  );
}
