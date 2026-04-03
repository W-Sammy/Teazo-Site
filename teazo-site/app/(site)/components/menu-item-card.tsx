import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
});

export type MenuItem = {
  name: string;
  description?: string;
};

type MenuItemCardProps = {
  item: MenuItem;
};

export default function MenuItemCard({ item }: MenuItemCardProps) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-[#fcfaf7] px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <h4
        className={`${montserrat.className} text-[1rem] font-bold uppercase tracking-[0.03em] text-stone-900 sm:text-[1.05rem]`}
      >
        {item.name}
      </h4>

      {item.description && (
        <p
          className={`${montserrat.className} mt-3 text-[0.95rem] leading-6 text-stone-600`}
        >
          {item.description}
        </p>
      )}
    </article>
  );
}