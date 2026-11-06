"use client";

import ConfirmDeleteDialog from "@/app/admin/components/confirm-delete-dialog";

export default function DeleteEndedEventsDialog({ isOpen, eventCount, onCancel, onConfirm }: {
  isOpen: boolean;
  eventCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  if (!isOpen) return null;
  return <ConfirmDeleteDialog title="Delete all ended events?" onCancel={onCancel} onConfirm={onConfirm}>
    <p>Are you sure you want to delete {eventCount} {eventCount === 1 ? "ended event" : "ended events"}?</p>
  </ConfirmDeleteDialog>;
}
