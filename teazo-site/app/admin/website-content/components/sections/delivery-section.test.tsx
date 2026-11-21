/**
 * @vitest-environment jsdom
 */

import * as React from "react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DeliverySection from "./delivery-section";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals()); // after all tests finish, restore any globals changed by vi.stubGlobal
afterEach(cleanup); // after each test, remove components so next test starts with a clean page

// read type of one item from delivery section's links
type Link = React.ComponentProps<typeof DeliverySection>["deliveryLinks"][number];
// example platform
const platform: Link = {
    id: "delivery-test", label: "Test Delivery", icon: "",
    url: "https://example.com/order", enabled: true,
};

// render a fresh section for each test
function setup(links: Link[] = [platform]) {
    // mock callbacks that record add, remove, update & blur calls
    const onAddLink = vi.fn();
    const onRemoveLink = vi.fn();
    const onUpdateLink = vi.fn();
    const onBlur = vi.fn();

    // updates links when the section calls onUpdateLink
    function TestSection() {
        // hold the list in React state so changing a field updates what the test can see
        const [deliveryLinks, setLinks] = React.useState(links);
        
        // keep accordion open
        return React.createElement(DeliverySection, {
            deliveryLinks,
            isOpen: true,
            onToggle: vi.fn(),
            setRef: () => {},
            onAddLink,
            onRemoveLink,
            onBlur,
            onUpdateLink: (id: string, patch: Partial<Link>) => {
                // record the update so assertions can check which item & vals were passed
                onUpdateLink(id, patch);
                // copy list, replace only the matching item
                setLinks((previous) => previous.map((link) => link.id === id ? { ...link, ...patch } : link));
            },
        });
    }

    // put TestSection on a pretend page so screen can find its inputs & buttons
    render(React.createElement(TestSection));

    // give tests access to mock functions
    return { onAddLink, onRemoveLink, onUpdateLink, onBlur };
}

