/**
 * Admin delivery browser tests. Uses the real local admin page and a saved login.
 * Website-content saves are intercepted; no database records are changed.
 * These tests check browser interactions and outgoing save data, not database persistence.
 */
import { existsSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

// use local login file
const adminStatePath = process.env.TEAZO_E2E_ADMIN_STORAGE_STATE;
const hasAdminState = Boolean(adminStatePath && existsSync(adminStatePath));
test.use({
    baseURL: process.env.TEAZO_E2E_BASE_URL || "http://localhost:3000",
    storageState: hasAdminState && adminStatePath ? adminStatePath : { cookies: [], origins: [] },
    serviceWorkers: "block",
});

type Link = { id: string; label: string; url: string; enabled: boolean };
type Patch = { deliveryLinks?: Link[] };

async function mockSaves(page: Page) {
    const state = { writes: [] as Patch[], failSaves: false };

    // block unrelated writes, matching the carousel example
    await page.route("**/*", async (route) => {
        if (["GET", "HEAD", "OPTIONS"].includes(route.request().method()))
            await route.continue();
        else 
            await route.abort("blockedbyclient");
    });

    // shared hook initializes carousel settings even while editing delivery
    await page.route("**/api/admin/website-content/carousel", async (route) => {
        if (route.request().method() === "PATCH" && route.request().postDataJSON()?.action === "initialize-defaults")
            await route.fulfill({ json: { success: true, images: [] } });
        else
            await route.abort("blockedbyclient");
    });

    // later registered routes take priority over the write blocker above
    await page.route("**/api/website-content", async (route) => {
        if (route.request().method() !== "PATCH") {
            await route.fallback();
            return;
        }
        const body = route.request().postDataJSON() as Patch;
        // only a delivery-only patch is allowed in this suite
        if (!Array.isArray(body.deliveryLinks) || Object.keys(body).some((key) => key !== "deliveryLinks")) {
            await route.abort("blockedbyclient");
            return;
        }
        state.writes.push(body);
        await route.fulfill(state.failSaves
            ? { status: 503, json: { error: "Synthetic delivery save failure" } }
            : { status: 200, json: body });
    });
    return state;
}

async function openEditor(page: Page, mobile = false) {
    await page.goto("/admin/website-content");
    if (new URL(page.url()).pathname === "/login")
        throw new Error("The saved admin session is missing or expired. Export a fresh local session.");

    await expect(page.getByRole("heading", { name: "Website Content", exact: true })).toBeVisible();
    if (mobile)
        await page.locator("#website-content-section").selectOption("delivery");
    else
        await page.locator("#section-heading-delivery").click();

    const panel = page.locator("#section-panel-delivery");
    await expect(panel).toBeVisible();

    return panel;
}

async function addDraft(panel: Locator) {
    const names = panel.getByLabel("Delivery platform name", { exact: true });
    const count = await names.count();
    await panel.getByRole("button", { name: "New Delivery Link +", exact: true }).click();
    await expect(names).toHaveCount(count + 1);

    return {
        name: names.nth(count),
        url: panel.locator('input[type="url"]').nth(count), // select only delivery url inputs inside this section
    };
}

// register the response wait before the action so a quick save isn't missed
async function expectSave(page: Page, action: () => Promise<unknown>, status = 200) {
    const response = page.waitForResponse((res) =>
        new URL(res.url()).pathname === "/api/website-content" && res.request().method() === "PATCH",
    );

    await action();
    expect((await response).status()).toBe(status);
}

test.beforeEach(() => {
    test.skip(!hasAdminState, "Set TEAZO_E2E_ADMIN_STORAGE_STATE to your local saved admin session.");
});

test.describe("Admin delivery browser interactions", () => {
    test("adds a blank draft without saving it", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);

        // control browser time so the negative save check covers the debounce period too
        await page.clock.install();

        const draft = await addDraft(panel);
        await draft.url.focus();
        await draft.url.press("Tab");
        await page.clock.runFor(1000);

        await expect(draft.name).toHaveValue("");
        await expect(draft.url).toHaveValue("");
        await expect(panel.getByText(/A platform name is required/)).toHaveCount(0);
        await expect(panel.getByText(/A link is required/)).toHaveCount(0);

        expect(state.writes).toEqual([]);
    });

    test("shows the required name error when the URL is entered first", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addDraft(panel);

        await draft.url.fill("https://example.com/order");
        await expect(panel.getByText(/A platform name is required/)).toBeVisible();
        await expect(draft.name).toHaveAttribute("aria-invalid", "true");

        expect(state.writes).toEqual([]);
    });

    test("adds a complete platform and submits its name and URL", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addDraft(panel);

        await draft.name.fill("Browser Delivery");
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/browser");
            await draft.url.press("Tab");
        });

        await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();

        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({
            label: "Browser Delivery", url: "https://example.com/browser", enabled: true,
        }));
    });

    for (const invalidUrl of ["tea@example.com", "mailto:tea@example.com", "example.com", "not a link"]) {
        test(`rejects an invalid delivery URL: ${invalidUrl}`, async ({ page }) => {
            const state = await mockSaves(page);
            const panel = await openEditor(page);

            // control browser time so the negative save check covers the debounce period too
            await page.clock.install();

            const draft = await addDraft(panel);
            await draft.name.fill("Browser Delivery");
            await draft.url.fill(invalidUrl);
            await draft.url.press("Tab");

            await expect(panel.getByText("Please enter a valid http:// or https:// link")).toBeVisible();
            await expect(draft.url).toHaveAttribute("aria-invalid", "true");
            await page.clock.runFor(1000);

            expect(state.writes).toEqual([]);
        });
    }

    test("enforces the name limit during browser typing and pasted-text insertion", async ({ page }) => {
        await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addDraft(panel);
        const longName = "abcdefghijklmnopq";

        await draft.name.pressSequentially(longName);
        await expect(draft.name).toHaveValue(longName.slice(0, 16));

        await draft.name.fill("");
        await draft.name.focus();

        // insertText check browser text insertion without depending on operating system clipboard
        await page.keyboard.insertText(longName);
        await expect(draft.name).toHaveValue(longName.slice(0, 16));
    });

    test("edits, hides, restores and removes a synthetic platform", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const initialCount = await panel.getByLabel("Delivery platform name", { exact: true }).count();
        const draft = await addDraft(panel);

        await draft.name.fill("Browser Delivery");
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/browser");
            await draft.url.press("Tab");
        });

        const id = state.writes.at(-1)?.deliveryLinks?.at(-1)?.id;
        expect(id).toBeTruthy();

        await expectSave(page, async () => {
            await draft.name.fill("Edited Delivery");
            await draft.name.press("Tab");
        });
        expect(state.writes.at(-1)?.deliveryLinks?.find((link) => link.id === id)?.label).toBe("Edited Delivery");

        const toggle = panel.getByRole("switch", { name: "Show Edited Delivery on the delivery page", exact: true });
        await expectSave(page, () => toggle.click());
        await expect(toggle).toHaveAttribute("aria-checked", "false");

        expect(state.writes.at(-1)?.deliveryLinks?.find((link) => link.id === id)?.enabled).toBe(false);

        await expectSave(page, () => toggle.click());
        await expect(toggle).toHaveAttribute("aria-checked", "true");

        await expectSave(page, () => panel.getByRole("button", { name: "Remove Edited Delivery", exact: true }).click());
        await expect(panel.getByLabel("Delivery platform name", { exact: true })).toHaveCount(initialCount);

        expect(state.writes.at(-1)?.deliveryLinks?.some((link) => link.id === id)).toBe(false);
    });

    test("shows a failed save and recovers after another valid edit", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addDraft(panel);

        await draft.name.fill("Browser Delivery");
        state.failSaves = true;

        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/browser");
            await draft.url.press("Tab");
        }, 503);
        await expect(page.getByRole("alert").filter({ hasText: "Synthetic delivery save failure" })).toBeVisible();

        state.failSaves = false;
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/retry");
            await draft.url.press("Tab");
        });
        await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
    });

    test("opens delivery on mobile and submits a complete platform", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });

        const state = await mockSaves(page);
        const panel = await openEditor(page, true);
        const draft = await addDraft(panel);

        await expect(draft.name).toBeVisible();
        await expect(draft.url).toBeVisible();
        
        await draft.name.fill("Mobile Delivery");
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/mobile");
            await draft.url.press("Tab");
        });

        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({ label: "Mobile Delivery" }));
    });
});

