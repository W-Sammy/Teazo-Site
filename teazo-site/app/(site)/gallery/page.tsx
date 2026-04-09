import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import GalleryGrid, { type GalleryImage } from "../components/gallery-grid";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos of TEAZO drinks and the shop.",
};

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400"],
});

/* Placeholder images using the TEAZO logo */
const mockImages: GalleryImage[] = [
  { id: "mock-1", url: "/TEAZO_logo.png", alt: "TEAZO drink", caption: "Signature Drinks" },
  { id: "mock-2", url: "/TEAZO_logo.png", alt: "TEAZO drink", caption: "Fresh Fruit Tea" },
  { id: "mock-3", url: "/TEAZO_logo.png", alt: "TEAZO drink", caption: "Matcha Series" },
  { id: "mock-4", url: "/TEAZO_logo.png", alt: "TEAZO drink", caption: "Soufflé Pancakes" },
  { id: "mock-5", url: "/TEAZO_logo.png", alt: "TEAZO drink", caption: "Cheezo Tea" },
  { id: "mock-6", url: "/TEAZO_logo.png", alt: "TEAZO drink", caption: "Desserts" },
  { id: "mock-7", url: "/TEAZO_logo.png", alt: "TEAZO drink" },
  { id: "mock-8", url: "/TEAZO_logo.png", alt: "TEAZO drink" },
  { id: "mock-9", url: "/TEAZO_logo.png", alt: "TEAZO drink" },
];

export default function GalleryPage() {
  return (
    <main className="min-h-screen bg-[#f4efeb] text-stone-900">
      <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-28 sm:px-8 sm:pt-32 lg:px-10 lg:pt-36">

        {/* Page header */}
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
            Gallery
          </h1>
        </section>

        <GalleryGrid images={mockImages} />
      </div>
    </main>
  );
}
