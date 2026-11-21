// @vitest-environment jsdom

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StaticMenuPage, { metadata } from "./page";
import { getPublicWebsiteContent } from "@/app/lib/website-content";
import { heroLogoSrc } from "@/app/lib/default-logo";

vi.stubGlobal("React", React);

// mock website content
vi.mock("@/app/lib/website-content", () => ({
    getPublicWebsiteContent: vi.fn(),
}));

vi.mock("next/font/google", () => ({
    Cabin_Sketch: () => ({ className: "test-cabin-sketch" }),
}));

vi.mock("@/app/fonts", () => ({
    montserrat400: { className: "test-montserrat" },
}));

vi.mock("@/app/components/bubble-field", () => ({
    BubbleField: () => null,
}));

vi.mock("@/app/lib/default-logo", () => ({
    heroLogoSrc: vi.fn(() => "/test-menu-logo.svg"),
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

vi.mock("./static-menu-content", () => ({
    default: () => React.createElement("div", { "data-testid": "static-menu-content" }),
}));

type WebsiteContent = Awaited<ReturnType<typeof getPublicWebsiteContent>>;

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPublicWebsiteContent).mockResolvedValue({ logo: undefined } as unknown as WebsiteContent);
});

afterEach(() => {
    cleanup();
});

// tests
describe("static menu page", () => {
    it("exports the Menu tab title and page description", () => {
        expect(metadata.title).toBe("Menu");
        expect(metadata.description).toBe("View and download the TEAZO static menu PDF.");
    });

    it("shows the menu heading and introduction", async () => {
        render(await StaticMenuPage());

        expect(screen.queryByRole("main")).not.toBeNull();
        expect(screen.queryByRole("heading", { name: "MENU" })).not.toBeNull();
        expect(screen.queryByText("View the TEAZO menu below or download a copy for offline viewing."))
            .not.toBeNull();
    });

    it("uses the logo returned by the shared logo helper", async () => {
        render(await StaticMenuPage());

        expect(heroLogoSrc).toHaveBeenCalledWith(undefined);
        expect(screen.getByAltText("TEAZO logo").getAttribute("src")).toBe("/test-menu-logo.svg");
    });

    it("includes the static menu content component", async () => {
        render(await StaticMenuPage());

        expect(screen.queryByTestId("static-menu-content")).not.toBeNull();
    });

    it("loads website content once for this render", async () => {
        render(await StaticMenuPage());

        expect(getPublicWebsiteContent).toHaveBeenCalledTimes(1);
    });
});

