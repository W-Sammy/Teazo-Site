/**
 * Tests for CartDrawer outer shell, lazy interior coordination,
 * immediate dismissibility, accessibility (focus trap, Escape, scroll locking),
 * error recovery, and edit flow cancellation.
 */

// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
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

const skeletonRendered = vi.hoisted(() => vi.fn());

vi.mock("./cart-drawer-skeleton", () => ({
  default: () => {
    skeletonRendered();
    return <div data-testid="cart-skeleton">Loading skeleton...</div>;
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("./item-customizer-modal", () => ({
  default: () => <div data-testid="mocked-item-customizer-modal" />,
}));

import CartDrawer, * as cartDrawerModule from "./cart-drawer";
const { preloadCartInteriorModule, resetCartInteriorModule } = cartDrawerModule;
import { preloadCustomizerModule } from "./lazy-customizer-modal";
import NavBar from "./nav-bar";

type InteriorModule = Pick<typeof import("./cart-drawer-content"), "default">;
function MockInterior() {
  return <input aria-label="Checkout name" defaultValue="" />;
}
const interiorLoader = vi.fn<() => Promise<InteriorModule>>();

describe("CartDrawer Shell & Loading Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCartInteriorModule();
    interiorLoader.mockReset().mockResolvedValue({ default: MockInterior });
    vi.doMock("./cart-drawer-content", interiorLoader);
    mockCartState.isCartOpen = false;
    mockCartState.isHydrated = true;
    mockCartState.items = [];
    mockCartState.totalCount = 0;
    mockCartState.subtotalCents = 0;
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await vi.dynamicImportSettled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  describe("Cart Interior Chunk Pre-warming", () => {
    it("defers loading until intent, deduplicates warming, and never renders a skeleton after warming", async () => {
      const { rerender } = render(<CartDrawer />);
      await vi.dynamicImportSettled();
      expect(interiorLoader).not.toHaveBeenCalled();

      preloadCartInteriorModule();
      preloadCartInteriorModule();
      await vi.dynamicImportSettled();
      expect(interiorLoader).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText("Checkout name")).toBeNull();

      mockCartState.isCartOpen = true;
      rerender(<CartDrawer />);
      expect(screen.getByLabelText("Checkout name")).toBeTruthy();
      expect(skeletonRendered).not.toHaveBeenCalled();
    });

    it("preserves checkout state on updates and reopening after a cold load", async () => {
      mockCartState.isCartOpen = true;
      const { rerender } = render(<CartDrawer />);
      const name = await screen.findByLabelText("Checkout name");
      fireEvent.change(name, { target: { value: "Taylor" } });

      mockCartState.totalCount = 2;
      rerender(<CartDrawer />);
      mockCartState.isCartOpen = false;
      rerender(<CartDrawer />);
      mockCartState.isCartOpen = true;
      rerender(<CartDrawer />);

      expect(screen.getByLabelText("Checkout name")).toBe(name);
      expect((name as HTMLInputElement).value).toBe("Taylor");
    });

    it("renders the skeleton while a preload is still pending", async () => {
      let resolve!: (module: InteriorModule) => void;
      interiorLoader.mockReturnValue(new Promise((done) => { resolve = done; }));
      preloadCartInteriorModule();
      mockCartState.isCartOpen = true;
      render(<CartDrawer />);
      expect(screen.getByTestId("cart-skeleton")).toBeTruthy();

      await act(async () => {
        resolve({ default: MockInterior });
        await vi.dynamicImportSettled();
      });
      expect(await screen.findByLabelText("Checkout name")).toBeTruthy();
      expect(interiorLoader).toHaveBeenCalledTimes(1);
    });

    it("can warm successfully after a rejected speculative load", async () => {
      interiorLoader.mockRejectedValueOnce(new Error("offline"));
      preloadCartInteriorModule();
      await vi.dynamicImportSettled();
      vi.doMock("./cart-drawer-content", interiorLoader);
      preloadCartInteriorModule();
      await vi.dynamicImportSettled();

      mockCartState.isCartOpen = true;
      render(<CartDrawer />);
      expect(screen.getByLabelText("Checkout name")).toBeTruthy();
      expect(skeletonRendered).not.toHaveBeenCalled();
      expect(interiorLoader).toHaveBeenCalledTimes(2);
    });

    it("executes an idle preload with a deadline and cancels it on unmount", async () => {
      const requestIdleCallbackMock = vi.fn<typeof window.requestIdleCallback>(() => 123);
      const cancelIdleCallbackMock = vi.fn();
      vi.stubGlobal("requestIdleCallback", requestIdleCallbackMock);
      vi.stubGlobal("cancelIdleCallback", cancelIdleCallbackMock);

      mockCartState.totalCount = 3;
      const { unmount } = render(<CartDrawer />);

      expect(requestIdleCallbackMock).toHaveBeenCalledWith(expect.any(Function), { timeout: 1500 });
      expect(interiorLoader).not.toHaveBeenCalled();
      const callback = requestIdleCallbackMock.mock.calls[0][0];
      callback({ didTimeout: false, timeRemaining: () => 50 });
      await vi.dynamicImportSettled();
      expect(interiorLoader).toHaveBeenCalledTimes(1);

      unmount();
      expect(cancelIdleCallbackMock).toHaveBeenCalledWith(123);

    });

    it("executes the fallback preload after one second", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("requestIdleCallback", undefined);
      mockCartState.totalCount = 2;
      render(<CartDrawer />);
      await vi.advanceTimersByTimeAsync(999);
      expect(interiorLoader).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await vi.dynamicImportSettled();
      expect(interiorLoader).toHaveBeenCalledTimes(1);
    });

    it("cancels the fallback when unmounted or the cart becomes empty", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("requestIdleCallback", undefined);
      mockCartState.totalCount = 2;
      const { unmount, rerender } = render(<CartDrawer />);
      mockCartState.totalCount = 0;
      rerender(<CartDrawer />);
      await vi.advanceTimersByTimeAsync(1000);
      expect(interiorLoader).not.toHaveBeenCalled();

      mockCartState.totalCount = 1;
      rerender(<CartDrawer />);
      unmount();
      await vi.advanceTimersByTimeAsync(1000);
      expect(interiorLoader).not.toHaveBeenCalled();
    });

    it("does not schedule idle preload when totalCount is 0", () => {
      const requestIdleCallbackMock = vi.fn();
      vi.stubGlobal("requestIdleCallback", requestIdleCallbackMock);

      mockCartState.totalCount = 0;
      render(<CartDrawer />);

      expect(requestIdleCallbackMock).not.toHaveBeenCalled();

    });

    it("warms the cart while the customizer chunk is still downloading", async () => {
      let finishCustomizer!: (module: { default: () => null }) => void;
      const customizerLoading = new Promise<{ default: () => null }>((resolve) => {
        finishCustomizer = resolve;
      });
      vi.doMock("./item-customizer-modal", () => customizerLoading);
      preloadCustomizerModule();
      try {
        await waitFor(() => expect(interiorLoader).toHaveBeenCalledTimes(1));
      } finally {
        finishCustomizer({ default: () => null });
      }
    });

    it("preloads on hover and focus of both bag buttons without opening the cart", () => {
      const preload = vi.spyOn(cartDrawerModule, "preloadCartInteriorModule");
      render(<NavBar />);

      const bagButtons = screen.getAllByRole("button", { name: /Open Cart/i });
      expect(bagButtons.length).toBe(2);

      for (const button of bagButtons) {
        const calls = preload.mock.calls.length;
        fireEvent.mouseEnter(button);
        expect(preload).toHaveBeenCalledTimes(calls + 1);
        button.focus();
        expect(preload).toHaveBeenCalledTimes(calls + 2);
        expect(document.activeElement).toBe(button);
      }
      expect(mockCartState.openCart).not.toHaveBeenCalled();
      fireEvent.click(bagButtons[0]);
      expect(mockCartState.openCart).toHaveBeenCalledTimes(1);
    });
  });
});
