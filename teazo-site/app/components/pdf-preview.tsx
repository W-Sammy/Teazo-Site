"use client";

import { useEffect, useRef } from "react";

type PdfPreviewProps = {
	fileUrl: string;
};

export default function PdfPreview({ fileUrl }: PdfPreviewProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function renderPdf() {
			const container = containerRef.current;
			if (!container) return;

			container.innerHTML = "";

			try {
				const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
				pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

				const loadingTask = pdfjsLib.getDocument(fileUrl);
				const pdf = await loadingTask.promise;

				for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
					if (cancelled) return;

					const page = await pdf.getPage(pageNum);

					const currentContainer = containerRef.current;
					if (!currentContainer) return;

					const containerWidth = currentContainer.clientWidth || 900;
					const unscaledViewport = page.getViewport({ scale: 1 });

					const isMobile = window.innerWidth < 640;
					const fitScale = containerWidth / unscaledViewport.width;

					const scale = isMobile
						? Math.min(fitScale, 1.0)
						: Math.min(fitScale, 1.5);

					const viewport = page.getViewport({ scale });

					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d");

					if (!context) continue;

					canvas.width = Math.floor(viewport.width);
					canvas.height = Math.floor(viewport.height);
					canvas.style.width = "100%";
					canvas.style.height = "auto";
					canvas.style.display = "block";
					canvas.style.margin = "0 auto 1.5rem auto";
					canvas.style.background = "white";

					currentContainer.appendChild(canvas);

					await page.render({
						canvas,
						canvasContext: context,
						viewport,
					}).promise;
				}
			} catch (error) {
				console.error("Failed to render PDF preview:", error);

				const currentContainer = containerRef.current;
				if (!currentContainer) return;

				currentContainer.innerHTML = `
					<div style="text-align:center; padding: 2rem 0; color: #57534e;">
						<p style="margin-bottom: 1rem;">Unable to load PDF preview on this device.</p>
						<a
							href="${fileUrl}"
							target="_blank"
							rel="noopener noreferrer"
							style="
								display:inline-flex;
								align-items:center;
								justify-content:center;
								height:56px;
								min-width:190px;
								padding:0 24px;
								background:black;
								color:white;
								text-decoration:none;
								font-weight:600;
								letter-spacing:0.05em;
							"
						>
							OPEN PDF
						</a>
					</div>
				`;
			}
		}

		renderPdf();

		const handleResize = () => {
			renderPdf();
		};

		window.addEventListener("resize", handleResize);

		return () => {
			cancelled = true;
			window.removeEventListener("resize", handleResize);
		};
	}, [fileUrl]);

	return <div ref={containerRef} className="w-full" />;
}