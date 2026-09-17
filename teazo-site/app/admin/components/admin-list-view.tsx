"use client";

import Image from "next/image";
import { useState } from "react";
import { allowedHosts } from "@/app/lib/imageHosts";
import type { ItemCategory } from "@/app/types/menu-item";

type CellValue =
  | string
  | string[]
  | number
  | number[]
  | boolean
  | null
  | ItemCategory[];

type Row = Partial<Record<string, CellValue>>;

type ListViewProps<T extends Row = Row> = {
  items: T[];

  // Optional so other pages can keep using this shared component unchanged.
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;

  // If omitted, automatically choose cards or a table based on available width.
  // "responsive" uses mobile cards and a desktop table until the user chooses a view.
  viewMode?: "auto" | "responsive" | "grid" | "list";
};

const fallbackImage = "/TEAZO_logo.svg";

function checkCell(value: unknown): string {
  if (value == null) {
    return "N/A";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "N/A";
    }

    if (value.length === 1) {
      return String(value[0]);
    }

    return "...";
  }

  const text = String(value);

  return text.length > 20
    ? `${text.slice(0, 20)}…`
    : text;
}

function fullCell(value: unknown): string {
  if (value == null) {
    return "N/A";
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map(String).join(", ")
      : "N/A";
  }

  return String(value);
}

function getItemName(item: Row): string {
  return typeof item.name === "string" && item.name.trim()
    ? item.name
    : "Unnamed item";
}

function getCategories(value: unknown): ItemCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (category): category is ItemCategory =>
      typeof category === "object" &&
      category !== null &&
      "id" in category &&
      typeof category.id === "string" &&
      "name" in category &&
      (
        typeof category.name === "string" ||
        category.name === null
      ),
  );
}

function getImageSrc(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallbackImage;
  }

  const source = value.trim();

  // Temporary images selected on this page use browser-local blob URLs.
  if (source.startsWith("blob:")) {
    return source;
  }

  if (
    source.startsWith("/") &&
    !source.startsWith("//") &&
    !source.includes("\\")
  ) {
    return source;
  }

  try {
    const url = new URL(source);

    const allowed = allowedHosts.some(
      (hostname) =>
        url.hostname === hostname ||
        url.hostname.endsWith(`.${hostname}`),
    );

    return url.protocol === "https:" && allowed
      ? source
      : fallbackImage;
  } catch {
    return fallbackImage;
  }
}

function ItemThumbnail({
  value,
  itemName,
  compact = false,
}: {
  value: unknown;
  itemName: string;
  compact?: boolean;
}) {
  const [failedSource, setFailedSource] =
    useState<string | null>(null);

  const source = getImageSrc(value);

  const displayedSource =
    failedSource === source
      ? fallbackImage
      : source;

  return (
    <Image
      src={displayedSource}
      alt={itemName}
      width={64}
      height={64}
      unoptimized={
        displayedSource === fallbackImage ||
        displayedSource.startsWith("blob:")
      }
      className={`shrink-0 rounded object-cover ${
        compact ? "h-8 w-8" : "h-16 w-16"
      }`}
      onError={() => {
        if (displayedSource !== fallbackImage) {
          setFailedSource(source);
        }
      }}
    />
  );
}

