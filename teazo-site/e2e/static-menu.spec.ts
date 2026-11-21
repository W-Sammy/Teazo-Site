import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const MENU_PAGE_PATH = process.env.TEAZO_E2E_STATIC_MENU_PATH || "/static-menu";
const PDF_PATH = "/api/menu/pdf";
const FALLBACK = "Use the button above to open our menu. A preview will appear when supported.";

test.use({
    baseURL: process.env.TEAZO_E2E_BASE_URL || "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36",
});

const TEST_PDF = readFileSync("public/teazo-menu.pdf");

type PdfMode = "success" | "missing" | "corrupt" | "module-error";

async function mockPdf(context: BrowserContext, mode: PdfMode = "success") {
    const state = { pdfReads: 0 };

    await context.route("**/*", async (route) => {
        if (["GET", "HEAD", "OPTIONS"].includes(route.request().method()))
            await route.continue();
        else
            await route.abort("blockedbyclient");
    });

    // context routing also catches requests made by the new PDF tab
    await context.route((url) => url.pathname === PDF_PATH, async (route) => {
        const request = route.request();
        if (!["GET", "HEAD"].includes(request.method())) {
            await route.abort("blockedbyclient");
            return;
        }

        if (request.isNavigationRequest()) {
            await route.fulfill({
                contentType: "text/html",
                body: "<!doctype html><html><head><title>Test menu destination</title></head><body><h1>Test menu destination</h1></body></html>",
            });
            return;
        }

        state.pdfReads++;
        if (mode === "missing")
            await route.fulfill({ status: 404, contentType: "text/plain", body: "Test PDF not found" });
        else {
            await route.fulfill({
                contentType: "application/pdf",
                body: mode === "corrupt" ? Buffer.from("This deliberately is not a PDF.") : TEST_PDF,
            });
        }
    });

    if (mode === "module-error") {
        await context.route((url) => url.pathname === "/pdfjs/pdf.min.mjs", (route) =>
            route.fulfill({ status: 404, contentType: "text/plain", body: "Test module not found" }),
        );
    }

    return state;
}

async function openMenu(page: Page) {
    const response = await page.goto(MENU_PAGE_PATH, { waitUntil: "load" });
    expect(response?.ok(), "the static menu route should load successfully").toBe(true);
    const heading = page.getByRole("heading", { name: "MENU", exact: true });
    await expect(heading).toBeVisible();

    return heading.locator("xpath=ancestor::main[1]");
}

function openPdfLink(main: Locator) {
    return main.getByRole("link", { name: "OPEN PDF", exact: true });
}

async function expectDrawnPages(main: Locator) {
    const canvases = main.locator("canvas");
    await expect(canvases).toHaveCount(1);

    await expect.poll(() => canvases.evaluateAll((elements) => elements.every((element) => {
        const canvas = element as HTMLCanvasElement;
        const context = canvas.getContext("2d");
        if (!context || canvas.width === 0 || canvas.height === 0) 
            return false;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] > 0 && pixels[index] < 100 && pixels[index + 1] < 100 && pixels[index + 2] < 100) 
                return true;
        }
        return false;
    })), { message: "the menu PDF page should contain drawn content", timeout: 15_000 }).toBe(true);
    return canvases;
}

async function openPdfTab(page: Page, main: Locator, keyboard = false) {
    const originalUrl = page.url();
    const link = openPdfLink(main);
    const expectedUrl = new URL(PDF_PATH, originalUrl).href;

    const popupPromise = page.waitForEvent("popup");
    if (keyboard) 
        await link.press("Enter");
    else 
        await link.click();

    const popup = await popupPromise;

    try {
        await expect(popup).toHaveURL(expectedUrl);
        await expect(popup.getByRole("heading", { name: "Test menu destination", exact: true })).toBeVisible();
        await expect(page).toHaveURL(originalUrl);
        await expect(openPdfLink(main)).toBeVisible();
    } finally {
        await popup.close();
    }
}

async function letBrowserPaint(page: Page) {
    await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
}

