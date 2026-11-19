/**
 * Tests public shopping bag checkout submission.
 *
 * Covers button disabling, repeated submissions,
 * validation, failure recovery, security token reset,
 * and ordering availability.
 *
 * All cart, Turnstile, and network dependencies are
 * mocked. No production orders or payments are made.
 */

// @vitest-environment jsdom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type {
  CartItem,
} from "@/app/types/checkout";

import type {
  WebsiteContent,
} from "@/app/types/website-content";

const mocks = vi.hoisted(() => ({
  useCart: vi.fn(),
  recordPendingCheckoutOrder: vi.fn(),
  fetch: vi.fn(),
  getPickupDays: vi.fn(
    () => [] as Array<{ date: string; label: string; slots: string[] }>,
  ),
  getStoreScheduleForDate: vi.fn(() => ({
    closed: false,
    openMinuteOfDay: 0,
    closeMinuteOfDay: 1439,
    cutoffMinuteOfDay: 1439,
    openHour: 0,
    closeHour: 24,
  })),
}));

vi.mock("@/app/context/cart-context", () => ({
  useCart: mocks.useCart,
  recordPendingCheckoutOrder:
    mocks.recordPendingCheckoutOrder,
  MAX_ITEM_QUANTITY: 50,
}));

vi.mock("next/font/google", () => ({
  Montserrat: () => ({
    className: "test-montserrat",
  }),
  Cabin_Sketch: () => ({
    className: "test-cabin",
  }),
}));

vi.mock("next/image", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/app/(site)/components/payment-badges", () => ({
  default: () => null,
}));

vi.mock(
  "@/app/(site)/components/item-customizer-modal",
  () => ({
    default: () => null,
  }),
);

vi.mock("@/app/components/turnstile-widget", () => ({
  TURNSTILE_SITE_KEY: "test-site-key",
  default: ({
    onToken,
    onFailedChange,
    resetKey,
  }: {
    onToken?: (token: string) => void;
    onFailedChange?: (failed: boolean) => void;
    resetKey?: number;
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          onFailedChange?.(false);
          onToken?.("valid-test-token");
        }}
      >
        Supply security token
      </button>
      <button
        type="button"
        onClick={() => {
          onFailedChange?.(true);
        }}
      >
        Fail security check
      </button>
      <span data-testid="turnstile-reset-key">
        {resetKey ?? 0}
      </span>
    </div>
  ),
}));

// Use a predictable, open store schedule.
// These tests focus on checkout submission behavior,
// not the store-hours calculations tested elsewhere.
vi.mock("@/app/lib/store-hours", () => ({
  getPickupDays: () => mocks.getPickupDays(),
  getPacificParts: () => ({
    minuteOfDay: 900,
  }),
  formatMinuteOfDay: () => "3:00 PM",
  getStoreScheduleForDate: () => mocks.getStoreScheduleForDate(),
  MAX_SCHEDULE_DAYS_AHEAD: 7,
  ONLINE_ORDERING_PAUSED_MESSAGE:
    "Online ordering is paused right now.",
}));

import CartDrawer from "./cart-drawer";
import { getCheckoutStatus } from "./cart-drawer-content";

const cartItem: CartItem = {
  cartItemId: "cart-item-1",
  catalogObjectId: "ITEM1",
  variationId: "VAR1",
  variationName: "Regular",
  name: "Milk Tea",
  basePriceCents: 500,
  imageUrl: null,
  selectedModifiers: [],
  quantity: 1,
  itemTotalCents: 500,
};

const DAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function makeContent(
  overrides: Partial<WebsiteContent> = {},
): WebsiteContent {
  return {
    logo: "",
    story: "",
    socialLinks: [],
    address: {
      businessName: "TEAZO",
      streetAddress: "1050 Taraval St",
      locality: "San Francisco, CA 94116",
      phone: "+1 (415) 748-7398",
      email: "contact@example.com",
    },
    hours: DAYS.map((day) => ({
      day,
      start: 11,
      end: 20,
      closed: false,
    })),
    holidays: [],
    contactFormEnabled: true,
    onlineOrderingEnabled: true,
    ...overrides,
  };
}

function failedResponse(
  message = "Square temporarily unavailable",
): Response {
  return Response.json(
    { error: message },
    { status: 503 },
  );
}

function checkoutCalls() {
  return mocks.fetch.mock.calls.filter(
    (call) => call[0] === "/api/checkout",
  );
}

