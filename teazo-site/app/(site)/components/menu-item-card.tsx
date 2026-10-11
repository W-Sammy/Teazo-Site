"use client";

import Image from "next/image";
import { useState } from "react";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
});

const FALLBACK_IMAGE_SRC = "/TEAZO_logo.svg";

import type { ModifierList, ItemVariation } from "@/app/types/menu-item";

/* Core menu item shape for the UI. */
export type MenuItem = {
  catalogObjectId: string;
  name: string;
  variationId: string | null;
  priceCents: number;
  currency: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  description?: string;
  modifiers?: ModifierList[];
  variations?: ItemVariation[];
};

type MenuItemCardProps = {
  item: MenuItem;
  onCustomize?: (item: MenuItem) => void;
};

/* Price values come from the data layer in cents. This helper converts
   them into a display-ready currency string for the menu card UI. */
function formatPrice(priceCents: number, currency: string | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(priceCents / 100);
}

/* Reusable card used to display a single menu item.
   Clicking the card or the Order action opens the customization modal. */
export default function MenuItemCard({ item, onCustomize }: MenuItemCardProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const formattedPrice = formatPrice(item.priceCents, item.currency);

  const imageSrc = !hasImageError && item.imageUrl ? item.imageUrl : FALLBACK_IMAGE_SRC;
  const isUsingFallbackImage = imageSrc === FALLBACK_IMAGE_SRC;

  const handleClick = () => {
    onCustomize?.(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCustomize?.(item);
    }
  };

  return (
    <article
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onCustomize ? "button" : undefined}
      tabIndex={onCustomize ? 0 : undefined}
      aria-label={onCustomize ? `Customize ${item.name}` : undefined}
      className={`group flex min-h-[180px] items-start gap-4 rounded-2xl border border-stone-200 bg-[#fcfaf7] px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        onCustomize ? "cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-[#DBAF82]" : ""
      }`}
    >
      {/* This text column is allowed to shrink so long item names wrap instead of pushing into the image. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Stacking the name and price on mobile prevents the price from being covered by the image. */}
        <div className="flex flex-col gap-1">
          <h4
            className={`${montserrat.className} break-words text-[1rem] font-bold uppercase leading-snug tracking-[0.03em] text-stone-900 group-hover:text-[#c68f5d] transition-colors sm:text-[1.05rem]`}
          >
            {item.name}
          </h4>

          <span
            className={`${montserrat.className} text-[0.95rem] font-bold text-[#c68f5d]`}
          >
            {formattedPrice}
          </span>
        </div>

        {item.description && (
          <p
            className={`${montserrat.className} mt-3 line-clamp-3 text-[0.95rem] leading-6 text-stone-600`}
          >
            {item.description}
          </p>
        )}

      </div>

      {/* The image keeps a fixed size so it does not overlap the text or price. */}
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-[#f3ece6] sm:h-28 sm:w-28">
        <Image
          key={item.imageUrl || "fallback"}
          src={imageSrc}
          alt={item.name}
          fill
          className={isUsingFallbackImage ? "object-contain p-2" : "object-cover"}
          sizes="(max-width: 640px) 96px, 112px"
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      </div>
    </article>
  );
}