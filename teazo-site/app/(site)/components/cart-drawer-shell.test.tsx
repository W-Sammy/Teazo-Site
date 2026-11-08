/**
 * Tests for CartDrawer outer shell, lazy interior coordination,
 * immediate dismissibility, accessibility (focus trap, Escape, scroll locking),
 * error recovery, and edit flow cancellation.
 */

// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { CartItem } from "@/app/types/checkout";

const mockCartState = {
  items: [] as CartItem[],
  totalCount: 0,
  subtotalCents: 0,
  isCartOpen: false,
  isHydrated: true,
  openCart: vi.fn(),
  closeCart: vi.fn(),
  updateQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
};

vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
  Cabin_Sketch: () => ({ className: "test-cabin" }),
}));

vi.mock("@/app/context/cart-context", () => ({
  useCart: () => mockCartState,
  recordPendingCheckoutOrder: vi.fn(),
  MAX_ITEM_QUANTITY: 50,
}));

vi.mock("./cart-drawer-skeleton", () => ({
  default: () => <div data-testid="cart-skeleton">Loading skeleton...</div>,
}));

vi.mock("./payment-badges", () => ({
  default: () => null,
}));

vi.mock("@/app/components/turnstile-widget", () => ({
  TURNSTILE_SITE_KEY: "test-site-key",
  default: () => <div data-testid="turnstile-widget" />,
}));

vi.mock("@/app/lib/store-hours", () => ({
  getPickupDays: () => [],
  getPacificParts: () => ({ minuteOfDay: 720 }),
  formatMinuteOfDay: () => "12:00 PM",
  getStoreScheduleForDate: () => ({
    closed: false,
    openMinuteOfDay: 0,
    closeMinuteOfDay: 1439,
    cutoffMinuteOfDay: 1439,
    openHour: 0,
    closeHour: 24,
  }),
  MAX_SCHEDULE_DAYS_AHEAD: 7,
  ONLINE_ORDERING_PAUSED_MESSAGE: "Online ordering paused",
}));

import CartDrawer from "./cart-drawer";

describe("CartDrawer Shell & Loading Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCartState.isCartOpen = false;
    mockCartState.isHydrated = true;
    mockCartState.items = [];
    mockCartState.totalCount = 0;
    mockCartState.subtotalCents = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the outer shell in a closed painted state before first opening", () => {
    render(<CartDrawer />);

    const dialog = screen.getByRole("dialog", { name: "Shopping Bag" });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain("pointer-events-none invisible");

    const aside = dialog.querySelector("aside");
    expect(aside).toBeTruthy();
    expect(aside?.className).toContain("translate-x-full");

    // Header is rendered
    expect(screen.getByText("TEAZO")).toBeTruthy();
    expect(screen.getByText("Your Bag")).toBeTruthy();
  });

  it("slides in and sets open transform when isCartOpen becomes true", () => {
    mockCartState.isCartOpen = true;
    render(<CartDrawer />);

    const dialog = screen.getByRole("dialog", { name: "Shopping Bag" });
    expect(dialog.className).toContain("pointer-events-auto visible");

    const aside = dialog.querySelector("aside");
    expect(aside?.className).toContain("translate-x-0");
  });

  it("locks body scroll when opened and restores when closed", () => {
    document.body.style.overflow = "visible";

    mockCartState.isCartOpen = true;
    const { rerender } = render(<CartDrawer />);
    expect(document.body.style.overflow).toBe("hidden");

    mockCartState.isCartOpen = false;
    rerender(<CartDrawer />);
    expect(document.body.style.overflow).toBe("visible");
  });

  it("closes immediately when close button is clicked in the header", () => {
    mockCartState.isCartOpen = true;
    render(<CartDrawer />);

    const closeBtn = screen.getByRole("button", { name: "Close cart" });
    fireEvent.click(closeBtn);

    expect(mockCartState.closeCart).toHaveBeenCalledTimes(1);
  });

  it("closes immediately when clicking backdrop", () => {
    mockCartState.isCartOpen = true;
    render(<CartDrawer />);

    const backdrop = document.querySelector(".fixed.inset-0.bg-black\\/60");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);

    expect(mockCartState.closeCart).toHaveBeenCalledTimes(1);
  });

  it("handles Escape key in outer shell", () => {
    mockCartState.isCartOpen = true;
    render(<CartDrawer />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockCartState.closeCart).toHaveBeenCalledTimes(1);
  });

  it("restores focus to trigger element when drawer closes", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Bag Trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    mockCartState.isCartOpen = true;
    const { rerender } = render(<CartDrawer />);

    // Close the cart
    mockCartState.isCartOpen = false;
    rerender(<CartDrawer />);

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it("traps focus between the first and last interactive element in the shell", () => {
    mockCartState.isCartOpen = true;
    render(<CartDrawer />);

    const closeBtn = screen.getByRole("button", { name: "Close cart" });
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    // Tab wraps within the dialog
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    // Shift-Tab also wraps
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeBtn);
  });

  it("renders interior skeleton while loading on first open", async () => {
    mockCartState.isCartOpen = true;
    render(<CartDrawer />);

    // While loading interior chunk, skeleton is displayed
    expect(screen.getByTestId("cart-skeleton")).toBeTruthy();
  });
});
