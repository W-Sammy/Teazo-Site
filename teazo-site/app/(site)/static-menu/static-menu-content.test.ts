// @vitest-environment jsdom

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StaticMenuContent from "./static-menu-content";
import { CURRENT_MENU_PDF_URL } from "@/app/lib/menu-upload";

vi.stubGlobal("React", React);

// mock content
vi.mock("@/app/fonts", () => ({
    montserrat400: { className: "test-montserrat" },
}));

vi.mock("@/app/lib/menu-upload", () => ({
    CURRENT_MENU_PDF_URL: "/test-current-menu.pdf",
}));

vi.mock("@/app/components/general-button", () => ({
    default: ({ text, href }: { text: string; href: string }) =>
        React.createElement("a", { href }, text),
}));

// stand in for the PDF viewer
vi.mock("@/app/components/pdf-preview", () => ({
    default: ({ fileUrl }: { fileUrl: string }) => React.createElement("div", {
        role: "region",
        "aria-label": "Menu PDF preview",
        "data-file-url": fileUrl,
    }),
}));

const chrome = "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36";
const safari = "Mozilla/5.0 Version/18.0 Safari/605.1.15";
const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")!;

function setBrowser(width: number, userAgent = chrome) {
    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: width,
    });
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
}

function preview() {
    return screen.queryByRole("region", { name: "Menu PDF preview" });
}

function expectPdfButton() {
    expect(screen.getByRole("link", { name: "OPEN PDF" }).getAttribute("href"))
        .toBe(CURRENT_MENU_PDF_URL);
}

beforeEach(() => {
    vi.clearAllMocks();
    setBrowser(1024);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", originalWidth);
});

describe("static menu PDF content", () => {
    it("shows the OPEN PDF button and helper text", () => {
        render(React.createElement(StaticMenuContent));

        expectPdfButton();
        expect(screen.queryByText("Use the button above to open our menu.")).not.toBeNull();
    });

    it("leaves the preview out of the initial server HTML but includes the PDF button", () => {
        const html = renderToStaticMarkup(React.createElement(StaticMenuContent));
        const container = document.createElement("div");
        container.innerHTML = html;

        expect(container.querySelector("a")?.textContent).toBe("OPEN PDF");
        expect(container.querySelector("a")?.getAttribute("href")).toBe(CURRENT_MENU_PDF_URL);
        expect(container.querySelector('[aria-label="Menu PDF preview"]')).toBeNull();
    });

    it.each([
        ["Chrome", chrome, true],
        ["Firefox", "Mozilla/5.0 Firefox/132.0", true],
        ["Edge", "Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0", true],
        ["Safari", safari, false],
        ["Chrome on iOS", "Mozilla/5.0 CriOS/130.0 Mobile Safari/604.1", true],
        ["Android Chrome on a wide screen", "Mozilla/5.0 Android 14 Chrome/130.0 Safari/537.36", true],
        ["an unrecognized browser without a Safari marker", "UnknownBrowser/1.0", true],
    ] as const)("applies the preview rule for %s on a wide screen", (_name, userAgent, showPreview) => {
        setBrowser(1024, userAgent);
        render(React.createElement(StaticMenuContent));

        if (showPreview) {
            expect(preview()).not.toBeNull();
            expect(preview()?.getAttribute("data-file-url")).toBe(CURRENT_MENU_PDF_URL);
        } else
            expect(preview()).toBeNull();
        

        expectPdfButton();
    });

    it.each([
        [390, false],
        [639, false],
        [640, true],
    ] as const)("applies the preview size rule at %ipx", (width, showPreview) => {
        setBrowser(width);
        render(React.createElement(StaticMenuContent));

        expect(preview() !== null).toBe(showPreview);
        expectPdfButton();
    });

    it("keeps the preview hidden in Safari even when the screen is exactly 640px wide", () => {
        setBrowser(640, safari);
        render(React.createElement(StaticMenuContent));

        expect(preview()).toBeNull();
        expectPdfButton();
    });
});
