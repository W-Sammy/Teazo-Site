// @vitest-environment jsdom

import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Delivery from "./page";
import { getWebsiteContent } from "@/app/lib/website-content";
import { heroLogoSrc } from "@/app/lib/default-logo";

vi.stubGlobal("React", React);

// mock content
vi.mock("@/app/lib/website-content", () => ({
    getWebsiteContent: vi.fn(),
}));

vi.mock("next/font/google", () => ({
    Cabin_Sketch: () => ({ className: "test-cabin-sketch" }),
}));

vi.mock("@/app/fonts", () => ({
    montserrat500: { className: "test-montserrat-medium" },
    montserrat800: { className: "test-montserrat-bold" },
}));

vi.mock("@/app/components/bubble-field", () => ({
    BubbleField: () => null,
}));

vi.mock("next/image", () => ({
    default: (props: {
        src: string;
        alt: string;
        "aria-hidden"?: "true" | "false" | boolean;
    }) => React.createElement("img", {
        src: props.src,
        alt: props.alt,
        "aria-hidden": props["aria-hidden"],
    }),
}));

vi.mock("@/app/components/general-button", () => ({
    default: ({ text, href }: { text: string; href: string }) =>
        React.createElement("a", { href }, text),
}));

vi.mock("@/app/lib/default-logo", () => ({
    heroLogoSrc: vi.fn(() => "/test-delivery-logo.svg"),
}));

type WebsiteContent = Awaited<ReturnType<typeof getWebsiteContent>>;
type DeliveryLink = NonNullable<WebsiteContent["deliveryLinks"]>[number];

function makeLink(overrides: Partial<DeliveryLink> = {}): DeliveryLink {
    return {
        id: "delivery-one",
        label: "DoorDash",
        url: "https://example.com/order",
        enabled: true,
        icon: "",
        ...overrides,
    };
}

function makeContent(deliveryLinks: DeliveryLink[] | null | undefined): WebsiteContent {
    return { logo: undefined, deliveryLinks } as unknown as WebsiteContent;
}

async function renderPage(content: WebsiteContent) {
    vi.mocked(getWebsiteContent).mockResolvedValue(content);
    return render(await Delivery());
}

describe("public delivery page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it("shows the delivery heading and description", async () => {
        await renderPage(makeContent([]));

        expect(screen.queryByRole("main")).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "DELIVERY"})).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "HUNGRY AT HOME?"})).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "WE DELIVER."})).not.toBeNull();
    });

    it.each(["doordash", "DoorDash"])("displays the label %s in uppercase", async (label) => {
        await renderPage(makeContent([makeLink({ label })]));

        expect(screen.getByRole("link", { name: "DOORDASH"}).textContent)
            .toBe("DOORDASH");
    });

    it("passes the platform's complete URL to its button", async () => {
        const url = "https://example.com/order?store=teazo&pickup=false#menu";
        await renderPage(makeContent([makeLink({ url })]));

        expect(screen.getByRole("link", { name: "DOORDASH" }).getAttribute("href")).toBe(url);
    });

    it("hides a disabled platform while keeping an enabled one", async () => {
        await renderPage(makeContent([
            makeLink({ id: "hidden", label: "Hidden", enabled: false }),
            makeLink({ id: "visible", label: "Visible" }),
        ]));

        expect(screen.queryByRole("link", { name: "HIDDEN" })).toBeNull();
        expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["VISIBLE"]);
    });

    it.each(["", "   "])("hides a platform with a blank name: %j", async (label) => {
        await renderPage(makeContent([makeLink({ label })]));

        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it.each(["", "   "])("hides a platform with a blank URL: %j", async (url) => {
        await renderPage(makeContent([makeLink({ url })]));

        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it.each([
        ["an empty list", []],
        ["a missing list", undefined],
        ["a null list", null],
    ] as const)("renders without delivery buttons when content contains %s", async (_description, links) => {
        await renderPage(makeContent(links === undefined || links === null ? links : [...links]));

        expect(screen.queryByRole("heading", { name: "DELIVERY"})).not.toBeNull();
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("keeps the saved order of the remaining visible platforms", async () => {
        await renderPage(makeContent([
            makeLink({ id: "third", label: "Third", url: "https://example.com/third" }),
            makeLink({ id: "hidden", label: "Hidden", enabled: false }),
            makeLink({ id: "blank", label: " " }),
            makeLink({ id: "first", label: "First", url: "https://example.com/first" }),
        ]));

        const links = screen.getAllByRole("link");
        expect(links.map((link) => link.textContent)).toEqual(["THIRD", "FIRST"]);
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "https://example.com/third",
            "https://example.com/first",
        ]);
    });

    it("does not change the saved labels or remove hidden items from the source content", async () => {
        const links = [makeLink(), makeLink({ id: "hidden", label: "Hidden", enabled: false })];
        const originalLinks = links.map((link) => ({ ...link }));
        await renderPage(makeContent(links));

        expect(links).toEqual(originalLinks);
    });

    it("loads the website content once for this render", async () => {
        await renderPage(makeContent([]));

        expect(getWebsiteContent).toHaveBeenCalledTimes(1);
    });

    it("uses the logo returned by the shared logo helper", async () => {
        const content = makeContent([]);
        await renderPage(content);

        expect(heroLogoSrc).toHaveBeenCalledWith(content.logo);
        expect(screen.getByAltText("TEAZO logo").getAttribute("src"))
            .toBe("/test-delivery-logo.svg");
    });
});
