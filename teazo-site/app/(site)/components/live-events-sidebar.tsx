"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AdminEvent } from "@/app/types/admin-event";

type LiveEventsSidebarProps = {
  events: AdminEvent[];
};

const eventDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatEventDuration(event: AdminEvent) {
  return `${eventDateFormatter.format(new Date(event.startAt))} – ${eventDateFormatter.format(new Date(event.endAt))}`;
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export default function LiveEventsSidebar({ events }: LiveEventsSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [hasBeenOpenedByUser, setHasBeenOpenedByUser] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  if (events.length === 0) return null;

  function toggleEvents() {
    setIsOpen((open) => !open);
    setHasBeenOpenedByUser(true);
  }

  return (
    <>
      <aside
        id="live-events-sidebar"
        aria-label="Live events"
        aria-hidden={!isOpen}
        className={`fixed bottom-24 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] origin-bottom-right transition-all duration-300 sm:right-6 ${
          isOpen ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-95 opacity-0"
        }`}
      >
        <div className="overflow-hidden rounded-2xl border border-[#eadbd6] bg-[#fffafa] shadow-[0_18px_50px_rgba(62,35,30,0.2)]">
          <div className="flex items-center justify-between bg-[#3c2924] px-5 py-4 text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Happening now</p>
              <h2 className="mt-1 text-xl font-bold">Live events</h2>
            </div>
            <span className="rounded-full bg-white/25 px-2.5 py-1 text-sm font-bold" aria-label={`${events.length} live events`}>
              {events.length}
            </span>
          </div>

          <div className="max-h-[min(65vh,34rem)] space-y-4 overflow-y-auto p-4">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/events#${encodeURIComponent(event.id)}`}
                aria-label={`${event.name}. ${formatEventDuration(event)}`}
                aria-disabled={!hasBeenOpenedByUser}
                onClick={(clickEvent) => {
                  if (!hasBeenOpenedByUser) clickEvent.preventDefault();
                }}
                className={`group block w-full overflow-hidden rounded-xl border border-[#eee1dc] bg-white text-left shadow-sm transition ${
                  hasBeenOpenedByUser
                    ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
                    : "cursor-default"
                }`}
              >
                <div className="relative aspect-[2/1] w-full overflow-hidden bg-[#f4e9e4]">
                  <Image
                    src={event.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) calc(100vw - 4rem), 320px"
                    className="object-cover transition duration-300 group-enabled:group-hover:scale-105"
                    unoptimized={event.imageUrl.startsWith("http") || event.imageUrl.startsWith("data:")}
                  />
                </div>
                <div className="px-4 py-3">
                  <h3 className="font-bold text-[#3c2924]">{event.name}</h3>
                  <p className="mt-1 text-xs font-medium text-[#9b7065]">{formatEventDuration(event)}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="border-t border-[#eee1dc] px-4 py-3">
            <Link
              href="/events"
              onClick={() => setHasBeenOpenedByUser(true)}
              className="block text-center text-sm font-bold uppercase tracking-[0.12em] text-[#3c2924] transition hover:text-[#9b7065]"
            >
              View all live events →
            </Link>
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={toggleEvents}
        aria-expanded={isOpen}
        aria-controls="live-events-sidebar"
        aria-label={isOpen ? "Close live events" : "Show live events"}
        className="fixed bottom-5 right-4 z-50 flex h-14 items-center gap-2 rounded-full bg-[#3c2924] px-4 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_8px_25px_rgba(62,35,30,0.28)] transition hover:bg-[#D9AE81] focus:outline-none focus:ring-4 focus:ring-[#D9AE81]/40 sm:right-6"
      >
        {isOpen ? (
          <CloseIcon />
        ) : (
          <Image
            src="/admin_icons/admin_svg/teazo_event_icon.svg"
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
        )}
        <span className="hidden sm:inline">{isOpen ? "Close" : "Events"}</span>
      </button>
    </>
  );
}