function setFetchResponses(
  content = makeContent(),
) {
  mocks.fetch.mockImplementation(
    async (url: string) => {
      if (url === "/api/website-content") {
        return Response.json(content);
      }

      if (url === "/api/checkout") {
        return failedResponse();
      }

      throw new Error(
        `Unexpected request: ${url}`,
      );
    },
  );
}

function pendingCheckout() {
  let settle!: (response: Response) => void;

  const pending = new Promise<Response>(
    (resolve) => {
      settle = resolve;
    },
  );

  mocks.fetch.mockImplementation(
    async (url: string) => {
      if (url === "/api/website-content") {
        return Response.json(makeContent());
      }

      if (url === "/api/checkout") {
        return pending;
      }

      throw new Error(
        `Unexpected request: ${url}`,
      );
    },
  );

  return { settle };
}

// The checkout button changes its accessible name to reflect its
// checkout status (loading, paused, blocked, security, ready, submitting).
const CHECKOUT_BUTTON_NAMES =
  /Proceed to Checkout|Redirecting to Square|Loading pickup times|Pickup times unavailable|Online ordering paused|Select a pickup time|No pickup times available|ASAP pickup unavailable|Checking security|Security check unavailable/;

function checkoutButton() {
  return screen.getByRole("button", {
    name: CHECKOUT_BUTTON_NAMES,
  }) as HTMLButtonElement;
}

function supplySecurityToken() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Supply security token",
    }),
  );
}

function failSecurityCheck() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Fail security check",
    }),
  );
}

