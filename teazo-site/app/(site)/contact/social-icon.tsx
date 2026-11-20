"use client";

import Image from "next/image";
import { usePageLoaded } from "@/app/lib/use-page-loaded";

/**
 * A social icon in the contact card. The card is well below the fold on phones,
 * so the icon waits for the page to load (TZ-515); until then a box of the same
 * size holds its place. The link around it carries the label.
 */
export default function SocialIcon({ src }: { src: string }) {
  if (!usePageLoaded()) {
    return <span aria-hidden="true" className="block h-12 w-12" />;
  }

  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={64}
      height={64}
      className="h-12 w-12 object-contain"
    />
  );
}
