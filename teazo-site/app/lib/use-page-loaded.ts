import { useEffect, useState } from "react";

/**
 * False until the window's load event has fired, then true (true straight away
 * if the page had already loaded). Content that is off screen or optional waits
 * for it, so it doesn't compete with what's on screen first (TZ-515).
 */
export function usePageLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () => setLoaded(true);
    if (document.readyState === "complete") {
      load();
      return;
    }
    window.addEventListener("load", load, { once: true });
    return () => window.removeEventListener("load", load);
  }, []);

  return loaded;
}
