import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import { headers } from "next/headers";
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

const MOBILE_USER_AGENT_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

// Cabin Sketch is the approved display face for the hand-drawn headings on this
// route. Reuse this instance instead of re-declaring font config inline.
const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["700"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Fine-tune day/hour positions independently in the hours rows.
const HOURS_TIME_COLUMN_MIN_WIDTH = "10.5rem";
const HOURS_DAY_SHIFT_PX = 10;
const HOURS_TIME_SHIFT_PX = -28;

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-6-5.4-6-10a6 6 0 1 1 12 0c0 4.6-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.8 3.7h3.4l1.5 4.4-2 1.7a16 16 0 0 0 6.2 6.2l1.7-2 4.4 1.5v3.4A1.8 1.8 0 0 1 18.2 21C10.9 21 3 13.1 3 5.8A1.8 1.8 0 0 1 4.8 3.7Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l3 2" />
    </svg>
  );
}

export default async function ContactPage() {
  const requestHeaders = await headers();
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const { location, hours } = contactContent;
  const phoneHref = `tel:${location.phone.replace(/[^\d+]/g, "")}`;
  const isMobileRequest = MOBILE_USER_AGENT_REGEX.test(userAgent);
  const hoursDayShiftPx = isMobileRequest ? 0 : HOURS_DAY_SHIFT_PX;
  const hoursTimeShiftPx = isMobileRequest ? 0 : HOURS_TIME_SHIFT_PX;
  const hoursTimeMinWidth = isMobileRequest
    ? "auto"
    : HOURS_TIME_COLUMN_MIN_WIDTH;
  const emailHref = isMobileRequest
    ? `mailto:${location.email}`
    : `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(location.email)}`;
  const opensWebmail = !isMobileRequest;

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

        <section
          className={`${montserrat.className} mx-auto mt-16 w-full max-w-[1320px] rounded-[28px] border border-[#e9dbd5] bg-white px-5 py-6 shadow-sm sm:px-6 sm:py-7 lg:mt-20 lg:px-8 lg:py-8`}
        >
          <div className="grid gap-6 lg:grid-cols-[1.03fr_0.97fr]">
            <div>
              <div className="overflow-hidden rounded-[16px] border border-[#e6ddd8] bg-[#efe7e0]">
                <iframe
                  title={`${location.businessName} map`}
                  src={mapEmbedSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-[320px] w-full border-0 sm:h-[380px] lg:h-[430px]"
                />
              </div>

              <div className="mt-4 rounded-[16px] border border-[#eadfd9] bg-[#faf6f3] p-4 sm:p-5">
                <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-[#cd8f84]">
                      <PinIcon />
                    </span>
                    <div className="leading-[1.35]">
                      <p className="text-[1.01rem] font-semibold text-stone-900">
                        {location.streetAddress}
                      </p>
                      <p className="mt-1 text-[1rem] font-medium text-stone-700">
                        {location.locality}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 sm:justify-self-end sm:pr-16">
                    <span className="mt-0.5 shrink-0 text-[#cd8f84]">
                      <PhoneIcon />
                    </span>
                    <a
                      href={phoneHref}
                      className="block whitespace-nowrap text-[1.01rem] font-semibold text-stone-900 transition hover:opacity-70"
                    >
                      {location.phone}
                    </a>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-[#cd8f84]">
                      <MailIcon />
                    </span>
                    <a
                      href={emailHref}
                      className="block text-[1.01rem] font-medium text-stone-900 transition hover:opacity-70"
                      target={opensWebmail ? "_blank" : undefined}
                      rel={opensWebmail ? "noreferrer" : undefined}
                    >
                      {location.email}
                    </a>
                  </div>

                  <div className="flex items-start justify-start sm:justify-end sm:pr-16">
                    <a
                      href={directionsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block whitespace-nowrap text-sm font-semibold uppercase tracking-[0.08em] text-[#cd8f84] transition hover:opacity-70"
                    >
                      Get Directions
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[16px] border border-[#eadfd9] bg-[#faf6f3] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[1.35rem] font-bold uppercase tracking-[0.06em] text-[#cd8f84] sm:text-[1.5rem]">
                    Hours of Operation
                  </h3>
                  <span className="mt-3 block h-[2px] w-24 bg-[#e3bfb4]" />
                </div>

                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#e3c8bf] text-[#cd8f84]">
                  <ClockIcon />
                </div>
              </div>

              <dl className="mt-6 space-y-3">
                {hours.map((entry) => (
                  <div
                    key={entry.day}
                    className="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] items-center gap-x-3 gap-y-1 rounded-[12px] border border-[#ece3de] bg-white px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-rows-1 sm:gap-y-0"
                  >
                    <span className="row-span-2 text-stone-500 sm:row-span-1">
                      <CalendarIcon />
                    </span>
                    <dt
                      className="text-[0.98rem] font-semibold uppercase tracking-[0.04em] text-stone-700 sm:text-[1rem]"
                      style={{ transform: `translateX(${hoursDayShiftPx}px)` }}
                    >
                      {entry.day}
                    </dt>
                    <dd
                      className="col-start-2 row-start-2 justify-self-start whitespace-nowrap text-left text-[0.95rem] font-semibold text-stone-700 sm:col-start-3 sm:row-start-1 sm:justify-self-end sm:text-right sm:text-[1rem]"
                      style={{
                        minWidth: hoursTimeMinWidth,
                        transform: `translateX(${hoursTimeShiftPx}px)`,
                      }}
                    >
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
