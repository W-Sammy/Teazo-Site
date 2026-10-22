
"use client";

import { useState, type MouseEvent } from "react";
import type { AdminGalleryImage } from "../../../types/gallery-image";

export type BulkDeleteResult = {
  deletedCount: number;
  failedNames: string[];
};

type DeleteSelectedImagesDialogProps = {
  images: AdminGalleryImage[];
  onCancel: () => void;
  onConfirm: () => Promise<BulkDeleteResult>;
};

export default function DeleteSelectedImagesDialog({
  images,
  onCancel,
  onConfirm,
}: DeleteSelectedImagesDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  if (images.length === 0) {
    return null;
  }

  async function handleConfirm() {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const result = await onConfirm();

      if (result.failedNames.length > 0) {
        setErrorMessage(
          `${result.deletedCount} image(s) deleted. ` +
          `${result.failedNames.length} failed: ` +
          result.failedNames.join(", ") +
          ". You can retry the remaining images.",
        );
      }
    } catch (error) {
      console.error("Bulk gallery deletion failed:", error);
      setErrorMessage(
        "The selected images could not be deleted. Please try again.",
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
      aria-labelledby="bulk-delete-title"
      onClick={() => {
        if (!isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event: MouseEvent<HTMLDivElement>) =>
          event.stopPropagation()
        }
      >
        <h2
          id="bulk-delete-title"
          className="text-xl font-semibold text-gray-900"
        >
          Delete selected images?
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          {images.length === 1 ? (
            <>
              Are you sure you want to delete{" "}
              <strong>{images[0].name}</strong>? This permanently
              removes the image from the Gallery page.
            </>
          ) : (
            <>
              Are you sure you want to delete{" "}
              <strong>{images.length} images</strong>? This
              permanently removes the images from the Gallery page.
            </>
          )}
        </p>

        <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-[#dbb082]/60 bg-[#fffaf6] p-3">
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
            {images.map((image) => (
              <li key={image.id} className="break-words">
                {image.name}
              </li>
            ))}
          </ul>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
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
            {isDeleting
              ? "Deleting..."
              : `Delete ${images.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
