"use client";

import { useEffect, useState } from "react";
import { watchCatalogRevision } from "@/app/lib/watch-catalog-revision";

export default function CatalogChangeNotice({ initialRevision }: { initialRevision: string | null }) {
  const [changed, setChanged] = useState(false);

  useEffect(() => watchCatalogRevision(initialRevision, () => setChanged(true)), [initialRevision]);

  if (!changed) return null;

  return (
    <div role="status" className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg">
      <p>Changes have been made to the menu. Please refresh to view them.</p>
      <button type="button" onClick={() => window.location.reload()} className="shrink-0 rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white hover:bg-amber-800">
        Refresh
      </button>
    </div>
  );
}
