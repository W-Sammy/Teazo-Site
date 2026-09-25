import Image from "next/image";
import type { AdminEvent } from "@/app/types/admin-event";
import { formatEventDate } from "./dashboard-utils";

export default function LiveEvents({ events }: { events: AdminEvent[] }) {
  return <section className="rounded-2xl bg-white p-6" aria-labelledby="events-heading"><div className="mb-5 flex items-center justify-between gap-3"><div><h2 id="events-heading" className="text-lg font-bold text-[#374151]">Currently live events</h2><p className="mt-1 text-sm text-slate-400">Events visible to your guests right now.</p></div><span className="rounded-full bg-[#eef8f1] px-3 py-1 text-xs font-semibold text-[#4c9a68]">{events.length} live</span></div>{events.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{events.map((event) => <EventCard key={event.id} event={event} />)}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">There are no active events right now.</p>}</section>;
}

function EventCard({ event }: { event: AdminEvent }) {
  return <article className="flex min-w-0 gap-3 rounded-xl bg-slate-50 p-3"><div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-[#fcf5ed]"><Image src={event.imageUrl} alt="" fill sizes="80px" className="object-cover" /></div><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-600">{event.name}</h3><p className="mt-1 text-xs text-slate-400">{formatEventDate(event.startAt)} – {formatEventDate(event.endAt)}</p></div></article>;
}
