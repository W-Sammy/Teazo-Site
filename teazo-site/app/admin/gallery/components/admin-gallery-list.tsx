"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import type { AdminGalleryImage } from "../../../types/gallery-image";

type AdminGalleryListProps = {
  images: AdminGalleryImage[];
  onEdit: (image: AdminGalleryImage) => void;
  onDelete: (image: AdminGalleryImage) => void;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : dateFormatter.format(date);
}

export default function AdminGalleryList({
  images,
  onEdit,
  onDelete,
}: AdminGalleryListProps) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[#dbb082]/60 bg-white">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-[#dbb082] bg-[#fffaf6] text-left text-sm text-gray-700">
            <th className="w-14 px-3 py-3" aria-label="Delete" />
            <th className="w-20 px-3 py-3" aria-label="Edit" />
            <th className="w-20 px-3 py-3">Icon</th>
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Tags</th>
            <th className="w-36 px-3 py-3">Added</th>
          </tr>
        </thead>

        <tbody>
          {images.map((image) => (
            <tr
              key={image.id}
              onClick={() => onEdit(image)}
              className="cursor-pointer border-b border-[#dbb082]/40 text-sm last:border-b-0 hover:bg-[#dbb082]/15"
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    onDelete(image);
                  }}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg font-bold text-red-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Delete ${image.name}`}
                  title="Delete image"
                >
                  ×
                </button>
              </td>

              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    onEdit(image);
                  }}
                  className="cursor-pointer rounded bg-[#dbb082] px-2 py-1 text-xs font-bold text-white hover:bg-[#c89968]"
                >
                  EDIT
                </button>
              </td>

              <td className="px-3 py-2">
                <div className="relative h-11 w-11 overflow-hidden rounded bg-[#f3ece6]">
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    unoptimized={image.url.startsWith("blob:")}
                    className="object-cover"
                    sizes="44px"
                  />
                </div>
              </td>

              <td className="px-3 py-2 font-medium text-gray-900">
                {image.name}
              </td>

              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {image.tags.length > 0 ? (
                    image.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[#fff0f2] px-2 py-1 text-xs text-gray-700"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">No tags</span>
                  )}
                </div>
              </td>

              <td className="px-3 py-2 text-gray-500">
                {formatDate(image.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
