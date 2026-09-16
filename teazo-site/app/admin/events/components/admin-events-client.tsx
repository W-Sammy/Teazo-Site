"use client";

import {
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
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
  EventFormValues,
  EventSortOption,
  EventStatus,
  EventViewMode,
} from "@/app/types/admin-event";
import { useEvents } from "@/app/admin/events/handlers/manage-events";
import AdminEventsGrid from "./admin-events-grid";
import AdminEventsList from "./admin-events-list";
import DeleteEventDialog from "./delete-event-dialog";
import DeleteEndedEventsDialog from "./delete-ended-events-dialog";
import EventForm from "./event-form";
import {
  getEventStatus,
} from "./event-display";

// Initial records and target choices are supplied by the parent page.
type AdminEventsClientProps = {
  initialEvents: AdminEvent[];
  categories: EventCategory[];
  items: EventCatalogItem[];
};

// Options consumed by the shared card/list view toggle.
const viewOptions: readonly AdminViewOption<EventViewMode>[] =
  [
    {
      value: "grid",
      label: "Card View",
      icon: <GridViewIcon />,
    },
    {
      value: "list",
      label: "List View",
      icon: <ListViewIcon />,
    },
  ];

const statuses: EventStatus[] = [
  "upcoming",
  "active",
  "ended",
];

