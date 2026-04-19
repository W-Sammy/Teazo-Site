import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import {
  contactContent,
  directionsHref,
  mapEmbedSrc,
} from "./contact-content";
import Subtitle from "../components/sub-title";

// Keep route metadata local to the contact page so the rest of the site can
// evolve independently without coupling page-specific SEO copy together.
export const metadata: Metadata = {
  title: "Contact",
  description: "Visit TEAZO in San Francisco and check the latest store hours.",
};

// Cabin Sketch is the approved display face for the hand-drawn headings on this
// route. Reuse this instance instead of re-declaring font config inline.
const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["700"],
});

function PaintStroke() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 900 230"
      className="absolute left-1/2 top-1/2 h-[120px] w-[680px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2"
    >
      {/* Layer a few uneven strokes so the heading underline feels hand-painted
          instead of like a single clean vector line. */}
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

export default function ContactPage() {
  const { location, hours } = contactContent;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#f4efeb] text-stone-900">
      {/* Shared so other pages can reuse the same motion treatment without
          copying contact-specific files. */}
      <BubbleField count={13} />

      <div className="relative z-10 mx-auto max-w-[1440px] px-5 pb-24 pt-28 sm:px-8 sm:pt-32 lg:px-10 lg:pt-36">
        <section className="flex flex-col items-center text-center">
          {/* Use the approved uploaded logo asset rather than reconstructing it
              in code so brand updates can be handled from /public later. */}
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
            Contact
          </h1>

          {/* The decorative brush stroke sits behind the section heading rather
              than being baked into an image, which keeps the heading editable. */}
          <div className="relative mt-14 inline-flex items-center justify-center sm:mt-16">
            <Subtitle text="Location & Hours"/>
          </div>
        </section>

        {/* This card intentionally groups map, store details, and hours so any
            future CMS/admin wiring can stay inside the content module. */}
        <section className="mx-auto mt-16 w-full max-w-[1320px] bg-white px-4 py-5 sm:px-6 sm:py-6 lg:mt-20 lg:px-7 lg:py-7 xl:max-w-[1380px]">
          <div className="grid gap-7 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="min-h-[405px] overflow-hidden bg-[#efe7e0]">
              {/* The embed is sized to fill the full left column so taller hours
                  content does not leave an empty gap under the map. */}
              <iframe
                title={`${location.businessName} map`}
                src={mapEmbedSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full min-h-[405px] w-full border-0"
              />
            </div>

            <div className="grid gap-10 pt-1 lg:grid-cols-[0.88fr_1fr]">
              <div className="text-left">
                {/* All business data comes from contact-content.ts so later admin
                    work only has one source file to replace. */}
                <h3 className="text-[1.15rem] font-semibold uppercase tracking-[0.02em] text-stone-950 sm:text-[1.35rem]">
                  {location.businessName}
                </h3>

                <div className="mt-5 space-y-4 text-[1.05rem] font-semibold leading-[1.45] text-stone-900 sm:text-[1.12rem]">
                  <p>{location.streetAddress}</p>
                  <p>{location.locality}</p>
                  <p>{location.phone}</p>
                  <p>{location.email}</p>
                </div>

                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-7 inline-block text-[1.02rem] font-semibold uppercase tracking-[0.02em] text-stone-950 transition hover:opacity-70"
                >
                  Get Directions
                </a>
              </div>

              {/* Keep hours in a definition list for accessible day/value pairing. */}
              <dl className="grid grid-cols-[auto_1fr] items-start gap-x-6 gap-y-5 text-left">
                {hours.map((entry) => (
                  <div
                    key={entry.day}
                    className="col-span-2 grid grid-cols-subgrid items-baseline"
                  >
                    <dt className="text-[1.05rem] font-semibold uppercase tracking-[0.02em] text-stone-950 sm:text-[1.12rem]">
                      {entry.day}
                    </dt>
                    <dd className="justify-self-end text-[1.02rem] font-semibold text-stone-950 sm:text-[1.08rem]">
                      {entry.hours}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
