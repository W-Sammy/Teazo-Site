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
} from "@/app/types/admin-event";

export type EventFormValues = Omit<AdminEvent, "id" | "imageUrl"> & {
  imageFile: File | null;
};

type EventFormProps = {
  initialEvent?: AdminEvent | null;
  categories: EventCategory[];
  items: EventCatalogItem[];
  onCancel: () => void;
  onSave: (values: EventFormValues) => void;
};

function toDateTimeLocal(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((current) => current !== value)
    : [...values, value];
}

const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxFileSize = 10 * 1024 * 1024;

export default function EventForm({
  initialEvent = null,
  categories,
  items,
  onCancel,
  onSave,
}: EventFormProps) {
  const [name, setName] = useState(initialEvent?.name ?? "");
  const [description, setDescription] = useState(
    initialEvent?.description ?? "",
  );
  const [startAt, setStartAt] = useState(
    toDateTimeLocal(initialEvent?.startAt),
  );
  const [endAt, setEndAt] = useState(
    toDateTimeLocal(initialEvent?.endAt),
  );
  const [appliesToAll, setAppliesToAll] = useState(
    initialEvent?.appliesToAll ?? false,
  );
  const [categoryIds, setCategoryIds] = useState<string[]>(
    initialEvent?.categoryIds ?? [],
  );
  const [itemIds, setItemIds] = useState<string[]>(
    initialEvent?.itemIds ?? [],
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(
    initialEvent?.imageUrl ?? "/admin_icons/teazo_dash_icon.png",
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const temporaryPreviewUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (temporaryPreviewUrl.current) {
        URL.revokeObjectURL(temporaryPreviewUrl.current);
      }
    };
  }, []);

  const affectedItemCount = useMemo(() => {
    if (appliesToAll) return items.length;

    const selectedCategories = new Set(categoryIds);
    return items.filter(
      (item) =>
        itemIds.includes(item.id) ||
        item.categoryIds.some((id) => selectedCategories.has(id)),
    ).length;
  }, [appliesToAll, categoryIds, itemIds, items]);

  function selectImage(file: File) {
    setImageError(null);

    if (!acceptedImageTypes.includes(file.type)) {
      setImageError("Choose a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > maxFileSize) {
      setImageError("The selected image must be 10 MB or smaller.");
      return;
    }

    if (temporaryPreviewUrl.current) {
      URL.revokeObjectURL(temporaryPreviewUrl.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    temporaryPreviewUrl.current = nextPreviewUrl;
    setImageFile(file);
    setPreviewUrl(nextPreviewUrl);
  }

  /* handles the form submission for the event information */
  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !description.trim()) {
      setError("Enter an event name and description.");
      return;
    }

    if (!startAt || !endAt) {
      setError("Choose a start and end date.");
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (endDate <= startDate) {
      setError("The end date must be later than the start date.");
      return;
    }

    /* onSave callback to handleSave in admin-events-client where POST/PATCH should be included */
    onSave({
      name: name.trim(),
      description: description.trim(),
      imageFile,
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      appliesToAll,
      categoryIds: appliesToAll ? [] : categoryIds,
      itemIds: appliesToAll ? [] : itemIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-full flex-col pt-4" noValidate>
      <h2 className="mb-6 text-center text-xl font-semibold">
        {initialEvent ? "Edit Event" : "Create New Event"}
      </h2>

      <label className="text-sm text-gray-700" htmlFor="event-name">
        Name
      </label>
      <input
        id="event-name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        className="mt-1 rounded border border-[#dbb082] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
      />

      <label className="mt-4 text-sm text-gray-700" htmlFor="event-description">
        Description
      </label>
      <textarea
        id="event-description"
        rows={4}
        value={description}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          setDescription(event.target.value)
        }
        className="mt-1 resize-y rounded border border-[#dbb082] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
      />

      <div className="mt-4">
        <label className="text-sm text-gray-700" htmlFor="event-image">
          Event image <span className="text-gray-400">(optional)</span>
        </label>
        <div className="relative mt-1 aspect-[4/3] overflow-hidden rounded-xl border border-[#dbb082] bg-[#f3ece6]">
          <Image
            src={previewUrl}
            alt={`${name || "Event"} preview`}
            fill
            unoptimized={previewUrl.startsWith("blob:")}
            className="object-cover"
            sizes="272px"
          />
        </div>
        <input
          id="event-image"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file) selectImage(file);
            event.target.value = "";
          }}
          className="mt-2 block w-full cursor-pointer rounded border border-[#dbb082] bg-[#fffaf6] p-2 text-xs file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-[#FFBDC7] file:px-3 file:py-2 file:font-semibold file:text-white"
        />
        <p className={`mt-1 text-xs ${imageError ? "text-red-600" : "text-gray-500"}`}>
          {imageError ?? "JPG, PNG, or WEBP · 10 MB maximum. /admin_icons/teazo_dash_icon.png is used if omitted."}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="text-sm text-gray-700" htmlFor="event-start">
          Starts
          <input
            id="event-start"
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className="mt-1 block w-full rounded border border-[#dbb082] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
          />
        </label>

        <label className="text-sm text-gray-700" htmlFor="event-end">
          Ends
          <input
            id="event-end"
            type="datetime-local"
            value={endAt}
            min={startAt || undefined}
            onChange={(event) => setEndAt(event.target.value)}
            className="mt-1 block w-full rounded border border-[#dbb082] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-gray-800">Applies to</legend>

        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded bg-[#fffaf6] p-2 text-sm">
          <input
            type="checkbox"
            checked={appliesToAll}
            onChange={(event) => setAppliesToAll(event.target.checked)}
            className="accent-[#b98555]"
          />
          All current and future items
        </label>

        {!appliesToAll && (
          <>
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Categories
            </p>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded border border-[#dbb082] p-2">
              {categories.length > 0 ? (
                categories.map((category) => (
                  <label key={category.id} className="flex cursor-pointer gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category.id)}
                      onChange={() =>
                        setCategoryIds((current) => toggleValue(current, category.id))
                      }
                      className="accent-[#b98555]"
                    />
                    {category.name}
                  </label>
                ))
              ) : (
                <p className="text-xs text-gray-400">No categories available</p>
              )}
            </div>

            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Individual items
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-[#dbb082] p-2">
              {items.length > 0 ? (
                items.map((item) => (
                  <label key={item.id} className="flex cursor-pointer gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={itemIds.includes(item.id)}
                      onChange={() => setItemIds((current) => toggleValue(current, item.id))}
                      className="accent-[#b98555]"
                    />
                    {item.name}
                  </label>
                ))
              ) : (
                <p className="text-xs text-gray-400">No menu items available</p>
              )}
            </div>
          </>
        )}

        <p className="mt-2 text-xs text-gray-500">
          {affectedItemCount} current {affectedItemCount === 1 ? "item" : "items"} affected.
          Future items in selected categories will also be included.
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-auto flex justify-between gap-3 pt-8">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-lg bg-gray-400 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
        >
          {initialEvent ? "Save Changes" : "Save"}
        </button>
      </div>
    </form>
  );
}