function fillCustomerForm() {
  fireEvent.change(
    screen.getByLabelText(/Full Name/),
    {
      target: {
        value: "  Taylor Smith  ",
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText(/Mobile Phone/),
    {
      target: {
        value: "(415) 555-0100",
      },
    },
  );

  fireEvent.change(
    screen.getByLabelText(/Email Address/),
    {
      target: {
        value: "  taylor@example.com  ",
      },
    },
  );
}

async function renderReadyCart() {
  render(<CartDrawer />);

  await waitFor(() => {
    expect(
      screen.getByRole("button", {
        name: /ASAP \(~20/,
      }),
    ).toBeTruthy();
  });
}

async function prepareCheckout() {
  await renderReadyCart();
  fillCustomerForm();
  supplySecurityToken();

  await waitFor(() => {
    expect(checkoutButton().disabled).toBe(false);
  });
}

function submitCheckoutForm() {
  const form = document.getElementById(
    "checkout-contact-form",
  );

  if (!form) {
    throw new Error("Checkout form is missing");
  }

  fireEvent.submit(form);
}

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const mockLocalStorage = createStorageMock();
const mockSessionStorage = createStorageMock();
Object.defineProperty(window, "localStorage", { value: mockLocalStorage, writable: true, configurable: true });
Object.defineProperty(window, "sessionStorage", { value: mockSessionStorage, writable: true, configurable: true });

describe("Shopping Bag checkout submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPickupDays.mockReset();
    mocks.getPickupDays.mockReturnValue([]);
    mocks.getStoreScheduleForDate.mockReset();
    mocks.getStoreScheduleForDate.mockReturnValue({
      closed: false,
      openMinuteOfDay: 0,
      closeMinuteOfDay: 1439,
      cutoffMinuteOfDay: 1439,
      openHour: 0,
      closeHour: 24,
    });

    window.localStorage.clear();
    window.sessionStorage.clear();

    vi.spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.useCart.mockReturnValue({
      items: [cartItem],
      totalCount: 1,
      subtotalCents: 500,
      isCartOpen: true,
      isHydrated: true,
      openCart: vi.fn(),
      closeCart: vi.fn(),
      updateQuantity: vi.fn(),
      removeItem: vi.fn(),
      clearCart: vi.fn(),
    });

    setFetchResponses();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps checkout disabled until a security token is available", async () => {
    await renderReadyCart();

    fillCustomerForm();

    expect(checkoutButton().disabled).toBe(true);

    supplySecurityToken();

    expect(checkoutButton().disabled).toBe(false);

    expect(checkoutCalls()).toHaveLength(0);
  });

  it("disables the checkout button while a request is pending", async () => {
    const { settle } = pendingCheckout();

    await prepareCheckout();

    fireEvent.click(checkoutButton());

    await waitFor(() => {
      expect(checkoutCalls()).toHaveLength(1);
      expect(checkoutButton().disabled).toBe(true);
    });

    expect(
      screen.getByText(
        "Redirecting to Square...",
      ),
    ).toBeTruthy();

    settle(failedResponse());

    await waitFor(() => {
      expect(
        screen.getByText(
          "Square temporarily unavailable",
        ),
      ).toBeTruthy();
    });
  });

  it("ignores another user click while the checkout button is disabled", async () => {
    const { settle } = pendingCheckout();

    await prepareCheckout();

    const button = checkoutButton();

    fireEvent.click(button);

    expect(button.disabled).toBe(true);

    // A regular click on a disabled button must not
    // result in another checkout request.
    fireEvent.click(button);

    expect(checkoutCalls()).toHaveLength(1);

    settle(failedResponse());

    await waitFor(() => {
      expect(checkoutButton().disabled).toBe(true);
    });
  });

  it("sends the correct cart and trimmed customer details", async () => {
    const { settle } = pendingCheckout();

    await prepareCheckout();

    fireEvent.click(checkoutButton());

    expect(checkoutCalls()).toHaveLength(1);

    const options = checkoutCalls()[0][1] as RequestInit;

    expect(options.method).toBe("POST");

    const body = JSON.parse(
      String(options.body),
    ) as Record<string, unknown>;

    expect(body).toMatchObject({
      customer: {
        displayName: "Taylor Smith",
        phone: "(415) 555-0100",
        email: "taylor@example.com",
      },
      pickupTiming: {
        type: "ASAP",
      },
      turnstileToken: "valid-test-token",
      items: [
        {
          catalogObjectId: "ITEM1",
          variationId: "VAR1",
          quantity: 1,
          modifierOptionIds: [],
        },
      ],
    });

    settle(failedResponse());

    await waitFor(() => {
      expect(
        screen.getByText(
          "Square temporarily unavailable",
        ),
      ).toBeTruthy();
    });
  });

  it("characterizes direct form resubmission during an active request", async () => {
    const { settle } = pendingCheckout();

    await prepareCheckout();

    // Unlike a normal disabled-button click, a direct
    // form submit reaches the submission handler.
    submitCheckoutForm();
    submitCheckoutForm();

    // This documents current behavior rather than
    // asserting that duplicates are prevented.
    expect(checkoutCalls()).toHaveLength(2);

    settle(failedResponse());

    await waitFor(() => {
      expect(
        screen.getByText(
          "Square temporarily unavailable",
        ),
      ).toBeTruthy();
    });
  });

  it("rejects missing customer details before sending checkout requests", async () => {
    await renderReadyCart();

    supplySecurityToken();

    fireEvent.click(checkoutButton());

    expect(checkoutCalls()).toHaveLength(0);

    expect(
      screen.getByText(
        "Please complete the required contact and pickup details above.",
      ),
    ).toBeTruthy();
  });

  it("resets the security token after an API failure and permits retry", async () => {
    await prepareCheckout();

    fireEvent.click(checkoutButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "Square temporarily unavailable",
        ),
      ).toBeTruthy();
    });

    expect(checkoutCalls()).toHaveLength(1);
    expect(checkoutButton().disabled).toBe(true);

    expect(
      screen.getByTestId(
        "turnstile-reset-key",
      ).textContent,
    ).toBe("1");

    supplySecurityToken();

    expect(checkoutButton().disabled).toBe(false);

    fireEvent.click(checkoutButton());

    await waitFor(() => {
      expect(checkoutCalls()).toHaveLength(2);
    });

    expect(
      checkoutCalls().map((call) => call[0]),
    ).toEqual([
      "/api/checkout",
      "/api/checkout",
    ]);
  });

  it("displays network failures and resets the security token", async () => {
    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/website-content") {
          return Response.json(makeContent());
        }

        if (url === "/api/checkout") {
          throw new Error("Network disconnected");
        }

        throw new Error(
          `Unexpected request: ${url}`,
        );
      },
    );

    await prepareCheckout();

    fireEvent.click(checkoutButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "Network disconnected",
        ),
      ).toBeTruthy();
    });

    expect(checkoutCalls()).toHaveLength(1);
    expect(checkoutButton().disabled).toBe(true);

    expect(
      screen.getByTestId(
        "turnstile-reset-key",
      ).textContent,
    ).toBe("1");
  });

  it("handles an incomplete checkout response without recording an order", async () => {
    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/website-content") {
          return Response.json(makeContent());
        }

        if (url === "/api/checkout") {
          return Response.json({
            orderId: "ORDER_WITHOUT_URL",
          });
        }

        throw new Error(
          `Unexpected request: ${url}`,
        );
      },
    );

    await prepareCheckout();

    fireEvent.click(checkoutButton());

    await waitFor(() => {
      expect(
        screen.getByText(
          "Missing checkout URL from server.",
        ),
      ).toBeTruthy();
    });

    expect(
      mocks.recordPendingCheckoutOrder,
    ).not.toHaveBeenCalled();

    expect(checkoutButton().disabled).toBe(true);

    supplySecurityToken();

    expect(checkoutButton().disabled).toBe(false);
  });

  it("prevents checkout while online ordering is paused", async () => {
    setFetchResponses(
      makeContent({
        onlineOrderingEnabled: false,
      }),
    );

    render(<CartDrawer />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Online Ordering Paused",
        ),
      ).toBeTruthy();
    });

    fillCustomerForm();

    expect(checkoutButton().disabled).toBe(true);

    expect(checkoutCalls()).toHaveLength(0);
  });

  it("does not display a checkout button for an empty cart", async () => {
    mocks.useCart.mockReturnValue({
      ...mocks.useCart.mock.results[0]?.value,
      items: [],
      totalCount: 0,
      subtotalCents: 0,
      isCartOpen: true,
      isHydrated: true,
      openCart: vi.fn(),
      closeCart: vi.fn(),
      updateQuantity: vi.fn(),
      removeItem: vi.fn(),
      clearCart: vi.fn(),
    });

    render(<CartDrawer />);

    expect(
      await screen.findByText(
        "Your bag is currently empty",
      ),
    ).toBeTruthy();

    expect(
      screen.queryByRole("button", {
        name: /Proceed to Checkout/,
      }),
    ).toBeNull();

    expect(checkoutCalls()).toHaveLength(0);
  });

  it("invalidates stale ready status and indicates unavailable settings when content refresh fails on reopening", async () => {
    let isCartOpenState = true;
    const baseCart = mocks.useCart.mock.results[0]?.value ?? {};
    mocks.useCart.mockImplementation(() => ({
      ...baseCart,
      items: [cartItem],
      totalCount: 1,
      subtotalCents: 500,
      isCartOpen: isCartOpenState,
      isHydrated: true,
      openCart: vi.fn(),
      closeCart: vi.fn(),
      updateQuantity: vi.fn(),
      removeItem: vi.fn(),
      clearCart: vi.fn(),
    }));

    const { rerender } = render(<CartDrawer />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ASAP \(~20/ })).toBeTruthy();
    });

    // Close the cart
    isCartOpenState = false;
    rerender(<CartDrawer />);

    // Simulate storage outage on /api/website-content
    mocks.fetch.mockImplementation((url: string) => {
      if (url.includes("/api/website-content")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "Storage unavailable" }), { status: 503 }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    // Reopen the cart during the outage
    isCartOpenState = true;
    rerender(<CartDrawer />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't load pickup times/i)).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /ASAP \(~20/ })).toBeNull();

    fillCustomerForm();
    supplySecurityToken();
    expect(checkoutButton().disabled).toBe(true);
  });
  describe("store hours refresh", () => {
    function websiteContentCalls() {
      return mocks.fetch.mock.calls.filter((call) => call[0] === "/api/website-content");
    }

    function mockCartState(state: { isCartOpen: boolean; totalCount: number }) {
      mocks.useCart.mockImplementation(() => ({
        items: state.totalCount > 0 ? [{ ...cartItem, quantity: state.totalCount }] : [],
        totalCount: state.totalCount,
        subtotalCents: 500 * state.totalCount,
        isCartOpen: state.isCartOpen,
        isHydrated: true,
        openCart: vi.fn(),
        closeCart: vi.fn(),
        updateQuantity: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
      }));
    }

    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("does not refetch store hours when only the quantity changes", async () => {
      const state = { isCartOpen: true, totalCount: 1 };
      mockCartState(state);
      const { rerender } = render(<CartDrawer />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /ASAP \(~20/ })).toBeTruthy();
      });
      expect(websiteContentCalls()).toHaveLength(1);

      state.totalCount = 2;
      rerender(<CartDrawer />);
      state.totalCount = 3;
      rerender(<CartDrawer />);
      await flush();

      expect(websiteContentCalls()).toHaveLength(1);
    });

    it("refetches store hours when the bag is reopened", async () => {
      const state = { isCartOpen: true, totalCount: 1 };
      mockCartState(state);
      const { rerender } = render(<CartDrawer />);

      await waitFor(() => {
        expect(websiteContentCalls()).toHaveLength(1);
      });

      state.isCartOpen = false;
      rerender(<CartDrawer />);
      await flush();
      const callsWhileClosed = websiteContentCalls().length;

      state.isCartOpen = true;
      rerender(<CartDrawer />);

      await waitFor(() => {
        expect(websiteContentCalls()).toHaveLength(callsWhileClosed + 1);
      });
    });

    it("fetches store hours when the first item is added while the bag is closed", async () => {
      const state = { isCartOpen: true, totalCount: 0 };
      mockCartState(state);
      const { rerender } = render(<CartDrawer />);

      await waitFor(() => {
        expect(websiteContentCalls()).toHaveLength(1);
      });

      state.isCartOpen = false;
      rerender(<CartDrawer />);
      await flush();
      expect(websiteContentCalls()).toHaveLength(1);

      state.totalCount = 1;
      rerender(<CartDrawer />);

      await waitFor(() => {
        expect(websiteContentCalls()).toHaveLength(2);
      });
    });
  });

  describe("checkout status derivation and precedence unit tests", () => {
    it("prioritizes submission above all other states", () => {
      const status = getCheckoutStatus({
        isSubmitting: true,
        scheduleStatus: "error",
        isOrderingPaused: true,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: true,
      });

      expect(status).toEqual({
        statusKey: "submitting",
        label: "Redirecting to Square...",
        isPending: true,
        isDisabled: true,
      });
    });

    it("prioritizes schedule loading above ordering, pickup, and security blockers", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "loading",
        isOrderingPaused: true,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: true,
      });

      expect(status).toEqual({
        statusKey: "schedule_loading",
        label: "Loading pickup times...",
        isPending: true,
        isDisabled: true,
      });
    });

    it("prioritizes schedule failure above ordering, pickup, and security blockers", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "error",
        isOrderingPaused: true,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: true,
      });

      expect(status).toEqual({
        statusKey: "schedule_error",
        label: "Pickup times unavailable",
        isPending: false,
        isDisabled: true,
      });
    });

    it("prioritizes ordering paused above pickup blockers and security checks", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: true,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: true,
      });

      expect(status).toEqual({
        statusKey: "ordering_paused",
        label: "Online ordering paused",
        isPending: false,
        isDisabled: true,
      });
    });

    it("shows no pickup times available when scheduled pickup has 0 days or slots", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: "valid-token",
        botCheckFailed: false,
      });

      expect(status).toEqual({
        statusKey: "pickup_no_times",
        label: "No pickup times available",
        isPending: false,
        isDisabled: true,
      });
    });

    it("does not ask customers to select a time when no scheduled times exist", () => {
      // Even if hasActiveSlot is false, availableSlotsCount: 0 must show "No pickup times available"
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: true,
        pickupDaysCount: 1,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: "valid-token",
        botCheckFailed: false,
      });

      expect(status.label).toBe("No pickup times available");
      expect(status.statusKey).toBe("pickup_no_times");
      expect(status.isPending).toBe(false);
      expect(status.isDisabled).toBe(true);
    });

    it("shows select a pickup time when scheduled times exist but none is selected", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "SCHEDULED",
        isAsapAvailable: true,
        pickupDaysCount: 2,
        availableSlotsCount: 5,
        hasActiveSlot: false,
        turnstileToken: "valid-token",
        botCheckFailed: false,
      });

      expect(status).toEqual({
        statusKey: "pickup_select_time",
        label: "Select a pickup time",
        isPending: false,
        isDisabled: true,
      });
    });

    it("shows no pickup times available when ASAP is unavailable and 0 pickup days exist", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "ASAP",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: "valid-token",
        botCheckFailed: false,
      });

      expect(status).toEqual({
        statusKey: "pickup_no_times",
        label: "No pickup times available",
        isPending: false,
        isDisabled: true,
      });
    });

    it("shows ASAP pickup unavailable when ASAP is selected but closed and scheduled days exist", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "ASAP",
        isAsapAvailable: false,
        pickupDaysCount: 3,
        availableSlotsCount: 10,
        hasActiveSlot: false,
        turnstileToken: "valid-token",
        botCheckFailed: false,
      });

      expect(status).toEqual({
        statusKey: "pickup_asap_unavailable",
        label: "ASAP pickup unavailable",
        isPending: false,
        isDisabled: true,
      });
    });

    it("prioritizes pickup blockers over security verification", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "ASAP",
        isAsapAvailable: false,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: false,
      });

      expect(status.statusKey).toBe("pickup_no_times");
      expect(status.label).toBe("No pickup times available");
    });

    it("shows security check unavailable when bot check fails or is unconfigured", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "ASAP",
        isAsapAvailable: true,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: true,
      });

      expect(status).toEqual({
        statusKey: "security_failed",
        label: "Security check unavailable",
        isPending: false,
        isDisabled: true,
      });
    });

    it("shows checking security when waiting for security verification token", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "ASAP",
        isAsapAvailable: true,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: null,
        botCheckFailed: false,
      });

      expect(status).toEqual({
        statusKey: "security_pending",
        label: "Checking security...",
        isPending: true,
        isDisabled: true,
      });
    });

    it("shows ready state only when all blockers are clear and token is supplied", () => {
      const status = getCheckoutStatus({
        isSubmitting: false,
        scheduleStatus: "ready",
        isOrderingPaused: false,
        effectivePickupType: "ASAP",
        isAsapAvailable: true,
        pickupDaysCount: 0,
        availableSlotsCount: 0,
        hasActiveSlot: false,
        turnstileToken: "valid-token",
        botCheckFailed: false,
      });

      expect(status).toEqual({
        statusKey: "ready",
        label: "Proceed to Checkout",
        isPending: false,
        isDisabled: false,
      });
    });
  });

  describe("checkout button status UI and accessibility", () => {
    it("displays schedule loading status with aria-busy and spinner while store hours load", () => {
      // Simulate pending /api/website-content
      mocks.fetch.mockImplementation(() => new Promise(() => {}));

      render(<CartDrawer />);

      const button = checkoutButton();
      expect(button.textContent).toContain("Loading pickup times...");
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.querySelector("svg.animate-spin")).toBeTruthy();

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Loading pickup times...");
    });

    it("displays schedule failure status without spinner when store hours fail to load", async () => {
      mocks.fetch.mockImplementation(async (url: string) => {
        if (url === "/api/website-content") {
          return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
        }
        return new Response("{}", { status: 200 });
      });

      render(<CartDrawer />);

      await waitFor(() => {
        const button = checkoutButton();
        expect(button.textContent).toContain("Pickup times unavailable");
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBeNull();
        expect(button.querySelector("svg.animate-spin")).toBeNull();
      });

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Pickup times unavailable");
    });

    it("displays online ordering paused status without spinner when ordering is disabled", async () => {
      setFetchResponses(
        makeContent({
          onlineOrderingEnabled: false,
        }),
      );

      render(<CartDrawer />);

      await waitFor(() => {
        const button = checkoutButton();
        expect(button.textContent).toContain("Online ordering paused");
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBeNull();
        expect(button.querySelector("svg.animate-spin")).toBeNull();
      });

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Online ordering paused");
    });

    it("displays no pickup times available when store is closed for ASAP and no scheduled days exist", async () => {
      mocks.getStoreScheduleForDate.mockReturnValue({
        closed: true,
        openMinuteOfDay: 0,
        closeMinuteOfDay: 1439,
        cutoffMinuteOfDay: 1439,
        openHour: 0,
        closeHour: 24,
      });
      mocks.getPickupDays.mockReturnValue([]);

      render(<CartDrawer />);

      await waitFor(() => {
        const button = checkoutButton();
        expect(button.textContent).toContain("No pickup times available");
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBeNull();
        expect(button.querySelector("svg.animate-spin")).toBeNull();
      });

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: No pickup times available");
    });

    it("displays checking security with aria-busy and spinner while awaiting token", async () => {
      await renderReadyCart();

      const button = checkoutButton();
      expect(button.textContent).toContain("Checking security...");
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(button.querySelector("svg.animate-spin")).toBeTruthy();

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Checking security...");
    });

    it("displays security check unavailable without spinner when bot check fails", async () => {
      await renderReadyCart();

      failSecurityCheck();

      await waitFor(() => {
        const button = checkoutButton();
        expect(button.textContent).toContain("Security check unavailable");
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBeNull();
        expect(button.querySelector("svg.animate-spin")).toBeNull();
      });

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Security check unavailable");

      // Verify phone fallback is displayed
      expect(
        screen.getByText(/The security check couldn't load, so checkout is unavailable right now/i),
      ).toBeTruthy();
    });

    it("displays ready state with subtotal and enables checkout when token is supplied", async () => {
      await renderReadyCart();

      supplySecurityToken();

      const button = checkoutButton();
      expect(button.textContent).toContain("Proceed to Checkout");
      expect(button.textContent).toContain("$5.00");
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("aria-busy")).toBeNull();
      expect(button.querySelector("svg.animate-spin")).toBeNull();

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Proceed to Checkout");

      // Receiving a token must not automatically submit checkout
      expect(checkoutCalls()).toHaveLength(0);
    });

    it("displays submitting state with aria-busy and spinner during submission", async () => {
      const { settle } = pendingCheckout();
      await prepareCheckout();

      fireEvent.click(checkoutButton());

      await waitFor(() => {
        const button = checkoutButton();
        expect(button.textContent).toContain("Redirecting to Square...");
        expect(button.disabled).toBe(true);
        expect(button.getAttribute("aria-busy")).toBe("true");
        expect(button.querySelector("svg.animate-spin")).toBeTruthy();
      });

      const announcement = screen.getByTestId("checkout-status-announcement");
      expect(announcement.textContent).toBe("Checkout status: Redirecting to Square...");

      settle(failedResponse());
      await waitFor(() => {
        expect(checkoutButton().disabled).toBe(true);
      });
    });

    it("maintains schedule failure precedence even when security token is supplied", async () => {
      mocks.fetch.mockImplementation(async (url: string) => {
        if (url === "/api/website-content") {
          return new Response(JSON.stringify({ error: "Storage down" }), { status: 503 });
        }
        return new Response("{}", { status: 200 });
      });

      render(<CartDrawer />);

      await waitFor(() => {
        expect(checkoutButton().textContent).toContain("Pickup times unavailable");
      });

      supplySecurityToken();

      // Schedule blocker still takes precedence over security
      expect(checkoutButton().textContent).toContain("Pickup times unavailable");
      expect(checkoutButton().disabled).toBe(true);
    });

    it("maintains ordering paused precedence and prevents security widget mounting", async () => {
      setFetchResponses(
        makeContent({
          onlineOrderingEnabled: false,
        }),
      );

      render(<CartDrawer />);

      await waitFor(() => {
        expect(checkoutButton().textContent).toContain("Online ordering paused");
      });

      // Ordering paused takes precedence over security; security widget is not even mounted
      expect(screen.queryByRole("button", { name: "Supply security token" })).toBeNull();
      expect(checkoutButton().textContent).toContain("Online ordering paused");
      expect(checkoutButton().disabled).toBe(true);
    });

    it("does not repeat or alter live status announcement on price or quantity changes", async () => {
      let currentItem = { ...cartItem, quantity: 1, itemTotalCents: 500 };
      mocks.useCart.mockImplementation(() => ({
        items: [currentItem],
        totalCount: currentItem.quantity,
        subtotalCents: currentItem.itemTotalCents,
        isCartOpen: true,
        isHydrated: true,
        openCart: vi.fn(),
        closeCart: vi.fn(),
        updateQuantity: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
      }));

      const { rerender } = render(<CartDrawer />);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /ASAP \(~20/ })).toBeTruthy();
      });

      supplySecurityToken();

      expect(checkoutButton().textContent).toContain("Proceed to Checkout");
      expect(checkoutButton().textContent).toContain("$5.00");
      expect(screen.getByTestId("checkout-status-announcement").textContent).toBe(
        "Checkout status: Proceed to Checkout",
      );

      // Quantity and price change
      currentItem = { ...cartItem, quantity: 2, itemTotalCents: 1000 };
      rerender(<CartDrawer />);

      // Button displays updated subtotal
      expect(checkoutButton().textContent).toContain("Proceed to Checkout");
      expect(checkoutButton().textContent).toContain("$10.00");

      // But live announcement remains the concise status without price, preventing repeated spam
      expect(screen.getByTestId("checkout-status-announcement").textContent).toBe(
        "Checkout status: Proceed to Checkout",
      );
    });
  });
});
