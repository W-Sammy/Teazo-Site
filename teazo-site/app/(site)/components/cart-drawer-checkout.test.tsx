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
    resetKey,
  }: {
    onToken?: (token: string) => void;
    resetKey?: number;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onToken?.("valid-test-token")
        }
      >
        Supply security token
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
  getPickupDays: () => [],
  getPacificParts: () => ({
    minuteOfDay: 900,
  }),
  formatMinuteOfDay: () => "3:00 PM",
  getStoreScheduleForDate: () => ({
    closed: false,
    openMinuteOfDay: 0,
    closeMinuteOfDay: 1439,
    cutoffMinuteOfDay: 1439,
    openHour: 0,
    closeHour: 24,
  }),
  MAX_SCHEDULE_DAYS_AHEAD: 7,
  ONLINE_ORDERING_PAUSED_MESSAGE:
    "Online ordering is paused right now.",
}));

import CartDrawer from "./cart-drawer";

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

// The checkout button changes its accessible name while
// submission is active. Match both valid states.
function checkoutButton() {
  return screen.getByRole("button", {
    name: /Proceed to Checkout|Redirecting to Square/,
  }) as HTMLButtonElement;
}

function supplySecurityToken() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Supply security token",
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

describe("Shopping Bag checkout submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockReset();
    mocks.useCart.mockReset();

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

  it("does not display a checkout button for an empty cart", () => {
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
      screen.getByText(
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
});
