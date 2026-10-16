import { describe, expect, it } from "vitest";
import type { CartItem } from "@/app/types/checkout";
import { cartIssueMessage, cartItemsWithIssue, readCartIssue } from "@/app/lib/cart-issues";

const item = (cartItemId: string, variationId: string): CartItem => ({
  cartItemId,
  catalogObjectId: `ITEM_${variationId}`,
  variationId,
  name: variationId,
  basePriceCents: 600,
  imageUrl: null,
  selectedModifiers: [],
  quantity: 1,
  itemTotalCents: 600,
});

describe("readCartIssue (TZ-444)", () => {
  it("reads unavailable items and option problems", () => {
    expect(readCartIssue({ error: "x", code: "ITEM_UNAVAILABLE", variationIds: ["V1"] })).toEqual({
      code: "ITEM_UNAVAILABLE",
      variationIds: ["V1"],
    });
    expect(readCartIssue({ error: "x", code: "INVALID_OPTIONS", variationIds: ["V1", "V2"] })).toEqual({
      code: "INVALID_OPTIONS",
      variationIds: ["V1", "V2"],
    });
  });

  it("ignores other errors, and issues that name no items", () => {
    expect(readCartIssue({ error: "x", code: "ORDERING_PAUSED" })).toBeNull();
    expect(readCartIssue({ error: "x", code: "RATE_LIMITED", variationIds: ["V1"] })).toBeNull();
    expect(readCartIssue({ error: "x", code: "ITEM_UNAVAILABLE" })).toBeNull();
    expect(readCartIssue({ error: "x", code: "ITEM_UNAVAILABLE", variationIds: [] })).toBeNull();
    expect(readCartIssue(null)).toBeNull();
  });

  it("drops anything in variationIds that isn't an ID", () => {
    const error = { error: "x", code: "ITEM_UNAVAILABLE", variationIds: ["V1", "", 7, null] as unknown as string[] };
    expect(readCartIssue(error)?.variationIds).toEqual(["V1"]);
  });
});

describe("cartItemsWithIssue (TZ-444)", () => {
  const cart = [item("a", "V1"), item("b", "V2"), item("c", "V1")];

  it("finds every cart line with a named variation, including the same drink customized twice", () => {
    const flagged = cartItemsWithIssue(cart, { code: "ITEM_UNAVAILABLE", variationIds: ["V1"] });
    expect(flagged.map((i) => i.cartItemId)).toEqual(["a", "c"]);
  });

  it("is empty with no issue, or once the named lines are gone", () => {
    expect(cartItemsWithIssue(cart, null)).toEqual([]);
    expect(cartItemsWithIssue([item("b", "V2")], { code: "ITEM_UNAVAILABLE", variationIds: ["V1"] })).toEqual([]);
  });

  it("says what to do for each kind of issue", () => {
    expect(cartIssueMessage("ITEM_UNAVAILABLE")).toContain("Remove");
    expect(cartIssueMessage("INVALID_OPTIONS")).toContain("Edit");
  });
});
