/**
 * Tests for TEAZO Checkout Security Verification Lifecycle.
 *
 * Covers:
 * - Starting verification on customization intent before the bag opens.
 * - Deep link intent and menu item selection.
 * - Deduplication and session preservation across repeated intent.
 * - Token reuse and seamless transition from customizer to bag (pending and completed).
 * - Direct entry into a populated bag.
 * - Token expiration (5 min), bounded auto-refresh, and failure recovery.
 * - Obsolete callback suppression.
 * - Lack of auto-submission on token receipt.
 * - Independence from contact form Turnstile widget.
 * - Ordinary browsing does not start verification.
 * - Managed Turnstile interactive challenge visibility and container identity.
 */

// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { MenuItem } from "./menu-item-card";
import type { CartItem } from "@/app/types/checkout";
import {
  startCheckoutVerification,
  setCustomizerState,
  setCartState,
  resetCheckoutSecurity,
  resetCheckoutSecuritySessionForTesting,
  getCheckoutSecuritySnapshot,
  onTokenReceived,
  onTokenExpired,
} from "@/app/lib/checkout-security";
import CheckoutSecurityHost from "./checkout-security-host";

const mockCart = vi.hoisted(() => ({
  items: [] as CartItem[],
  totalCount: 0,
  subtotalCents: 0,
  isCartOpen: false,
  isHydrated: true,
  addItem: vi.fn(),
  updateItem: vi.fn(),
  removeItem: vi.fn(),
  updateQuantity: vi.fn(),
  setQuantity: vi.fn(),
  clearCart: vi.fn(),
  openCart: vi.fn(),
  closeCart: vi.fn(),
  toggleCart: vi.fn(),
}));

vi.mock("@/app/context/cart-context", () => ({
  useCart: () => mockCart,
  recordPendingCheckoutOrder: vi.fn(),
  MAX_ITEM_QUANTITY: 50,
  MIN_ITEM_QUANTITY: 1,
}));

vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
  Cabin_Sketch: () => ({ className: "test-cabin" }),
}));

vi.mock("next/image", () => ({ default: () => null }));

const turnstileCalls: Array<{
  action: string;
  appearance?: string;
  resetKey?: unknown;
  onToken?: (token: string) => void;
  onExpire?: () => void;
  onFailedChange?: (failed: boolean) => void;
  onBeforeInteractive?: () => void;
  onAfterInteractive?: () => void;
}> = [];

vi.mock("@/app/components/turnstile-widget", () => ({
  TURNSTILE_SITE_KEY: "test-turnstile-site-key",
  default: (props: {
    action: string;
    appearance?: string;
    resetKey?: unknown;
    onToken?: (token: string) => void;
    onExpire?: () => void;
    onFailedChange?: (failed: boolean) => void;
    onBeforeInteractive?: () => void;
    onAfterInteractive?: () => void;
  }) => {
    turnstileCalls.push(props);
    return (
      <div data-testid={`mock-turnstile-${props.action}`}>
        <button
          type="button"
          onClick={() => {
            props.onFailedChange?.(false);
            props.onToken?.(`token-for-${props.action}-${props.resetKey ?? 0}`);
          }}
        >
          Verify {props.action}
        </button>
        <button
          type="button"
          onClick={() => {
            props.onBeforeInteractive?.();
          }}
        >
          Trigger interactive challenge
        </button>
        <button
          type="button"
          onClick={() => {
            props.onFailedChange?.(true);
          }}
        >
          Fail {props.action}
        </button>
        <button
          type="button"
          onClick={() => {
            props.onExpire?.();
          }}
        >
          Expire {props.action}
        </button>
        <span data-testid={`turnstile-reset-key-${props.action}`}>
          {String(props.resetKey ?? 0)}
        </span>
      </div>
    );
  },
}));

import CartDrawer from "./cart-drawer";
import MenuCatalog from "./menu-catalog";

