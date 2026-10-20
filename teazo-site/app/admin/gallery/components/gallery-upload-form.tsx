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
import { adminButtonStyles } from "../../components/admin-button-styles";

// A null file lets edits keep the existing image while updating its name or tags.
export type GalleryUploadValues = {
  name: string;
  tags: string[];
  file: File | null;
};

type GalleryUploadFormProps = {
  initialImage?: AdminGalleryImage | null;
  onCancel: () => void;
  onSave: (
    values: GalleryUploadValues,
  ) => void | Promise<void>;
};

// JPG, PNG and WebP can be processed by the existing backend.
const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// Some browsers report HEIC/HEIF as an empty or generic MIME type.
const heicImageTypes = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function isHeicImage(file: File) {
  return (
    heicImageTypes.has(file.type.toLowerCase()) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

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
  // Seed fields from the image being edited, or start a blank new image.
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

  // Keep field-specific messages beside the relevant control.
  const [nameError, setNameError] =
    useState<string | null>(null);

  const [tagError, setTagError] =
    useState<string | null>(null);

  const [imageError, setImageError] =
    useState<string | null>(null);

  // Report failures after validation, including server/network errors.
  const [uploadError, setUploadError] =
    useState<string | null>(null);

  // Prevent duplicate submissions.
  const [isSaving, setIsSaving] =
    useState(false);

  // Prevent saving while HEIC/HEIF conversion is running.
  const [isConverting, setIsConverting] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  // Only revoke object URLs created by this form.
  const temporaryPreviewUrl =
    useRef<string | null>(null);

  // Prevent unfinished conversions from updating a closed form.
  const isMounted = useRef(true);
  const selectionSequence = useRef(0);

  // Free the latest preview when the form closes.
  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      selectionSequence.current += 1;

      if (temporaryPreviewUrl.current) {
        URL.revokeObjectURL(
          temporaryPreviewUrl.current,
        );
        temporaryPreviewUrl.current = null;
      }
    };
  }, []);

  // Replace the preview only after validation/conversion succeeds.
  // A conversion failure must preserve the previous selection.
  function applySelectedFile(
    file: File,
    originalName: string,
  ) {
    const nextPreviewUrl =
      URL.createObjectURL(file);

    const previousPreviewUrl =
      temporaryPreviewUrl.current;

    temporaryPreviewUrl.current =
      nextPreviewUrl;

    setSelectedFile(file);
    setPreviewUrl(nextPreviewUrl);

    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    // Suggest a filename-based title only when the name is blank.
    if (!name.trim()) {
      setName(fileNameToTitle(originalName));
      setNameError(null);
    }
  }

  // Both file picking and drag-and-drop use the same validation.
  async function selectFile(file: File) {
    if (isSaving || isConverting) {
      return;
    }

    setImageError(null);
    setUploadError(null);

    const needsConversion = isHeicImage(file);

    if (
      !needsConversion &&
      !acceptedImageTypes.includes(
        file.type.toLowerCase(),
      )
    ) {
      setImageError(
        "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
      );
      return;
    }

    if (file.size > maxFileSize) {
      setImageError(
        "The selected image must be 10 MB or smaller.",
      );
      return;
    }

    // Regular images keep the existing upload workflow.
    if (!needsConversion) {
      applySelectedFile(file, file.name);
      return;
    }

    // HEIC/HEIF files must be converted before preview/upload.
    const requestId = ++selectionSequence.current;

    setIsConverting(true);

    try {
      // Dynamically load the converter only for HEIC/HEIF files.
      const { default: heic2any } =
        await import("heic2any");

      const result = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85,
      });

      // Use the first still image if multiple frames are returned.
      const jpegBlob = Array.isArray(result)
        ? result[0]
        : result;

      if (!jpegBlob || jpegBlob.size === 0) {
        throw new Error(
          "The converted image was empty.",
        );
      }

      // Preserve the 10 MB upload limit after conversion.
      if (jpegBlob.size > maxFileSize) {
        throw new Error(
          "The converted image exceeds 10 MB.",
        );
      }

      // Create a normal JPEG file for the existing upload API.
      const jpegName =
        file.name.replace(
          /\.(heic|heif)$/i,
          "",
        ) + ".jpg";

      const jpegFile = new File(
        [jpegBlob],
        jpegName,
        {
          type: "image/jpeg",
          lastModified: file.lastModified,
        },
      );

      // Do not update state if the form closed during conversion.
      if (
        isMounted.current &&
        selectionSequence.current === requestId
      ) {
        applySelectedFile(
          jpegFile,
          file.name,
        );
      }
    } catch (error) {
      console.error(
        "HEIC/HEIF conversion failed:",
        error,
      );

      if (
        isMounted.current &&
        selectionSequence.current === requestId
      ) {
        setImageError(
          "This HEIC/HEIF image could not be converted. Try another image or convert it to JPG first.",
        );
      }
    } finally {
      if (
        isMounted.current &&
        selectionSequence.current === requestId
      ) {
        setIsConverting(false);
      }
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (file) {
      void selectFile(file);
    }

    // Allow the same file to be selected again.
    event.target.value = "";
  }

  // Prevent browser navigation and process the first dropped file.
  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) {
      void selectFile(file);
    }
  }

  // Add a normalized tag with length, count and duplicate validation.
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

  // Enter/comma add a tag. Backspace removes the last tag if empty.
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

  // Remove only the requested tag.
  function removeTag(tagToRemove: string) {
    setTags((currentTags) =>
      currentTags.filter(
        (tag: string) => tag !== tagToRemove,
      ),
    );

    setTagError(null);
  }

  // Validate fields and include any unfinished tag before saving.
  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSaving || isConverting) {
      return;
    }

    const cleanName = name.trim();
    let submittedTags = tags;

    setNameError(null);
    setTagError(null);
    setImageError(null);
    setUploadError(null);

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

    // Include typed text even if Add wasn't clicked.
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

    // Submit the converted JPEG or original supported image.
    // The parent handles the API request and persistent storage.
    try {
      setIsSaving(true);

      await onSave({
        name: cleanName,
        tags: submittedTags,
        file: selectedFile,
      });
    } catch (error) {
      console.error(
        "Gallery image save failed:",
        error,
      );

      setUploadError(
        error instanceof Error && error.message
          ? error.message
          : "The image could not be saved. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  // Submission remains unavailable during conversion.
  const canSave = Boolean(
    name.trim() && previewUrl && !isConverting,
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
            Name <span className="text-red-600" aria-hidden="true">*</span>
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
              setUploadError(null);
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
                setUploadError(null);
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
          <label htmlFor="gallery-image-file" className="mb-2 block text-sm text-gray-700">
            Image{initialImage ? " (optional)" : <> <span className="text-red-600" aria-hidden="true">*</span></>}
          </label>
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

          {/* Shared file picker for standard and HEIC/HEIF images */}
          <input
            ref={fileInputRef}
            id="gallery-image-file"
            name="galleryImageFile"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            onChange={handleFileChange}
            disabled={isSaving || isConverting}
            className="hidden"
          />

          {previewUrl ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={isSaving || isConverting}
                className="cursor-pointer rounded-lg border border-[#dbb082] bg-[#fffaf6] px-4 py-2 text-sm font-semibold text-[#9b6d43] hover:bg-[#f3ece6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConverting
                  ? "Converting HEIC..."
                  : "Change Image"}
              </button>

              <p className="text-center text-xs text-gray-500">
                JPG, PNG, WebP, HEIC, or HEIF · 10 MB maximum
              </p>
            </div>
          ) : (
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
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={isSaving || isConverting}
                className={`w-full max-w-full whitespace-normal break-words ${adminButtonStyles.primary} sm:w-auto`}
              >
                {isConverting
                  ? "Converting HEIC..."
                  : "Select/Drag Image Here"}
              </button>

              <p className="mt-2 max-w-full break-words text-xs text-gray-500">
                JPG, PNG, WebP, HEIC, or HEIF · 10 MB maximum
              </p>
            </div>
          )}

          {isConverting && (
            <p
              role="status"
              className="mt-2 text-center text-xs text-gray-500"
            >
              Converting image for preview and upload...
            </p>
          )}

          {imageError && (
            <p className="mt-2 break-words text-center text-xs text-red-600">
              {imageError}
            </p>
          )}
        </div>

        {/* Show server/network save failures without closing the form. */}
        {uploadError && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {uploadError}
          </div>
        )}

        {/* Keep actions reachable while the mobile form content scrolls. */}
        {/* Form actions */}
        <div className="sticky bottom-0 z-10 -mx-1 mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 bg-white px-1 pb-1 pt-5 md:static md:mx-0 md:flex md:items-center md:justify-between md:border-0 md:px-0 md:pb-0 md:pt-8">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className={`w-full ${adminButtonStyles.secondary} md:w-auto`}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!canSave || isSaving || isConverting}
            className={`w-full ${adminButtonStyles.primary} md:w-auto`}
          >
            {isSaving
              ? "Saving..."
              : initialImage
                ? "Save Changes"
                : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
