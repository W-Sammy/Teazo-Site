"use client";

import { useEffect, useRef } from "react";

type PdfPreviewProps = {
	fileUrl: string;
	onPreviewError?: () => void;
	onPreviewSuccess?: () => void;
};

export default function PdfPreview({
	fileUrl,
	onPreviewError,
	onPreviewSuccess,
}: PdfPreviewProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function renderPdf() {
			const container = containerRef.current;
			if (!container) return;

			container.innerHTML = "";

			try {
				// @ts-ignore runtime import from public folder
				const pdfjsLib = (await import(/* webpackIgnore: true */ "/pdfjs/pdf.min.mjs")) as any;

				pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

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

				onPreviewSuccess?.();
			} catch (error) {
				console.error("Failed to render PDF preview:", error);
				onPreviewError?.();

				const currentContainer = containerRef.current;
				if (!currentContainer) return;

				currentContainer.innerHTML = `
					<div style="text-align:center; padding: 2rem 0; color: #57534e;">
						<p style="margin-bottom: 1rem;">Use the buttons above to open or download our menu. A preview will appear when supported.</p>
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
	}, [fileUrl, onPreviewError, onPreviewSuccess]);

	return <div ref={containerRef} className="w-full" />;
}