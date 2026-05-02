"use client";

import { useEffect, useRef } from "react";

/* Props for the PDF preview component. */
type PdfPreviewProps = {
	fileUrl: string;
};

/* Renders PDF pages into responsive canvas elements. */
export default function PdfPreview({ fileUrl }: PdfPreviewProps) {
	/* Container where the PDF canvases are inserted. */
	const containerRef = useRef<HTMLDivElement | null>(null);

	/* Tracks the newest render so older renders can stop safely. */
	const renderIdRef = useRef(0);

	/* Stores the resize delay so resizing can be debounced. */
	const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		/* Prevents rendering after the component unmounts. */
		let unmounted = false;

		/* Loads the PDF and renders each page into the preview container. */
		async function renderPdf() {
			const container = containerRef.current;
			if (!container || unmounted) return;

			/* Starts a new render attempt. */
			const renderId = ++renderIdRef.current;

			/* Removes old canvases before drawing the updated preview. */
			container.innerHTML = "";

			try {
				/* Load PDF.js from the public folder at runtime. */
				const pdfjsPath = "/pdfjs/pdf.min.mjs";
				const pdfjsLib = (await import(/* webpackIgnore: true */ pdfjsPath)) as any;

				/* Stop if this render is outdated. */
				if (unmounted || renderId !== renderIdRef.current) return;

				/* Set the PDF.js worker path. */
				pdfjsLib.GlobalWorkerOptions.workerSrc =
					"/pdfjs/pdf.worker.min.mjs";

				/* Load the PDF file. */
				const loadingTask = pdfjsLib.getDocument(fileUrl);
				const pdf = await loadingTask.promise;

				/* Stop if this render is outdated. */
				if (unmounted || renderId !== renderIdRef.current) return;

				/* Render every page in the PDF. */
				for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
					if (unmounted || renderId !== renderIdRef.current) return;

					/* Load the current PDF page. */
					const page = await pdf.getPage(pageNum);

					const currentContainer = containerRef.current;
					if (!currentContainer || unmounted || renderId !== renderIdRef.current) return;

					/* Use the container width to fit the preview. */
					const containerWidth = currentContainer.clientWidth || 900;

					/* Get the original page dimensions. */
					const unscaledViewport = page.getViewport({ scale: 1 });

					/* Limit scale so the preview stays readable without oversized canvases. */
					const fitScale = containerWidth / unscaledViewport.width;
					const scale = Math.min(fitScale, 1.5);

					/* Create the scaled viewport for rendering. */
					const viewport = page.getViewport({ scale });

					/* Create a canvas for this PDF page. */
					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d");
					if (!context) continue;

					/* Match the canvas resolution to the PDF page size. */
					canvas.width = Math.floor(viewport.width);
					canvas.height = Math.floor(viewport.height);

					/* Make the canvas responsive inside the page. */
					canvas.style.width = "100%";
					canvas.style.height = "auto";
					canvas.style.display = "block";
					canvas.style.margin = "0 auto 1.5rem auto";
					canvas.style.background = "white";

					/* Add the canvas before rendering into it. */
					currentContainer.appendChild(canvas);

					/* Draw the PDF page into the canvas. */
					await page.render({
						canvas,
						canvasContext: context,
						viewport,
					}).promise;

					/* Stop if another render started during this page render. */
					if (unmounted || renderId !== renderIdRef.current) return;
				}
			} catch (error) {
				/* Ignore errors from old renders. */
				if (unmounted || renderId !== renderIdRef.current) return;

				/* Log the issue and show fallback content. */
				console.error("Failed to render PDF preview:", error);

				const currentContainer = containerRef.current;
				if (!currentContainer) return;

				/* Fallback shown when the preview cannot render. */
				currentContainer.innerHTML = `
					<div style="text-align:center; padding: 2rem 0; color: #57534e;">
						<p style="margin-bottom: 1rem;">Use the button above to open our menu. A preview will appear when supported.</p>
					</div>
				`;
			}
		}

		/* Render once when the component loads. */
		renderPdf();

		/* Re-render after resize so the preview fits the new width. */
		const handleResize = () => {
			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current);
			}

			/* Wait briefly before rerendering during resize. */
			resizeTimeoutRef.current = setTimeout(() => {
				renderPdf();
			}, 150);
		};

		window.addEventListener("resize", handleResize);

		/* Cleanup timers, listeners, and active renders. */
		return () => {
			unmounted = true;
			renderIdRef.current += 1;

			if (resizeTimeoutRef.current) {
				clearTimeout(resizeTimeoutRef.current);
			}

			window.removeEventListener("resize", handleResize);
		};
	}, [fileUrl]);

	/* Empty container filled by renderPdf. */
	return <div ref={containerRef} className="w-full" />;
}