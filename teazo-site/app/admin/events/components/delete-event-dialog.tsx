"use client";

import type { AdminEvent } from "@/app/types/admin-event";
import ConfirmDeleteDialog from "@/app/admin/components/confirm-delete-dialog";
import Image from "next/image";

export default function DeleteEventDialog({ event, onCancel, onConfirm }: {
  event: AdminEvent | null;
  onCancel: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  if (!event) return null;
  return <ConfirmDeleteDialog title="Delete event?" onCancel={onCancel} onConfirm={onConfirm}>
    <div className="relative mb-3 h-20 w-20 overflow-hidden rounded-xl bg-[#f3ece6]">
      <Image src={event.imageUrl} alt="" fill sizes="80px"
        unoptimized={event.imageUrl.startsWith("blob:")} className="object-cover" />
    </div>
    <p>Are you sure you want to delete <strong>{event.name}</strong>? This removes it from the website.</p>
  </ConfirmDeleteDialog>;
}
