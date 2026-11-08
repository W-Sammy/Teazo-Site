/**
 * MenuItemsSection memoization tests.
 *
 * Covers skipping re-renders for unchanged props and re-rendering
 * when fresh catalog data or a new handler arrives.
 * MenuItemCard is mocked to count renders; no Square requests are made.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { MenuItem } from "./menu-item-card";
import MenuItemsSection from "./menu-items-section";

const cardRender = vi.fn();

vi.mock("./menu-item-card", () => ({
  default: ({ item }: { item: MenuItem }) => {
    cardRender(item.catalogObjectId);
    return <div>{item.name}</div>;
  },
}));

function makeItem(id: string, name: string): MenuItem {
  return { catalogObjectId: id, name } as MenuItem;
}

describe("MenuItemsSection memoization", () => {
  const items = [makeItem("a", "Milk Tea"), makeItem("b", "Matcha")];
  const onCustomizeItem = vi.fn();
  const props = {
    title: "Teas",
    items,
    headingClassName: "heading",
    bodyClassName: "body",
    onCustomizeItem,
  };

  beforeEach(() => {
    cardRender.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not re-render cards when rerendered with identical props", () => {
    const { rerender } = render(<MenuItemsSection {...props} />);
    expect(cardRender).toHaveBeenCalledTimes(2);

    rerender(<MenuItemsSection {...props} />);

    expect(cardRender).toHaveBeenCalledTimes(2);
  });

  it("re-renders with fresh catalog items", () => {
    const { rerender } = render(<MenuItemsSection {...props} />);

    rerender(<MenuItemsSection {...props} items={[makeItem("a", "Milk Tea Deluxe"), items[1]]} />);

    expect(screen.getByText("Milk Tea Deluxe")).toBeTruthy();
    expect(cardRender).toHaveBeenCalledTimes(4);
  });

  it("re-renders with a new heading, subtitle or handler", () => {
    const { rerender } = render(<MenuItemsSection {...props} />);

    rerender(<MenuItemsSection {...props} title="Fresh Teas" subtitle="New season" />);
    expect(screen.getByText("Fresh Teas")).toBeTruthy();
    expect(screen.getByText("New season")).toBeTruthy();

    cardRender.mockClear();
    rerender(<MenuItemsSection {...props} title="Fresh Teas" subtitle="New season" onCustomizeItem={vi.fn()} />);
    expect(cardRender).toHaveBeenCalledTimes(2);
  });
});
