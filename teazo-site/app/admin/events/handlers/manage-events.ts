"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminEvent, EventFormValues } from "@/app/types/admin-event";

const fallbackEventImage = "/admin_icons/teazo_dash_icon.png";

function createTemporaryEventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Owns event data and the create, update, and delete operations.
 * Replace the marked temporary blocks with API calls when persistence is ready.
 */
export function useEvents(initialEvents: AdminEvent[]) {
  const [events, setEvents] = useState(initialEvents);
  const [errorMessage, setErrorMessage] = useState("");
  const managedObjectUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = managedObjectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

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

  async function createEvent(values: EventFormValues) {
    setErrorMessage("");

    try {
      /* TODO: Replace this temporary block with POST /api/events. */
      const { imageFile, ...eventValues } = values;
      const newEvent: AdminEvent = {
        id: createTemporaryEventId(),
        ...eventValues,
        imageUrl: imageFile
          ? createManagedObjectUrl(imageFile)
          : fallbackEventImage,
      };

      setEvents((current) => [newEvent, ...current]);
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
      /* TODO: Replace this temporary block with PATCH /api/events/:id. */
      const { imageFile, ...eventValues } = values;
      const imageUrl = imageFile
        ? createManagedObjectUrl(imageFile)
        : currentEvent.imageUrl;
      const updatedEvent: AdminEvent = {
        ...currentEvent,
        ...eventValues,
        imageUrl,
      };

      setEvents((current) =>
        current.map((event) =>
          event.id === currentEvent.id ? updatedEvent : event,
        ),
      );

      if (imageFile) revokeManagedObjectUrl(currentEvent.imageUrl);
      return true;
    } catch {
      setErrorMessage("Failed to update the event.");
      return false;
    }
  }

  async function deleteEvent(eventToDelete: AdminEvent) {
    setErrorMessage("");

    try {
      /* TODO: Replace this temporary block with DELETE /api/events/:id. */
      setEvents((current) =>
        current.filter((event) => event.id !== eventToDelete.id),
      );
      revokeManagedObjectUrl(eventToDelete.imageUrl);
      return true;
    } catch {
      setErrorMessage("Failed to delete the event.");
      return false;
    }
  }

  return {
    events,
    errorMessage,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
