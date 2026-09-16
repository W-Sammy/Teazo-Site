"use client";

import Image from "next/image";
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

// File-size limit in bytes; the interface labels this as 10 MB.
const maxFileSize = 10 * 1024 * 1024;

const fallbackImageUrl =
  "/admin_icons/teazo_dash_icon.png";

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

  // The visible Choose File button triggers this hidden native file input.
  const fileInputRef =
    useRef<HTMLInputElement | null>(null);

  // Track only the temporary blob URL created here, not an existing saved image URL.
  const temporaryPreviewUrl =
    useRef<string | null>(null);

  // Release the remaining temporary preview when the form unmounts.
  useEffect(() => {
    return () => {
      if (temporaryPreviewUrl.current) {
        URL.revokeObjectURL(
          temporaryPreviewUrl.current,
        );
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

  // Reject invalid files without replacing a previously valid selection or preview.
  function selectImage(file: File) {
    setImageError(null);

    if (
      !acceptedImageTypes.includes(file.type)
    ) {
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

    // Create a local preview only; this does not upload the file.
    const nextPreviewUrl =
      URL.createObjectURL(file);

    temporaryPreviewUrl.current =
      nextPreviewUrl;

    setImageFile(file);
    setPreviewUrl(nextPreviewUrl);
  }

  // Use only the first selected file.
  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (file) {
      selectImage(file);
    }

    /*
     * Allows the same file to be selected again
     * after an invalid or canceled selection.
     */
    event.target.value = "";
  }

  // Validate required text and date ordering before handing values to the parent.
  function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

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
            Name
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
            Description
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
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
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
                className="w-full shrink-0 cursor-pointer rounded bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] sm:w-auto"
              >
                Choose File
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
              "JPG, PNG, or WEBP · 10 MB maximum. A default image is used if omitted."}
          </p>
        </div>

        {/* Event dates */}
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3">
          <label
            className="min-w-0 text-sm text-gray-700"
            htmlFor="event-start"
          >
            Starts

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
            Ends

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

        {/* Actions remain sticky on smaller screens and return to normal flow on desktop. */}
        {/* Form actions */}
        <div className="sticky bottom-0 z-10 -mx-1 mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 bg-white px-1 pb-2 pt-5 md:static md:mx-0 md:flex md:items-center md:justify-between md:border-0 md:px-0 md:pb-0 md:pt-8">
          <button
            type="button"
            onClick={onCancel}
            className="w-full cursor-pointer rounded-lg bg-gray-400 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-500 md:w-auto"
          >
            Cancel
          </button>

          <button
            type="submit"
            className="w-full cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] md:w-auto"
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