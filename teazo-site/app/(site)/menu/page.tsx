import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import MenuItemCard, { type MenuItem } from "../components/menu-item-card";

export const metadata: Metadata = {
  title: "Menu",
  description: "Explore the TEAZO menu.",
};

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["700"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
});

function PaintStroke() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 900 230"
      className="absolute left-1/2 top-1/2 h-[120px] w-[680px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2"
    >
      <path
        d="M70 120C180 74 250 134 364 104c80-20 118-45 222-28 72 12 126 34 214 16"
        fill="none"
        stroke="#ffafc4"
        strokeLinecap="round"
        strokeWidth="26"
      />
      <path
        d="M106 152c78-50 158-14 243-36 104-27 177-88 333-58"
        fill="none"
        stroke="#ffbfd0"
        strokeLinecap="round"
        strokeWidth="24"
      />
      <path
        d="M274 80c64-10 146 24 204 10 94-22 149-12 234 14"
        fill="none"
        stroke="#ff9eb9"
        strokeLinecap="round"
        strokeWidth="20"
      />
    </svg>
  );
}

type MenuSection = {
  title: string;
  items: MenuItem[];
};

const menuSections: MenuSection[] = [
  {
    title: "Milk Teas",
    items: [
      {
        name: "Classic Milk Tea",
        description: "A smooth and creamy black milk tea.",
      },
      {
        name: "Taro Milk Tea",
        description: "Sweet and nutty taro flavor with a creamy finish.",
      },
      {
        name: "Thai Milk Tea",
        description: "Bold tea flavor with warm spices and sweetness.",
      },
      {
        name: "Brown Sugar Milk Tea",
        description: "Rich brown sugar flavor with creamy milk tea.",
      },
    ],
  },
  {
    title: "Fruit Teas",
    items: [
      {
        name: "Passion Fruit Tea",
        description: "Bright and tropical with a tangy finish.",
      },
      {
        name: "Mango Green Tea",
        description: "Refreshing green tea blended with mango flavor.",
      },
      {
        name: "Peach Black Tea",
        description: "Light peach sweetness with bold black tea.",
      },
      {
        name: "Strawberry Tea",
        description: "Fruity and refreshing with a sweet berry flavor.",
      },
    ],
  },
  {
    title: "Specialty Drinks",
    items: [
      {
        name: "Matcha Latte",
        description: "Creamy matcha drink with a smooth earthy flavor.",
      },
      {
        name: "Coffee Milk Tea",
        description: "A bold blend of coffee notes and milk tea.",
      },
      {
        name: "Wintermelon Tea",
        description: "Lightly sweet tea with a mellow wintermelon taste.",
      },
      {
        name: "Honey Lemon Tea",
        description: "Fresh citrus flavor balanced with honey sweetness.",
      },
    ],
  },
  {
    title: "Toppings",
    items: [
      {
        name: "Boba",
        description: "Classic chewy tapioca pearls.",
      },
      {
        name: "Crystal Boba",
        description: "Soft and lightly sweet translucent pearls.",
      },
      {
        name: "Pudding",
        description: "Smooth egg pudding topping.",
      },
      {
        name: "Grass Jelly",
        description: "Cool and silky herbal jelly topping.",
      },
    ],
  },
];

function MenuCategorySection({ section }: { section: MenuSection }) {
  return (
    <section className="rounded-[28px] bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-center justify-center text-center">
        <h3
          className={`${cabinSketch.className} text-[2.2rem] uppercase leading-[0.95] tracking-[0.04em] text-[#d9ab79] sm:text-[2.6rem]`}
        >
          {section.title}
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {section.items.map((item) => (
          <MenuItemCard key={item.name} item={item} />
        ))}
      </div>
    </section>
  );
}

export default function MenuPage() {
  return (
    <main className="min-h-screen bg-[#f4efeb] text-stone-900">
      <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-28 sm:px-8 sm:pt-32 lg:px-10 lg:pt-36">
        <section className="flex flex-col items-center text-center">
          <Image
            src="/TEAZO_logo.png"
            alt=""
            aria-hidden="true"
            width={389}
            height={397}
            className="h-[170px] w-auto sm:h-[195px]"
            priority
          />

          <h1
            className={`${cabinSketch.className} mt-4 text-[3.8rem] uppercase leading-[0.9] tracking-[0.08em] text-[#d9ab79] sm:text-[5.1rem]`}
          >
            Menu
          </h1>

          <div className="relative mt-14 inline-flex items-center justify-center sm:mt-16">
            <PaintStroke />
            <h2
              className={`${cabinSketch.className} relative z-10 px-5 text-center text-[3.1rem] uppercase leading-[0.92] tracking-[0.035em] text-[#161616] sm:text-[4.5rem] lg:text-[5rem]`}
            >
              Drinks &amp; Toppings
            </h2>
          </div>

          <p
            className={`${montserrat.className} mt-8 max-w-3xl text-base leading-7 text-stone-700 sm:text-lg`}
          >
            Explore some of our featured menu categories.
          </p>
        </section>

        <div className="mx-auto mt-16 grid max-w-[1320px] grid-cols-1 gap-6 lg:mt-20 lg:grid-cols-2 lg:gap-8">
          {menuSections.map((section) => (
            <MenuCategorySection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}