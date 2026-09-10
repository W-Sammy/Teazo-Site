"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import AdminForm from "@/app/admin/components/admin-form-page";
import AdminViewToggle, {
  GridViewIcon,
  ListViewIcon,
  type AdminViewOption,
} from "@/app/admin/components/admin-view-toggle";
import type {
  AdminEvent,
  EventCatalogItem,
  EventCategory,
  EventSortOption,
  EventStatus,
  EventViewMode,
} from "@/app/types/admin-event";
import AdminEventsGrid from "./admin-events-grid";
import AdminEventsList from "./admin-events-list";
import DeleteEventDialog from "./delete-event-dialog";
import EventForm, { type EventFormValues } from "./event-form";
import { getEventStatus } from "./event-display";

type AdminEventsClientProps = {
  initialEvents: AdminEvent[];
  categories: EventCategory[];
  items: EventCatalogItem[];
};

const viewOptions: readonly AdminViewOption<EventViewMode>[] = [
  { value: "grid", label: "Card View", icon: <GridViewIcon /> },
  { value: "list", label: "List View", icon: <ListViewIcon /> },
];

const statuses: EventStatus[] = ["upcoming", "active", "ended"];
const fallbackEventImage = "/admin_icons/teazo_dash_icon.png";

function createEventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* Owns the eventPendingDelete state. Null means the confirmation dialog is closed. */
/* Passes the state setter to both event views using the prop name onDelete. eventsGrid and eventsList*/
export default function AdminEventsClient({
  initialEvents,
  categories,
  items,
}: AdminEventsClientProps) {
  const [events, setEvents] = useState(initialEvents);
  const [search, setSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<EventStatus[]>([]);
  const [sortBy, setSortBy] = useState<EventSortOption>("start-asc");
  const [viewMode, setViewMode] = useState<EventViewMode>("grid");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AdminEvent | null>(null);
  const [eventPendingDelete, setEventPendingDelete] = useState<AdminEvent | null>(null);
  const managedObjectUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = managedObjectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );
  const itemNames = useMemo(
    () => new Map(items.map((item) => [item.id, item.name])),
    [items],
  );

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = events.filter((event) => {
      const status = getEventStatus(event);
      const matchesStatus =
        selectedStatuses.length === 0 || selectedStatuses.includes(status);
      const searchableTargets = [
        ...event.categoryIds.map((id) => categoryNames.get(id) ?? ""),
        ...event.itemIds.map((id) => itemNames.get(id) ?? ""),
      ].join(" ");
      const matchesSearch =
        !query ||
        event.name.toLocaleLowerCase().includes(query) ||
        event.description.toLocaleLowerCase().includes(query) ||
        searchableTargets.toLocaleLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "start-desc":
          return Date.parse(b.startAt) - Date.parse(a.startAt);
        case "start-asc":
        default:
          return Date.parse(a.startAt) - Date.parse(b.startAt);
      }
    });
  }, [categoryNames, events, itemNames, search, selectedStatuses, sortBy]);

  function toggleStatus(status: EventStatus) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter((value) => value !== status)
        : [...current, status],
    );
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingEvent(null);
  }
  
  /*opens new event drawer by setting editingEvent to null and drawerOpen to true */
  function openNewEventDrawer() {
    setEditingEvent(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(event: AdminEvent) {
    setEditingEvent(event);
    setDrawerOpen(true);
  }

  function createManagedObjectUrl(file: File) {
    const url = URL.createObjectURL(file);
    managedObjectUrls.current.add(url);
    return url;
  }

  function revokeManagedObjectUrl(url: string) {
    if (!managedObjectUrls.current.has(url)) return;
    URL.revokeObjectURL(url);
    managedObjectUrls.current.delete(url);
  }

  /* api calls should be completed here, may abstract to separate files in the future */
  function handleSave(values: EventFormValues) {
    const { imageFile, ...eventValues } = values;
    const imageUrl = imageFile
      ? createManagedObjectUrl(imageFile)
      : editingEvent?.imageUrl ?? fallbackEventImage;

    setEvents((current) =>
      editingEvent
        ? current.map((event) =>
            event.id === editingEvent.id
              ? { ...event, ...eventValues, imageUrl }
              : event,
          )
        : [{ id: createEventId(), ...eventValues, imageUrl }, ...current],
    );

    if (imageFile && editingEvent) {
      revokeManagedObjectUrl(editingEvent.imageUrl);
    }
    closeDrawer();
  }

  function confirmDelete() {
    if (!eventPendingDelete) return;
    revokeManagedObjectUrl(eventPendingDelete.imageUrl);
    setEvents((current) =>
      current.filter((event) => event.id !== eventPendingDelete.id),
    );
    if (editingEvent?.id === eventPendingDelete.id) closeDrawer();
    setEventPendingDelete(null);
  }

  function clearSearchAndFilters() {
    setSearch("");
    setSelectedStatuses([]);
  }

  return (
    <div className="relative flex h-dvh w-full min-w-0 overflow-hidden bg-white">
      {mobileFiltersOpen && (
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(false)}
          className="absolute inset-0 z-30 bg-black/30 md:hidden"
          aria-label="Close event filters"
        />
      )}

      <aside
        id="event-filter-panel"
        className={`absolute inset-y-0 left-0 z-40 h-full w-64 max-w-[calc(100%-1rem)] overflow-y-auto border-r border-[#dbb082] bg-white p-4 shadow-xl transition-transform duration-300 md:static md:z-auto md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:transition-all ${
          mobileFiltersOpen ? "translate-x-0" : "-translate-x-full"
        } ${filtersOpen ? "md:w-52 md:p-4" : "md:w-11 md:p-2"}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-semibold ${filtersOpen ? "md:block" : "md:hidden"}`}>
            Filters
          </h2>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            className="flex h-9 w-9 items-center justify-center text-xl font-bold md:hidden"
            aria-label="Close filters"
          >
            ×
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((current) => !current)}
            className="hidden cursor-pointer rounded px-2 py-1 text-lg font-bold hover:bg-gray-100 md:inline-flex"
            aria-label={filtersOpen ? "Collapse filters" : "Expand filters"}
          >
            {filtersOpen ? "←" : "→"}
          </button>
        </div>

        <div className={`space-y-4 ${filtersOpen ? "md:block" : "md:hidden"}`}>
          <label className="block text-sm text-gray-600" htmlFor="event-sort">
            Sort by:
            <select
              id="event-sort"
              value={sortBy}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSortBy(event.target.value as EventSortOption)
              }
              className="mt-1 w-full cursor-pointer rounded bg-gray-200 px-3 py-2 text-sm"
            >
              <option value="start-asc">Start (Soonest)</option>
              <option value="start-desc">Start (Latest)</option>
              <option value="name-asc">Name A to Z</option>
              <option value="name-desc">Name Z to A</option>
            </select>
          </label>

          <div>
            <p className="mb-1 text-sm text-gray-600">Status:</p>
            {statuses.map((status) => (
              <label key={status} className="flex cursor-pointer items-center gap-2 py-1 text-sm capitalize">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                  className="accent-[#b98555]"
                />
                {status}
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSelectedStatuses([])}
            className="cursor-pointer text-xs text-blue-500 hover:underline"
          >
            Clear filters
          </button>
        </div>
      </aside>

      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[#dbb082] p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-2 lg:max-w-72 lg:flex-1">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="rounded-lg border border-[#dbb082] px-3 py-2 text-sm font-semibold text-[#9b6d43] md:hidden"
                  aria-controls="event-filter-panel"
                >
                  Filters
                </button>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search events"
                  className="min-w-0 flex-1 rounded bg-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FFBDC7]/50"
                />
              </div>
              <AdminViewToggle
                value={viewMode}
                options={viewOptions}
                onChange={setViewMode}
                ariaLabel="Event view"
                className="max-w-full self-start lg:self-auto"
              />
            </div>
            <button
              type="button"
              onClick={openNewEventDrawer}
              className="inline-flex w-full justify-center rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-bold text-white hover:bg-[#F59AA3] sm:w-auto"
            >
              New Event +
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
            <span>{filteredEvents.length} {filteredEvents.length === 1 ? "event" : "events"}</span>
            {(search || selectedStatuses.length > 0) && (
              <button
                type="button"
                onClick={clearSearchAndFilters}
                className="cursor-pointer text-blue-500 hover:underline"
              >
                Clear search and filters
              </button>
            )}
          </div>

          {filteredEvents.length > 0 ? (
            viewMode === "grid" ? (
              <AdminEventsGrid
                events={filteredEvents}
                categories={categories}
                items={items}
                onEdit={openEditDrawer}
                onDelete={setEventPendingDelete}
              />
            ) : (
              <AdminEventsList
                events={filteredEvents}
                categories={categories}
                items={items}
                onEdit={openEditDrawer}
                onDelete={setEventPendingDelete}
              />
            )
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#dbb082]/60 bg-[#fffaf6] px-6 text-center">
              <h2 className="text-lg font-semibold text-gray-800">
                {events.length === 0 ? "No events yet" : "No events found"}
              </h2>
              <p className="mt-2 max-w-md text-sm text-gray-500">
                {events.length === 0
                  ? "Use the New Event button to create the first event."
                  : "Try changing the search or status filters."}
              </p>
              <button
                type="button"
                onClick={events.length === 0 ? openNewEventDrawer : clearSearchAndFilters}
                className="mt-4 rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
              >
                {events.length === 0 ? "Add an event" : "Clear search and filters"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* event form drawer, that opens and handles, editing or creating new events */}
      <AdminForm isOpen={drawerOpen} onClose={closeDrawer}>
        {drawerOpen && (
          <EventForm
            key={editingEvent?.id ?? "new-event"}
            initialEvent={editingEvent}
            categories={categories}
            items={items}
            onCancel={closeDrawer}
            onSave={handleSave}
          />
        )}
      </AdminForm>

      <DeleteEventDialog
        event={eventPendingDelete}
        onCancel={() => setEventPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
