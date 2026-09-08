"use client";

import type { MouseEvent } from "react";
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

type AdminEventsListProps = {
  events: AdminEvent[];
  categories: EventCategory[];
  items: EventCatalogItem[];
  onEdit: (event: AdminEvent) => void;
  onDelete: (event: AdminEvent) => void;
};

export default function AdminEventsList({
  events,
  categories,
  items,
  onEdit,
  onDelete,
}: AdminEventsListProps) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[#dbb082]/60 bg-white">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr className="border-b border-[#dbb082] bg-[#fffaf6] text-left text-sm text-gray-700">
            <th className="w-14 px-3 py-3" aria-label="Delete" />
            <th className="w-20 px-3 py-3" aria-label="Edit" />
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Description</th>
            <th className="px-3 py-3">Applies To</th>
            <th className="w-44 px-3 py-3">Starts</th>
            <th className="w-44 px-3 py-3">Ends</th>
            <th className="w-24 px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const status = getEventStatus(event);
            return (
              <tr
                key={event.id}
                onClick={() => onEdit(event)}
                className="cursor-pointer border-b border-[#dbb082]/40 text-sm last:border-b-0 hover:bg-[#dbb082]/15"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(clickEvent: MouseEvent<HTMLButtonElement>) => {
                      clickEvent.stopPropagation();
                      onDelete(event);
                    }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg font-bold text-red-500 hover:bg-red-50"
                    aria-label={`Delete ${event.name}`}
                  >
                    ×
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onEdit(event);
                    }}
                    className="cursor-pointer rounded bg-[#dbb082] px-2 py-1 text-xs font-bold text-white hover:bg-[#c89968]"
                  >
                    EDIT
                  </button>
                </td>
                <td className="px-3 py-2 font-medium text-gray-900">{event.name}</td>
                <td className="max-w-60 truncate px-3 py-2 text-gray-600">{event.description}</td>
                <td className="px-3 py-2 text-gray-600">
                  {getTargetLabel(event, categories, items)}
                </td>
                <td className="px-3 py-2 text-gray-500">{formatEventDate(event.startAt)}</td>
                <td className="px-3 py-2 text-gray-500">{formatEventDate(event.endAt)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClasses[status]}`}>
                    {status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
