"use client";

import Image from "next/image";
import { useState, type MouseEvent } from "react";
import type { AdminGalleryImage } from "../../../types/gallery-image";

type DeleteImageDialogProps = {
  image: AdminGalleryImage | null;
  onCancel: () => void;
  onConfirm: () => Promise<string | null>;
};

export default function DeleteImageDialog({
  image,
  onCancel,
  onConfirm,
}: DeleteImageDialogProps) {
  // Keep the dialog open and report a failure if deletion does not succeed.
  const [deleteError, setDeleteError] =
    useState<string | null>(null);

  // Prevent duplicate delete requests while one is already running.
  const [isDeleting, setIsDeleting] =
    useState(false);

  if (!image) return null;

  async function handleConfirm() {
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const errorMessage = await onConfirm();

      if (errorMessage) {
        setDeleteError(errorMessage);
      }
    } catch (error) {
      console.error(
        "Unexpected gallery image deletion failure:",
        error,
      );

      setDeleteError(
        "The image could not be deleted. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-image-title"
      onClick={() => {
        if (!isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(
          event: MouseEvent<HTMLDivElement>,
        ) => event.stopPropagation()}
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
            <h2
              id="delete-image-title"
              className="text-xl font-semibold text-gray-900"
            >
              Delete image?
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Are you sure you want to delete{" "}
              <strong>{image.name}</strong>? This
              removes it from the current gallery session.
            </p>
          </div>
        </div>

        {/* Keep the dialog open and explain why the deletion failed. */}
        {deleteError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {deleteError}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="cursor-pointer rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}