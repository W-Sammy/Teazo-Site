"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import type { AdminGalleryImage } from "../../../types/gallery-image";

type DeleteImageDialogProps = {
  image: AdminGalleryImage | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteImageDialog({
  image,
  onCancel,
  onConfirm,
}: DeleteImageDialogProps) {
  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-image-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event: MouseEvent<HTMLDivElement>) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-start gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f3ece6]">
            <Image
              src={image.url}
              alt=""
              fill
              unoptimized={image.url.startsWith("blob:")}
              className="object-cover"
              sizes="80px"
            />
          </div>

          <div>
            <h2 id="delete-image-title" className="text-xl font-semibold text-gray-900">
              Delete image?
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Are you sure you want to delete <strong>{image.name}</strong>? This
              removes it from the current gallery session.
            </p>
          </div>
        </div>

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
