import type { DashboardPeriod, MenuItemMetric } from "@/app/types/dashboard";
import { periodOptions } from "./dashboard-types";

type VisitChartProps = { items: MenuItemMetric[]; period: DashboardPeriod; onPeriodChange: (period: DashboardPeriod) => void };

export default function VisitChart({ items, period, onPeriodChange }: VisitChartProps) {
  const maxVisits = items[0]?.event_count ?? 1;
  return <section className="mt-10 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(43,33,29,0.04)] sm:p-7" aria-labelledby="top-items-heading">
    <div className="mb-6"><h2 id="top-items-heading" className="text-lg font-bold text-[#374151]">Top menu item page visits</h2><p className="mt-1 text-sm text-slate-400">Ordered by visits (highest → lowest)</p></div>
    <div className="space-y-4">{items.map((item) => <div key={item.square_item_id} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:gap-5"><span className="truncate text-slate-500">{item.item_name_snapshot}</span><div className="h-8 overflow-hidden rounded-lg bg-[#fcf5ed]"><div className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-[#dfb282] to-[#e8ccb0] px-2 text-xs font-semibold text-white transition-all duration-300" style={{ width: `${Math.max((item.event_count / maxVisits) * 100, 15)}%` }}><span className="hidden sm:inline">{item.event_count.toLocaleString()} visits</span></div></div><span className="text-xs font-medium text-slate-400 sm:hidden">{item.event_count.toLocaleString()}</span></div>)}</div>
    <div className="mt-7 flex gap-2 border-t border-slate-100 pt-5" role="tablist" aria-label="Visit period">{periodOptions.map((option) => <button key={option.value} type="button" onClick={() => onPeriodChange(option.value)} role="tab" aria-selected={period === option.value} className={`rounded-md px-3 py-2 text-sm font-semibold transition ${period === option.value ? "bg-[#fff7ef] text-[#d59f6d]" : "text-slate-500 hover:bg-slate-50"}`}>{option.label}</button>)}</div>
  </section>;
}