export default function AdminEventsClient({
  initialEvents,
  categories,
  items,
}: AdminEventsClientProps) {
  // Delegate event operations and their error messages to the events hook.
  const {
    events,
    errorMessage,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteEndedEvents,
  } = useEvents(initialEvents);

  // Search, status selection, sorting, and view mode control the visible results.
  const [search, setSearch] =
    useState("");

  const [
    selectedStatuses,
    setSelectedStatuses,
  ] = useState<EventStatus[]>([]);

  const [sortBy, setSortBy] =
    useState<EventSortOption>("start-asc");

  const [viewMode, setViewMode] =
    useState<EventViewMode>("grid");

  // Desktop collapse and mobile overlay visibility are independent.
  const [filtersOpen, setFiltersOpen] =
    useState(true);

  const [
    mobileFiltersOpen,
    setMobileFiltersOpen,
  ] = useState(false);

  // A null editingEvent means the drawer is creating a new event.
  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [editingEvent, setEditingEvent] =
    useState<AdminEvent | null>(null);

  // Store deletion candidates until the corresponding confirmation is accepted.
  const [
    eventPendingDelete,
    setEventPendingDelete,
  ] = useState<AdminEvent | null>(null);

  const [
    deleteEndedDialogOpen,
    setDeleteEndedDialogOpen,
  ] = useState(false);

  // Resolve target IDs to names without repeatedly searching the source arrays.
  const categoryNames = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [categories],
  );

  const itemNames = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.id,
          item.name,
        ]),
      ),
    [items],
  );

  // Bulk deletion counts the full collection, not only the currently filtered results.
  const endedEventCount = useMemo(
    () =>
      events.filter(
        (event) =>
          getEventStatus(event) === "ended",
      ).length,
    [events],
  );

  // Match any selected status AND the search query, then order the matching events.
  const filteredEvents = useMemo(() => {
    const query = search
      .trim()
      .toLocaleLowerCase();

    const filtered = events.filter(
      (event) => {
        const status =
          getEventStatus(event);

        const matchesStatus =
          selectedStatuses.length === 0 ||
          selectedStatuses.includes(status);

        // Include linked category and item names in addition to event text.
        const searchableTargets = [
          ...event.categoryIds.map(
            (id) =>
              categoryNames.get(id) ?? "",
          ),
          ...event.itemIds.map(
            (id) =>
              itemNames.get(id) ?? "",
          ),
        ].join(" ");

        const matchesSearch =
          !query ||
          event.name
            .toLocaleLowerCase()
            .includes(query) ||
          event.description
            .toLocaleLowerCase()
            .includes(query) ||
          searchableTargets
            .toLocaleLowerCase()
            .includes(query);

        return (
          matchesStatus &&
          matchesSearch
        );
      },
    );

    // Sort a copy so the source event order is not mutated.
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(
            b.name,
          );

        case "name-desc":
          return b.name.localeCompare(
            a.name,
          );

        case "start-desc":
          return (
            Date.parse(b.startAt) -
            Date.parse(a.startAt)
          );

        case "start-asc":
        default:
          return (
            Date.parse(a.startAt) -
            Date.parse(b.startAt)
          );
      }
    });
  }, [
    categoryNames,
    events,
    itemNames,
    search,
    selectedStatuses,
    sortBy,
  ]);

  // Add or remove a status using a new selection array.
  function toggleStatus(
    status: EventStatus,
  ) {
    setSelectedStatuses((current) =>
      current.includes(status)
        ? current.filter(
            (value) => value !== status,
          )
        : [...current, status],
    );
  }

  // Clear the edit selection when closing so the next new-event form starts fresh.
  function closeDrawer() {
    setDrawerOpen(false);
    setEditingEvent(null);
  }

  // Opening a new event must not reuse an earlier edit selection.
  function openNewEventDrawer() {
    setEditingEvent(null);
    setDrawerOpen(true);
  }

  // Pass the selected event into the same form used for creation.
  function openEditDrawer(
    event: AdminEvent,
  ) {
    setEditingEvent(event);
    setDrawerOpen(true);
  }

  // Close the form only when the events hook reports that saving succeeded.
  async function handleSave(
    values: EventFormValues,
  ) {
    const saved = editingEvent
      ? await updateEvent(
          editingEvent,
          values,
        )
      : await createEvent(values);

    if (saved) {
      closeDrawer();
    }
  }

  // Leave the confirmation open when deletion fails; clear it after success.
  async function confirmDelete() {
    if (!eventPendingDelete) {
      return;
    }

    const deletedEvent =
      eventPendingDelete;

    const deleted = await deleteEvent(
      deletedEvent,
    );

    if (!deleted) {
      return;
    }

    if (
      editingEvent?.id ===
      deletedEvent.id
    ) {
      closeDrawer();
    }

    setEventPendingDelete(null);
  }

  // Delete ended events, then clear any editor or pending dialog for an ended event.
  async function handleDeleteEndedEvents() {
    if (endedEventCount === 0) {
      return;
    }

    const deleted =
      await deleteEndedEvents();

    if (!deleted) {
      return;
    }

    if (
      editingEvent &&
      getEventStatus(editingEvent) ===
        "ended"
    ) {
      closeDrawer();
    }

    if (
      eventPendingDelete &&
      getEventStatus(
        eventPendingDelete,
      ) === "ended"
    ) {
      setEventPendingDelete(null);
    }

    setDeleteEndedDialogOpen(false);
  }

  // Reset matching criteria without changing the selected sort or view mode.
  function clearSearchAndFilters() {
    setSearch("");
    setSelectedStatuses([]);
  }

  return (
    <div className="relative flex h-dvh w-full min-w-0 overflow-hidden bg-white">
      {/* Surface operation errors from useEvents above the page controls. */}
      {errorMessage && (
        <div
          role="alert"
          className="fixed right-5 top-5 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-lg"
        >
          {errorMessage}
        </div>
      )}

      {/* Tapping the shaded area dismisses the mobile filter overlay. */}
      {mobileFiltersOpen && (
        <button
          type="button"
          onClick={() =>
            setMobileFiltersOpen(false)
          }
          className="absolute inset-0 z-30 bg-black/30 md:hidden"
          aria-label="Close event filters"
        />
      )}

      {/* Event filters */}
      <aside
        id="event-filter-panel"
        className={`absolute inset-y-0 left-0 z-40 h-full w-64 max-w-[calc(100%-1rem)] overflow-y-auto border-r border-[#dbb082] bg-white p-4 shadow-xl transition-transform duration-300 md:static md:z-auto md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:transition-all ${
          mobileFiltersOpen
            ? "translate-x-0"
            : "-translate-x-full"
        } ${
          filtersOpen
            ? "md:w-52 md:p-4"
            : "md:w-11 md:p-2"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className={`font-semibold ${
              filtersOpen
                ? "md:block"
                : "md:hidden"
            }`}
          >
            Filters
          </h2>

          <button
            type="button"
            onClick={() =>
              setMobileFiltersOpen(false)
            }
            className="flex h-9 w-9 items-center justify-center text-xl font-bold md:hidden"
            aria-label="Close filters"
          >
            ×
          </button>

          <button
            type="button"
            onClick={() =>
              setFiltersOpen(
                (current) => !current,
              )
            }
            className="hidden cursor-pointer rounded px-2 py-1 text-lg font-bold hover:bg-gray-100 md:inline-flex"
            aria-label={
              filtersOpen
                ? "Collapse filters"
                : "Expand filters"
            }
          >
            {filtersOpen ? "←" : "→"}
          </button>
        </div>

        <div
          className={`space-y-4 ${
            filtersOpen
              ? "md:block"
              : "md:hidden"
          }`}
        >
          <label
            className="block text-sm text-gray-600"
            htmlFor="event-sort"
          >
            Sort by:

            <select
              id="event-sort"
              value={sortBy}
              onChange={(
                event: ChangeEvent<HTMLSelectElement>,
              ) =>
                setSortBy(
                  event.target
                    .value as EventSortOption,
                )
              }
              className="mt-1 w-full cursor-pointer rounded bg-gray-200 px-3 py-2 text-sm"
            >
              <option value="start-asc">
                Start (Soonest)
              </option>

              <option value="start-desc">
                Start (Latest)
              </option>

              <option value="name-asc">
                Name A to Z
              </option>

              <option value="name-desc">
                Name Z to A
              </option>
            </select>
          </label>

          <div>
            <p className="mb-1 text-sm text-gray-600">
              Status:
            </p>

            {statuses.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 py-1 text-sm capitalize"
              >
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(
                    status,
                  )}
                  onChange={() =>
                    toggleStatus(status)
                  }
                  className="accent-[#b98555]"
                />

                {status}
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setSelectedStatuses([])
            }
            className="cursor-pointer text-xs text-blue-500 hover:underline"
          >
            Clear filters
          </button>
        </div>
      </aside>

      {/* Main event area */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Stack toolbar controls on narrow screens instead of allowing overlap. */}
        <div className="shrink-0 border-b border-[#dbb082] p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-2 lg:max-w-72 lg:flex-1">
                <button
                  type="button"
                  onClick={() =>
                    setMobileFiltersOpen(true)
                  }
                  className="rounded-lg border border-[#dbb082] px-3 py-2 text-sm font-semibold text-[#9b6d43] md:hidden"
                  aria-controls="event-filter-panel"
                >
                  Filters
                </button>

                <input
                  id="event-search"
                  name="eventSearch"
                  type="search"
                  value={search}
                  onChange={(
                    event: ChangeEvent<HTMLInputElement>,
                  ) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Search events"
                  aria-label="Search events"
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
              onClick={
                openNewEventDrawer
              }
              className="inline-flex w-full justify-center rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-bold text-white hover:bg-[#F59AA3] sm:w-auto"
            >
              New Event +
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm text-gray-500">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                {filteredEvents.length}{" "}
                {filteredEvents.length === 1
                  ? "event"
                  : "events"}
              </span>

              <button
                type="button"
                onClick={() =>
                  setDeleteEndedDialogOpen(
                    true,
                  )
                }
                disabled={
                  endedEventCount === 0
                }
                className="cursor-pointer rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Delete ended events (
                {endedEventCount})
              </button>
            </div>

            {(search ||
              selectedStatuses.length > 0) && (
              <button
                type="button"
                onClick={
                  clearSearchAndFilters
                }
                className="cursor-pointer text-blue-500 hover:underline"
              >
                Clear search and filters
              </button>
            )}
          </div>

          {/* Distinguish an empty collection from a search with no matches. */}
          {filteredEvents.length > 0 ? (
            viewMode === "grid" ? (
              <AdminEventsGrid
                events={filteredEvents}
                categories={categories}
                items={items}
                onEdit={openEditDrawer}
                onDelete={
                  setEventPendingDelete
                }
              />
            ) : (
              <AdminEventsList
                events={filteredEvents}
                categories={categories}
                items={items}
                onEdit={openEditDrawer}
                onDelete={
                  setEventPendingDelete
                }
              />
            )
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#dbb082]/60 bg-[#fffaf6] px-6 text-center">
              <h2 className="text-lg font-semibold text-gray-800">
                {events.length === 0
                  ? "No events yet"
                  : "No events found"}
              </h2>

              <p className="mt-2 max-w-md text-sm text-gray-500">
                {events.length === 0
                  ? "Use the New Event button to create the first event."
                  : "Try changing the search or status filters."}
              </p>

              <button
                type="button"
                onClick={
                  events.length === 0
                    ? openNewEventDrawer
                    : clearSearchAndFilters
                }
                className="mt-4 rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
              >
                {events.length === 0
                  ? "Add an event"
                  : "Clear search and filters"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Create/edit event form */}
      {/* Conditional rendering and the record key reset form state between selections. */}
      <AdminForm
        isOpen={drawerOpen}
        onClose={closeDrawer}
        mobileFullscreen
      >
        {drawerOpen && (
          <EventForm
            key={
              editingEvent?.id ??
              "new-event"
            }
            initialEvent={editingEvent}
            categories={categories}
            items={items}
            onCancel={closeDrawer}
            onSave={handleSave}
          />
        )}
      </AdminForm>

      {/* Deletion happens only through the confirmation callbacks. */}
      <DeleteEventDialog
        event={eventPendingDelete}
        onCancel={() =>
          setEventPendingDelete(null)
        }
        onConfirm={confirmDelete}
      />

      <DeleteEndedEventsDialog
        isOpen={deleteEndedDialogOpen}
        eventCount={endedEventCount}
        onCancel={() =>
          setDeleteEndedDialogOpen(false)
        }
        onConfirm={
          handleDeleteEndedEvents
        }
      />
    </div>
  );
}