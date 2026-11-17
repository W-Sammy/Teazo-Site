// @vitest-environment jsdom

/** Real cart, customizer, security owner, and widget wrapper; only the SDK/network are simulated. */
import React, { StrictMode } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CartProvider, CART_STORAGE_KEY, useCart } from "@/app/context/cart-context";
import CartDrawer from "./cart-drawer";
import MenuCatalog from "./menu-catalog";
import CheckoutSecurityHost from "./checkout-security-host";
import CustomizerLoadingModal from "./customizer-loading-modal";
import TurnstileWidget from "@/app/components/turnstile-widget";
import { preloadCustomizerModule } from "./lazy-customizer-modal";
import {
  consumeCheckoutToken, getCheckoutSecuritySnapshot, MAX_ACTIVE_REFRESHES,
  resetCheckoutSecurity, resetCheckoutSecuritySessionForTesting,
  startCheckoutVerification, TURNSTILE_TOKEN_TTL_MS,
} from "@/app/lib/checkout-security";
import type { MenuItem } from "@/app/types/menu-item";
import type { MenuItem as CatalogMenuItem } from "./menu-item-card";

const mocks = vi.hoisted(() => {
  const originalKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
  return { originalKey };
});
vi.mock("next/font/google", () => ({ Cabin_Sketch: () => ({ className: "font" }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const available = { available: true, locationId: "LOC", reasons: [] };
const item: MenuItem & CatalogMenuItem = {
  catalogObjectId: "SECURITY_TEA", variationId: "VAR", name: "Review Tea",
  priceCents: 500, currency: "USD", imageUrl: null, categories: [],
  categoryId: null, categoryName: null, description: undefined,
  modifiers: [], availability: available,
  variations: [{ id: "VAR", name: "Regular", priceCents: 500, availability: available }],
};
const cartItem = {
  cartItemId: "CART_TEA", catalogObjectId: item.catalogObjectId, variationId: "VAR",
  name: item.name, basePriceCents: 500, selectedModifiers: [], quantity: 1, itemTotalCents: 500,
};
const hours = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => ({ day, start: 0, end: 24, closed: false }));

type Widget = {
  id: string; frame: HTMLIFrameElement; input: HTMLInputElement;
  options: Record<string, unknown>; removed: boolean;
};
let widgets: Widget[];
let paused: boolean;
let productResponse: () => Promise<Response>;
let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<Response>>;
let sdk: NonNullable<Window["turnstile"]>;

function sdkEvent(widget: Widget, event: string, token?: string) {
  if (event === "callback") widget.input.value = token ?? "";
  (widget.options[event] as ((token?: string) => void) | undefined)?.(token);
}
const checkoutWidgets = () => widgets.filter(w => w.options.action === "checkout");
const currentWidget = () => checkoutWidgets().findLast(w => !w.removed)!;
const snapshot = getCheckoutSecuritySnapshot;

function BagControl() {
  const { openCart } = useCart();
  return <button onClick={openCart}>Open bag</button>;
}
function Catalog() {
  return <MenuCatalog sections={[{ id: "tea", title: "Teas", items: [item] }]}
    headingClassName="" bodyClassName="" />;
}
function Storefront({ showCatalog = true, initialOpen = false }: { showCatalog?: boolean; initialOpen?: boolean }) {
  return <CartProvider initialOpen={initialOpen}>
    {showCatalog && <Catalog />}
    <BagControl />
    <CartDrawer />
  </CartProvider>;
}
async function customize() {
  fireEvent.click(screen.getByRole("button", { name: "Customize Review Tea" }));
  await screen.findByRole("button", { name: /Add to Bag/ });
  await waitFor(() => expect(currentWidget()).toBeTruthy());
}
async function addToBag() {
  fireEvent.click(screen.getByRole("button", { name: /Add to Bag/ }));
  await screen.findByTestId("checkout-status-announcement");
}

beforeEach(() => {
  document.querySelectorAll("script[data-teazo-turnstile]").forEach(script => script.remove());
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
      clear: () => values.clear(),
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  resetCheckoutSecuritySessionForTesting();
  window.history.replaceState({}, "", "/menu");
  localStorage.clear();
  widgets = [];
  paused = false;
  productResponse = async () => Response.json(item);
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/products/")) return productResponse();
    if (url === "/api/website-content") return Response.json({
      onlineOrderingEnabled: !paused, hours, holidays: [], address: { phone: "415-555-0100" },
    });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  sdk = {
    render: vi.fn((container: HTMLElement, options: Record<string, unknown>) => {
      const frame = document.createElement("iframe");
      frame.title = `${options.action} verification`;
      frame.tabIndex = 0;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "cf-turnstile-response";
      container.append(frame, input);
      const id = `widget-${widgets.length}`;
      widgets.push({ id, frame, input, options, removed: false });
      return id;
    }),
    remove: vi.fn((id: string) => {
      const widget = widgets.find(w => w.id === id)!;
      widget.removed = true;
      widget.frame.remove();
      widget.input.remove();
    }),
    reset: vi.fn(),
  };
  window.turnstile = sdk;
});
afterEach(async () => {
  cleanup();
  // Flush owner disposal, which intentionally survives Strict Mode effect replay.
  await act(async () => {});
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.turnstile;
  resetCheckoutSecuritySessionForTesting();
});
afterAll(() => {
  if (mocks.originalKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = mocks.originalKey;
});

describe("checkout security through the actual ordering flow", () => {
  it("preloading and ordinary browsing do not generate checkout tokens", async () => {
    render(<Storefront />);
    preloadCustomizerModule();
    await act(async () => {});
    expect(checkoutWidgets()).toHaveLength(0);
    expect(snapshot().hasActiveIntent).toBe(false);
    expect(document.getElementById("checkout-contact-form")).toBeNull();
  });

  it.each(["pending", "completed", "completing during add"])("preserves %s verification across actual Add to Bag", async timing => {
    render(<Storefront />);
    await customize();
    const original = currentWidget();
    expect(document.getElementById("checkout-contact-form")).toBeNull();
    if (timing === "completed") act(() => sdkEvent(original, "callback", "early-token"));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Add to Bag/ }));
      if (timing === "completing during add") sdkEvent(original, "callback", "during-add-token");
    });
    await screen.findByTestId("checkout-status-announcement");
    expect(currentWidget()).toBe(original);
    expect(original.frame.isConnected).toBe(true);
    expect(original.removed).toBe(false);
    expect(checkoutWidgets()).toHaveLength(1);
    const securityRegion = screen.getByRole("region", { name: "Checkout security verification" });
    expect(securityRegion.contains(original.frame)).toBe(true);
    expect(securityRegion.getAttribute("data-placement")).toBe("cart");
    expect(screen.getByRole("dialog", { name: "Shopping Bag" }).getAttribute("aria-owns")).toBe(securityRegion.id);
    expect(original.options.appearance).toBe("always");
    expect(screen.getByTestId("checkout-security-slot")).toBeTruthy();
    if (timing === "pending") act(() => sdkEvent(original, "callback", "late-token"));
    expect(snapshot().token).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/checkout")).toBe(false);
  });

  it("preserves valid verification across repeated customizers without creating a new widget", async () => {
    render(<Storefront />);
    await customize();
    const original = currentWidget();
    act(() => sdkEvent(original, "callback", "valid-token"));
    fireEvent.click(screen.getByRole("button", { name: "Close customizer" }));
    expect(snapshot().hasActiveIntent).toBe(false);
    expect(original.removed).toBe(false);
    await customize();
    expect(snapshot().token).toBe("valid-token");
    expect(checkoutWidgets()).toHaveLength(1);
  });

  it("includes the visible cart widget in the bag keyboard loop", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    const widget = currentWidget();
    act(() => sdkEvent(widget, "callback", "visible-bag-token"));
    const checkout = screen.getByRole("button", { name: /Proceed to Checkout/ });
    const close = screen.getByRole("button", { name: "Close cart" });
    checkout.focus();
    fireEvent.keyDown(checkout, { key: "Tab" });
    expect(document.activeElement).toBe(widget.frame);
    fireEvent.focus(screen.getByTestId("security-focus-start"));
    expect(document.activeElement).toBe(checkout);
    fireEvent.focus(screen.getByTestId("security-focus-end"));
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(widget.frame);
    fireEvent.click(close);
    expect(screen.queryByRole("region", { name: "Checkout security verification" })).toBeNull();
    expect(widget.removed).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Open bag" }));
    expect(screen.getByRole("region", { name: "Checkout security verification" }).contains(widget.frame)).toBe(true);
    expect(checkoutWidgets()).toHaveLength(1);
  });

  it("keeps a widget in a closed shadow root reachable from the bag and challenge keyboard loops", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    const widget = currentWidget();
    // The live Cloudflare SDK hides its iframe from ordinary DOM queries.
    const shadowHost = document.createElement("div");
    widget.frame.parentElement!.append(shadowHost);
    shadowHost.attachShadow({ mode: "closed" }).append(widget.frame);
    const boundary = document.querySelector<HTMLElement>("[data-checkout-security-widget]")!;
    expect(boundary.querySelector("iframe")).toBeNull();
    act(() => sdkEvent(widget, "callback", "shadow-token"));
    const checkout = screen.getByRole("button", { name: /Proceed to Checkout/ });
    checkout.focus();
    fireEvent.keyDown(checkout, { key: "Tab" });
    expect(document.activeElement).toBe(boundary);
    const close = screen.getByRole("button", { name: "Close cart" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(boundary);
    act(() => sdkEvent(widget, "before-interactive-callback"));
    fireEvent.focus(screen.getByTestId("security-focus-end"));
    expect(document.activeElement).toBe(boundary);
    fireEvent.focus(screen.getByTestId("security-focus-start"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue later" }));
  });

  it("keeps the cart badge aligned with its footer space after layout changes", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-security-slot");
    const widget = currentWidget();
    const slot = screen.getByTestId("checkout-security-slot");
    const host = screen.getByRole("region", { name: "Checkout security verification" });
    vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
      top: 300, left: 25, width: 350, height: 65, right: 375, bottom: 365, x: 25, y: 300,
      toJSON: () => ({}),
    });
    fireEvent(window, new Event("resize"));
    expect(host.style.getPropertyValue("--security-top")).toBe("300px");
    expect(host.style.getPropertyValue("--security-width")).toBe("350px");
    expect(currentWidget()).toBe(widget);
    expect(widget.frame.isConnected).toBe(true);
    expect(checkoutWidgets()).toHaveLength(1);
  });

  it("removes abandoned pending work and rejects callbacks after unmount", async () => {
    render(<Storefront />);
    await customize();
    const abandoned = currentWidget();
    fireEvent.click(screen.getByRole("button", { name: "Close customizer" }));
    expect(abandoned.removed).toBe(true);
    act(() => sdkEvent(abandoned, "callback", "obsolete-token"));
    expect(snapshot().token).toBeNull();
    expect(snapshot().hasActiveIntent).toBe(false);
    await customize();
    expect(currentWidget()).not.toBe(abandoned);
    act(() => sdkEvent(abandoned, "before-interactive-callback"));
    expect(snapshot().isInteractive).toBe(false);
  });

  it("keeps one owner for a warm deep link, including Strict Mode remounts", async () => {
    render(<Storefront />);
    await customize(); // Warm the actual lazy customizer module.
    cleanup();
    await act(async () => {});
    widgets = [];
    window.history.replaceState({}, "", "/menu?item=SECURITY_TEA");
    render(<StrictMode><Storefront /></StrictMode>);
    await screen.findByRole("button", { name: /Add to Bag/ });
    expect(screen.getAllByTestId("checkout-security-host")).toHaveLength(1);
    expect(checkoutWidgets().filter(w => !w.removed)).toHaveLength(1);
    act(() => sdkEvent(currentWidget(), "callback", "deep-link-token"));
    await addToBag();
    expect(snapshot().token).toBe("deep-link-token");
    expect(checkoutWidgets().filter(w => !w.removed)).toHaveLength(1);
  });

  it("releases customization intent when navigating away", async () => {
    const view = render(<Storefront />);
    await customize();
    const old = currentWidget();
    view.rerender(<Storefront showCatalog={false} />);
    expect(snapshot().isCustomizerOpen).toBe(false);
    expect(snapshot().hasActiveIntent).toBe(false);
    expect(old.removed).toBe(true);
    view.rerender(<Storefront />);
    await customize();
    act(() => sdkEvent(old, "callback", "old-navigation-token"));
    expect(snapshot().token).toBeNull();
  });

  it.each(["failure", "cancellation"])("does not retain customizer intent after edit %s", async outcome => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByRole("button", { name: "Edit" });
    let release!: (response: Response) => void;
    productResponse = () => new Promise(resolve => { release = resolve; });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(snapshot().isCustomizerOpen).toBe(false);
    if (outcome === "failure") {
      await act(async () => release(new Response("{}", { status: 503 })));
    }
    fireEvent.click(screen.getByRole("button", { name: "Close cart" }));
    if (outcome === "cancellation") await act(async () => release(Response.json(item)));
    expect(snapshot().hasActiveIntent).toBe(false);
    expect(snapshot().isCustomizerOpen).toBe(false);
    expect(checkoutWidgets().every(w => w.removed)).toBe(true);
  });

  it("resumes verification when reopened store settings stop pausing orders", async () => {
    paused = true;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await waitFor(() => expect(screen.getByTestId("checkout-status-announcement").textContent).toContain("Online ordering paused"));
    fireEvent.click(screen.getByRole("button", { name: "Close cart" }));
    paused = false;
    fireEvent.click(screen.getByRole("button", { name: "Open bag" }));
    await waitFor(() => expect(snapshot().status).toBe("pending"));
    expect(snapshot().isCartOpen).toBe(true);
    expect(currentWidget()).toBeTruthy();
    act(() => sdkEvent(currentWidget(), "callback", "resumed-token"));
    expect(screen.getByRole("button", { name: /Proceed to Checkout/ }).hasAttribute("disabled")).toBe(false);
  });

  it("gives a Managed challenge its own visible dialog and keyboard scope", async () => {
    render(<Storefront />);
    await customize();
    const widget = currentWidget();
    act(() => sdkEvent(widget, "before-interactive-callback"));
    const dialog = screen.getByRole("dialog", { name: "Please verify you are human to continue" });
    expect(dialog.contains(widget.frame)).toBe(true);
    expect(currentWidget()).toBe(widget);
    expect(widget.removed).toBe(false);
    expect(dialog.className).toContain("z-[10080]");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Please verify you are human to continue" }));
    expect(screen.getByRole("button", { name: "Close customizer", hidden: true }).closest('[role="dialog"]')?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.focus(screen.getByTestId("security-focus-start"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Continue later" }));
    fireEvent.focus(screen.getByTestId("security-focus-end"));
    expect(document.activeElement).toBe(widget.frame);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(snapshot().isInteractive).toBe(false);
    expect(widget.removed).toBe(true);
    // Escape closes only the foreground challenge; the drink choices remain.
    expect(screen.getByRole("button", { name: "Close customizer" })).toBeTruthy();
    await addToBag();
    expect(currentWidget()).not.toBe(widget);
    act(() => sdkEvent(currentWidget(), "before-interactive-callback"));
    expect(screen.getByRole("button", { name: "Close cart", hidden: true }).closest('[role="dialog"]')?.getAttribute("aria-hidden")).toBe("true");
    act(() => sdkEvent(currentWidget(), "callback", "challenge-token"));
    expect(screen.getByRole("button", { name: /Proceed to Checkout/ }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["callback", "after-interactive-callback", "error-callback", "Escape", "Continue later"])(
    "returns focus to the loaded customizer when its loading button disappears during a challenge: %s",
    async outcome => {
      // Keep the bag open underneath, as it is when editing an existing drink.
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
      const onClose = vi.fn();
      const view = render(<CartProvider initialOpen>
        <CartDrawer />
        <CustomizerLoadingModal onDismiss={onClose} />
      </CartProvider>);
      await screen.findByTestId("checkout-status-announcement");
      act(() => startCheckoutVerification("customizer"));
      const cancel = screen.getByRole("button", { name: "Cancel" });
      cancel.focus();
      const widget = currentWidget();
      act(() => sdkEvent(widget, "before-interactive-callback"));

      const { default: ItemCustomizerModal } = await import("./item-customizer-modal");
      view.rerender(<CartProvider initialOpen>
        <CartDrawer />
        <ItemCustomizerModal item={item} onClose={onClose} />
      </CartProvider>);
      expect(cancel.isConnected).toBe(false);
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Please verify you are human to continue" }));

      if (outcome === "Escape") fireEvent.keyDown(window, { key: "Escape" });
      else if (outcome === "Continue later") fireEvent.click(screen.getByRole("button", { name: "Continue later" }));
      else act(() => sdkEvent(widget, outcome, "challenge-token"));

      const customizer = screen.getByRole("dialog", { name: item.name });
      expect(customizer.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(document.body);
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it.each(["customizer", "bag"])("restores the original control in the %s when it remains available", async view => {
    if (view === "bag") localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen={view === "bag"} />);
    if (view === "customizer") await customize();
    else await screen.findByTestId("checkout-status-announcement");
    const previous = screen.getByRole("button", { name: view === "customizer" ? "Close customizer" : "Close cart" });
    previous.focus();
    const widget = currentWidget();
    act(() => sdkEvent(widget, "before-interactive-callback"));
    act(() => sdkEvent(widget, "callback", "challenge-token"));
    expect(document.activeElement).toBe(previous);
  });

  it.each(["removed", "disabled"])("falls back to the bag when its original control is %s", async unavailable => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    const previous = screen.getByLabelText("Full Name*") as HTMLInputElement;
    previous.focus();
    const widget = currentWidget();
    act(() => sdkEvent(widget, "before-interactive-callback"));
    if (unavailable === "removed") previous.remove();
    else previous.disabled = true;
    act(() => sdkEvent(widget, "callback", "challenge-token"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close cart" }));
  });

  it("rejects saved SDK callbacks after reset and token consumption", () => {
    render(<CheckoutSecurityHost />);
    act(() => startCheckoutVerification("bag"));
    const old = currentWidget();
    act(() => sdkEvent(old, "callback", "submitted-token"));
    act(() => resetCheckoutSecurity());
    const fresh = currentWidget();
    expect(old.removed).toBe(true);
    act(() => {
      sdkEvent(old, "callback", "submitted-token");
      sdkEvent(old, "expired-callback");
      sdkEvent(old, "error-callback");
      sdkEvent(old, "before-interactive-callback");
    });
    expect(snapshot().status).toBe("pending");
    expect(snapshot().token).toBeNull();
    expect(snapshot().isInteractive).toBe(false);
    act(() => sdkEvent(fresh, "callback", "fresh-token"));
    act(() => consumeCheckoutToken());
    act(() => sdkEvent(fresh, "callback", "fresh-token"));
    expect(snapshot().token).toBeNull();
    expect(snapshot().status).toBe("idle");
  });

  it("recovers from an actual failed checkout without clearing customer inputs", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    const original = currentWidget();
    act(() => sdkEvent(original, "callback", "submitted-token"));
    fireEvent.change(screen.getByLabelText("Full Name*"), { target: { value: "Review Customer" } });
    fireEvent.change(screen.getByLabelText(/Mobile Phone/), { target: { value: "4155550100" } });
    fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: "review@example.com" } });
    const normalFetch = fetchMock.getMockImplementation()!;
    let release!: (response: Response) => void;
    fetchMock.mockImplementation((url: string) => url === "/api/checkout"
      ? new Promise<Response>(resolve => { release = resolve; })
      : normalFetch(url));
    fireEvent.click(screen.getByRole("button", { name: /Proceed to Checkout/ }));
    expect(screen.getByRole("button", { name: "Redirecting to Square..." }).hasAttribute("disabled")).toBe(true);
    const attempt = fetchMock.mock.calls.find(([url]) => url === "/api/checkout")!;
    expect(JSON.parse(attempt[1]!.body as string).turnstileToken).toBe("submitted-token");
    await act(async () => release(Response.json({ error: "Try checkout again" }, { status: 503 })));
    expect(original.removed).toBe(true);
    expect(snapshot().token).toBeNull();
    act(() => sdkEvent(original, "callback", "submitted-token"));
    expect(snapshot().token).toBeNull();
    expect((screen.getByLabelText("Full Name*") as HTMLInputElement).value).toBe("Review Customer");
    const fresh = currentWidget();
    act(() => sdkEvent(fresh, "callback", "fresh-token"));
    expect(screen.getByRole("button", { name: /Proceed to Checkout/ }).hasAttribute("disabled")).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/checkout")).toHaveLength(1);
  });

  it("expires a completed token while the bag is closed without background refresh", async () => {
    render(<Storefront />);
    await customize();
    const widget = currentWidget();
    vi.useFakeTimers();
    act(() => sdkEvent(widget, "callback", "closed-token"));
    fireEvent.click(screen.getByRole("button", { name: "Close customizer" }));
    act(() => vi.advanceTimersByTime(TURNSTILE_TOKEN_TTL_MS));
    expect(widget.removed).toBe(true);
    expect(snapshot().token).toBeNull();
    expect(snapshot().status).toBe("expired");
    const count = widgets.length;
    act(() => vi.advanceTimersByTime(TURNSTILE_TOKEN_TTL_MS * 10));
    expect(widgets).toHaveLength(count);
    vi.useRealTimers();
    await customize();
    expect(currentWidget()).not.toBe(widget);
    expect(snapshot().status).toBe("pending");
  });

  it.each(["challenge", "timeout"])("explains and recovers from a %s error", async failure => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    const failedWidget = currentWidget();
    act(() => {
      sdkEvent(failedWidget, failure === "challenge" ? "error-callback" : "timeout-callback");
    });
    expect(failedWidget.removed).toBe(true);
    expect(screen.getByRole("button", { name: "Security check unavailable" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry security verification" }));
    const retry = currentWidget();
    expect(retry).not.toBe(failedWidget);
    act(() => sdkEvent(retry, "callback", "recovered-token"));
    expect(snapshot().isInteractive).toBe(false);
    expect(screen.getByRole("button", { name: /Proceed to Checkout/ }).hasAttribute("disabled")).toBe(false);
  });

  it("downloads the shared script again after a failed download and explicit retry", async () => {
    delete window.turnstile;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    const originalScript = document.querySelector("script[data-teazo-turnstile]")!;
    expect(originalScript).toBeTruthy();
    fireEvent.error(originalScript);
    expect(originalScript.isConnected).toBe(false);
    expect(screen.getByRole("button", { name: "Security check unavailable" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry security verification" }));
    const retryScript = document.querySelector("script[data-teazo-turnstile]")!;
    expect(retryScript).toBeTruthy();
    expect(retryScript).not.toBe(originalScript);
    expect(document.querySelectorAll("script[data-teazo-turnstile]")).toHaveLength(1);
    window.turnstile = sdk;
    fireEvent.load(retryScript);
    act(() => sdkEvent(currentWidget(), "callback", "script-recovered-token"));
    expect(screen.getByRole("button", { name: /Proceed to Checkout/ }).hasAttribute("disabled")).toBe(false);
  });

  it("expires tokens without an SDK callback, caps automatic refresh, and offers a genuine retry", async () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([cartItem]));
    render(<Storefront initialOpen />);
    await screen.findByTestId("checkout-status-announcement");
    vi.useFakeTimers();
    for (let refresh = 0; refresh <= MAX_ACTIVE_REFRESHES; refresh++) {
      const widget = currentWidget();
      expect(widget.options["refresh-expired"]).toBe("manual");
      expect(widget.options["refresh-timeout"]).toBe("never");
      expect(widget.options.retry).toBe("never");
      act(() => sdkEvent(widget, "callback", `token-${refresh}`));
      act(() => vi.advanceTimersByTime(TURNSTILE_TOKEN_TTL_MS));
      expect(snapshot().token).toBeNull();
      expect(widget.removed).toBe(true);
    }
    expect(snapshot().status).toBe("expired");
    expect(screen.getByRole("button", { name: "Security verification expired" }).hasAttribute("disabled")).toBe(true);
    const count = widgets.length;
    act(() => vi.advanceTimersByTime(TURNSTILE_TOKEN_TTL_MS * 10));
    expect(widgets).toHaveLength(count);
    fireEvent.click(screen.getByRole("button", { name: "Retry security verification" }));
    expect(currentWidget()).toBeTruthy();
    expect(widgets).toHaveLength(count + 1);
  });

  it.each(["contact-first", "checkout-first"])("shares delayed script loading independently: %s", async order => {
    delete window.turnstile;
    act(() => startCheckoutVerification("bag"));
    const contact = <form key="contact" aria-label="Contact"><TurnstileWidget action="contact" /></form>;
    const checkout = <CheckoutSecurityHost key="checkout" />;
    render(<>{order === "contact-first" ? [contact, checkout] : [checkout, contact]}</>);
    expect(widgets).toHaveLength(0);
    window.turnstile = sdk;
    act(() => window.onTeazoTurnstileLoad?.());
    expect(widgets.map(w => w.options.action)).toEqual(order === "contact-first" ? ["contact", "checkout"] : ["checkout", "contact"]);
    const contactWidget = widgets.find(w => w.options.action === "contact")!;
    act(() => sdkEvent(contactWidget, "callback", "contact-only"));
    expect(snapshot().token).toBeNull();
    expect(new FormData(screen.getByRole("form", { name: "Contact" }) as HTMLFormElement).get("cf-turnstile-response")).toBe("contact-only");
    act(() => sdkEvent(currentWidget(), "callback", "checkout-only"));
    expect(snapshot().token).toBe("checkout-only");
    act(() => resetCheckoutSecurity());
    expect(contactWidget.removed).toBe(false);
    expect(contactWidget.input.value).toBe("contact-only");
  });
});