test.describe("Additional mocked delivery browser interactions", () => {
    for (const field of ["name", "url"] as const) {
        test(`does not save after a previously valid ${field} is cleared`, async ({ page }) => {
            const state = await mockSaves(page);
            const panel = await openEditor(page);
            const draft = await addCompleteMockDraft(page, panel, "Clear Delivery", "https://example.com/clear");

            await pauseSaveTimers(page);
            const previousSaves = state.writes.length;
            await draft[field].fill("");
            await draft[field].press("Tab");

            const message = field === "name" ? /A platform name is required/ : /A link is required/;
            await expect(panel.getByText(message)).toBeVisible();
            await expect(draft[field]).toHaveAttribute("aria-invalid", "true");

            // move past the save delay to check that incomplete data is still not submitted
            await page.clock.runFor(1000);
            expect(state.writes).toHaveLength(previousSaves);
        });
    }

    test("clears an invalid URL error and submits the corrected URL", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addDraft(panel);
        await draft.name.fill("Fixed Delivery");
        await draft.url.fill("tea@example.com");
        await draft.url.press("Tab");
        await expect(panel.getByText("Please enter a valid http:// or https:// link")).toBeVisible();
        expect(state.writes).toEqual([]);

        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/corrected");
            await draft.url.press("Tab");
        });

        await expect(panel.getByText("Please enter a valid http:// or https:// link")).toHaveCount(0);
        await expect(draft.url).toHaveAttribute("aria-invalid", "false");
        await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({
            label: "Fixed Delivery", url: "https://example.com/corrected", enabled: true,
        }));
    });

    test("edits a second platform without changing the first platform or its save data", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const first = await addCompleteMockDraft(page, panel, "First Mock", "https://example.com/first-mock");
        const firstSaved = state.writes.at(-1)?.deliveryLinks?.at(-1);
        expect(firstSaved).toBeTruthy();
        const second = await addCompleteMockDraft(page, panel, "Second Mock", "https://example.com/second-mock");

        await expectSave(page, async () => {
            await second.url.fill("https://example.com/second-edited");
            await second.url.press("Tab");
        });

        await expect(first.name).toHaveValue("First Mock");
        await expect(first.url).toHaveValue("https://example.com/first-mock");
        await expect(second.url).toHaveValue("https://example.com/second-edited");
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(firstSaved);
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({
            label: "Second Mock", url: "https://example.com/second-edited", enabled: true,
        }));
    });

    test("discards a waiting valid URL save if the same field becomes invalid before leaving it", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addCompleteMockDraft(page, panel, "Queued Delivery", "https://example.com/original");

        await pauseSaveTimers(page);
        const previousSaves = state.writes.length;
        await draft.url.fill("https://example.com/waiting");
        // stay in the same field so a valid edit is not flushed by leaving it before the invalid edit
        await draft.url.fill("tea@example.com");
        await draft.url.press("Tab");
        await expect(panel.getByText("Please enter a valid http:// or https:// link")).toBeVisible();
        await page.clock.runFor(1000);

        // neither the invalid url nor the older waiting url should be submitted
        expect(state.writes).toHaveLength(previousSaves);
        await expect(draft.url).toHaveValue("tea@example.com");
    });
});

// create a complete item
async function addCompleteMockDraft(page: Page, panel: Locator, label: string, url: string) {
    const draft = await addDraft(panel);
    await draft.name.fill(label);
    await expectSave(page, async () => {
        await draft.url.fill(url);
        await draft.url.press("Tab");
    });
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
    return draft;
}

async function pauseSaveTimers(page: Page) {
    await page.clock.install();
    // advance the browser clock and pause it; this does not wait a real minute since
    await page.clock.pauseAt(new Date(Date.now() + 60_000)); // pausing prevents the typing delay from expiring between our next two input actions
}