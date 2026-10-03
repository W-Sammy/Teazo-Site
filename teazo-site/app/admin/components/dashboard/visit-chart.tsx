import type { DashboardPeriod, DashboardVisitType } from "@/app/types/dashboard";
import { periodOptions, visitTypeOptions } from "./dashboard-types";

type VisitMetric = { id: string; name: string; event_count: number };
type VisitChartProps = { items: VisitMetric[]; period: DashboardPeriod; visitType: DashboardVisitType; onPeriodChange: (period: DashboardPeriod) => void; onVisitTypeChange: (visitType: DashboardVisitType) => void };

export default function VisitChart({ items, period, visitType, onPeriodChange, onVisitTypeChange }: VisitChartProps) {
  const maxVisits = items[0]?.event_count ?? 1;
  const title = visitType === "menu-items" ? "Top menu item page visits" : "Top User page visits";
  return <section className="mt-10 rounded-2xl bg-white p-5 sm:p-7" aria-labelledby="visit-chart-heading">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="visit-chart-heading" className="text-lg font-bold text-[#374151]">{title}</h2><p className="mt-1 text-sm text-slate-400">Ordered by visits (highest → lowest)</p></div><div className="flex rounded-lg bg-[#fcf5ed] p-1" role="tablist" aria-label="Visit type">{visitTypeOptions.map((option) => <button key={option.value} type="button" onClick={() => onVisitTypeChange(option.value)} role="tab" aria-selected={visitType === option.value} className={`rounded-md px-3 py-2 text-xs font-semibold transition sm:text-sm ${visitType === option.value ? "bg-white text-[#d59f6d] shadow-sm" : "text-slate-500 hover:text-[#d59f6d]"}`}>{option.label}</button>)}</div></div>
    <div className="space-y-4">{items.map((item) => <div key={item.id} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:gap-5"><span className="truncate text-slate-500">{item.name}</span><div className="h-8 overflow-hidden rounded-lg bg-[#fcf5ed]"><div className="flex h-full items-center justify-end rounded-lg bg-[#dfb282] px-2 text-xs font-semibold text-white transition-all duration-300" style={{ width: `${Math.max((item.event_count / maxVisits) * 100, 15)}%` }}><span className="hidden sm:inline">{item.event_count.toLocaleString("en-US")} visits</span></div></div><span className="text-xs font-medium text-slate-400 sm:hidden">{item.event_count.toLocaleString("en-US")}</span></div>)}</div>
    <div className="mt-7 flex gap-2 pt-5" role="tablist" aria-label="Visit period">{periodOptions.map((option) => <button key={option.value} type="button" onClick={() => onPeriodChange(option.value)} role="tab" aria-selected={period === option.value} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${period === option.value ? "bg-[#fff7ef] text-[#d59f6d]" : "text-slate-500 hover:bg-slate-50"}`}>{option.label}</button>)}</div>
  </section>;
}
