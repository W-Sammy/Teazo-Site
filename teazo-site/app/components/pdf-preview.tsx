"use client";

import { useEffect, useRef } from "react";

type PdfPreviewProps = {
	fileUrl: string;
};

export default function PdfPreview({ fileUrl }: PdfPreviewProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
		let observer: IntersectionObserver | null = null;

		function showFallback() {
			const currentContainer = containerRef.current;
			if (!currentContainer) return;

			currentContainer.innerHTML = `
				<div style="text-align:center; padding: 2rem 0; color: #57534e;">
					<p style="margin-bottom: 1rem;">Preview unavailable in this browser.</p>
					<div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:center;">
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
						<a
							href="${fileUrl}"
							download
							style="
								display:inline-flex;
								align-items:center;
								justify-content:center;
								height:56px;
								min-width:190px;
								padding:0 24px;
								border:1px solid black;
								background:transparent;
								color:black;
								text-decoration:none;
								font-weight:600;
								letter-spacing:0.05em;
							"
						>
							DOWNLOAD PDF
						</a>
					</div>
				</div>
			`;
		}

		async function renderPdf() {
			const container = containerRef.current;
			if (!container) return;

			if (observer) {
				observer.disconnect();
				observer = null;
			}

			container.innerHTML = "";

			try {
				const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
				pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

				const loadingTask = pdfjsLib.getDocument(fileUrl);
				const pdf = await loadingTask.promise;

				const currentContainer = containerRef.current;
				if (!currentContainer || cancelled) return;

				const containerWidth = currentContainer.clientWidth || 900;
				const isMobile = window.innerWidth < 640;

				async function renderPageIntoHost(pageNum: number, host: HTMLDivElement) {
					if (cancelled || host.dataset.rendered === "true") return;

					const page = await pdf.getPage(pageNum);
					if (cancelled) return;

					const unscaledViewport = page.getViewport({ scale: 1 });
					const fitScale = containerWidth / unscaledViewport.width;
					const scale = isMobile
						? Math.min(fitScale, 1.0)
						: Math.min(fitScale, 1.5);

					const viewport = page.getViewport({ scale });

					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d");

					if (!context) return;

					canvas.width = Math.floor(viewport.width);
					canvas.height = Math.floor(viewport.height);
					canvas.style.width = "100%";
					canvas.style.height = "auto";
					canvas.style.display = "block";
					canvas.style.background = "white";

					host.innerHTML = "";
					host.appendChild(canvas);

					await page.render({
						canvas,
						canvasContext: context,
						viewport,
					}).promise;

					host.dataset.rendered = "true";
				}

				const pageHosts: HTMLDivElement[] = [];

				for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
					const pageHost = document.createElement("div");
					pageHost.dataset.page = String(pageNum);
					pageHost.dataset.rendered = "false";
					pageHost.style.margin = "0 auto 1.5rem auto";
					pageHost.style.background = "white";
					pageHost.style.minHeight = isMobile ? "320px" : "420px";
					pageHost.style.width = "100%";
					pageHost.style.display = "flex";
					pageHost.style.alignItems = "center";
					pageHost.style.justifyContent = "center";

					const loadingLabel = document.createElement("p");
					loadingLabel.textContent = pageNum === 1 ? "Loading preview..." : "Load page...";
					loadingLabel.style.color = "#57534e";
					loadingLabel.style.fontSize = "0.95rem";

					pageHost.appendChild(loadingLabel);
					currentContainer.appendChild(pageHost);
					pageHosts.push(pageHost);
				}

				if (pageHosts.length > 0) {
					await renderPageIntoHost(1, pageHosts[0]);
				}

				if ("IntersectionObserver" in window) {
					observer = new IntersectionObserver(
						(entries) => {
							for (const entry of entries) {
								if (!entry.isIntersecting) continue;

								const host = entry.target as HTMLDivElement;
								const pageNum = Number(host.dataset.page);

								if (!host.dataset.rendered || host.dataset.rendered === "false") {
									renderPageIntoHost(pageNum, host);
								}
							}
						},
						{
							rootMargin: "300px 0px",
							threshold: 0.01,
						}
					);

					for (let i = 1; i < pageHosts.length; i++) {
						observer.observe(pageHosts[i]);
					}
				} else {
					for (let i = 1; i < pageHosts.length; i++) {
						await renderPageIntoHost(i + 1, pageHosts[i]);
					}
				}
			} catch (error) {
				console.error("Failed to render PDF preview:", error);
				showFallback();
			}
		}

		renderPdf();

		const handleResize = () => {
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}

			resizeTimeout = setTimeout(() => {
				renderPdf();
			}, 200);
		};

		window.addEventListener("resize", handleResize);

		return () => {
			cancelled = true;

			if (observer) {
				observer.disconnect();
			}

			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}

			window.removeEventListener("resize", handleResize);
		};
	}, [fileUrl]);

	return <div ref={containerRef} className="w-full" />;
}