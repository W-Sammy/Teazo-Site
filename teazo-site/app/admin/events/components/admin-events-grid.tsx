"use client";

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
            className="overflow-hidden rounded-2xl border border-[#dbb082]/60 bg-white shadow-sm"
          >
            <div className="relative bg-gradient-to-br from-[#fff0f2] to-[#fffaf6] p-5">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClasses[status]}`}>
                {status}
              </span>
              <button
                type="button"
                onClick={() => onDelete(event)}
                className="absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-red-500 shadow hover:bg-red-50"
                aria-label={`Delete ${event.name}`}
              >
                ×
              </button>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#9b6d43]">
                {formatEventDate(event.startAt)}
              </p>
              <h2 className="mt-1 line-clamp-2 text-lg font-semibold text-gray-900">
                {event.name}
              </h2>
            </div>

            <div className="p-4">
              <p className="line-clamp-3 min-h-15 text-sm leading-5 text-gray-600">
                {event.description}
              </p>
              <dl className="mt-4 space-y-2 text-xs">
                <div>
                  <dt className="font-semibold text-gray-700">Ends</dt>
                  <dd className="text-gray-500">{formatEventDate(event.endAt)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-gray-700">Applies to</dt>
                  <dd className="text-gray-500">
                    {getTargetLabel(event, categories, items)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="mt-4 cursor-pointer text-xs font-bold text-[#b98555] hover:underline"
              >
                EDIT
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
