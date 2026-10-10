import type { Metadata } from "next";
import Image from "next/image";
import { Cabin_Sketch, Montserrat } from "next/font/google";

import { getLiveEvents } from "@/app/admin/events/handlers/get-events";
import { formatEventDate } from "@/app/admin/events/components/event-display";

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Live Events | Teazo",
  description: "Explore current events and promotions at Teazo.",
};

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = (await getLiveEvents()).sort(
    (first, second) => Date.parse(first.endAt) - Date.parse(second.endAt),
  );

  return (
    <main className={`${montserrat.className} min-h-screen bg-[#FFF8F9] px-5 pb-24 pt-44 sm:px-8 lg:px-10`}>
      <section className="mx-auto max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#cd8f84]">Teazo happenings</p>
        <h1 className={`${cabinSketch.className} mt-2 text-6xl text-[#D9AE81] sm:text-8xl`}>Live events</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
          Explore our current promotions and special events. Events ending soonest appear first.
        </p>

        {events.length > 0 ? (
          <div className="mt-10 max-h-[min(72vh,48rem)] space-y-5 overflow-y-auto rounded-3xl border border-[#eadbd6] bg-white p-4 shadow-[0_18px_50px_rgba(62,35,30,0.1)] sm:p-6">
            {events.map((event) => (
              <article
                key={event.id}
                id={event.id}
                className="group scroll-mt-36 grid overflow-hidden rounded-2xl border border-[#eee1dc] bg-[#fffafa] transition target:border-[#D9AE81] target:ring-4 target:ring-[#D9AE81]/20 hover:-translate-y-0.5 hover:border-[#D9AE81] hover:shadow-md sm:grid-cols-[240px_1fr]"
              >
                <div className="relative aspect-[16/8] overflow-hidden bg-[#f4e9e4] sm:aspect-auto sm:min-h-44">
                  <Image
                    src={event.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 240px"
                    className="object-cover transition duration-300 group-hover:scale-105"
                    unoptimized={event.imageUrl.startsWith("http") || event.imageUrl.startsWith("data:")}
                  />
                </div>
                <div className="flex flex-col justify-center px-5 py-5 sm:px-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#cd8f84]">Happening now</p>
                  <h2 className="mt-2 text-xl font-bold text-[#3c2924] sm:text-2xl">{event.name}</h2>
                  <p className="mt-2 text-sm font-medium text-[#9b7065]">
                    Ends {formatEventDate(event.endAt)}
                  </p>
                  <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-600 sm:text-base">
                    {event.description || "Join us at Teazo for this special event."}
                  </p>
                  <span className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-[#3c2924]">Live event</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-[#eadbd6] bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-[#3c2924]">No live events right now</h2>
            <p className="mt-2 text-stone-600">Check back soon for the next Teazo promotion.</p>
          </div>
        )}
      </section>
    </main>
  );
}
