"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { AdminEvent } from "@/app/types/admin-event";
import type { WebsiteContent } from "@/app/types/website-content";
import type { DashboardMetrics, DashboardPeriod, MenuItemMetric } from "@/app/types/dashboard";

type DashboardClientProps = {
  metrics: DashboardMetrics;
  events: AdminEvent[];
  websiteContent: WebsiteContent;
};

const periodOptions: { value: DashboardPeriod; label: string }[] = [
  { value: "24-hours", label: "Past 24 hours" },
  { value: "7-days", label: "7 days" },
  { value: "30-days", label: "30 days" },
];

function formatHour(hour: number) {
  const wholeHour = Math.floor(hour) % 24;
  const minutes = Math.round((hour % 1) * 60);
  const period = wholeHour >= 12 ? "pm" : "am";
  const displayHour = wholeHour % 12 === 0 ? 12 : wholeHour % 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")}${period}`;
}

function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).format(new Date(date));
}

function isEventActive(event: AdminEvent) {
  const now = Date.now();
  return new Date(event.startAt).getTime() <= now && now <= new Date(event.endAt).getTime();
}

function getTodayHours(content: WebsiteContent) {
  const dayIndex = new Date().getDay();
  return content.hours[dayIndex] ?? content.hours[0];
}

function getTodayHoliday(content: WebsiteContent) {
  const today = new Date();
  const monthDay = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return content.holidays.find((holiday) => holiday.date === monthDay);
}

function sortMetrics(metrics: MenuItemMetric[]) {
  return [...metrics].sort((a, b) => b.event_count - a.event_count).slice(0, 5);
}

export default function DashboardClient({
  metrics,
  events,
  websiteContent,
}: DashboardClientProps) {
  const [period, setPeriod] = useState<DashboardPeriod>("24-hours");
  const topItems = useMemo(() => sortMetrics(metrics[period]), [metrics, period]);
  const totalVisits = topItems.reduce((total, item) => total + item.event_count, 0);
  const topItem = topItems[0];
  const hours = getTodayHours(websiteContent);
  const todayHoliday = getTodayHoliday(websiteContent);
  const activeEvents = events.filter(isEventActive);
  const maxVisits = topItems[0]?.event_count ?? 1;

  return (
    <div className="min-h-full bg-white px-5 pb-14 pt-8 text-[#273142] sm:px-8 lg:px-12 lg:pt-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#dbb082]">Overview</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#2b211d]">Dashboard</h1>
            <p className="mt-2 text-sm text-slate-500">See how guests are engaging with your restaurant.</p>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-500">
            <span className="sr-only">Visit period</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
              className="rounded-lg border border-[#ead8c5] bg-[#fffaf5] px-3 py-2.5 text-sm font-semibold text-[#b88554] outline-none focus:ring-2 focus:ring-[#dbb082]/30"
            >
              {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>

        <section aria-label="Visit summary" className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Total visits (Top 5)" value={totalVisits.toLocaleString()} />
          <SummaryCard label="Most visited item" value={topItem?.item_name_snapshot ?? "—"} />
          <SummaryCard label="Top item visits" value={topItem?.event_count.toLocaleString() ?? "—"} />
        </section>

        <section className="mt-10 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(43,33,29,0.04)] sm:p-7" aria-labelledby="top-items-heading">
          <div className="mb-6">
            <h2 id="top-items-heading" className="text-lg font-bold text-[#374151]">Top menu item page visits</h2>
            <p className="mt-1 text-sm text-slate-400">Ordered by visits (highest → lowest)</p>
          </div>

          <div className="space-y-4">
            {topItems.map((item) => (
              <div key={item.square_item_id} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:gap-5">
                <span className="truncate text-slate-500">{item.item_name_snapshot}</span>
                <div className="h-8 overflow-hidden rounded-lg bg-[#fcf5ed]">
                  <div className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-[#dfb282] to-[#e8ccb0] px-2 text-xs font-semibold text-white transition-all duration-300" style={{ width: `${Math.max((item.event_count / maxVisits) * 100, 15)}%` }}>
                    <span className="hidden sm:inline">{item.event_count.toLocaleString()} visits</span>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-400 sm:hidden">{item.event_count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 flex gap-2 border-t border-slate-100 pt-5" role="tablist" aria-label="Visit period">
            {periodOptions.map((option) => (
              <button key={option.value} type="button" onClick={() => setPeriod(option.value)} role="tab" aria-selected={period === option.value} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${period === option.value ? "bg-[#fff7ef] text-[#d59f6d]" : "text-slate-500 hover:bg-slate-50"}`}>
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.35fr]">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgba(43,33,29,0.04)]" aria-labelledby="hours-heading">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 id="hours-heading" className="text-lg font-bold text-[#374151]">Today&apos;s business hours</h2>
              <span className="rounded-full bg-[#fff7ef] px-3 py-1 text-xs font-semibold text-[#c78e59]">{hours.day}</span>
            </div>
            {todayHoliday ? <HolidayNotice holiday={todayHoliday} /> : <p className="text-2xl font-semibold text-[#d39d6b]">{hours.closed ? "Closed" : `${formatHour(hours.start)} – ${formatHour(hours.end)}`}</p>}
            <div className="mt-7 border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Holiday hours</p>
              <div className="mt-3 space-y-2 text-sm">
                {websiteContent.holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center justify-between gap-3 text-slate-500">
                    <span>{holiday.name}</span>
                    <span className="font-medium text-slate-400">{holiday.closed ? "Closed" : `${formatHour(holiday.start ?? 0)} – ${formatHour(holiday.end ?? 0)}`}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_30px_rgba(43,33,29,0.04)]" aria-labelledby="events-heading">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 id="events-heading" className="text-lg font-bold text-[#374151]">Currently live events</h2>
                <p className="mt-1 text-sm text-slate-400">Events visible to your guests right now.</p>
              </div>
              <span className="rounded-full bg-[#eef8f1] px-3 py-1 text-xs font-semibold text-[#4c9a68]">{activeEvents.length} live</span>
            </div>
            {activeEvents.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{activeEvents.map((event) => <EventCard key={event.id} event={event} />)}</div> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">There are no active events right now.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[#f3e9de] bg-[#fffaf5] px-5 py-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 truncate text-2xl font-bold text-[#d39d6b] sm:text-3xl">{value}</p></div>;
}

function HolidayNotice({ holiday }: { holiday: WebsiteContent["holidays"][number] }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#c78e59]">{holiday.name}</p><p className="mt-2 text-2xl font-semibold text-[#d39d6b]">{holiday.closed ? "Closed" : `${formatHour(holiday.start ?? 0)} – ${formatHour(holiday.end ?? 0)}`}</p><p className="mt-2 text-sm text-slate-400">Adjusted holiday hours</p></div>;
}

function EventCard({ event }: { event: AdminEvent }) {
  return <article className="flex min-w-0 gap-3 rounded-xl border border-slate-100 p-3"><div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-[#fcf5ed]"><Image src={event.imageUrl} alt="" fill sizes="80px" className="object-cover" /></div><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-600">{event.name}</h3><p className="mt-1 text-xs text-slate-400">{formatEventDate(event.startAt)} – {formatEventDate(event.endAt)}</p></div></article>;
}
