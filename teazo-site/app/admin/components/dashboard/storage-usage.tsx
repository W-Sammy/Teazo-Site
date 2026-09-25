import type { StorageUsage } from "@/app/types/storage-usage";

const WARNING_THRESHOLD = 0.8;

function formatStorage(bytes: number, service: StorageUsage["service"]) {
  const divisor = service === "D1" ? 1024 ** 2 : 1024 ** 3;
  const unit = service === "D1" ? "MB" : "GB";
  return `${(bytes / divisor).toFixed(1)} ${unit}`;
}

function getUsagePercent(usage: StorageUsage) {
  return Math.min((usage.currentBytes / usage.maxBytes) * 100, 100);
}

function isAtWarningThreshold(usage: StorageUsage) {
  return usage.currentBytes / usage.maxBytes >= WARNING_THRESHOLD;
}

export function StorageWarnings({ usage }: { usage: StorageUsage[] }) {
  const warnings = usage.filter(isAtWarningThreshold);

  if (warnings.length === 0) return null;

  return (
    <section aria-label="Storage warnings" className="mb-6 space-y-3">
      {warnings.map((item) => (
        <div key={item.service} role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span aria-hidden="true" className="mt-0.5 text-base">⚠</span>
          <p><span className="font-semibold">{item.service} storage is at {getUsagePercent(item).toFixed(0)}%.</span> Consider cleaning up unused {item.service === "R2" ? "images or events" : "data"} to keep costs under control.</p>
        </div>
      ))}
    </section>
  );
}

export default function StorageUsage({ usage }: { usage: StorageUsage[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(43,33,29,0.04)] sm:p-7" aria-labelledby="storage-heading">
      <div className="mb-6"><h2 id="storage-heading" className="text-lg font-bold text-[#374151]">Storage usage</h2><p className="mt-1 text-sm text-slate-400">Current usage compared with your service limits.</p></div>
      <div className="grid gap-6">
        {usage.map((item) => {
          const percentage = getUsagePercent(item);
          const color = item.service === "D1" ? "bg-blue-500" : "bg-green-500";
          const trackColor = item.service === "D1" ? "bg-blue-50" : "bg-green-50";
          return <div key={item.service}><div className="mb-3 flex items-center justify-between"><span className="font-semibold text-slate-600">{item.service}</span><span className="text-sm font-medium text-slate-400">{percentage.toFixed(0)}%</span></div><div className={`h-4 overflow-hidden rounded-full ${trackColor}`}><div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${percentage}%` }} /></div><div className="mt-3 flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-600">{formatStorage(item.currentBytes, item.service)}</span><span className="text-slate-400">of {formatStorage(item.maxBytes, item.service)}</span></div></div>;
        })}
      </div>
    </section>
  );
}
