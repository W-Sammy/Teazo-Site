"use client";

import Image from "next/image";
import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
} from "@/app/types/admin-event";
import {
  formatEventDate,
  getEventStatus,
  getTargetLabel,
  statusClasses,
} from "./event-display";

type AdminEventsGridProps = {
  events: AdminEvent[];
  categories: EventCategory[];
  items: EventCatalogItem[];
  onEdit: (event: AdminEvent) => void;
  onDelete: (event: AdminEvent) => void;
};

export default function AdminEventsGrid({
  events,
  categories,
  items,
  onEdit,
  onDelete,
}: AdminEventsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {events.map((event) => {
        const status = getEventStatus(event);

        return (
          <article
            key={event.id}
            className="overflow-visible rounded-2xl border border-[#dbb082]/60 bg-white shadow-sm"
          >
            <div className="relative aspect-[4/3] overflow-visible rounded-t-2xl bg-[#f3ece6]">
              {/* Round the image itself instead of clipping its parent. */}
              <Image
                src={event.imageUrl}
                alt={event.name}
                fill
                unoptimized={event.imageUrl.startsWith("blob:")}
                className="rounded-t-2xl object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
              />

              {/* Transparent edit button covering the image area. */}
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="absolute inset-0 z-10 cursor-pointer rounded-t-2xl bg-transparent"
                aria-label={`Edit ${event.name}`}
              />

              {/* Status badge stays above the image edit button. */}
              <span
                className={`absolute left-3 top-3 z-20 rounded-full px-2 py-1 text-xs font-semibold capitalize shadow-sm ${statusClasses[status]}`}
              >
                {status}
              </span>

              {/* Use an SVG icon instead of a font-rendered × character. */}
              <button
                type="button"
                onClick={() => onDelete(event)}
                className="absolute right-3 top-3 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-red-500 shadow hover:bg-red-50"
                aria-label={`Delete ${event.name}`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M6 6L18 18M6 18L18 6" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="line-clamp-2 text-lg font-semibold text-gray-900">
                  {event.name}
                </h2>

                <button
                  type="button"
                  onClick={() => onEdit(event)}
                  className="shrink-0 cursor-pointer text-xs font-bold text-[#b98555] hover:underline"
                >
                  EDIT
                </button>
              </div>

              <p className="line-clamp-3 min-h-15 text-sm leading-5 text-gray-600">
                {event.description}
              </p>

              <dl className="mt-4 space-y-2 text-xs">
                <div>
                  <dt className="font-semibold text-gray-700">
                    Starts
                  </dt>
                  <dd className="text-gray-500">
                    {formatEventDate(event.startAt)}
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-gray-700">
                    Ends
                  </dt>
                  <dd className="text-gray-500">
                    {formatEventDate(event.endAt)}
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-gray-700">
                    Applies to
                  </dt>
                  <dd className="text-gray-500">
                    {getTargetLabel(event, categories, items)}
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        );
      })}
    </div>
  );
}