function DesktopCategories({ value }: { value: unknown }) {
  const categories = getCategories(value);

  if (categories.length === 0) {
    return <>N/A</>;
  }

  if (categories.length === 1) {
    return <>{categories[0].name ?? "Unnamed category"}</>;
  }

  return (
    <>
      {/* Mobile shows all category names instead of requiring a hover. */}
      <span className="md:hidden [overflow-wrap:anywhere]">
        {categories
          .map(
            (category) =>
              category.name ?? "Unnamed category",
          )
          .join(", ")}
      </span>

      <div
        className="group relative hidden md:inline-block"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="cursor-pointer font-bold text-blue-600 hover:underline focus-visible:underline"
          aria-label={`Show ${categories.length} categories`}
          title={categories
            .map(
              (category) =>
                category.name ?? "Unnamed category",
            )
            .join(", ")}
        >
          {categories.length}
        </button>

        <div className="absolute right-0 top-full z-20 mt-1 hidden w-48 rounded border border-[#dbb082] bg-white p-2 shadow-lg group-hover:block group-focus-within:block">
          <ul className="space-y-1 text-sm text-gray-700">
            {categories.map((category) => (
              <li
                key={category.id}
                className="[overflow-wrap:anywhere]"
              >
                {category.name ?? "Unnamed category"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function DeleteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export default function ListView<T extends Row = Row>({
  items,
  viewMode = "auto",
  onEdit,
  onDelete,
}: ListViewProps<T>) {
  if (!items || items.length === 0) {
    return (
      <div className="px-4 py-4">
        No data found
      </div>
    );
  }

  const keys = Array.from(
    new Set(
      items.flatMap((item) => Object.keys(item)),
    ),
  ).filter(
    (key) => key !== "id" && key !== "category_id",
  );

  const additionalKeys = keys.filter(
    (key) =>
      ![
        "img",
        "name",
        "price",
        "description",
        "categories",
      ].includes(key),
  );

  // Explicit Card/List choices apply on every screen size.
  // "responsive" supplies the menu's initial mobile/desktop defaults.
  // "auto" preserves the original container-width behavior for other callers.
  const cardVisibility =
    viewMode === "auto"
      ? "grid @min-[700px]/menu-list:hidden"
      : viewMode === "responsive"
        ? "grid md:hidden"
        : viewMode === "grid"
          ? "grid"
          : "hidden";

  const tableVisibility =
    viewMode === "auto"
      ? "hidden @min-[700px]/menu-list:block"
      : viewMode === "responsive"
        ? "hidden md:block"
        : viewMode === "list"
          ? "block"
          : "hidden";

  // Both card and table Edit buttons delegate to the page that owns the data.
  function editHandler(item: T) {
    if (onEdit) {
      onEdit(item);
    } else {
      console.log("edit", item);
    }
  }

  // Both delete controls use the same parent callback and confirmation flow.
  function deleteHandler(item: T) {
    if (onDelete) {
      onDelete(item);
    } else {
      console.log("delete", item);
    }
  }

  return (
    <div className="@container/menu-list w-full min-w-0">
      <ul
        className={`${cardVisibility} min-w-0 grid-cols-1 gap-3 p-3 sm:p-4`}
        aria-label="Menu items"
      >
        {items.map((item, index) => {
          const itemName = getItemName(item);
          const categories = getCategories(item.categories);

          return (
            <li
              key={String(item.id ?? index)}
              className="min-w-0"
            >
              <article className="min-w-0 rounded-xl border border-[#dbb082]/60 bg-white p-3 shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-gray-900 [overflow-wrap:anywhere]">
                      {itemName}
                    </h2>

                    <p className="mt-1 font-semibold text-gray-800 [overflow-wrap:anywhere]">
                      ${Number(item.price ?? 0).toFixed(2)}
                    </p>
                  </div>

                  <ItemThumbnail
                    value={item.img}
                    itemName={itemName}
                  />
                </div>

                <div className="mt-3 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-500">
                    Description
                  </h3>

                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">
                    {typeof item.description === "string" &&
                    item.description.trim()
                      ? item.description
                      : "No description"}
                  </p>
                </div>

                <div className="mt-3 min-w-0">
                  <h3 className="text-xs font-semibold text-gray-500">
                    Categories
                  </h3>

                  {categories.length > 0 ? (
                    <ul className="mt-1 flex min-w-0 flex-wrap gap-1.5">
                      {categories.map((category) => (
                        <li
                          key={category.id}
                          className="min-w-0 max-w-full rounded bg-[#fff0f2] px-2 py-1 text-xs text-[#374151] [overflow-wrap:anywhere]"
                        >
                          {category.name ?? "Unnamed category"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-gray-500">
                      N/A
                    </p>
                  )}
                </div>

                {additionalKeys.length > 0 && (
                  <dl className="mt-3 space-y-2">
                    {additionalKeys.map((key) => (
                      <div
                        key={key}
                        className="min-w-0"
                      >
                        <dt className="text-xs font-semibold text-gray-500">
                          {key}
                        </dt>

                        <dd className="text-sm [overflow-wrap:anywhere]">
                          {fullCell(item[key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#dbb082]/30 pt-3">
                  <button
                    type="button"
                    onClick={() => editHandler(item)}
                    aria-label={`Edit ${itemName}`}
                    className="min-w-0 cursor-pointer rounded bg-[#dbb082] px-2 py-2 text-sm font-bold text-white"
                  >
                    EDIT
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteHandler(item);
                    }}
                    aria-label={`Delete ${itemName}`}
                    className="inline-flex min-w-0 cursor-pointer flex-wrap items-center justify-center gap-1 rounded border border-red-200 px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    <DeleteIcon />
                    Delete
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {/* Swipe sideways inside this region without moving the whole page. */}
      <div
        className={`${tableVisibility} w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain md:overflow-x-visible md:@max-[560px]/menu-list:overflow-x-auto`}
        role="region"
        aria-label="Menu items list"
        tabIndex={0}
      >
        <table className="w-full min-w-[700px] table-fixed border-collapse md:min-w-[560px]">
          <caption className="sr-only">
            Menu items
          </caption>

          <colgroup>
            <col className="w-8" />
            <col className="w-16" />

            {keys.map((key) => (
              <col
                key={key}
                className={
                  key === "img"
                    ? "w-14"
                    : key === "price"
                      ? "w-24"
                      : undefined
                }
              />
            ))}
          </colgroup>

          <thead>
            <tr className="border-b border-[#dbb082]">
              <th scope="col">
                <span className="sr-only">Delete</span>
              </th>

              <th scope="col">
                <span className="sr-only">Edit</span>
              </th>

              {keys.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="py-2 pr-2 text-left [overflow-wrap:anywhere]"
                >
                  {checkCell(key)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {items.map((item, index) => {
              const itemName = getItemName(item);

              return (
                <tr
                  key={String(item.id ?? index)}
                  onClick={() => editHandler(item)}
                  className="cursor-pointer border-b border-[#dbb082]/50 hover:bg-[#dbb082]/25"
                >
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteHandler(item);
                      }}
                      aria-label={`Delete ${itemName}`}
                      className="flex h-8 w-8 cursor-pointer items-center justify-center text-red-500 hover:text-red-700"
                    >
                      <DeleteIcon />
                    </button>
                  </td>

                  <td className="py-2 pr-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        editHandler(item);
                      }}
                      aria-label={`Edit ${itemName}`}
                      className="cursor-pointer rounded bg-[#dbb082] px-1.5 py-0.5 text-xs font-bold text-white"
                    >
                      EDIT
                    </button>
                  </td>

                  {keys.map((key) => (
                    <td
                      key={key}
                      title={
                        typeof item[key] === "string" &&
                        key !== "img"
                          ? String(item[key])
                          : undefined
                      }
                      className="py-2 pr-2 [overflow-wrap:anywhere]"
                    >
                      {key === "price" ? (
                        `$${Number(item[key] ?? 0).toFixed(2)}`
                      ) : key === "img" ? (
                        <ItemThumbnail
                          value={item[key]}
                          itemName={itemName}
                          compact
                        />
                      ) : key === "categories" ? (
                        <DesktopCategories value={item[key]} />
                      ) : (
                        checkCell(item[key])
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}