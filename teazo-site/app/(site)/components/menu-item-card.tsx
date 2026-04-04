import Image from "next/image";
import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
});

/* Core menu item shape for the UI.
   This is closer to the Square API shape so mock data can be replaced later
   with less refactoring. */
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
};

type MenuItemCardProps = {
  item: MenuItem;
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
   This component is responsible only for rendering one item’s image,
   name, price, and optional description in a consistent card layout. */
export default function MenuItemCard({ item }: MenuItemCardProps) {
  const imageSrc = item.imageUrl || "/TEAZO_logo.png";
  const formattedPrice = formatPrice(item.priceCents, item.currency);

  return (
    <article className="flex min-h-[180px] items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-[#fcfaf7] px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      {/* Left side of the card contains the text-based product information. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top row keeps the product name and formatted price aligned consistently. */}
        <div className="flex items-start justify-between gap-4">
          <h4
            className={`${montserrat.className} text-[1rem] font-bold uppercase tracking-[0.03em] text-stone-900 sm:text-[1.05rem]`}
          >
            {item.name}
          </h4>

          <span
            className={`${montserrat.className} shrink-0 text-[0.95rem] font-bold text-[#c68f5d]`}
          >
            {formattedPrice}
          </span>
        </div>

        {/* Render the description only when the item includes one. */}
        {item.description && (
          <p
            className={`${montserrat.className} mt-3 line-clamp-3 text-[0.95rem] leading-6 text-stone-600`}
          >
            {item.description}
          </p>
        )}
      </div>

      {/* Right side of the card displays the product image in a fixed-size frame
          so cards stay visually consistent across different menu sections. */}
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f3ece6] sm:h-28 sm:w-28">
        <Image
          src={imageSrc}
          alt={item.name}
          fill
          className="object-cover"
          sizes="112px"
        />
      </div>
    </article>
  );
}