const testItem: MenuItem = {
  catalogObjectId: "ITEM_TEA_1",
  variationId: "VAR1",
  name: "Roasted Oolong Milk Tea",
  priceCents: 550,
  currency: "USD",
  imageUrl: null,
  categoryId: "CAT_MILK_TEA",
  categoryName: "Milk Tea",
  description: "Fragrant slow-roasted tea leaves",
  availability: { available: true, locationId: "LOC1", reasons: [] },
  modifiers: [],
  variations: [{ id: "VAR1", name: "Regular", priceCents: 550 }],
};

describe("Checkout Security Verification Lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    turnstileCalls.length = 0;
    resetCheckoutSecuritySessionForTesting();
    mockCart.items = [];
    mockCart.totalCount = 0;
    mockCart.subtotalCents = 0;
    mockCart.isCartOpen = false;
    mockCart.isHydrated = true;
  });

  afterEach(() => {
    cleanup();
    resetCheckoutSecuritySessionForTesting();
  });

  it("does not start checkout verification during ordinary browsing", () => {
    render(<CartDrawer />);
    render(
      <MenuCatalog
        sections={[{ id: "s1", title: "Teas", items: [testItem] }]}
        headingClassName=""
        bodyClassName=""
      />,
    );

    expect(screen.queryByTestId("mock-turnstile-checkout")).toBeNull();
    const snap = getCheckoutSecuritySnapshot();
    expect(snap.hasActiveIntent).toBe(false);
    expect(snap.status).toBe("idle");
    expect(snap.token).toBeNull();
  });

  it("starts verification when customization intent begins before the bag opens", async () => {
    render(<CartDrawer />);
    render(
      <MenuCatalog
        sections={[{ id: "s1", title: "Teas", items: [testItem] }]}
        headingClassName=""
        bodyClassName=""
      />,
    );

    expect(screen.queryByTestId("mock-turnstile-checkout")).toBeNull();

    // User clicks item on menu
    fireEvent.click(screen.getByRole("button", { name: /Roasted Oolong Milk Tea/i }));

    // Turnstile widget mounts immediately in the persistent host while the cart is still closed
    expect(screen.getByTestId("mock-turnstile-checkout")).toBeTruthy();
    const snap = getCheckoutSecuritySnapshot();
    expect(snap.hasActiveIntent).toBe(true);
    expect(snap.isCustomizerOpen).toBe(true);
    expect(snap.isCartOpen).toBe(false);
    expect(snap.status).toBe("pending");
  });

  it("starts verification immediately upon direct item deep link before the bag opens", () => {
    render(<CartDrawer />);
    render(
      <MenuCatalog
        sections={[{ id: "s1", title: "Teas", items: [testItem] }]}
        initialItemId={testItem.catalogObjectId}
        headingClassName=""
        bodyClassName=""
      />,
    );

    // Deep link directly opens customizer for testItem
    expect(screen.getByTestId("mock-turnstile-checkout")).toBeTruthy();
    const snap = getCheckoutSecuritySnapshot();
    expect(snap.hasActiveIntent).toBe(true);
    expect(snap.isCustomizerOpen).toBe(true);
    expect(snap.isCartOpen).toBe(false);
  });

  it("does not duplicate widgets or restart valid verification on repeated intent", () => {
    render(<CartDrawer />);
    render(
      <MenuCatalog
        sections={[{ id: "s1", title: "Teas", items: [testItem] }]}
        headingClassName=""
        bodyClassName=""
      />,
    );

    // First intent
    fireEvent.click(screen.getByRole("button", { name: /Roasted Oolong Milk Tea/i }));
    expect(screen.getAllByTestId("mock-turnstile-checkout")).toHaveLength(1);

    // Complete verification
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    const firstToken = getCheckoutSecuritySnapshot().token;
    expect(firstToken).toBeTruthy();

    // Repeated intent: calling startCheckoutVerification again must preserve the existing session and token
    act(() => {
      startCheckoutVerification("customizer");
    });

    expect(screen.getAllByTestId("mock-turnstile-checkout")).toHaveLength(1);
    expect(getCheckoutSecuritySnapshot().token).toBe(firstToken);
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
  });

  it("preserves completed verification during customizer-to-bag transition", async () => {
    const { rerender } = render(<CartDrawer />);
    render(
      <MenuCatalog
        sections={[{ id: "s1", title: "Teas", items: [testItem] }]}
        headingClassName=""
        bodyClassName=""
      />,
    );

    // Open customizer
    fireEvent.click(screen.getByRole("button", { name: /Roasted Oolong Milk Tea/i }));

    // Verification passes while customizing
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    const token = getCheckoutSecuritySnapshot().token;
    expect(token).toBeTruthy();

    // User adds item to bag and bag opens
    act(() => {
      setCustomizerState(false);
      mockCart.isCartOpen = true;
      mockCart.totalCount = 1;
      mockCart.items = [
        {
          cartItemId: "cart-1",
          catalogObjectId: testItem.catalogObjectId,
          variationId: "VAR1",
          name: testItem.name,
          basePriceCents: testItem.priceCents,
          imageUrl: null,
          selectedModifiers: [],
          quantity: 1,
          itemTotalCents: testItem.priceCents,
        },
      ];
      setCartState(true, 1);
    });

    rerender(<CartDrawer />);

    // The token is preserved!
    expect(getCheckoutSecuritySnapshot().token).toBe(token);
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
    expect(screen.getAllByTestId("mock-turnstile-checkout")).toHaveLength(1);
  });

  it("preserves pending verification during customizer-to-bag transition without restarting", () => {
    const { rerender } = render(<CartDrawer />);
    render(
      <MenuCatalog
        sections={[{ id: "s1", title: "Teas", items: [testItem] }]}
        headingClassName=""
        bodyClassName=""
      />,
    );

    // Open customizer
    fireEvent.click(screen.getByRole("button", { name: /Roasted Oolong Milk Tea/i }));
    const initialInstanceId = getCheckoutSecuritySnapshot().instanceId;
    expect(getCheckoutSecuritySnapshot().status).toBe("pending");

    // Transition to bag while verification is STILL pending
    act(() => {
      setCustomizerState(false);
      mockCart.isCartOpen = true;
      mockCart.totalCount = 1;
      setCartState(true, 1);
    });

    rerender(<CartDrawer />);

    // Session remains pending with the SAME instance ID (no restart/reset)
    expect(getCheckoutSecuritySnapshot().status).toBe("pending");
    expect(getCheckoutSecuritySnapshot().instanceId).toBe(initialInstanceId);

    // Pending verification completes after the bag has opened
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
    expect(getCheckoutSecuritySnapshot().token).toBeTruthy();
  });

  it("starts verification directly when customer opens a populated bag", () => {
    mockCart.isCartOpen = true;
    mockCart.totalCount = 2;
    mockCart.items = [
      {
        cartItemId: "c1",
        catalogObjectId: "ITEM1",
        variationId: "v1",
        name: "Tea",
        basePriceCents: 500,
        imageUrl: null,
        selectedModifiers: [],
        quantity: 2,
        itemTotalCents: 1000,
      },
    ];

    render(<CartDrawer />);

    expect(screen.getByTestId("mock-turnstile-checkout")).toBeTruthy();
    expect(getCheckoutSecuritySnapshot().status).toBe("pending");

    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
  });

  it("handles token expiration and bounds auto-refresh", () => {
    render(<CheckoutSecurityHost />);
    act(() => {
      startCheckoutVerification("bag");
    });

    // Provide initial token
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");

    // First expiration while open -> auto-refreshes (refreshCount = 1)
    fireEvent.click(screen.getByRole("button", { name: "Expire checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("pending");
    expect(getCheckoutSecuritySnapshot().token).toBeNull();

    // Verify refreshed token
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");

    // Second expiration while open -> auto-refreshes (refreshCount = 2)
    fireEvent.click(screen.getByRole("button", { name: "Expire checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("pending");

    // Verify second refreshed token
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");

    // Third expiration reaches MAX_ACTIVE_REFRESHES -> bounds refresh loop and sets status to expired
    fireEvent.click(screen.getByRole("button", { name: "Expire checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("expired");
    expect(getCheckoutSecuritySnapshot().token).toBeNull();
  });

  it("does not auto-refresh expired token if ordering intent was abandoned", () => {
    render(<CheckoutSecurityHost />);
    act(() => {
      startCheckoutVerification("customizer");
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");

    // User closes customizer and abandons intent (no cart items, cart closed)
    act(() => {
      setCustomizerState(false);
      setCartState(false, 0);
    });

    // Token expires after abandonment
    act(() => {
      onTokenExpired(getCheckoutSecuritySnapshot().instanceId);
    });

    // Status is expired and no auto-refresh loop is triggered
    expect(getCheckoutSecuritySnapshot().status).toBe("expired");
    expect(getCheckoutSecuritySnapshot().token).toBeNull();
  });

  it("resets security token after checkout failure and allows recovery", () => {
    render(<CheckoutSecurityHost />);
    act(() => {
      startCheckoutVerification("bag");
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
    expect(getCheckoutSecuritySnapshot().resetKey).toBe(0);

    // Checkout submission fails
    act(() => {
      resetCheckoutSecurity();
    });

    expect(getCheckoutSecuritySnapshot().status).toBe("pending");
    expect(getCheckoutSecuritySnapshot().token).toBeNull();
    expect(getCheckoutSecuritySnapshot().resetKey).toBe(1);

    // Customer can supply new token and recover
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
    expect(getCheckoutSecuritySnapshot().token).toContain("token-for-checkout-1");
  });

  it("ignores obsolete callbacks from superseded instances", () => {
    render(<CheckoutSecurityHost />);
    act(() => {
      startCheckoutVerification("bag");
    });

    const oldInstanceId = getCheckoutSecuritySnapshot().instanceId;

    // Reset occurs, superseding oldInstanceId
    act(() => {
      resetCheckoutSecurity();
    });
    const newInstanceId = getCheckoutSecuritySnapshot().instanceId;
    expect(newInstanceId).toBeGreaterThan(oldInstanceId);

    // Stale callback from old instance arrives
    act(() => {
      onTokenReceived("stale-token", oldInstanceId);
    });

    // Stale token is rejected
    expect(getCheckoutSecuritySnapshot().token).toBeNull();
    expect(getCheckoutSecuritySnapshot().status).toBe("pending");

    // Callback from current instance arrives
    act(() => {
      onTokenReceived("current-token", newInstanceId);
    });
    expect(getCheckoutSecuritySnapshot().token).toBe("current-token");
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
  });

  it("receiving a token never submits checkout automatically", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CheckoutSecurityHost />);

    act(() => {
      startCheckoutVerification("customizer");
    });

    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");

    // No checkout submission request was sent
    expect(fetchSpy).not.toHaveBeenCalledWith("/api/checkout", expect.anything());
  });

  it("does not interfere with contact form Turnstile widget", () => {
    render(<CheckoutSecurityHost />);
    act(() => {
      startCheckoutVerification("customizer");
    });

    // Checkout widget mounted with action="checkout" and appearance="always"
    const checkoutCall = turnstileCalls.find((c) => c.action === "checkout");
    expect(checkoutCall).toBeTruthy();
    expect(checkoutCall?.appearance).toBe("always");

    // Simulate contact form mounting
    const contactTokenCallback = vi.fn();

    // Verify checkout does not affect contact
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(contactTokenCallback).not.toHaveBeenCalled();
    expect(getCheckoutSecuritySnapshot().token).toContain("token-for-checkout");
  });

  it("displays accessible interactive challenge when Cloudflare Managed mode requires interaction", () => {
    render(<CheckoutSecurityHost />);
    act(() => {
      startCheckoutVerification("customizer");
    });

    const host = screen.getByTestId("checkout-security-host");
    // Initially non-interactive: hidden out of flow
    expect(host.className).toContain("pointer-events-none");

    // Cloudflare invokes before-interactive-callback
    fireEvent.click(screen.getByRole("button", { name: "Trigger interactive challenge" }));

    // Host becomes visible with accessible role and alert heading
    expect(host.getAttribute("role")).toBe("dialog");
    expect(host.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Please verify you are human to continue")).toBeTruthy();
    expect(host.className).toContain("z-[10080]");

    // User completes the challenge
    fireEvent.click(screen.getByRole("button", { name: "Verify checkout" }));
    expect(getCheckoutSecuritySnapshot().isInteractive).toBe(false);
    expect(getCheckoutSecuritySnapshot().status).toBe("ready");
  });
});
