"use client";

import { useMemo, useState } from "react";
import type { DashboardPeriod, DashboardVisitType } from "@/app/types/dashboard";
import { HoursCard, LiveEvents, StorageUsage, StorageWarnings, SummaryCard, VisitChart } from "./dashboard";
import { getTodayHoliday, getTodayHours, isEventActive, sortMetrics, sortPageMetrics } from "./dashboard/dashboard-utils";
import type { DashboardClientProps } from "./dashboard/dashboard-types";

export default function DashboardClient({ metrics, events, websiteContent, storageUsage }: DashboardClientProps) {
  const [period, setPeriod] = useState<DashboardPeriod>("24-hours");
  const [visitType, setVisitType] = useState<DashboardVisitType>("menu-items");
  const topItems = useMemo(() => visitType === "menu-items" ? sortMetrics(metrics.menuItems?.[period] ?? []) : sortPageMetrics(metrics.pages?.[period] ?? []), [metrics, period, visitType]);
  const topItem = topItems[0];
  const totalVisits = topItems.reduce((total, item) => total + item.event_count, 0);
  const chartItems = topItems.map((item) => "square_item_id" in item ? { id: item.square_item_id, name: item.item_name_snapshot, event_count: item.event_count } : { id: item.page_path, name: item.page_name_snapshot, event_count: item.event_count });
  const isMenuItemView = visitType === "menu-items";
  const activeEvents = events.filter(isEventActive);

  return <div className="min-h-full bg-white px-5 pb-14 pt-8 text-[#273142] sm:px-8 lg:px-12 lg:pt-10"><div className="mx-auto max-w-6xl"><header className="mb-10"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#dbb082]">Overview</p><h1 className="text-3xl font-bold tracking-tight text-[#2b211d]">Dashboard</h1><p className="mt-2 text-sm text-slate-500">See how guests are engaging with your restaurant.</p></header><StorageWarnings usage={storageUsage} /><section aria-label="Visit summary" className="grid gap-4 sm:grid-cols-3"><SummaryCard label={`Total visits (Top 5 ${isMenuItemView ? "items" : "pages"})`} value={totalVisits.toLocaleString("en-US")} /><SummaryCard label={isMenuItemView ? "Most visited item" : "Most visited page"} value={topItem ? (isMenuItemView && "item_name_snapshot" in topItem ? topItem.item_name_snapshot : "page_name_snapshot" in topItem ? topItem.page_name_snapshot : "—") : "—"} /><SummaryCard label={isMenuItemView ? "Top item visits" : "Top page visits"} value={topItem?.event_count.toLocaleString("en-US") ?? "—"} /></section><VisitChart items={chartItems} period={period} visitType={visitType} onPeriodChange={setPeriod} onVisitTypeChange={setVisitType} /><StorageUsage usage={storageUsage} /><div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.35fr]"><HoursCard content={websiteContent} hours={getTodayHours(websiteContent)} todayHoliday={getTodayHoliday(websiteContent)} /><LiveEvents events={activeEvents} /></div></div></div>;
}
