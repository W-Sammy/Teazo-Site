"use client";

import Image from "next/image";
import { useState } from "react";
import type { AdminEvent } from "@/app/types/admin-event";
import EventModal from "@/app/(site)/components/event-modal";

export default function EventsDirectory({ events }: { events: AdminEvent[] }) {
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return <>
    {events.length > 0 ? <div className="mt-10 max-h-[min(72vh,48rem)] space-y-5 overflow-y-auto rounded-3xl border border-[#eadbd6] bg-white p-4 shadow-[0_18px_50px_rgba(62,35,30,0.1)] sm:p-6">
      {events.map((event) => <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} className="group grid w-full overflow-hidden rounded-2xl border border-[#eee1dc] bg-[#fffafa] text-left transition hover:-translate-y-0.5 hover:border-[#D9AE81] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#D9AE81]/30 sm:grid-cols-[240px_1fr]">
        <div className="relative aspect-[16/8] overflow-hidden bg-[#f4e9e4] sm:aspect-auto sm:min-h-44"><Image src={event.imageUrl} alt="" fill sizes="(max-width: 640px) 100vw, 240px" className="object-cover transition duration-300 group-hover:scale-105" unoptimized={event.imageUrl.startsWith("http") || event.imageUrl.startsWith("data:")} /></div>
        <div className="flex flex-col justify-center px-5 py-5 sm:px-7"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#cd8f84]">Happening now</p><h2 className="mt-2 text-xl font-bold text-[#3c2924] sm:text-2xl">{event.name}</h2><p className="mt-2 text-sm font-medium text-[#9b7065]">Ends {dateFormatter.format(new Date(event.endAt))}</p><p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-600 sm:text-base">{event.description || "Join us at Teazo for this special event."}</p><span className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-[#3c2924]">View details →</span></div>
      </button>)}
    </div> : <div className="mt-10 rounded-3xl border border-[#eadbd6] bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-bold text-[#3c2924]">No live events right now</h2><p className="mt-2 text-stone-600">Check back soon for the next Teazo promotion.</p></div>}
    {selectedEvent && <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
  </>;
}