test.describe("public static menu page", () => {
    test("opens without logging in and shows its title, heading, and instructions", async ({ page, context }) => {
        await mockPdf(context);
        const main = await openMenu(page);

        await expect(page).toHaveTitle("Menu");
        await expect(main.getByText("View the TEAZO menu below or download a copy for offline viewing.", { exact: true })).toBeVisible();
        await expect(main.getByText("Use the button above to open our menu.", { exact: true })).toBeVisible();
        await expect(openPdfLink(main)).toBeVisible();
    });

    test("shows a successfully loaded TEAZO logo", async ({ page, context }) => {
        await mockPdf(context);
        const logo = (await openMenu(page)).getByAltText("TEAZO logo", { exact: true });
        await expect(logo).toBeVisible();

        await expect.poll(() => logo.evaluate((element) => {
            const image = element as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
        })).toBe(true);
    });

    test("the PDF link has the correct URL and safe new-tab settings", async ({ page, context }) => {
        await mockPdf(context);
        const link = openPdfLink(await openMenu(page));

        await expect(link).toHaveAttribute("href", PDF_PATH);
        await expect(link).toHaveAttribute("target", "_blank");
        const rel = (await link.getAttribute("rel"))?.split(/\s+/) || [];
        expect(rel).toContain("noopener");
        expect(rel).toContain("noreferrer");
    });

    test("draws the menu PDF page on desktop", async ({ page, context }) => {
        const state = await mockPdf(context);
        const main = await openMenu(page);

        await expectDrawnPages(main);
        expect(state.pdfReads).toBeGreaterThan(0);
        await expect(main.getByText(FALLBACK, { exact: true })).toHaveCount(0);
    });

    test("clicking OPEN PDF opens the correct new tab and preserves the menu tab", async ({ page, context }) => {
        await mockPdf(context);
        const main = await openMenu(page);
        await openPdfTab(page, main);
    });

    test("the PDF link can receive Tab focus and open with Enter", async ({ page, context }) => {
        await mockPdf(context);
        const main = await openMenu(page);
        const link = openPdfLink(main);

        await link.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(link).toBeFocused();
        await openPdfTab(page, main, true);
    });

    test("hovering changes the button from black to pink without changing its URL", async ({ page, context }) => {
        await mockPdf(context);
        const main = await openMenu(page);
        const button = main.getByRole("button", { name: "OPEN PDF", exact: true });
        await page.mouse.move(0, 0);
        await expect(button).toHaveCSS("background-color", "rgb(0, 0, 0)");

        await button.hover();
        await expect(button).toHaveCSS("background-color", "rgb(255, 189, 199)");
        await expect(openPdfLink(main)).toHaveAttribute("href", PDF_PATH);
    });

    test("refreshing keeps the PDF button and redraws the preview", async ({ page, context }) => {
        await mockPdf(context);
        await expectDrawnPages(await openMenu(page));

        await page.reload({ waitUntil: "load" });
        const main = page.getByRole("heading", { name: "MENU", exact: true }).locator("xpath=ancestor::main[1]");
        await expect(openPdfLink(main)).toHaveAttribute("href", PDF_PATH);
        await expectDrawnPages(main);
    });

    test("resizing a desktop preview redraws the menu page to fit without duplicates", async ({ page, context }) => {
        await mockPdf(context);
        const main = await openMenu(page);
        const canvases = await expectDrawnPages(main);
        const oldWidth = await canvases.first().evaluate((canvas) => (canvas as HTMLCanvasElement).width);

        await page.setViewportSize({ width: 900, height: 900 });
        await expect.poll(() => main.locator("canvas").first().evaluate((canvas) =>
            (canvas as HTMLCanvasElement).width,
        )).not.toBe(oldWidth);
        const resized = await expectDrawnPages(main);

        for (let index = 0; index < await resized.count(); index++) {
            const box = await resized.nth(index).boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width).toBeLessThanOrEqual(901);
        }
    });

    for (const mode of ["missing", "corrupt", "module-error"] as const) {
        test(`shows fallback instructions when PDF loading fails: ${mode}`, async ({ page, context }) => {
            await mockPdf(context, mode);
            const main = await openMenu(page);

            await expect(main.getByText(FALLBACK, { exact: true })).toBeVisible({ timeout: 15_000 });
            await expect(main.locator("canvas")).toHaveCount(0);
            await expect(openPdfLink(main)).toBeVisible();
            await openPdfTab(page, main);
        });
    }

    for (const width of [390, 639, 640]) {
        test(`uses the correct preview behavior and usable button at ${width}px`, async ({ page, context }) => {
            await page.setViewportSize({ width, height: 844 });
            const state = await mockPdf(context);
            const main = await openMenu(page);

            if (width < 640) {
                await letBrowserPaint(page);
                await expect(main.locator("canvas")).toHaveCount(0);
            } else
                await expectDrawnPages(main);

            const link = openPdfLink(main);
            await link.scrollIntoViewIfNeeded();
            const box = await link.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
            await openPdfTab(page, main);
            if (width < 640) {
                expect(state.pdfReads).toBe(0);
                await expect(main.getByText(FALLBACK, { exact: true })).toHaveCount(0);
            }
        });
    }

    test("Safari detection hides the desktop preview while keeping OPEN PDF usable", async ({ page, context }) => {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "userAgent", {
                configurable: true,
                get: () => "Mozilla/5.0 Version/18.0 Safari/605.1.15",
            });
        });
        const state = await mockPdf(context);
        const main = await openMenu(page);
        await letBrowserPaint(page);

        await expect(main.locator("canvas")).toHaveCount(0);
        await openPdfTab(page, main);
        expect(state.pdfReads).toBe(0);
        await expect(main.getByText(FALLBACK, { exact: true })).toHaveCount(0);
    });
});
