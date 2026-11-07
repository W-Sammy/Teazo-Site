"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { AdminEvent, EventCategory, EventItem } from "@/app/types/admin-event";
import { formatEventDate } from "@/app/lib/event-date";

type EventModalProps = { event: AdminEvent; categories?: EventCategory[]; items?: EventItem[]; onClose: () => void };

export default function EventModal({ event, categories = [], items = [], onClose }: EventModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const includedCategories = categories.filter((category) => event.categoryIds.includes(category.id));
  const includedItems = items.filter((item) => event.itemIds.includes(item.id));

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        onClose();
      }
      if (keyEvent.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const isOutside = !dialogRef.current?.contains(document.activeElement);
        if (isOutside || (keyEvent.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          keyEvent.preventDefault();
          (keyEvent.shiftKey ? last : first).focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[#241713]/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="event-modal-title" className="relative max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex justify-end bg-white px-4 py-3">
          <button type="button" onClick={onClose} aria-label="Close event details" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3c2924] text-2xl leading-none text-white transition hover:bg-[#D9AE81] focus:outline-none focus:ring-4 focus:ring-[#D9AE81]/40">×</button>
        </div>
        <div className="relative aspect-[2/1] max-h-[40dvh] w-full bg-[#f4e9e4]">
          <Image src={event.imageUrl} alt={event.name} fill sizes="(max-width: 704px) calc(100vw - 2rem), 672px" className="object-contain" unoptimized={event.imageUrl.startsWith("blob:") || event.imageUrl.startsWith("data:")} />
        </div>
        <div className="px-6 py-7 sm:px-9 sm:py-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#cd8f84]">Happening now</p>
          <h2 id="event-modal-title" className="mt-2 text-3xl font-bold text-[#3c2924] sm:text-4xl">{event.name}</h2>
          <p className="mt-3 text-sm font-medium leading-6 text-[#9b7065]">{formatEventDate(event.startAt, true)} – {formatEventDate(event.endAt, true)}</p>
          <div className="mt-6 border-t border-[#eee1dc] pt-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#3c2924]">Description</h3>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-700">{event.description || "Join us at Teazo for this special event."}</p>
          </div>
          {event.appliesToAll && (
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#3c2924]">Included items</h3>
              <p className="mt-3 text-base leading-7 text-stone-700">All menu items are included in this event.</p>
            </div>
          )}
          {!event.appliesToAll && includedCategories.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#3c2924]">Included categories</h3>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Included categories">
                {includedCategories.map((category) => (
                  <li key={category.id} className="rounded-full bg-[#fff8f4] px-4 py-2 text-sm font-medium text-[#76574e]">{category.name}</li>
                ))}
              </ul>
            </div>
          )}
          {!event.appliesToAll && includedItems.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-[#3c2924]">Included items</h3>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Included items">
                {includedItems.map((item) => (
                  <li key={item.id} className="rounded-full bg-[#fff8f4] px-4 py-2 text-sm font-medium text-[#76574e]">{item.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
