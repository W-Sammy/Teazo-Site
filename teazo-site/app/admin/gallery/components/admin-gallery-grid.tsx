"use client";

import Image from "next/image";
import type { AdminGalleryImage } from "../../../types/gallery-image";

type AdminGalleryGridProps = {
  images: AdminGalleryImage[];
  onEdit: (image: AdminGalleryImage) => void;
  onDelete: (image: AdminGalleryImage) => void;
};

export default function AdminGalleryGrid({
  images,
  onEdit,
  onDelete,
}: AdminGalleryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {images.map((image, index) => (
        <article
          key={image.id}
          className="rounded-2xl border border-[#dbb082]/60 bg-white shadow-sm"
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-[#f3ece6]">
            <Image
              src={image.url}
              alt={image.name}
              fill
              loading={index < 3 ? "eager" : "lazy"}
              unoptimized={image.url.startsWith("blob:")}
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            />

            {/*
             * Makes the entire image clickable without using the animated
             * hover overlay that caused Safari to stop painting tag text.
             */}
            <button
              type="button"
              onClick={() => onEdit(image)}
              className="absolute inset-0 z-10 cursor-pointer bg-transparent"
              aria-label={`Edit ${image.name}`}
            >
              <span className="sr-only">
                Edit {image.name}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onDelete(image)}
              className="absolute right-3 top-3 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/95 text-red-500 shadow hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              aria-label={`Delete ${image.name}`}
              title="Delete image"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>

          <div className="relative z-10 rounded-b-2xl bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 truncate font-semibold text-gray-900">
                {image.name}
              </h2>

              <button
                type="button"
                onClick={() => onEdit(image)}
                className="shrink-0 cursor-pointer text-xs font-bold text-[#b98555] hover:underline"
              >
                EDIT
              </button>
            </div>

            <div className="relative z-10 mt-2 flex min-h-6 flex-wrap gap-1.5">
              {image.tags.length > 0 ? (
                image.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center whitespace-nowrap rounded-full bg-[#fff0f2] px-2 py-1 text-xs leading-5 text-[#374151]"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">
                  No tags
                </span>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}