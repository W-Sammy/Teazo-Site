"use client";

import { useMemo, useState } from "react";
import type { DashboardPeriod } from "@/app/types/dashboard";
import { HoursCard, LiveEvents, StorageUsage, StorageWarnings, SummaryCard, VisitChart } from "./dashboard";
import { getTodayHoliday, getTodayHours, isEventActive, sortMetrics } from "./dashboard/dashboard-utils";
import type { DashboardClientProps } from "./dashboard/dashboard-types";

export default function DashboardClient({ metrics, events, websiteContent, storageUsage }: DashboardClientProps) {
  const [period, setPeriod] = useState<DashboardPeriod>("24-hours");
  const topItems = useMemo(() => sortMetrics(metrics[period]), [metrics, period]);
  const topItem = topItems[0];
  const totalVisits = topItems.reduce((total, item) => total + item.event_count, 0);
  const activeEvents = events.filter(isEventActive);

  return <div className="min-h-full bg-white px-5 pb-14 pt-8 text-[#273142] sm:px-8 lg:px-12 lg:pt-10"><div className="mx-auto max-w-6xl"><header className="mb-10"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#dbb082]">Overview</p><h1 className="text-3xl font-bold tracking-tight text-[#2b211d]">Dashboard</h1><p className="mt-2 text-sm text-slate-500">See how guests are engaging with your restaurant.</p></header><StorageWarnings usage={storageUsage} /><section aria-label="Visit summary" className="grid gap-4 sm:grid-cols-3"><SummaryCard label="Total visits (Top 5)" value={totalVisits.toLocaleString("en-US")} /><SummaryCard label="Most visited item" value={topItem?.item_name_snapshot ?? "—"} /><SummaryCard label="Top item visits" value={topItem?.event_count.toLocaleString("en-US") ?? "—"} /></section><VisitChart items={topItems} period={period} onPeriodChange={setPeriod} /><StorageUsage usage={storageUsage} /><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.35fr]"><HoursCard content={websiteContent} hours={getTodayHours(websiteContent)} todayHoliday={getTodayHoliday(websiteContent)} /><LiveEvents events={activeEvents} /></div></div></div>;
}
