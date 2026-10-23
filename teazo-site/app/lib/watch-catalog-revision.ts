/** Watch the revision captured before the page loaded its menu items. */
export function watchCatalogRevision(initialRevision: string | null, onChange: () => void): () => void {
  let baseline = initialRevision;
  let stopped = false;
  let changed = false;
  let activeRequest: AbortController | null = null;

  async function check() {
    if (stopped || changed || activeRequest || document.visibilityState === "hidden") return;
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/square/catalog-revision", {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (stopped || !data || typeof data !== "object" || !("revision" in data) || typeof data.revision !== "string") return;
      // Recover quietly if the page's original DB lookup failed.
      if (baseline === null) baseline = data.revision;
      else if (data.revision !== baseline) {
        changed = true;
        onChange();
      }
    } catch {
      // A failed check isn't proof of a change. Retry on the next interval.
    } finally {
      window.clearTimeout(timeout);
      activeRequest = null;
    }
  }

  void check();
  const interval = window.setInterval(check, 20_000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  return () => {
    stopped = true;
    activeRequest?.abort();
    window.clearInterval(interval);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}
