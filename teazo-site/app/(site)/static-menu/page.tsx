import type { Metadata } from "next";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import StaticMenuContent from "./static-menu-content";

export const metadata: Metadata = {
	title: "Menu",
	description: "View and download the TEAZO static menu PDF.",
};

const cabinSketch = Cabin_Sketch({
	subsets: ["latin"],
	weight: ["700"],
});

const montserrat = Montserrat({
	subsets: ["latin"],
	weight: ["400", "700"],
});

export default function StaticMenuPage() {
	return (
		<main className="relative isolate min-h-screen bg-[#f4efeb] px-5 pb-20 pt-28 text-stone-900 sm:px-8 sm:pt-32 lg:px-10 lg:pt-36">
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<BubbleField count={30} />
			</div>

			<div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col items-center">
				<h1
					className={`${cabinSketch.className} text-center text-[3rem] uppercase leading-[0.9] tracking-[0.08em] text-[#d9ab79] sm:text-[4rem]`}
				>
					Menu
				</h1>

				<p
					className={`${montserrat.className} mt-6 max-w-3xl text-center text-base leading-7 text-stone-700 sm:text-lg`}
				>
					View the TEAZO static menu below or download a copy for offline
					viewing.
				</p>

				<div className="mt-8 flex w-full flex-col items-center">
					<StaticMenuContent />
				</div>
			</div>
		</main>
	);
}