// tests
describe("admin delivery section", () => {
    it("shows an empty state and calls the add handler", () => {
        // starts with no platforms
        const { onAddLink } = setup([]);
        // returns an element if found, null if missing
        expect(screen.queryByText("No delivery links yet. Add one to get started!")).not.toBeNull();

        // find add button using name then click
        fireEvent.click(screen.getByRole("button", { name: "New Delivery Link +" }));
        // click should ask to add exactly one item
        expect(onAddLink).toHaveBeenCalledTimes(1);
    });

    it("does not show required field errors for a completely blank new row", () => {
        setup([{ ...platform, label: "", url: "" }]);

        expect(screen.queryByText(/A platform name is required/)).toBeNull();
        expect(screen.queryByText(/A link is required/)).toBeNull();
    });

    // regression test: make sure entering url first shows missing name error
    it("shows a name required error when the URL is entered first", () => {
        setup([{ ...platform, label: "", url: "" }]);

        // enter a url without interacting with name field
        fireEvent.change(screen.getByLabelText("Delivery platform link"), {
            target: { value: "https://example.com/order" },
        });
        expect(screen.queryByText(/A platform name is required/)).not.toBeNull();

        // check assistive technology can also identify the name field as invalid
        expect(screen.getByLabelText("Delivery platform name").getAttribute("aria-invalid")).toBe("true");
    });

    it("clears the name error after a platform name is entered", () => {
        setup([{ ...platform, label: "" }]);
        const name = screen.getByLabelText("Delivery platform name");
        fireEvent.blur(name);
        expect(screen.queryByText(/A platform name is required/)).not.toBeNull();

        // enter a name & update component; error should disappear
        fireEvent.change(name, { target: { value: "Delivery" } });
        expect(screen.queryByText(/A platform name is required/)).toBeNull();
    });

    // it.each runs same test separately for each listed value
    it.each(["tea@example.com", "mailto:tea@example.com", "example.com", "not a link"])("shows an error for an invalid delivery link: %s", (url) => {
        setup();
        const input = screen.getByLabelText("Test Delivery delivery link");

        // try invalid value then leave url field to trigger validation message
        fireEvent.change(input, { target: { value: url } });
        fireEvent.blur(input);

        expect(screen.queryByText("Please enter a valid http:// or https:// link")).not.toBeNull();
        expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("requires a URL after a platform name has been entered", () => {
        const { onBlur } = setup([{ ...platform, url: "" }]);
        fireEvent.blur(screen.getByLabelText("Test Delivery delivery link"));

        expect(screen.queryByText(/A link is required/)).not.toBeNull();
        // confirm leaving the field also calls the callback to flush waiting saves
        expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it("configures a 16 character name input limit", () => {
        setup();
        // check html input declares limit
        expect(screen.getByLabelText("Delivery platform name").getAttribute("maxlength")).toBe("16");
    });

    it("hides and shows a platform through the update handler", () => {
        const { onUpdateLink } = setup();
        const toggle = screen.getByRole("switch", { name: "Show Test Delivery on the delivery page" }); // switch controls visibility & name identifies platform
        fireEvent.click(toggle);

        // callback should request hiding platform
        expect(onUpdateLink).toHaveBeenLastCalledWith(platform.id, { enabled: false });
        // check that rendered switch reflects updated hidden state
        expect(toggle.getAttribute("aria-checked")).toBe("false");

        // hiding keeps row visible
        expect(screen.queryByLabelText("Delivery platform name")).not.toBeNull();

        fireEvent.click(toggle);
        // second click should request showing platform again
        expect(onUpdateLink).toHaveBeenLastCalledWith(platform.id, { enabled: true });
    });

    it("passes the selected platform ID to the remove handler", () => {
        const { onRemoveLink } = setup();
        fireEvent.click(screen.getByRole("button", { name: "Remove Test Delivery" }));

        // confirm removal request for correct item
        expect(onRemoveLink).toHaveBeenCalledExactlyOnceWith(platform.id);
    });

    it("clears the URL error after an invalid link is corrected", () => {
        setup();
        const input = screen.getByLabelText("Test Delivery delivery link");
        fireEvent.change(input, { target: { value: "tea@example.com" } });
        fireEvent.blur(input); // leave the field so its validation runs
        expect(screen.queryByText("Please enter a valid http:// or https:// link")).not.toBeNull();

        // once field has been checked, correcting it should clear the error
        fireEvent.change(input, { target: { value: "https://example.com/fixed" } });
        expect(screen.queryByText("Please enter a valid http:// or https:// link")).toBeNull();
        expect(input.getAttribute("aria-invalid")).toBe("false");
    });

    it("edits the second platform without changing the first platform", () => {
        const second = { ...platform, id: "delivery-two", label: "Second Delivery" };
        const { onUpdateLink } = setup([platform, second]);
        const names = screen.getAllByLabelText("Delivery platform name");
        fireEvent.change(names[1], { target: { value: "Renamed" } });

        // check that callback targets second id & the first field keeps its original value
        expect(onUpdateLink).toHaveBeenCalledExactlyOnceWith(second.id, { label: "Renamed" });
        expect((names[0] as HTMLInputElement).value).toBe(platform.label);
        expect((names[1] as HTMLInputElement).value).toBe("Renamed");
    });

    it("hides the second platform without changing the first switch", () => {
        const second = { ...platform, id: "delivery-two", label: "Second Delivery" };
        const { onUpdateLink } = setup([platform, second]);
        const firstToggle = screen.getByRole("switch", { name: "Show Test Delivery on the delivery page" });
        const secondToggle = screen.getByRole("switch", { name: "Show Second Delivery on the delivery page" });
        fireEvent.click(secondToggle);

        expect(onUpdateLink).toHaveBeenCalledExactlyOnceWith(second.id, { enabled: false });
        expect(firstToggle.getAttribute("aria-checked")).toBe("true");
        expect(secondToggle.getAttribute("aria-checked")).toBe("false");
        expect(screen.getAllByLabelText("Delivery platform name")).toHaveLength(2);
    });

    it("requests removal of the second platform rather than the first", () => {
        const second = { ...platform, id: "delivery-two", label: "Second Delivery" };
        const { onRemoveLink } = setup([platform, second]);
        fireEvent.click(screen.getByRole("button", { name: "Remove Second Delivery" }));

        // record removals
        expect(onRemoveLink).toHaveBeenCalledExactlyOnceWith(second.id);
    });

    // check errors after clearing values that used to be valid
    it("shows the required URL error after an existing URL is cleared", () => {
        setup();
        const input = screen.getByLabelText("Test Delivery delivery link");
        fireEvent.change(input, { target: { value: "" } });
        fireEvent.blur(input);

        expect(screen.queryByText(/A link is required/)).not.toBeNull();
        expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("treats a whitespace-only platform name as missing", () => {
        setup();
        const input = screen.getByLabelText("Delivery platform name");
        fireEvent.change(input, { target: { value: "   " } });
        fireEvent.blur(input);

        expect(screen.queryByText(/A platform name is required/)).not.toBeNull();
        expect(input.getAttribute("aria-invalid")).toBe("true");
    });

    it("keeps the other platform's URL when one URL is edited", () => {
        const second = { ...platform, id: "delivery-two", label: "Second Delivery", url: "https://example.com/second" };
        const { onUpdateLink } = setup([platform, second]);
        const firstUrl = screen.getByLabelText("Test Delivery delivery link");
        const secondUrl = screen.getByLabelText("Second Delivery delivery link");
        fireEvent.change(secondUrl, { target: { value: "https://example.com/updated" } });

        expect(onUpdateLink).toHaveBeenCalledExactlyOnceWith(second.id, { url: "https://example.com/updated" });
        expect((firstUrl as HTMLInputElement).value).toBe(platform.url);
        expect((secondUrl as HTMLInputElement).value).toBe("https://example.com/updated");
    });
});
