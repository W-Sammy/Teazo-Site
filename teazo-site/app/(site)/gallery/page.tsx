import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import GalleryGrid, { type GalleryImage } from "../components/gallery-grid";
import { getWebsiteContent } from "@/app/lib/website-content";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos of TEAZO drinks and the shop.",
};

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

/* Placeholder images using the TEAZO logo */
const mockImages: GalleryImage[] = [
  { id: "mock-1", url: "/TEAZO_logo.svg", alt: "TEAZO drink", caption: "Signature Drinks" },
  { id: "mock-2", url: "/TEAZO_logo.svg", alt: "TEAZO drink", caption: "Fresh Fruit Tea" },
  { id: "mock-3", url: "/TEAZO_logo.svg", alt: "TEAZO drink", caption: "Matcha Series" },
  { id: "mock-4", url: "/TEAZO_logo.svg", alt: "TEAZO drink", caption: "Soufflé Pancakes" },
  { id: "mock-5", url: "/TEAZO_logo.svg", alt: "TEAZO drink", caption: "Cheezo Tea" },
  { id: "mock-6", url: "/TEAZO_logo.svg", alt: "TEAZO drink", caption: "Desserts" },
  { id: "mock-7", url: "/TEAZO_logo.svg", alt: "TEAZO drink" },
  { id: "mock-8", url: "/TEAZO_logo.svg", alt: "TEAZO drink" },
  { id: "mock-9", url: "/TEAZO_logo.svg", alt: "TEAZO drink" },
];

export default async function GalleryPage() {
  const content = await getWebsiteContent();
  const logoSrc = content.logo || "/TEAZO_logo.svg";

  return (
    <main className="relative z-0 min-h-screen bg-[#FFF8F9] text-stone-900">
      {/* bubble background */}
      <div className="">
        <BubbleField />
      </div>

      <div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 pt-45 sm:px-8 lg:px-10">

        {/* Page header */}
        <section className="flex flex-col items-center text-center">
          <Image
              src={logoSrc}
              alt="TEAZO logo"
              aria-hidden="true"
              width={389}
              height={397}
              className="h-[170px] w-auto sm:h-[195px]"
              priority
              unoptimized={logoSrc.startsWith("data:") || logoSrc.startsWith("http")}
          />

          <h1
            className={`${cabinSketch.className} mt-3 text-[70px] text-[#D9AE81]`}
          >
            GALLERY
          </h1>
        </section>

        <GalleryGrid images={mockImages} />
      </div>
    </main>
  );
}
