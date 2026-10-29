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

// These tests render the ownership-transfer confirmation page
// without contacting real APIs or changing administrator roles.

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  signOut: vi.fn(),
}));

// Prevent tests from triggering real NextAuth sign-outs.
vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
}));

// Render Next.js links as ordinary anchors in jsdom.
vi.mock("next/link", () => ({
  default: "a",
}));

import OwnershipTransferClient from "./ownership-transfer-client";

// Use unusual usernames to catch grammatically incorrect
// sentences that interpolate account names directly.
const testTransfer = {
  id: "test-transfer-id",
  ownerUsername: "you",
  recipientUsername: "Admin.",
  expiresAt: 1893456000,
};

// Return a minimal mocked response matching the properties
// consumed by the ownership-transfer client.
function apiResponse(
  body: unknown,
  ok = true,
) {
  return {
    ok,
    json: async () => body,
  };
}

// Configure successful transfer review by default.
// Tests override this mock when verifying specific outcomes.
function mockSuccessfulReview() {
  mocks.fetch.mockImplementation(
    async (url: string) => {
      if (url === "/api/admin/ownership-transfer/review") {
        return apiResponse({
          transfer: testTransfer,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  );
}

// Inspect a request sent to a specific API endpoint.
function getRequest(url: string) {
  return mocks.fetch.mock.calls.find(
    (call) => call[0] === url,
  );
}

describe("Ownership transfer confirmation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Replace browser fetch with a local mock.
    vi.stubGlobal("fetch", mocks.fetch);

    mockSuccessfulReview();

    mocks.signOut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Verify the revised copy works with usernames such as
  // "you" and "Admin." without producing awkward sentences.
  it("displays neutral introductory wording and labeled account details", async () => {
    render(
      <OwnershipTransferClient token="test-token" />,
    );

    const introduction = await screen.findByText(
      /The TEAZO Owner has offered to transfer ownership/,
    );

    expect(introduction.textContent).toContain(
      "your administrator account",
    );

    expect(introduction.textContent).not.toContain(
      "you has offered",
    );

    const currentOwner = screen.getByText(
      /Current Owner:/,
    );

    const receivingAccount = screen.getByText(
      /Receiving account:/,
    );

    expect(currentOwner.textContent).toContain("you");

    expect(receivingAccount.textContent).toContain(
      "Admin.",
    );

    expect(
      screen.getByText(
        /If you accept, you will become the sole Owner/,
      ),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /This change cannot be automatically reversed/,
      ),
    ).toBeTruthy();
  });

  // Opening the page only reviews the offer.
  // A separate authenticated decision must be submitted.
  it("displays expiration and decision controls without automatically accepting", async () => {
    render(
      <OwnershipTransferClient token="test-token" />,
    );

    await screen.findByRole("button", {
      name: "Accept Ownership",
    });

    expect(
      screen.getByRole("button", {
        name: "Decline",
      }),
    ).toBeTruthy();

    const expectedExpiration = new Date(
      testTransfer.expiresAt * 1000,
    ).toLocaleString();

    expect(
      screen.getByText(/Expires:/).textContent,
    ).toContain(expectedExpiration);

    const reviewRequest = getRequest(
      "/api/admin/ownership-transfer/review",
    );

    expect(reviewRequest).toBeDefined();

    expect(reviewRequest?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });

    expect(
      JSON.parse(String(reviewRequest?.[1]?.body)),
    ).toEqual({
      token: "test-token",
    });

    // Reviewing the page must not submit a decision.
    expect(
      getRequest(
        "/api/admin/ownership-transfer/decision",
      ),
    ).toBeUndefined();
  });

  // Acceptance requires an explicit click and results in
  // the expected session-invalidation instructions.
  it("submits acceptance only after the recipient selects Accept Ownership", async () => {
    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/admin/ownership-transfer/review") {
          return apiResponse({
            transfer: testTransfer,
          });
        }

        if (url === "/api/admin/ownership-transfer/decision") {
          return apiResponse({
            status: "accepted",
            message: "Ownership transfer completed.",
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );

    render(
      <OwnershipTransferClient token="test-token" />,
    );

    const acceptButton = await screen.findByRole(
      "button",
      {
        name: "Accept Ownership",
      },
    );

    fireEvent.click(acceptButton);

    expect(
      await screen.findByText(
        "Ownership transfer completed",
      ),
    ).toBeTruthy();

    const decisionRequest = getRequest(
      "/api/admin/ownership-transfer/decision",
    );

    expect(decisionRequest).toBeDefined();

    expect(
      JSON.parse(String(decisionRequest?.[1]?.body)),
    ).toEqual({
      token: "test-token",
      decision: "accepted",
    });

    expect(
      screen.getByText(
        /Your previous session is no longer valid/,
      ),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Sign in again",
      }),
    ).toBeTruthy();
  });

  // Declining must submit the decline decision and
  // leave the recipient with a Dashboard return link.
  it("submits a decline and displays the declined state", async () => {
    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/admin/ownership-transfer/review") {
          return apiResponse({
            transfer: testTransfer,
          });
        }

        if (url === "/api/admin/ownership-transfer/decision") {
          return apiResponse({
            status: "declined",
            message: "Ownership offer declined.",
          });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );

    render(
      <OwnershipTransferClient token="test-token" />,
    );

    const declineButton = await screen.findByRole(
      "button",
      {
        name: "Decline",
      },
    );

    fireEvent.click(declineButton);

    expect(
      await screen.findByText(
        "Ownership offer declined",
      ),
    ).toBeTruthy();

    const decisionRequest = getRequest(
      "/api/admin/ownership-transfer/decision",
    );

    expect(
      JSON.parse(String(decisionRequest?.[1]?.body)),
    ).toEqual({
      token: "test-token",
      decision: "declined",
    });

    const dashboardLink = screen.getByRole(
      "link",
      {
        name: "Return to Dashboard",
      },
    );

    expect(
      dashboardLink.getAttribute("href"),
    ).toBe("/admin");
  });

  // Invalid or expired offers must display an error,
  // rather than offering an unauthorized acceptance action.
  it("shows an error when the ownership offer cannot be verified", async () => {
    mocks.fetch.mockResolvedValue(
      apiResponse(
        {
          error: "This ownership offer has expired.",
        },
        false,
      ),
    );

    render(
      <OwnershipTransferClient token="expired-token" />,
    );

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "This ownership offer has expired.",
    );

    expect(
      screen.queryByRole("button", {
        name: "Accept Ownership",
      }),
    ).toBeNull();

    expect(
      screen.getByRole("button", {
        name: "Sign in with another account",
      }),
    ).toBeTruthy();
  });

  // A recipient signed in with the wrong account should
  // be able to return to Login with the intended destination.
  it("preserves the transfer destination when switching accounts", async () => {
    mocks.fetch.mockResolvedValue(
      apiResponse(
        {
          error: "This offer belongs to another administrator.",
        },
        false,
      ),
    );

    render(
      <OwnershipTransferClient token="test-token" />,
    );

    const switchButton = await screen.findByRole(
      "button",
      {
        name: "Sign in with another account",
      },
    );

    fireEvent.click(switchButton);

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledWith({
        redirectTo:
          "/login?next=%2Fownership-transfer%3Ftoken%3Dtest-token",
      });
    });
  });

  // A failed decision must not display a success state.
  // The recipient should remain able to review the error.
  it("keeps the confirmation page available when a decision fails", async () => {
    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/admin/ownership-transfer/review") {
          return apiResponse({
            transfer: testTransfer,
          });
        }

        if (url === "/api/admin/ownership-transfer/decision") {
          return apiResponse(
            {
              error: "Unable to complete ownership transfer.",
            },
            false,
          );
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );

    render(
      <OwnershipTransferClient token="test-token" />,
    );

    const acceptButton = await screen.findByRole(
      "button",
      {
        name: "Accept Ownership",
      },
    );

    fireEvent.click(acceptButton);

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "Unable to complete ownership transfer.",
    );

    expect(
      screen.getByRole("button", {
        name: "Accept Ownership",
      }),
    ).toBeTruthy();

    expect(
      screen.queryByText(
        "Ownership transfer completed",
      ),
    ).toBeNull();
  });
});
