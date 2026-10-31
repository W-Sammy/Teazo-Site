import Image from "next/image";
import { getWebsiteContent } from "@/app/lib/website-content";
import type { Metadata } from "next";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import StaticMenuContent from "./static-menu-content";

/* Sets the browser tab title and page description. */
export const metadata: Metadata = {
	title: "Menu",
	description: "View and download the TEAZO static menu PDF.",
};

/* Font used for the main page heading. */
const cabinSketch = Cabin_Sketch({
	subsets: ["latin"],
	weight: ["400"],
});

/* Font used for the supporting page text. */
const montserrat = Montserrat({
	subsets: ["latin"],
	weight: ["400"],
});

/* Static menu route page. */
export default async function StaticMenuPage() {
	const content = await getWebsiteContent();
	const logoSrc = content.logo || "/TEAZO_logo.svg";

	return (
		<main className="relative isolate min-h-screen bg-[#FFF8F9] px-5 pb-20 pt-45 text-stone-900 sm:px-8 lg:px-10">
			{/* Decorative bubble background. */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden">
				<BubbleField count={30} />
			</div>

			{/* Main content layer above the bubbles. */}
			<div className="relative z-10 mx-auto flex w-full max-w-[1400px] flex-col items-center">
				{/* Page heading. */}
				<div className="flex flex-col items-center">
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

					<h1 className={`${cabinSketch.className} text-[70px] text-[#B28458] py-3`}>
						MENU
					</h1>
				</div>

				{/* Short page description. */}
				<p
					className={`${montserrat.className} mt-1 max-w-3xl text-center text-[24px] text-base leading-7 text-stone-700 sm:text-lg`}
				>
					View the TEAZO menu below or download a copy for offline viewing.
				</p>

				{/* Client component for PDF button and preview. */}
				<div className="flex w-full flex-col items-center">
					<StaticMenuContent />
				</div>
			</div>
		</main>
	);
}