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
	const renderIdRef = useRef(0);
	const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let unmounted = false;

		async function renderPdf() {
			const container = containerRef.current;
			if (!container || unmounted) return;

			const renderId = ++renderIdRef.current;
			container.innerHTML = "";

			try {
				// @ts-ignore runtime import from public folder
				const pdfjsLib = (await import(/* webpackIgnore: true */ "/pdfjs/pdf.min.mjs")) as any;

				if (unmounted || renderId !== renderIdRef.current) return;

				pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

				const loadingTask = pdfjsLib.getDocument(fileUrl);
				const pdf = await loadingTask.promise;

				if (unmounted || renderId !== renderIdRef.current) return;

				for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
					if (unmounted || renderId !== renderIdRef.current) return;

					const page = await pdf.getPage(pageNum);

					const currentContainer = containerRef.current;
					if (!currentContainer || unmounted || renderId !== renderIdRef.current) return;

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

					if (unmounted || renderId !== renderIdRef.current) return;
				}

				if (!unmounted && renderId === renderIdRef.current) {
					onPreviewSuccess?.();
				}
			} catch (error) {
				if (unmounted || renderId !== renderIdRef.current) return;

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
			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current);
			}

			resizeTimeoutRef.current = setTimeout(() => {
				renderPdf();
			}, 150);
		};

		window.addEventListener("resize", handleResize);

		return () => {
			unmounted = true;
			renderIdRef.current += 1;

			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current);
			}

			window.removeEventListener("resize", handleResize);
		};
	}, [fileUrl]);

	return <div ref={containerRef} className="w-full" />;
}