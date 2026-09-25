type SummaryCardProps = { label: string; value: string };

export default function SummaryCard({ label, value }: SummaryCardProps) {
  return <div className="rounded-2xl border border-[#f3e9de] bg-[#fffaf5] px-5 py-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 truncate text-2xl font-bold text-[#d39d6b] sm:text-3xl">{value}</p></div>;
}
