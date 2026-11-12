"use client";

import { usePageLoaded } from "@/app/lib/use-page-loaded";

/**
 * The Google Maps embed, mounted once the page has loaded. The embed pulls in
 * about 600 KB of Google scripts, and loading it with the page delayed the
 * page's own text on phones (TZ-515). The map box shows its background until then.
 */
export default function MapFrame({ title, src, className }: { title: string; src: string; className: string }) {
  if (!usePageLoaded()) {
    return <div role="presentation" className={className} />;
  }

  return (
    <iframe
      title={title}
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      className={className}
    />
  );
}
