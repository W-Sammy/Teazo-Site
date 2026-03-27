import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";

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

const menuSections = [
  {
    title: "Milk Teas",
    items: [
      "Classic Milk Tea",
      "Taro Milk Tea",
      "Thai Milk Tea",
      "Brown Sugar Milk Tea",
    ],
  },
  {
    title: "Fruit Teas",
    items: [
      "Passion Fruit Tea",
      "Mango Green Tea",
      "Peach Black Tea",
      "Strawberry Tea",
    ],
  },
  {
    title: "Specialty Drinks",
    items: [
      "Matcha Latte",
      "Coffee Milk Tea",
      "Wintermelon Tea",
      "Honey Lemon Tea",
    ],
  },
  {
    title: "Toppings",
    items: [
      "Boba",
      "Crystal Boba",
      "Pudding",
      "Grass Jelly",
    ],
  },
];

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
            Explore some of our featured menu categories. This route is ready and
            can be updated later with real menu data.
          </p>
        </section>

        <section className="mx-auto mt-16 grid max-w-[1320px] gap-6 sm:grid-cols-2 lg:mt-20 lg:gap-8">
          {menuSections.map((section) => (
            <article
              key={section.title}
              className="bg-white px-6 py-7 shadow-sm"
            >
              <h3
                className={`${cabinSketch.className} text-[2.1rem] uppercase leading-[0.95] tracking-[0.04em] text-[#d9ab79]`}
              >
                {section.title}
              </h3>

              <ul className={`${montserrat.className} mt-5 space-y-3`}>
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="border-b border-stone-200 pb-3 text-[1rem] font-semibold uppercase tracking-[0.02em] text-stone-900"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}