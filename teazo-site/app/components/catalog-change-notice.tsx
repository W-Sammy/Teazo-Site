"use client";

import { useEffect, useState } from "react";
import { watchCatalogRevision } from "@/app/lib/watch-catalog-revision";

export default function CatalogChangeNotice({ initialRevision }: { initialRevision: string | null }) {
  const [changed, setChanged] = useState(false);

  useEffect(() => watchCatalogRevision(initialRevision, () => setChanged(true)), [initialRevision]);

  if (!changed) return null;

  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col items-start justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg sm:flex-row sm:items-center">
      <p>Changes have been made to the menu. Please refresh to view them.</p>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <button type="button" onClick={() => setChanged(false)} className="rounded-lg px-3 py-2 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900">
          Dismiss
        </button>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900">
          Refresh
        </button>
      </div>
    </div>
  );
}
