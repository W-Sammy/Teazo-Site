"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import type { AdminGalleryImage } from "../../../types/gallery-image";

// A null file lets edits keep the existing image while updating its name or tags.
export type GalleryUploadValues = {
  name: string;
  tags: string[];
  file: File | null;
};

type GalleryUploadFormProps = {
  initialImage?: AdminGalleryImage | null;
  onCancel: () => void;
  onSave: (values: GalleryUploadValues) => void;
};

// Client-side constraints for file selection and tag entry.
const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const maxFileSize = 10 * 1024 * 1024;
const maxTags = 12;
const maxTagLength = 30;

// Remove outer whitespace and collapse repeated whitespace inside a tag.
function normalizeTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

// Suggest a readable name by removing the extension and replacing separators.
function fileNameToTitle(fileName: string) {
  const withoutExtension = fileName.replace(
    /\.[^/.]+$/,
    "",
  );

  const words = withoutExtension
    .replace(/[_-]+/g, " ")
    .trim();

  return words.replace(/\b\w/g, (character) =>
    character.toUpperCase(),
  );
}

export default function GalleryUploadForm({
  initialImage = null,
  onCancel,
  onSave,
}: GalleryUploadFormProps) {
  // Seed local form fields from the image being edited, or start a blank new image.
  const [name, setName] = useState(
    initialImage?.name ?? "",
  );

  const [tags, setTags] = useState<string[]>(
    initialImage?.tags ?? [],
  );

  const [tagInput, setTagInput] = useState("");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState<string | null>(
      initialImage?.url ?? null,
    );

  const [isDragging, setIsDragging] =
    useState(false);

  // Keep field-specific messages beside the control that needs attention.
  const [nameError, setNameError] =
    useState<string | null>(null);

  const [tagError, setTagError] =
    useState<string | null>(null);

  const [imageError, setImageError] =
    useState<string | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  // Only blob URLs created by this form should be revoked by this form.
  const temporaryPreviewUrl =
    useRef<string | null>(null);

  // Free the latest local preview when the form closes or switches records.
  useEffect(() => {
    return () => {
      if (temporaryPreviewUrl.current) {
        URL.revokeObjectURL(
          temporaryPreviewUrl.current,
        );
      }
    };
  }, []);

  // Both the file picker and drag-and-drop use the same file checks and preview setup.
  function selectFile(file: File) {
    setImageError(null);

    if (!acceptedImageTypes.includes(file.type)) {
      setImageError(
        "Choose a JPG, PNG, or WEBP image.",
      );
      return;
    }

    if (file.size > maxFileSize) {
      setImageError(
        "The selected image must be 10 MB or smaller.",
      );
      return;
    }

    if (temporaryPreviewUrl.current) {
      URL.revokeObjectURL(
        temporaryPreviewUrl.current,
      );
    }

    // Previewing creates a local object URL; saving is delegated to the parent.
    const nextPreviewUrl =
      URL.createObjectURL(file);

    temporaryPreviewUrl.current =
      nextPreviewUrl;

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);

    // Suggest a filename-based title only when the user has not entered a name.
    if (!name.trim()) {
      setName(fileNameToTitle(file.name));
      setNameError(null);
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (file) {
      selectFile(file);
    }

    /*
     * Allows the same file to be selected again
     * after a failed or canceled selection.
     */
    event.target.value = "";
  }

  // Prevent browser navigation and process only the first dropped file.
  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      selectFile(file);
    }
  }

  // Add one normalized tag, enforcing length, count, and case-insensitive uniqueness.
  function addTag(rawValue = tagInput) {
    const nextTag = normalizeTag(rawValue);

    if (!nextTag) {
      return true;
    }

    if (nextTag.length > maxTagLength) {
      setTagError(
        `Tags must be ${maxTagLength} characters or fewer.`,
      );
      return false;
    }

    if (tags.length >= maxTags) {
      setTagError(
        `You can add up to ${maxTags} tags.`,
      );
      return false;
    }

    const duplicate = tags.some(
      (tag: string) =>
        tag.toLocaleLowerCase() ===
        nextTag.toLocaleLowerCase(),
    );

    if (duplicate) {
      setTagError(
        "That tag has already been added.",
      );
      return false;
    }

    setTags((currentTags) => [
      ...currentTags,
      nextTag,
    ]);

    setTagInput("");
    setTagError(null);

    return true;
  }

  // Enter/comma add a tag instead of submitting.
  // Backspace removes the last tag when the input is empty.
  function handleTagKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (
      event.key === "Enter" ||
      event.key === ","
    ) {
      event.preventDefault();
      addTag();
    }

    if (
      event.key === "Backspace" &&
      !tagInput &&
      tags.length > 0
    ) {
      setTags((currentTags) =>
        currentTags.slice(0, -1),
      );
    }
  }

  // Remove only the requested tag and clear any previous tag validation message.
  function removeTag(tagToRemove: string) {
    setTags((currentTags) =>
      currentTags.filter(
        (tag: string) => tag !== tagToRemove,
      ),
    );

    setTagError(null);
  }

  // Validate the image/name and include an unfinished tag before invoking onSave.
  function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const cleanName = name.trim();
    let submittedTags = tags;

    setNameError(null);
    setTagError(null);
    setImageError(null);

    if (!cleanName) {
      setNameError(
        "Enter a name for the image.",
      );
      return;
    }

    if (!previewUrl) {
      setImageError(
        "Select an image before saving.",
      );
      return;
    }

    // Include typed text even when Add was not clicked; ignore an existing duplicate.
    const pendingTag = normalizeTag(tagInput);

    if (pendingTag) {
      if (pendingTag.length > maxTagLength) {
        setTagError(
          `Tags must be ${maxTagLength} characters or fewer.`,
        );
        return;
      }

      const duplicate = submittedTags.some(
        (tag: string) =>
          tag.toLocaleLowerCase() ===
          pendingTag.toLocaleLowerCase(),
      );

      if (!duplicate) {
        if (submittedTags.length >= maxTags) {
          setTagError(
            `You can add up to ${maxTags} tags.`,
          );
          return;
        }

        submittedTags = [
          ...submittedTags,
          pendingTag,
        ];
      }
    }

    // Pass the file itself, not this form's short-lived preview URL.
    onSave({
      name: cleanName,
      tags: submittedTags,
      file: selectedFile,
    });
  }

  // This checks basic readiness only; submission still validates a pending tag.
  const canSave = Boolean(
    name.trim() && previewUrl,
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-full w-full min-w-0 flex-col pt-2 sm:pt-4"
      noValidate
    >
      <div className="mx-auto flex w-full max-w-xl min-w-0 flex-1 flex-col md:max-w-none">
        <h2 className="mb-5 break-words pr-10 text-center text-lg font-semibold sm:mb-6 sm:text-xl">
          {initialImage
            ? "Edit Image"
            : "Create New Image"}
        </h2>

        {/* Image name */}
        <div className="min-w-0">
          <label
            htmlFor="gallery-image-name"
            className="mb-1 block text-sm text-gray-700"
          >
            Name
          </label>

          <input
            id="gallery-image-name"
            name="galleryImageName"
            type="text"
            value={name}
            onChange={(
              event: ChangeEvent<HTMLInputElement>,
            ) => {
              setName(event.target.value);
              setNameError(null);
            }}
            className={`w-full min-w-0 rounded border bg-white px-3 py-2 text-base outline-none transition focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm ${
              nameError
                ? "border-red-400"
                : "border-[#dbb082]"
            }`}
            aria-invalid={Boolean(nameError)}
            aria-describedby={
              nameError
                ? "gallery-name-error"
                : undefined
            }
          />

          {nameError && (
            <p
              id="gallery-name-error"
              className="mt-1 text-xs text-red-600"
            >
              {nameError}
            </p>
          )}
        </div>

        {/* Tags */}
        <div className="mt-4 min-w-0">
          <label
            htmlFor="gallery-tag-input"
            className="mb-1 block text-sm text-gray-700"
          >
            Add Tags
          </label>

          {tags.length > 0 && (
            <div className="mb-2 flex max-w-full flex-wrap gap-1.5 rounded border border-[#dbb082] p-2">
              {tags.map((tag: string) => (
                <span
                  key={tag}
                  className="inline-flex max-w-full items-center gap-1 rounded bg-[#fff0f2] px-2 py-1 text-xs text-gray-700"
                >
                  <span className="min-w-0 break-words">
                    {tag}
                  </span>

                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="shrink-0 cursor-pointer text-sm leading-none text-[#f08a9b] hover:text-red-600"
                    aria-label={`Remove ${tag} tag`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input
              id="gallery-tag-input"
              name="galleryTagInput"
              type="text"
              value={tagInput}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) => {
                setTagInput(event.target.value);
                setTagError(null);
              }}
              onKeyDown={handleTagKeyDown}
              placeholder="Type a tag and press Enter"
              className={`w-full min-w-0 flex-1 rounded border bg-white px-3 py-2 text-base outline-none transition focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm ${
                tagError
                  ? "border-red-400"
                  : "border-[#dbb082]"
              }`}
              aria-invalid={Boolean(tagError)}
              aria-describedby="gallery-tag-help"
            />

            <button
              type="button"
              onClick={() => addTag()}
              className="w-full shrink-0 cursor-pointer rounded border border-[#dbb082] px-3 py-2 text-sm font-semibold text-[#9b6d43] hover:bg-[#fffaf6] sm:w-auto"
            >
              Add
            </button>
          </div>

          <p
            id="gallery-tag-help"
            className={`mt-1 break-words text-xs ${
              tagError
                ? "text-red-600"
                : "text-gray-500"
            }`}
          >
            {tagError ??
              "Press Enter or comma to add each tag."}
          </p>
        </div>

        {/* Image preview and selector */}
        <div className="mt-6 min-w-0">
          {previewUrl && (
            <div className="mb-3 min-w-0">
              <div className="relative h-52 w-full overflow-hidden rounded-xl border border-[#dbb082] bg-[#f3ece6] md:h-44">
                <Image
                  src={previewUrl}
                  alt={`${
                    name || "Selected image"
                  } preview`}
                  fill
                  unoptimized={previewUrl.startsWith(
                    "blob:",
                  )}
                  className="object-cover"
                  sizes="(max-width: 767px) 100vw, 272px"
                />
              </div>

              <p className="mt-1 text-center text-xs text-gray-500">
                Preview
              </p>
            </div>
          )}

          <div
            onDragEnter={(
              event: DragEvent<HTMLDivElement>,
            ) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(
              event: DragEvent<HTMLDivElement>,
            ) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(
              event: DragEvent<HTMLDivElement>,
            ) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={handleDrop}
            className={`flex min-h-40 w-full min-w-0 flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition sm:p-4 ${
              isDragging
                ? "border-[#f08a9b] bg-[#fff0f2]"
                : "border-[#dbb082] bg-[#fffaf6]"
            }`}
          >
            <input
              ref={fileInputRef}
              id="gallery-image-file"
              name="galleryImageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              className="w-full max-w-full cursor-pointer whitespace-normal break-words rounded-lg bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] sm:w-auto sm:px-4"
            >
              {initialImage || selectedFile
                ? "Select/Drag New Image Here"
                : "Select/Drag Image Here"}
            </button>

            <p className="mt-2 max-w-full break-words text-xs text-gray-500">
              JPG, PNG, or WEBP · 10 MB maximum
            </p>
          </div>

          {imageError && (
            <p className="mt-2 break-words text-center text-xs text-red-600">
              {imageError}
            </p>
          )}
        </div>

        {/* Keep actions reachable while the mobile form content scrolls. */}
        {/* Form actions */}
        <div className="sticky bottom-0 z-10 -mx-1 mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 bg-white px-1 pb-1 pt-5 md:static md:mx-0 md:flex md:items-center md:justify-between md:border-0 md:px-0 md:pb-0 md:pt-8">
          <button
            type="button"
            onClick={onCancel}
            className="w-full cursor-pointer rounded-lg bg-gray-400 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-500 md:w-auto"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!canSave}
            className="w-full cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            {initialImage
              ? "Save Changes"
              : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}