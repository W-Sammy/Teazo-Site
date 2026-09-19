"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type SyntheticEvent,
} from "react";
import type { CreateMenuItemBody } from "@/app/types/menu-item";

// Keep the existing create-item fields; the selected image remains a local File.
export type MenuItemFormValues = CreateMenuItemBody & {
  description: string;
  currency: "USD";
  categoryIds: string[];
  imageFile: File | null;

  // A null imageFile keeps the current image unless removeImage is true.
  removeImage: boolean;
};

export type MenuItemFormInitialValues = {
  name: string;
  description: string;
  priceCents: number;
  categoryIds: string[];
  imageUrl: string;
};

type MenuItemFormProps = {
  initialItem?: MenuItemFormInitialValues | null;
  categories: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (values: MenuItemFormValues) => void;
};

type FieldErrors = {
  name?: string;
  price?: string;
  form?: string;
};

type SelectedImage = {
  file: File;
  url: string;
};

const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const maxFileSize = 10 * 1024 * 1024;

// Parse a nonnegative dollar amount without rounding extra decimal places.
function parsePriceCents(value: string): number | null {
  const trimmed = value.trim();

  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) {
    return null;
  }

  const [dollars, fraction = ""] = trimmed.split(".");

  const cents = Number(
    `${dollars || "0"}${fraction.padEnd(2, "0")}`,
  );

  return Number.isSafeInteger(cents) && cents >= 0
    ? cents
    : null;
}

