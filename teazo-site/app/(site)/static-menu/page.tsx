import type { Metadata } from "next";
import { Cabin_Sketch, Montserrat } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import PdfPreview from "@/app/components/pdf-preview";

export const metadata: Metadata = {
	title: "Static Menu",
	description: "View, open, and download the TEAZO static menu PDF.",
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
					Static Menu
				</h1>

				<p
					className={`${montserrat.className} mt-6 max-w-3xl text-center text-base leading-7 text-stone-700 sm:text-lg`}
				>
					Preview the TEAZO static menu below. You can also open the PDF in a
					new tab or download a copy for offline viewing.
				</p>

				<div className="mt-8 flex flex-wrap items-center justify-center gap-4">
					<a
						href="/teazo-static-menu.pdf"
						download
						className={`${montserrat.className} inline-flex h-[70px] min-w-[213px] items-center justify-center bg-black px-8 text-[18px] font-semibold tracking-[0.05em] text-white transition-colors hover:bg-[#FFBDC7]`}
					>
						DOWNLOAD PDF
					</a>

					<a
						href="/teazo-static-menu.pdf"
						target="_blank"
						rel="noopener noreferrer"
						className={`${montserrat.className} inline-flex h-[70px] min-w-[213px] items-center justify-center border border-black bg-transparent px-8 text-[18px] font-semibold tracking-[0.05em] text-black transition-colors hover:bg-black hover:text-white`}
					>
						OPEN PDF
					</a>
				</div>

				<p
					className={`${montserrat.className} mt-5 text-center text-sm leading-6 text-stone-600`}
				>
					If the preview does not load, use the buttons above to open or
					download the PDF.
				</p>

				<div className="mt-10 w-full max-w-[900px]">
					<PdfPreview fileUrl="/teazo-static-menu.pdf" />
				</div>
			</div>
		</main>
	);
}