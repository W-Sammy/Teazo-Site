"use client";

import { useState } from "react";
import type { AdminEvent, EventFormValues } from "@/app/types/admin-event";

function eventFormData(values: EventFormValues) {
  const form = new FormData();
  form.set("name", values.name);
  form.set("description", values.description);
  form.set("startAt", values.startAt);
  form.set("endAt", values.endAt);
  form.set("appliesToAll", String(values.appliesToAll));
  form.set("categoryIds", JSON.stringify(values.categoryIds));
  form.set("itemIds", JSON.stringify(values.itemIds));
  if (values.imageFile) form.set("imageFile", values.imageFile);
  return form;
}

/**
 * Owns event data and the create, update, and delete operations.
 * Persists event records through the admin API.
 */
export function useEvents(initialEvents: AdminEvent[]) {
  const [events, setEvents] = useState(initialEvents);
  const [errorMessage, setErrorMessage] = useState("");
  async function createEvent(values: EventFormValues) {
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/events", {
        method: "POST",
        body: eventFormData(values),
      });
      if (!response.ok) throw new Error("The event could not be created.");
      const created = await fetch("/api/admin/events", { cache: "no-store" });
      if (!created.ok) throw new Error("The event was created but could not be loaded.");
      setEvents(await created.json());
      return true;
    } catch {
      setErrorMessage("Failed to create the event.");
      return false;
    }
  }

  async function updateEvent(
    currentEvent: AdminEvent,
    values: EventFormValues,
  ) {
    setErrorMessage("");

    try {
      const response = await fetch(`/api/admin/events/${currentEvent.id}`, {
        method: "PATCH",
        body: eventFormData(values),
      });
      if (!response.ok) throw new Error("The event could not be updated.");
      const refreshed = await fetch("/api/admin/events", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("The event was updated but could not be loaded.");
      setEvents(await refreshed.json());
      return true;
    } catch {
      setErrorMessage("Failed to update the event.");
      return false;
    }
  }

  async function deleteEvent(eventToDelete: AdminEvent) {
    setErrorMessage("");

    try {
      const response = await fetch(`/api/admin/events/${eventToDelete.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("The event could not be deleted.");
      setEvents((current) => current.filter((event) => event.id !== eventToDelete.id));
      return true;
    } catch {
      setErrorMessage("Failed to delete the event.");
      return false;
    }
  }

  async function deleteEndedEvents() {
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/events", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endedOnly: true }),
      });
      if (!response.ok) throw new Error("Ended events could not be deleted.");
      setEvents((current) => current.filter((event) => Date.parse(event.endAt) >= Date.now()));
      return true;
    } catch {
      setErrorMessage("Failed to delete ended events.");
      return false;
    }
  }

  return {
    events,
    errorMessage,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteEndedEvents,
  };
}
