import { describe, expect, it } from "vitest";
import { isValidUrl, isValidUrlOrEmail, validateWebsiteContentPatch } from "@/app/lib/website-content-validators";
import type { DeliveryLink } from "@/app/types/website-content";

// test data
const platform = {
    id: "delivery-test",
    label: "Test Delivery",
    icon: "",
    url: "https://example.com/order",
    enabled: true,
};

// runs full save validation for a single platform
function checkDelivery(patch: Partial<DeliveryLink> = {}) {
    return validateWebsiteContentPatch({ deliveryLinks: [{ ...platform, ...patch }] });
}

// tests
describe("delivery URL validation", () => {
    // run once per value below
    it.each([
        "https://example.com/order",
        "http://example.com/order",
        "  https://example.com/order  ",
    ])("accepts a website link: %s", (url) => {
        // checks that small url only helper accepts value
        expect(isValidUrl(url)).toBe(true);

        // checks that full delivery save validation accepts it
        expect(checkDelivery({ url }).valid).toBe(true);
    });

    // each value should be rejected
    it.each([
        "tea@example.com",
        "mailto:tea@example.com",
        "ftp://example.com/order",
        "javascript:alert(1)",
        "not a link",
    ])("rejects a non-website value: %s", (url) => {
        expect(isValidUrl(url)).toBe(false);

        // confirm full delivery save rules reject it too
        expect(checkDelivery({ url }).valid).toBe(false);
    });

    it("requires a protocol when saving delivery, even though the basic URL helper allows a bare domain", () => {
        // delivery validation rejects a domain without http:// or https://
        expect(checkDelivery({ url: "example.com" }).valid).toBe(false);
    });

    // try a missing value, null, a number, empty text, space only text
    it.each([undefined, null, 123, "", "   "])("rejects an empty or non-text URL: %s", (value) => {
        expect(isValidUrl(value)).toBe(false);
    });
});

// these tests use the complete delivery validation rather than just the URL helper
describe("delivery save validation", () => {
    it.each(["", "   "])("rejects a missing platform name: %j", (label) => {
        // url stays valid only while name is replaced
        expect(checkDelivery({ label }).valid).toBe(false);
    });

    it.each(["", "   "])("rejects a missing delivery URL: %j", (url) => {
        // platform name stays valid only while url is empty or just spaces
        expect(checkDelivery({ url }).valid).toBe(false);
    });

    it("accepts a hidden platform without removing its saved information", () => {
        // visibility change is valid when platform still has a valid name & url
        expect(checkDelivery({ enabled: false }).valid).toBe(true);
    });

    it("still rejects an invalid URL when the platform is hidden", () => {
        // hiding an item must not bypass url checks
        expect(checkDelivery({ enabled: false, url: "tea@example.com" }).valid).toBe(false);
    });

    it("accepts an empty list so the last platform can be removed", () => {
        // should be valid so last item can be removed
        expect(validateWebsiteContentPatch({ deliveryLinks: [] }).valid).toBe(true);
    });

    // regression test: delivery being url only should not remove email support from social media
    it.each(["tea@example.com", "mailto:tea@example.com"])("preserves social email support: %s", (url) => {
        // helper should still accept both plain emails & mailto: links
        expect(isValidUrlOrEmail(url)).toBe(true);

        // same example is checked as a social link so an email is allowed for below
        expect(validateWebsiteContentPatch({ socialLinks: [{ ...platform, url }] }).valid).toBe(true);

        // check that email is rejected when used as a delivery link
        expect(checkDelivery({ url }).valid).toBe(false);
    });
});
