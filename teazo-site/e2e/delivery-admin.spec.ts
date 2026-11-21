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

// enabled is true for shown or false for hidden
type Link = { id: string; label: string; url: string; enabled: boolean };
type Patch = { deliveryLinks?: Link[] };

async function mockSaves(page: Page) {
    // writes records attempted delivery saves, including attempts that get a fake error
    const state = { writes: [] as Patch[], failSaves: false };
    await page.route("**/*", async (route) => {
        // allow read/information requests, includes checks whether the request method is in this list
        if (["GET", "HEAD", "OPTIONS"].includes(route.request().method()))
            await route.continue();
        else 
            await route.abort("blockedbyclient");
    });

    // shared hook initializes carousel settings while editing delivery
    await page.route("**/api/admin/website-content/carousel", async (route) => {
        // handle only the carousel initialization request
        if (route.request().method() === "PATCH" && route.request().postDataJSON()?.action === "initialize-defaults")
            // send mock successful response with an empty image list without saving carousel data
            await route.fulfill({ json: { success: true, images: [] } });
        else
            // block carousel writes
            await route.abort("blockedbyclient");
    });

    // later registered routes take priority over the write blocker above
    await page.route("**/api/website-content", async (route) => {
        if (route.request().method() !== "PATCH") {
            await route.fallback();
            return;
        }

        const body = route.request().postDataJSON() as Patch;
        // reject requests without a platform list or with extra fields belonging to other sections
        if (!Array.isArray(body.deliveryLinks) || Object.keys(body).some((key) => key !== "deliveryLinks")) {
            // block an unexpected update instead of letting it change unrelated content
            await route.abort("blockedbyclient");
            return;
        }
        // add the attempted save data to the list so the test can inspect it later
        state.writes.push(body);
        // 503 below pretends the service is unavailable; 200 pretends the save succeeded
        await route.fulfill(state.failSaves
            ? { status: 503, json: { error: "Synthetic delivery save failure" } }
            : { status: 200, json: body });
    });
    // give the test access to the same object that these request handlers update
    return state;
}

// open website content & select delivery
async function openEditor(page: Page, mobile = false) {
    await page.goto("/admin/website-content");
    // check whether the app sent us to login instead of allowing access to the editor
    if (new URL(page.url()).pathname === "/login")
        throw new Error("The saved admin session is missing or expired. Export a fresh local session.");

    await expect(page.getByRole("heading", { name: "Website Content", exact: true })).toBeVisible();
    // small screens use the section dropdown & desktop uses the delivery heading below
    if (mobile)
        await page.locator("#website-content-section").selectOption("delivery");
    else // click the desktop delivery section heading
        await page.locator("#section-heading-delivery").click();

    // keep a locator for just the delivery panel so later searches stay inside that section
    const panel = page.locator("#section-panel-delivery");
    // confirm that the selected section is actually visible before interacting with its inputs
    await expect(panel).toBeVisible();

    // return the panel locator so the test can find its controls
    return panel;
}

// click the add button & return locators for the newly appended row
async function addDraft(panel: Locator) {
    const names = panel.getByLabel("Delivery platform name", { exact: true });
    // remember how many rows existed before adding another one
    const count = await names.count();

    // find the add button by its role & accessible name before clicking it
    await panel.getByRole("button", { name: "New Delivery Link +", exact: true }).click();
    // wait until exactly one more platform name input is present
    await expect(names).toHaveCount(count + 1);

    return {
        name: names.nth(count),
        // use the same position to find the new row's url input
        url: panel.locator('input[type="url"]').nth(count), // select only delivery url inputs inside this section
    };
}

// register the response wait before the action so a quick save isn't missed
async function expectSave(page: Page, action: () => Promise<unknown>, status = 200) {
    const response = page.waitForResponse((res) =>
        // ignore unrelated responses & look only for website content update responses
        new URL(res.url()).pathname === "/api/website-content" && res.request().method() === "PATCH",
    );

    await action();
    // check for the response to the attempted save
    expect((await response).status()).toBe(status);
}

test.beforeEach(() => {
    // skip the test if no existing login file was supplied
    test.skip(!hasAdminState, "Set TEAZO_E2E_ADMIN_STORAGE_STATE to your local saved admin session.");
});

