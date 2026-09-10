"use client";

import type { MouseEvent } from "react";

type DeleteEndedEventsDialogProps = {
  isOpen: boolean;
  eventCount: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteEndedEventsDialog({
  isOpen,
  eventCount,
  onCancel,
  onConfirm,
}: DeleteEndedEventsDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-ended-events-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
      >
        <h2
          id="delete-ended-events-title"
          className="text-xl font-semibold text-gray-900"
        >
          Delete all ended events?
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Are you sure you want to delete {eventCount}{" "}
          {eventCount === 1 ? "ended event" : "ended events"}?
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