export default function MenuItemForm({
  initialItem = null,
  categories,
  onCancel,
  onSave,
}: MenuItemFormProps) {
  const isEditing = initialItem !== null;

  const originalImageUrl =
    initialItem?.imageUrl?.trim() || null;

  // The parent gives each item its own form key, so switching items resets these fields.
  const [name, setName] = useState(
    initialItem?.name ?? "",
  );

  const [description, setDescription] = useState(
    initialItem?.description ?? "",
  );

  const [price, setPrice] = useState(
    initialItem
      ? (initialItem.priceCents / 100).toFixed(2)
      : "",
  );

  const [categoryIds, setCategoryIds] = useState<string[]>(
    [...(initialItem?.categoryIds ?? [])],
  );

  const [imageRemoved, setImageRemoved] = useState(false);

  const [originalImageFailed, setOriginalImageFailed] =
    useState(false);

  const [selectedImage, setSelectedImage] =
    useState<SelectedImage | null>(null);

  const [imageError, setImageError] =
    useState<string | null>(null);

  const [checkingImage, setCheckingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const nameRef = useRef<HTMLInputElement | null>(null);
  const priceRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewUrlRef = useRef<string | null>(null);
  const dragDepth = useRef(0);
  const submitted = useRef(false);

  const previewUrl =
    selectedImage?.url ??
    (imageRemoved ? null : originalImageUrl);

  // This form owns only its preview URL, not the parent's saved preview URL.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function selectFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    if (files.length !== 1) {
      setImageError("Select one image at a time.");
      return;
    }

    const file = files[0];

    // These are browser-side type/size checks, not server-side validation.
    if (!acceptedImageTypes.includes(file.type)) {
      setImageError("Choose a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size === 0 || file.size > maxFileSize) {
      setImageError(
        "Choose a nonempty image that is 10 MB or smaller.",
      );
      return;
    }

    try {
      const url = URL.createObjectURL(file);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      previewUrlRef.current = url;

      setSelectedImage({ file, url });
      setImageRemoved(false);
      setCheckingImage(true);
      setImageError(null);
    } catch {
      setImageError(
        "The image could not be previewed. Please select it again.",
      );
    }
  }

  function clearSelectedImage() {
    // Never revoke the existing item's URL here. Cancel must leave it usable.
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setSelectedImage(null);
    setCheckingImage(false);
    setImageError(null);
  }

  function removeImage() {
    clearSelectedImage();
    setImageRemoved(true);
  }

  function restoreOriginalImage() {
    clearSelectedImage();
    setImageRemoved(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    dragDepth.current = 0;
    setIsDragging(false);

    selectFiles(event.dataTransfer.files);
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitted.current || checkingImage) {
      return;
    }

    const nextErrors: FieldErrors = {};
    const cleanName = name.trim();
    const priceCents = parsePriceCents(price);

    if (!cleanName) {
      nextErrors.name = "Enter a menu item name.";
    }

    if (priceCents === null) {
      nextErrors.price =
        "Enter a price of 0 or more, with up to two decimal places.";
    }

    setErrors(nextErrors);

    if (nextErrors.name) {
      nameRef.current?.focus();
      return;
    }

    if (priceCents === null) {
      priceRef.current?.focus();
      return;
    }

    if (imageError) {
      return;
    }

    // Ignore category IDs no longer present in the supplied options.
    const availableIds = new Set(
      categories.map((category) => category.id),
    );

    try {
      submitted.current = true;

      onSave({
        name: cleanName,
        description: description.trim(),
        priceCents,
        currency: "USD",
        categoryIds: categoryIds.filter((id) =>
          availableIds.has(id),
        ),
        imageFile: selectedImage?.file ?? null,
        removeImage: imageRemoved,
      });
    } catch {
      submitted.current = false;

      setErrors({
        form: isEditing
          ? "The local changes could not be saved. Please try again."
          : "The temporary item could not be added. Please try again.",
      });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="menu-item-form-title"
      className="flex min-h-full w-full min-w-0 flex-col pt-2 sm:pt-4"
    >
      <h2
        id="menu-item-form-title"
        className="mb-3 pr-10 text-center text-lg font-semibold [overflow-wrap:anywhere] sm:text-xl"
      >
        {isEditing
          ? "Edit Menu Item"
          : "Create New Menu Item"}
      </h2>

      {/* Item name */}
      <div className="min-w-0">
        <label
          htmlFor="menu-item-name"
          className="mb-1 block text-sm text-gray-700"
        >
          Name
        </label>

        <input
          ref={nameRef}
          id="menu-item-name"
          name="menuItemName"
          type="text"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);

            setErrors((current) => ({
              ...current,
              name: undefined,
              form: undefined,
            }));
          }}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={
            errors.name ? "menu-item-name-error" : undefined
          }
          className="w-full min-w-0 rounded border border-[#dbb082] bg-white px-3 py-2 text-base text-gray-900 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
        />

        {errors.name && (
          <p
            id="menu-item-name-error"
            role="alert"
            className="mt-1 text-xs text-red-600"
          >
            {errors.name}
          </p>
        )}
      </div>

      {/* Price */}
      <div className="mt-4 min-w-0">
        <label
          htmlFor="menu-item-price"
          className="mb-1 block text-sm text-gray-700"
        >
          Price (USD)
        </label>

        <input
          ref={priceRef}
          id="menu-item-price"
          name="menuItemPrice"
          type="text"
          inputMode="decimal"
          required
          placeholder="0.00"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);

            setErrors((current) => ({
              ...current,
              price: undefined,
              form: undefined,
            }));
          }}
          aria-invalid={Boolean(errors.price)}
          aria-describedby="menu-item-price-help"
          className="w-full min-w-0 rounded border border-[#dbb082] bg-white px-3 py-2 text-base text-gray-900 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
        />

        <p
          id="menu-item-price-help"
          role={errors.price ? "alert" : undefined}
          className={`mt-1 text-xs ${
            errors.price ? "text-red-600" : "text-gray-500"
          }`}
        >
          {errors.price ??
            "Use a decimal point, for example 6.50."}
        </p>
      </div>

      {/* Description */}
      <div className="mt-4 min-w-0">
        <label
          htmlFor="menu-item-description"
          className="mb-1 block text-sm text-gray-700"
        >
          Description (optional)
        </label>

        <textarea
          id="menu-item-description"
          name="menuItemDescription"
          rows={4}
          value={description}
          onChange={(event) =>
            setDescription(event.target.value)
          }
          className="w-full min-w-0 resize-y rounded border border-[#dbb082] bg-white px-3 py-2 text-base text-gray-900 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 md:text-sm"
        />
      </div>

      {/* Existing category choices */}
      <fieldset className="mt-4 min-w-0">
        <legend className="text-sm text-gray-700">
          Categories (optional)
        </legend>

        <p className="mb-2 mt-1 text-xs text-gray-500">
          Select any that apply.
        </p>

        <div className="max-h-44 min-w-0 space-y-1 overflow-y-auto rounded border border-[#dbb082] p-2">
          {categories.length > 0 ? (
            categories.map((category) => (
              <label
                key={category.id}
                className="flex min-w-0 cursor-pointer items-start gap-2 py-1 text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  name="menuItemCategory"
                  value={category.id}
                  checked={categoryIds.includes(category.id)}
                  onChange={() =>
                    setCategoryIds((current) =>
                      current.includes(category.id)
                        ? current.filter(
                            (id) => id !== category.id,
                          )
                        : [...current, category.id],
                    )
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#b98555]"
                />

                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {category.name}
                </span>
              </label>
            ))
          ) : (
            <p className="text-sm text-gray-500">
              No categories available.
            </p>
          )}
        </div>
      </fieldset>

      {/* Optional image selection */}
      <div className="mt-5 min-w-0">
        <p
          id="menu-item-image-label"
          className="mb-2 text-sm text-gray-700"
        >
          Item image (optional)
        </p>

        {previewUrl && (
          <div className="mb-3 min-w-0">
            <div className="relative h-44 w-full overflow-hidden rounded-xl border border-[#dbb082] bg-[#f3ece6]">
              {!selectedImage && originalImageFailed ? (
                <p className="flex h-full items-center justify-center px-3 text-center text-sm text-gray-600">
                  The current image could not be previewed. It will
                  be kept unless you replace or remove it.
                </p>
              ) : (
                <Image
                  key={previewUrl}
                  src={previewUrl}
                  alt={`${name.trim() || "Menu item"} preview`}
                  fill
                  unoptimized
                  loading="eager"
                  sizes="(max-width: 767px) 100vw, 272px"
                  className="object-contain"
                  onLoad={() => {
                    if (
                      selectedImage &&
                      previewUrlRef.current === selectedImage.url
                    ) {
                      setCheckingImage(false);
                    }
                  }}
                  onError={() => {
                    if (selectedImage) {
                      if (
                        previewUrlRef.current !== selectedImage.url
                      ) {
                        return;
                      }

                      setCheckingImage(false);

                      setImageError(
                        "This file could not be displayed as an image. Choose another or remove it.",
                      );
                    } else {
                      // A failed preview of an existing image does not block text edits.
                      setOriginalImageFailed(true);
                    }
                  }}
                />
              )}
            </div>

            <p className="mt-1 text-xs text-gray-500 [overflow-wrap:anywhere]">
              {selectedImage?.file.name ?? "Current image"}
            </p>
          </div>
        )}

        <div
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();

            dragDepth.current = Math.max(
              0,
              dragDepth.current - 1,
            );

            if (dragDepth.current === 0) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
          className={`min-w-0 rounded-xl border-2 border-dashed p-3 text-center ${
            isDragging
              ? "border-[#f08a9b] bg-[#fff0f2]"
              : "border-[#dbb082] bg-[#fffaf6]"
          }`}
        >
          <input
            ref={fileInputRef}
            id="menu-item-image"
            name="menuItemImage"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            aria-labelledby="menu-item-image-label"
            onChange={(event) => {
              selectFiles(event.target.files);

              // Allow the same file to be chosen again.
              event.target.value = "";
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full cursor-pointer whitespace-normal rounded-lg bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
          >
            {previewUrl
              ? "Choose / Drop a Replacement"
              : "Select / Drop Image Here"}
          </button>

          <p className="mt-2 text-xs text-gray-500">
            JPG, PNG, or WEBP · 10 MB maximum
          </p>

          {(previewUrl || imageError) && (
            <button
              type="button"
              onClick={removeImage}
              className="mt-2 cursor-pointer text-sm text-red-600 hover:underline"
            >
              {previewUrl
                ? "Remove image"
                : "Continue without an image"}
            </button>
          )}

          {originalImageUrl &&
            (selectedImage || imageRemoved || imageError) && (
              <button
                type="button"
                onClick={restoreOriginalImage}
                className="mt-2 block w-full cursor-pointer text-sm text-blue-500 hover:underline"
              >
                Restore current image
              </button>
            )}
        </div>

        {checkingImage && (
          <p
            role="status"
            className="mt-2 text-xs text-gray-500"
          >
            Checking image preview…
          </p>
        )}

        {imageError && (
          <p
            role="alert"
            className="mt-2 text-xs text-red-600"
          >
            {imageError}
          </p>
        )}
      </div>

      {errors.form && (
        <p
          role="alert"
          className="mt-4 text-sm text-red-600"
        >
          {errors.form}
        </p>
      )}

      {/* Keep actions reachable on mobile; use normal flow on desktop. */}
      <div className="sticky bottom-0 z-10 mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 bg-white pb-2 pt-5 md:static md:mt-6 md:border-0">
        <button
          type="button"
          onClick={onCancel}
          className="min-w-0 cursor-pointer rounded-lg bg-gray-400 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-500"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={checkingImage}
          className="min-w-0 cursor-pointer rounded-lg bg-[#FFBDC7] px-3 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3] disabled:cursor-wait disabled:opacity-50"
        >
          {isEditing ? "Save Changes" : "Add Item"}
        </button>
      </div>
    </form>
  );
}