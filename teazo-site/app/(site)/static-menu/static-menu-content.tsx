"use client";

import { useEffect, useState } from "react";
import { Montserrat } from "next/font/google";
import PdfPreview from "@/app/components/pdf-preview";

const montserrat = Montserrat({
	subsets: ["latin"],
	weight: ["400", "700"],
});

export default function StaticMenuContent() {
	const [shouldRenderPreview, setShouldRenderPreview] = useState(false);
	const [previewFailed, setPreviewFailed] = useState(false);

	useEffect(() => {
		const isMobile = window.innerWidth < 640;
		const userAgent = navigator.userAgent;

		const isSafari =
			/Safari/i.test(userAgent) &&
			!/Chrome/i.test(userAgent) &&
			!/CriOS/i.test(userAgent) &&
			!/Edg/i.test(userAgent) &&
			!/Android/i.test(userAgent);

		if (isMobile || isSafari) {
			setShouldRenderPreview(false);
			setPreviewFailed(true);
			return;
		}

		setShouldRenderPreview(true);
		setPreviewFailed(false);
	}, []);

	return (
		<>
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

			<p
				className={`${montserrat.className} mt-5 text-center text-sm leading-6 text-stone-600`}
			>
				{previewFailed
					? "Use the button above to open our menu."
					: "Use the button above to open our menu. A preview will appear when supported."}
			</p>

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