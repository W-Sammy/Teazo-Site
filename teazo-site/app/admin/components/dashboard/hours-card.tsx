import type { Holiday, WebsiteContent } from "@/app/types/website-content";
import Link from "next/link";
import { formatHour } from "./dashboard-utils";

type HoursCardProps = { content: WebsiteContent; hours: WebsiteContent["hours"][number]; todayHoliday: Holiday | undefined };

export default function HoursCard({ content, hours, todayHoliday }: HoursCardProps) {
  return <section className="rounded-2xl bg-white p-6" aria-labelledby="hours-heading"><Link href="/admin/website-content?section=hours" title="Open Business Hours in Website Content" className="-m-2 block rounded-xl p-2 transition-colors hover:bg-[#fffaf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c98a52]"><div className="mb-5 flex items-center justify-between gap-3"><h2 id="hours-heading" className="text-lg font-bold text-[#374151]">Today&apos;s business hours</h2><span className="rounded-full bg-[#fff7ef] px-3 py-1 text-xs font-semibold text-[#c78e59]">{hours.day}</span></div>{todayHoliday ? <HolidayNotice holiday={todayHoliday} /> : <p className="text-2xl font-semibold text-[#d39d6b]">{hours.closed ? "Closed" : `${formatHour(hours.start)} – ${formatHour(hours.end)}`}</p>}</Link><Link href="/admin/website-content?section=holidays" title="Open Holiday Exceptions in Website Content" className="-m-2 mt-5 block rounded-xl p-2 pt-5 transition-colors hover:bg-[#fffaf5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c98a52]"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Holiday hours</p><div className="mt-3 space-y-2 text-sm">{content.holidays.map((holiday) => <div key={holiday.id} className="flex items-center justify-between gap-3 text-slate-500"><span>{holiday.name}</span><span className="font-medium text-slate-400">{holiday.closed ? "Closed" : `${formatHour(holiday.start ?? 0)} – ${formatHour(holiday.end ?? 0)}`}</span></div>)}</div></Link></section>;
}

function HolidayNotice({ holiday }: { holiday: Holiday }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#c78e59]">{holiday.name}</p><p className="mt-2 text-2xl font-semibold text-[#d39d6b]">{holiday.closed ? "Closed" : `${formatHour(holiday.start ?? 0)} – ${formatHour(holiday.end ?? 0)}`}</p><p className="mt-2 text-sm text-slate-400">Adjusted holiday hours</p></div>;
}
