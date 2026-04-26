"use client";

import { useEffect, useState } from "react";
import { Montserrat } from "next/font/google";
import PdfPreview from "@/app/components/pdf-preview";

/* Font used for the button and helper text. */
const montserrat = Montserrat({
	subsets: ["latin"],
	weight: ["400", "700"],
});

/* Handles the PDF button and optional preview. */
export default function StaticMenuContent() {
	/* Controls whether the PDF preview appears. */
	const [shouldRenderPreview, setShouldRenderPreview] = useState(false);

	/* Tracks whether the preview is unavailable or failed. */
	const [previewFailed, setPreviewFailed] = useState(false);

	useEffect(() => {
		/* Disable preview on small screens. */
		const isMobile = window.innerWidth < 640;

		/* Used to detect browsers with preview issues. */
		const userAgent = navigator.userAgent;

		/* Detect Safari while excluding Chrome, Edge, and Android. */
		const isSafari =
			/Safari/i.test(userAgent) &&
			!/Chrome/i.test(userAgent) &&
			!/CriOS/i.test(userAgent) &&
			!/Edg/i.test(userAgent) &&
			!/Android/i.test(userAgent);

		/* Use the PDF button only on mobile and Safari. */
		if (isMobile || isSafari) {
			setShouldRenderPreview(false);
			setPreviewFailed(true);
			return;
		}

		/* Enable preview for supported desktop browsers. */
		setShouldRenderPreview(true);
		setPreviewFailed(false);
	}, []);

	return (
		<>
			{/* Opens the PDF in a new tab. */}
			<div className="mt-8 flex w-full justify-center">
				<a
					href="/teazo-menu.pdf"
					target="_blank"
					rel="noopener noreferrer"
					className={`${montserrat.className} inline-flex h-[70px] min-w-[213px] items-center justify-center bg-black px-8 text-[18px] font-semibold tracking-[0.05em] text-white transition-colors hover:bg-[#FFBDC7] hover:text-black`}
				>
					OPEN PDF
				</a>
			</div>

			{/* Shows a message based on preview support. */}
			<p
				className={`${montserrat.className} mt-5 text-center text-sm leading-6 text-stone-600`}
			>
				{previewFailed
					? "Use the button above to open our menu."
					: "Use the button above to open our menu. A preview will appear when supported."}
			</p>

			{/* Renders the PDF preview when supported. */}
			{shouldRenderPreview && (
				<div className="mt-10 w-full max-w-[900px]">
					<PdfPreview
						fileUrl="/teazo-menu.pdf"
						onPreviewError={() => setPreviewFailed(true)}
						onPreviewSuccess={() => setPreviewFailed(false)}
					/>
				</div>
			)}
		</>
	);
}