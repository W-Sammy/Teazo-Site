import type { Metadata } from "next";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import { getLiveEvents } from "@/app/admin/events/handlers/get-events";
import EventsDirectory from "./events-directory";

const cabinSketch = Cabin_Sketch({ subsets: ["latin"], weight: ["400"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = { title: "Live Events | Teazo", description: "Explore current events and promotions at Teazo." };
export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = (await getLiveEvents()).sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt));
  return <main className={`${montserrat.className} min-h-screen bg-[#FFF8F9] px-5 pb-24 pt-44 sm:px-8 lg:px-10`}><section className="mx-auto max-w-5xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#cd8f84]">Teazo happenings</p><h1 className={`${cabinSketch.className} mt-2 text-6xl text-[#D9AE81] sm:text-8xl`}>Live events</h1><p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">Explore our current promotions and special events. Events ending soonest appear first.</p><EventsDirectory events={events} /></section></main>;
}