// tests
test.describe("Admin delivery browser interactions", () => {
    test("adds a blank draft without saving it", async ({ page }) => {
        // mock save handlers & keep their record of attempted saves
        const state = await mockSaves(page);
        const panel = await openEditor(page);

        // control browser time so the negative save check covers debounce period
        await page.clock.install();

        // add a row & keep its name & url input locators
        const draft = await addDraft(panel);
        await draft.url.focus();
        await draft.url.press("Tab");

        // advance browser timers by one sec
        await page.clock.runFor(1000);

        // confirm the new inputs are still empty
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

        // check that missing name message is visible to the user
        await expect(panel.getByText(/A platform name is required/)).toBeVisible();
        await expect(draft.name).toHaveAttribute("aria-invalid", "true");
        expect(state.writes).toEqual([]);
    });

    test("adds a complete platform and submits its name and URL", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addDraft(panel);
        await draft.name.fill("Browser Delivery");

        // wait for save response
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/browser");
            await draft.url.press("Tab");
        });

        // check that shared save status message reports success
        await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
        // look for an item with the listed fields
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({
            label: "Browser Delivery", url: "https://example.com/browser", enabled: true,
        }));
    });

    // run a separate test for each of these four invalid destinations
    for (const invalidUrl of ["tea@example.com", "mailto:tea@example.com", "example.com", "not a link"]) {
        test(`rejects an invalid delivery URL: ${invalidUrl}`, async ({ page }) => {
            const state = await mockSaves(page);
            const panel = await openEditor(page);

            // control browser time so the negative save check covers debounce period
            await page.clock.install();

            const draft = await addDraft(panel);
            await draft.name.fill("Browser Delivery");

            // try the current invalid value while keeping the name valid
            await draft.url.fill(invalidUrl);
            // leave url field
            await draft.url.press("Tab");

            // checks the url error is displayed
            await expect(panel.getByText("Please enter a valid http:// or https:// link")).toBeVisible();
            // confirm url input is also marked invalid
            await expect(draft.url).toHaveAttribute("aria-invalid", "true");

            // advance browser timers by one second
            await page.clock.runFor(1000);

            // an empty recorded save list means no delivery save was attempted
            expect(state.writes).toEqual([]);
        });
    }

    test("enforces the name limit during browser typing and pasted-text insertion", async ({ page }) => {
        await mockSaves(page);

        const panel = await openEditor(page);
        const draft = await addDraft(panel);
        // use 17 characters
        const longName = "abcdefghijklmnopq";

        // type character by character
        await draft.name.pressSequentially(longName);
        // slice(0, 16) takes the first 16 characters
        await expect(draft.name).toHaveValue(longName.slice(0, 16));

        // clear the input before checking
        await draft.name.fill("");
        // send keyboard insertion to this name input
        await draft.name.focus();

        // insertText check browser text insertion without depending on operating system clipboard
        await page.keyboard.insertText(longName);
        await expect(draft.name).toHaveValue(longName.slice(0, 16));
    });

    test("edits, hides, restores and removes a synthetic platform", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);

        // remember how many items are already present
        const initialCount = await panel.getByLabel("Delivery platform name", { exact: true }).count();
        const draft = await addDraft(panel);
        await draft.name.fill("Browser Delivery");

        // perform edits & wait for save response
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/browser");
            await draft.url.press("Tab");
        });

        // read generated id from the last item in the latest save
        const id = state.writes.at(-1)?.deliveryLinks?.at(-1)?.id;
        // confirm id was found before using it later 
        expect(id).toBeTruthy();

        await expectSave(page, async () => {
            await draft.name.fill("Edited Delivery");
            await draft.name.press("Tab");
        });

        // find item with this id, then checks its submitted name
        expect(state.writes.at(-1)?.deliveryLinks?.find((link) => link.id === id)?.label).toBe("Edited Delivery");

        // find this item's visibility switch using its accessible name; should now report as hidden
        const toggle = panel.getByRole("switch", { name: "Show Edited Delivery on the delivery page", exact: true });
        await expectSave(page, () => toggle.click());
        await expect(toggle).toHaveAttribute("aria-checked", "false");

        // save should hide the item rather than removing it
        expect(state.writes.at(-1)?.deliveryLinks?.find((link) => link.id === id)?.enabled).toBe(false);

        // after the second click, the switch should report on again
        await expectSave(page, () => toggle.click());
        await expect(toggle).toHaveAttribute("aria-checked", "true");

        // remove test item
        await expectSave(page, () => panel.getByRole("button", { name: "Remove Edited Delivery", exact: true }).click());
        await expect(panel.getByLabel("Delivery platform name", { exact: true })).toHaveCount(initialCount);

        // check whether any submitted item still has id
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
        // should show specific error text returned by above
        await expect(page.getByRole("alert").filter({ hasText: "Synthetic delivery save failure" })).toBeVisible();

        // switch save response back to success
        state.failSaves = false;
        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/retry");
            await draft.url.press("Tab");
        });
        // check that shared save status message reports success accepting the save
        await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
    });

    test("opens delivery on mobile and submits a complete platform", async ({ page }) => {
        // set page area to 390 by 844 pixels for mobile view
        await page.setViewportSize({ width: 390, height: 844 });

        const state = await mockSaves(page);
        const panel = await openEditor(page, true);
        const draft = await addDraft(panel);

        // make sure the inputs can be seen in layout
        await expect(draft.name).toBeVisible();
        await expect(draft.url).toBeVisible();
        
        // enter name for mobile test item
        await draft.name.fill("Mobile Delivery");

        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/mobile");
            await draft.url.press("Tab");
        });

        // check that item entered through the mobile layout is included in save
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({ label: "Mobile Delivery" }));
    });

    // this test is ran twice for name field & url field
    for (const field of ["name", "url"] as const) {
        test(`does not save after a previously valid ${field} is cleared`, async ({ page }) => {
            const state = await mockSaves(page);
            const panel = await openEditor(page);
            const draft = await addCompleteMockDraft(page, panel, "Clear Delivery", "https://example.com/clear");

            // pause browser time so save delay can't expire between input
            await pauseSaveTimers(page);
            const previousSaves = state.writes.length;
            await draft[field].fill("");
            await draft[field].press("Tab");

            // check for missing name message or missing link message to match cleared field
            const message = field === "name" ? /A platform name is required/ : /A link is required/;
            await expect(panel.getByText(message)).toBeVisible();
            await expect(draft[field]).toHaveAttribute("aria-invalid", "true");

            // move past the save delay to check that incomplete data isn't submitted
            await page.clock.runFor(1000);
            // checks that number of save attempts is unchanged
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

        // check for an empty recorded save list & that no delivery save was attempted
        expect(state.writes).toEqual([]);

        await expectSave(page, async () => {
            await draft.url.fill("https://example.com/corrected");
            await draft.url.press("Tab");
        });

        // check that there's no matching error message
        await expect(panel.getByText("Please enter a valid http:// or https:// link")).toHaveCount(0);
        await expect(draft.url).toHaveAttribute("aria-invalid", "false");
        await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();

        // check for an item with the listed fields
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({
            label: "Fixed Delivery", url: "https://example.com/corrected", enabled: true,
        }));
    });

    test("edits a second platform without changing the first platform or its save data", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);

        // create complete item & keep its input locators for comparison
        const first = await addCompleteMockDraft(page, panel, "First Mock", "https://example.com/first-mock");
        const firstSaved = state.writes.at(-1)?.deliveryLinks?.at(-1);
        // check if item isn't saved
        expect(firstSaved).toBeTruthy();

        // create a second complete item
        const second = await addCompleteMockDraft(page, panel, "Second Mock", "https://example.com/second-mock");

        await expectSave(page, async () => {
            await second.url.fill("https://example.com/second-edited");
            await second.url.press("Tab");
        });

        // first item's displayed name & link should stay the same
        await expect(first.name).toHaveValue("First Mock");
        await expect(first.url).toHaveValue("https://example.com/first-mock");

        // second item should display the edited URL
        await expect(second.url).toHaveValue("https://example.com/second-edited");
        // check that data contains first item with its original values
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(firstSaved);
        // look for an item with listed fields
        expect(state.writes.at(-1)?.deliveryLinks).toContainEqual(expect.objectContaining({
            label: "Second Mock", url: "https://example.com/second-edited", enabled: true,
        }));
    });

    // regression test
    test("discards a waiting valid URL save if the same field becomes invalid before leaving it", async ({ page }) => {
        const state = await mockSaves(page);
        const panel = await openEditor(page);
        const draft = await addCompleteMockDraft(page, panel, "Queued Delivery", "https://example.com/original");

        // pause browser time so save delay can't expire
        await pauseSaveTimers(page);
        // remember the saves already made during setup
        const previousSaves = state.writes.length;

        // enter a valid replacement
        await draft.url.fill("https://example.com/waiting");
        // then an email address into url field
        await draft.url.fill("tea@example.com");
        await draft.url.press("Tab");

        // check that url specific error is displayed
        await expect(panel.getByText("Please enter a valid http:// or https:// link")).toBeVisible();
        await page.clock.runFor(1000);

        // check that number of save attempts are stay unchanged
        expect(state.writes).toHaveLength(previousSaves);
        // check that current invalid input is displayed
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

    // check that the shared save status message reports success
    await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();

    // return the two input locators to edit or inspect the item
    return draft;
}

// make queued save checks repeatable by preventing the timer from firing while the test is still editing
async function pauseSaveTimers(page: Page) {
    await page.clock.install();
    // pausing prevents the typing delay from expiring between our next two input actions
    await page.clock.pauseAt(new Date(Date.now() + 60_000)); 
}