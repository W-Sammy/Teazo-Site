import { expect, test, type Locator, type Page } from "@playwright/test";

// run the website and its local database worker before starting these tests
test.use({
    baseURL: process.env.TEAZO_E2E_BASE_URL || "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
});

// these tests read the delivery links already saved in your website content
// keep at least one complete, visible delivery platform in your local content
// the unit tests cover hidden items, incomplete items, and empty content separately

async function openDelivery(page: Page) {
    const response = await page.goto("/delivery", { waitUntil: "domcontentloaded" });
    expect(response?.ok(), "the delivery page should load successfully").toBe(true);
    await expect(page).toHaveURL(/\/delivery\/?(?:[?#].*)?$/);
    await expect(page.getByRole("heading", { name: "DELIVERY", exact: true })).toBeVisible();

    return page.getByRole("heading", { name: "DELIVERY", exact: true })
        .locator("xpath=ancestor::main[1]");
}

async function deliveryButtons(main: Locator) {
    const buttons = main.getByRole("link");
    await expect(buttons.first(),
        "add at least one enabled delivery platform with a name and URL in local website content",
    ).toBeVisible();
    return buttons;
}

async function readButtons(buttons: Locator) {
    return buttons.evaluateAll((elements) => elements.map((element) => ({
        text: element.textContent?.trim() || "",
        href: (element as HTMLAnchorElement).href,
    })));
}

async function followButton(page: Page, button: Locator, keyboard = false) {
    const href = await button.getAttribute("href");
    expect(href, "each delivery button needs a URL").toBeTruthy();
    const destination = new URL(href!, page.url()).href;
    const target = await button.getAttribute("target");

    let destinationPage = page;
    if (target && !["_self", "_top", "_parent"].includes(target.toLowerCase())) {
        const popup = page.waitForEvent("popup");
        if (keyboard) 
            await button.press("Enter");
        else 
            await button.click();
        destinationPage = await popup;
    } else {
        if (keyboard) await button.press("Enter");
        else await button.click();
    }

    await expect(destinationPage).toHaveURL(destination);
    await expect(destinationPage.getByRole("heading", {
        name: "Mock delivery destination", exact: true,
    })).toBeVisible();

    if (destinationPage !== page) 
        await destinationPage.close();
}

test.describe("public delivery page", () => {
    test.beforeEach(async ({ context, baseURL }) => {
        const siteOrigin = new URL(baseURL!).origin;

        // context routing also catches navigation inside newly opened tabs
        await context.route("**/*", async (route) => {
            const request = route.request();

            // this suite never sends browser requests that could save website changes
            if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
                await route.abort("blockedbyclient");
                return;
            }

            const url = new URL(request.url());
            const isOtherPage = request.isNavigationRequest()
                && (url.origin !== siteOrigin || !/^\/delivery\/?$/.test(url.pathname));

            if (isOtherPage) {
                await route.fulfill({
                    status: 200,
                    contentType: "text/html",
                    body: "<!doctype html><html><head><title>Mock destination</title></head><body><h1>Mock delivery destination</h1></body></html>",
                });
                return;
            }

            await route.continue();
        });
    });

    test("opens without logging in and shows the page title and introductory text", async ({ page }) => {
        const main = await openDelivery(page);

        await expect(page).toHaveTitle("Delivery");
        await expect(main.getByRole("heading", { name: "HUNGRY AT HOME?", exact: true })).toBeVisible();
        await expect(main.getByRole("heading", { name: "WE DELIVER.", exact: true })).toBeVisible();
    });

    test("displays a successfully loaded TEAZO logo", async ({ page }) => {
        const main = await openDelivery(page);
        const logo = main.getByAltText("TEAZO logo", { exact: true });
        await expect(logo).toBeVisible();

        await expect.poll(() => logo.evaluate((element) => {
            const image = element as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
        }), { message: "the delivery logo file should finish loading successfully" }).toBe(true);
    });

    test("shows readable uppercase button labels and complete web URLs", async ({ page }) => {
        const main = await openDelivery(page);
        const buttons = await deliveryButtons(main);

        for (let index = 0; index < await buttons.count(); index++) {
            const button = buttons.nth(index);
            await expect(button).toBeVisible();
            await expect(button).toBeEnabled();
            const text = (await button.innerText()).trim();
            expect(text.length, "delivery buttons should have text").toBeGreaterThan(0);
            expect(text).toBe(text.toUpperCase());

            const href = await button.getAttribute("href");
            expect(href).toMatch(/^https?:\/\//i);
            expect(new URL(href!).hostname.length).toBeGreaterThan(0);
        }
    });

    test("clicking every delivery button opens its configured destination", async ({ page }) => {
        let main = await openDelivery(page);
        let buttons = await deliveryButtons(main);
        const originalButtons = await readButtons(buttons);

        for (let index = 0; index < originalButtons.length; index++) {
            if (index > 0) {
                main = await openDelivery(page);
                buttons = await deliveryButtons(main);
            }
            expect(await readButtons(buttons)).toEqual(originalButtons);
            await followButton(page, buttons.nth(index));
        }
    });

    test("a delivery button can be reached with Tab", async ({ page }) => {
        const buttons = await deliveryButtons(await openDelivery(page));
        const first = buttons.first();

        await first.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(first).toBeFocused();
    });

    test("Enter opens a focused delivery button's destination", async ({ page }) => {
        const buttons = await deliveryButtons(await openDelivery(page));
        const first = buttons.first();
        await first.focus();
        await expect(first).toBeFocused();
        await followButton(page, first, true);
    });

    test("hovering a button keeps its label and destination intact", async ({ page }) => {
        const buttons = await deliveryButtons(await openDelivery(page));
        const first = buttons.first();
        const text = await first.innerText();
        const href = await first.getAttribute("href");

        await first.hover();
        await expect(first).toHaveText(text);
        await expect(first).toHaveAttribute("href", href!);
    });

    test("refreshing preserves the displayed button labels, order, and URLs", async ({ page }) => {
        let main = await openDelivery(page);
        const beforeRefresh = await readButtons(await deliveryButtons(main));

        await page.reload({ waitUntil: "domcontentloaded" });
        main = page.getByRole("heading", { name: "DELIVERY", exact: true })
            .locator("xpath=ancestor::main[1]");
        await expect(main).toBeVisible();

        expect(await readButtons(await deliveryButtons(main))).toEqual(beforeRefresh);
    });

    for (const width of [390, 1280]) {
        test(`buttons fit and can be clicked at a ${width}px viewport width`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 });
            const buttons = await deliveryButtons(await openDelivery(page));

            for (let index = 0; index < await buttons.count(); index++) {
                const button = buttons.nth(index);
                await button.scrollIntoViewIfNeeded();
                await expect(button).toBeInViewport();
                const box = await button.boundingBox();
                expect(box, "each button should have a visible box").not.toBeNull();
                expect(box!.width).toBeGreaterThan(0);
                expect(box!.x).toBeGreaterThanOrEqual(-1);
                expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
            }

            await followButton(page, buttons.first());
        });
    }
});
