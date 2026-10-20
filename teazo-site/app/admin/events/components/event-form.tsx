
"use client";

import Image from "next/image";
import { adminButtonStyles } from "@/app/admin/components/admin-button-styles";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from "react";
import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
  EventFormValues,
} from "@/app/types/admin-event";

// Collect values locally and pass them to the parent, which handles saving.
type EventFormProps = {
  initialEvent?: AdminEvent | null;
  categories: EventCategory[];
  items: EventCatalogItem[];
  onCancel: () => void;
  onSave: (values: EventFormValues) => void;
};

// Client-side checks use the selected file's declared MIME type and size.
const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// Some browsers report HEIC/HEIF files with a missing or generic MIME type.
const heicImageTypes = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function isHeicImage(file: File): boolean {
  return (
    heicImageTypes.has(file.type.toLowerCase()) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

// File-size limit in bytes; the interface labels this as 10 MB.
const maxFileSize = 10 * 1024 * 1024;

const fallbackImageUrl =
  "/admin_icons/admin_svg/teazo_dash_icon.svg";

// Format a stored date for datetime-local using the browser's local clock.
function toDateTimeLocal(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  // Shift by the local offset before taking the ISO date/time portion without Z.
  const offset =
    date.getTimezoneOffset() * 60_000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}

// Toggle an ID without mutating the existing category or item selection.
function toggleValue(
  values: string[],
  value: string,
) {
  return values.includes(value)
    ? values.filter(
        (current) => current !== value,
      )
    : [...values, value];
}

export default function EventForm({
  initialEvent = null,
  categories,
  items,
  onCancel,
  onSave,
}: EventFormProps) {
  // The parent remounts this form when switching records, reseeding these defaults.
  const initialPreviewUrl =
    initialEvent?.imageUrl?.trim() ||
    fallbackImageUrl;

  const [name, setName] = useState(
    initialEvent?.name ?? "",
  );

  const [description, setDescription] =
    useState(
      initialEvent?.description ?? "",
    );

  const [startAt, setStartAt] = useState(
    toDateTimeLocal(initialEvent?.startAt),
  );

  const [endAt, setEndAt] = useState(
    toDateTimeLocal(initialEvent?.endAt),
  );

  const [appliesToAll, setAppliesToAll] =
    useState(
      initialEvent?.appliesToAll ?? false,
    );

  const [categoryIds, setCategoryIds] =
    useState<string[]>(
      initialEvent?.categoryIds ?? [],
    );

  const [itemIds, setItemIds] =
    useState<string[]>(
      initialEvent?.itemIds ?? [],
    );

  // A null imageFile means no replacement file has been chosen in this form.
  const [imageFile, setImageFile] =
    useState<File | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState(initialPreviewUrl);

  const [imageError, setImageError] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  // Do not allow saving while a HEIC/HEIF image is being converted.
  const [isConverting, setIsConverting] = useState(false);

  // Ignore a conversion result if the form has already closed.
  const isMounted = useRef(true);
  const selectionSequence = useRef(0);
  const conversionInProgress = useRef(false);

  // The visible Choose File button triggers this hidden native file input.
  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  // Track only the temporary blob URL created here, not an existing saved image URL.
  const temporaryPreviewUrl =
    useRef<string | null>(null);

  // Release the remaining temporary preview when the form unmounts.
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

  // Count each current item once, even if both a category and an explicit ID match.
  const affectedItemCount = useMemo(() => {
    if (appliesToAll) {
      return items.length;
    }

    const selectedCategories = new Set(
      categoryIds,
    );

    return items.filter(
      (item) =>
        itemIds.includes(item.id) ||
        item.categoryIds.some((id) =>
          selectedCategories.has(id),
        ),
    ).length;
  }, [
    appliesToAll,
    categoryIds,
    itemIds,
    items,
  ]);

  // The default icon is contained; selected event photos fill the preview area.
  const usesFallbackImage =
    previewUrl === fallbackImageUrl;

  const selectedFileLabel =
    imageFile?.name ??
    (initialEvent?.imageUrl &&
    initialEvent.imageUrl !== fallbackImageUrl
      ? "Current image selected"
      : "No file chosen");

  // Update the preview only after the new file is valid and ready.
  function applySelectedFile(file: File) {
    const nextPreviewUrl = URL.createObjectURL(file);
    const previousPreviewUrl = temporaryPreviewUrl.current;

    temporaryPreviewUrl.current = nextPreviewUrl;
    setImageFile(file);
    setPreviewUrl(nextPreviewUrl);

    if (previousPreviewUrl) {
      URL.revokeObjectURL(previousPreviewUrl);
    }
  }

  // Validate normal images, or convert HEIC/HEIF to a JPEG before uploading.
  async function selectImage(file: File) {
    if (conversionInProgress.current) return;

    setImageError(null);

    const needsConversion = isHeicImage(file);

    if (
      !needsConversion &&
      !acceptedImageTypes.includes(file.type.toLowerCase())
    ) {
      setImageError(
        "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
      );
      return;
    }

    if (file.size === 0 || file.size > maxFileSize) {
      setImageError(
        "The selected image must be nonempty and 10 MB or smaller.",
      );
      return;
    }

    if (!needsConversion) {
      applySelectedFile(file);
      return;
    }

    const requestId = ++selectionSequence.current;
    conversionInProgress.current = true;
    setIsConverting(true);

    try {
      // Use the same client-side converter already used by Admin Gallery.
      const { default: heic2any } = await import("heic2any");
      const result = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85,
      });

      // Multi-frame HEIC files may produce several converted blobs.
      const jpegBlob = Array.isArray(result) ? result[0] : result;

      if (!jpegBlob || jpegBlob.size === 0) {
        throw new Error("The converted image was empty.");
      }

      if (jpegBlob.size > maxFileSize) {
        throw new Error("The converted image exceeds 10 MB.");
      }

      const jpegName =
        file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
      const jpegFile = new File([jpegBlob], jpegName, {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });

      if (isMounted.current && selectionSequence.current === requestId) {
        applySelectedFile(jpegFile);
      }
    } catch (error) {
      console.error("Event HEIC/HEIF conversion failed:", error);

      if (isMounted.current && selectionSequence.current === requestId) {
        setImageError(
          "This HEIC/HEIF image could not be converted. Try another image or convert it to JPG first.",
        );
      }
    } finally {
      conversionInProgress.current = false;
      if (isMounted.current && selectionSequence.current === requestId) {
        setIsConverting(false);
      }
    }
  }

  // Use only the first selected file and allow reselecting the same file.
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      void selectImage(file);
    }

    event.target.value = "";
  }

  // Validate required text and date ordering before handing values to the parent.
  function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (conversionInProgress.current || isConverting) {
      return;
    }

    setError(null);

    if (
      !name.trim() ||
      !description.trim()
    ) {
      setError(
        "Enter an event name and description.",
      );
      return;
    }

    if (!startAt || !endAt) {
      setError(
        "Choose a start and end date.",
      );
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (endDate <= startDate) {
      setError(
        "The end date must be later than the start date.",
      );
      return;
    }

    // Convert local inputs to UTC ISO strings and omit specific targets for all-items events.
    onSave({
      name: name.trim(),
      description: description.trim(),
      imageFile,
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      appliesToAll,
      categoryIds: appliesToAll
        ? []
        : categoryIds,
      itemIds: appliesToAll
        ? []
        : itemIds,
    });
  }

  // noValidate lets the form display its own validation messages.
  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-full w-full min-w-0 flex-col overflow-x-hidden pt-2 sm:pt-4"
      noValidate
    >
      <div className="mx-auto flex w-full max-w-xl min-w-0 flex-1 flex-col md:max-w-none">
        <h2 className="mb-5 break-words pr-10 text-center text-lg font-semibold sm:mb-6 sm:text-xl">
          {initialEvent
            ? "Edit Event"
            : "Create New Event"}
        </h2>

        {/* Event name */}
        <div className="min-w-0">
          <label
            className="mb-1 block text-sm text-gray-700"
            htmlFor="event-name"
          >
            Name <span className="text-red-600" aria-hidden="true">*</span>
          </label>

          <input
            id="event-name"
            name="eventName"
            type="text"
            value={name}
            onChange={(
              event: ChangeEvent<HTMLInputElement>,
            ) => {
              setName(event.target.value);
              setError(null);
            }}
            className="w-full min-w-0 rounded border border-[#dbb082] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
          />
        </div>

        {/* Description */}
        <div className="mt-4 min-w-0">
          <label
            className="mb-1 block text-sm text-gray-700"
            htmlFor="event-description"
          >
            Description <span className="text-red-600" aria-hidden="true">*</span>
          </label>

          <textarea
            id="event-description"
            name="eventDescription"
            rows={4}
            value={description}
            onChange={(
              event: ChangeEvent<HTMLTextAreaElement>,
            ) => {
              setDescription(
                event.target.value,
              );
              setError(null);
            }}
            className="w-full min-w-0 resize-y rounded border border-[#dbb082] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
          />
        </div>

        {/* Event image */}
        <div className="mt-4 min-w-0">
          <label
            className="block text-sm text-gray-700"
            htmlFor="event-image"
          >
            Event image{" "}
            <span className="text-gray-400">
              (optional)
            </span>
          </label>

          <div className="relative mt-1 aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#dbb082] bg-[#f3ece6]">
            <Image
              src={previewUrl}
              alt={`${
                name || "Event"
              } preview`}
              fill
              unoptimized={previewUrl.startsWith(
                "blob:",
              )}
              className={
                usesFallbackImage
                  ? "object-contain p-8 sm:p-10"
                  : "object-cover"
              }
              sizes="(max-width: 767px) calc(100vw - 2rem), 272px"
            />
          </div>

          {/* Keep the native chooser hidden and open it with the styled button below. */}
          <input
            ref={fileInputRef}
            id="event-image"
            name="eventImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
            disabled={isConverting}
            onChange={handleFileChange}
            className="hidden"
            aria-describedby="event-image-help"
          />

          <div className="mt-2 min-w-0 rounded border border-[#dbb082] bg-[#fffaf6] p-2">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={isConverting}
                className={`w-full shrink-0 ${adminButtonStyles.primary} sm:w-auto`}
              >
                {isConverting ? "Converting HEIC..." : "Choose File"}
              </button>

              <span
                className="min-w-0 break-all text-sm text-gray-600 sm:truncate"
                title={selectedFileLabel}
              >
                {selectedFileLabel}
              </span>
            </div>
          </div>

          <p
            id="event-image-help"
            className={`mt-1 break-words text-xs ${
              imageError
                ? "text-red-600"
                : "text-gray-500"
            }`}
          >
            {imageError ??
              "JPG, PNG, WebP, HEIC, or HEIF · 10 MB maximum. A default image is used if omitted."}
          </p>

          {isConverting && (
            <p role="status" className="mt-2 text-xs text-gray-500">
              Converting HEIC/HEIF image for preview and upload...
            </p>
          )}
        </div>

        {/* Event dates */}
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3">
          <label
            className="min-w-0 text-sm text-gray-700"
            htmlFor="event-start"
          >
            Starts <span className="text-red-600" aria-hidden="true">*</span>

            <input
              id="event-start"
              name="eventStart"
              type="datetime-local"
              value={startAt}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) => {
                setStartAt(
                  event.target.value,
                );
                setError(null);
              }}
              className="mt-1 block w-full min-w-0 max-w-full rounded border border-[#dbb082] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
            />
          </label>

          <label
            className="min-w-0 text-sm text-gray-700"
            htmlFor="event-end"
          >
            Ends <span className="text-red-600" aria-hidden="true">*</span>

            <input
              id="event-end"
              name="eventEnd"
              type="datetime-local"
              value={endAt}
              min={startAt || undefined}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) => {
                setEndAt(
                  event.target.value,
                );
                setError(null);
              }}
              className="mt-1 block w-full min-w-0 max-w-full rounded border border-[#dbb082] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
            />
          </label>
        </div>

        {/* Event targets */}
        <fieldset className="mt-5 min-w-0">
          <legend className="text-sm font-semibold text-gray-800">
            Applies to
          </legend>

          <label className="mt-2 flex min-w-0 cursor-pointer items-start gap-2 rounded bg-[#fffaf6] p-2 text-sm">
            <input
              type="checkbox"
              name="eventAppliesToAll"
              checked={appliesToAll}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) =>
                setAppliesToAll(
                  event.target.checked,
                )
              }
              className="mt-0.5 shrink-0 accent-[#b98555]"
            />

            <span className="min-w-0 break-words">
              All current and future items
            </span>
          </label>

          {/* Specific selections remain in state while hidden, but are omitted on save. */}
          {!appliesToAll && (
            <>
              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Categories
              </p>

              <div className="max-h-36 min-w-0 space-y-1 overflow-y-auto rounded border border-[#dbb082] p-2">
                {categories.length > 0 ? (
                  categories.map(
                    (category) => (
                      <label
                        key={category.id}
                        className="flex min-w-0 cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="eventCategory"
                          value={category.id}
                          checked={categoryIds.includes(
                            category.id,
                          )}
                          onChange={() =>
                            setCategoryIds(
                              (current) =>
                                toggleValue(
                                  current,
                                  category.id,
                                ),
                            )
                          }
                          className="mt-0.5 shrink-0 accent-[#b98555]"
                        />

                        <span className="min-w-0 break-words">
                          {category.name}
                        </span>
                      </label>
                    ),
                  )
                ) : (
                  <p className="text-xs text-gray-400">
                    No categories available
                  </p>
                )}
              </div>

              <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Individual items
              </p>

              <div className="max-h-44 min-w-0 space-y-1 overflow-y-auto rounded border border-[#dbb082] p-2">
                {items.length > 0 ? (
                  items.map((item) => (
                    <label
                      key={item.id}
                      className="flex min-w-0 cursor-pointer items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="eventItem"
                        value={item.id}
                        checked={itemIds.includes(
                          item.id,
                        )}
                        onChange={() =>
                          setItemIds(
                            (current) =>
                              toggleValue(
                                current,
                                item.id,
                              ),
                          )
                        }
                        className="mt-0.5 shrink-0 accent-[#b98555]"
                      />

                      <span className="min-w-0 break-words">
                        {item.name}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-xs text-gray-400">
                    No menu items available
                  </p>
                )}
              </div>
            </>
          )}

          <p className="mt-2 break-words text-xs text-gray-500">
            {affectedItemCount} current{" "}
            {affectedItemCount === 1
              ? "item"
              : "items"}{" "}
            affected. Future items in selected
            categories will also be included.
          </p>
        </fieldset>

        {/* Announce submit-level validation errors separately from image errors. */}
        {error && (
          <p
            role="alert"
            className="mt-4 break-words rounded bg-red-50 p-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Keep Cancel and Save visible near the bottom while scrolling on mobile.
          * On larger screens, let the buttons scroll normally with the form.
          */}
        {/*Form actions */}
        <div className="sticky bottom-0 z-10 -mx-1 mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 bg-white px-1 pb-2 pt-5 md:static md:mx-0 md:flex md:items-center md:justify-between md:border-0 md:px-0 md:pb-0 md:pt-8">
          <button
            type="button"
            onClick={onCancel}
            className={`w-full ${adminButtonStyles.secondary} md:w-auto`}
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isConverting}
            className={`w-full ${adminButtonStyles.primary} md:w-auto`}
          >
            {initialEvent
              ? "Save Changes"
              : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
