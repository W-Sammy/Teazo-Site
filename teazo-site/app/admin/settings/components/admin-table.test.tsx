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

// Test the actual administrator-management component with mocked
// account data and ownership-transfer API responses.

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  useAdmins: vi.fn(),
}));

// Replace the administrator data hook without changing the
// table, three-dot menus, or ownership-transfer dialog.
vi.mock("@/app/admin/settings/handlers/use-admins", () => ({
  useAdmins: mocks.useAdmins,
}));

import AdminsTable from "./admin-table";

// Use disposable account information only.
const owner = {
  id: "test-owner-id",
  username: "Ben",
  email: "owner@example.invalid",
  role: 1 as const,
  canManageAdmins: true,
  canResendInvitation: false,
  canReceiveOwnership: false,
};

const admin = {
  id: "test-admin-id",
  username: "Test Admin",
  email: "admin@example.invalid",
  role: 2 as const,
  canManageAdmins: false,
  canResendInvitation: false,
  canReceiveOwnership: true,
};

// A future expiration prevents the automatic expiration timer
// from interfering with normal component tests.
const pendingTransfer = {
  id: "test-transfer-id",
  recipientAdminId: admin.id,
  recipientUsername: admin.username,
  recipientEmail: admin.email,
  createdAt: 1893369600,
  expiresAt: 1893456000,
  status: "pending",
};

function apiResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

// Configure the mock hook with an Owner and an eligible Admin.
// All account-management actions are kept inside test mocks.
function mockAdminData(canManageAdmins = true) {
  mocks.useAdmins.mockReturnValue({
    admins: [owner, admin],
    canManageAdmins,
    errorMessage: "",
    clearError: vi.fn(),
    setError: vi.fn(),
    addAdmin: vi.fn(),
    loadAdmins: vi.fn().mockResolvedValue(undefined),
    deleteAdmin: vi.fn(),
    editAdminUsername: vi.fn(),
  });
}

// Return whether the mock received a particular API method.
function wasRequested(url: string, method: string) {
  return mocks.fetch.mock.calls.some(
    (call) =>
      call[0] === url &&
      (call[1]?.method ?? "GET") === method,
  );
}

describe("Admin page pending ownership-transfer controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal("fetch", mocks.fetch);

    mockAdminData();

    // No pending transfer is the default state.
    mocks.fetch.mockImplementation(
      async (url: string) => {
        if (url === "/api/admin/ownership-transfer") {
          return apiResponse({ transfer: null });
        }

        throw new Error(`Unexpected request: ${url}`);
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // An empty pending-transfer state must not leave an
  // unnecessary heading or container below New User.
  it("hides the entire pending-transfer section when no offer exists", async () => {
    render(<AdminsTable />);

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalled();
    });

    expect(
      screen.getByRole("heading", { name: "Owner" }),
    ).toBeTruthy();

    expect(
      screen.getByRole("heading", { name: "Admins" }),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", { name: /New User/ }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("heading", {
        name: "Pending Ownership Transfer",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("button", {
        name: "Cancel Transfer",
      }),
    ).toBeNull();
  });

  // When a pending offer exists, the new section must follow
  // the account list and use the same heading alignment.
  it("displays the pending section below New User with aligned headings and adjacent controls", async () => {
    mocks.fetch.mockResolvedValue(
      apiResponse({ transfer: pendingTransfer }),
    );

    render(<AdminsTable />);

    const heading = await screen.findByRole("heading", {
      name: "Pending Ownership Transfer",
    });

    const newUserButton = screen.getByRole("button", {
      name: /New User/,
    });

    // Pending ownership management follows the Admins list.
    expect(
      newUserButton.compareDocumentPosition(heading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const ownerHeading = screen.getByRole("heading", {
      name: "Owner",
    });

    const adminsHeading = screen.getByRole("heading", {
      name: "Admins",
    });

    // The redesigned section uses consistent heading sizes.
    expect(heading.className).toContain("text-2xl");
    expect(ownerHeading.className).toContain("text-2xl");
    expect(adminsHeading.className).toContain("text-2xl");

    // All three sections use the same desktop column layout.
    expect(heading.closest("section")?.className).toContain(
      "lg:grid-cols-[180px_minmax(0,1fr)]",
    );

    expect(
      screen.getByText(/Pending acceptance/),
    ).toBeTruthy();

    // The recipient's email also appears in the Admins table.
    // Check the pending-transfer details specifically instead
    // of searching the entire page for a duplicate address.
    const receivingAdminDetails = screen
      .getByText("Receiving Admin:")
      .closest("p");

    expect(receivingAdminDetails?.textContent).toContain(
      "Test Admin",
    );

    expect(receivingAdminDetails?.textContent).toContain(
      "admin@example.invalid",
    );

    expect(
      screen.getByText(/Expires:/),
    ).toBeTruthy();

    const refresh = screen.getByRole("button", {
      name: "Refresh Status",
    });

    const cancel = screen.getByRole("button", {
      name: "Cancel Transfer",
    });

    // Both controls must be siblings in the same button row.
    expect(refresh.parentElement).toBe(cancel.parentElement);
  });

  // A status refresh must remove the section after the
  // server confirms that no pending offer remains.
  it("hides the pending section after Refresh Status confirms resolution", async () => {
    let pending = true;

    mocks.fetch.mockImplementation(async () => {
      return apiResponse({
        transfer: pending ? pendingTransfer : null,
      });
    });

    render(<AdminsTable />);

    await screen.findByRole("heading", {
      name: "Pending Ownership Transfer",
    });

    // Simulate the offer being resolved outside this page.
    pending = false;

    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh Status",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: "Pending Ownership Transfer",
        }),
      ).toBeNull();
    });

    expect(
      screen.queryByRole("button", {
        name: "Cancel Transfer",
      }),
    ).toBeNull();
  });

  // Failed lookups must remain visible rather than being
  // mistaken for a successful empty pending-transfer state.
  it("shows a lookup error and allows Refresh Status to retry", async () => {
    let attempts = 0;

    mocks.fetch.mockImplementation(async () => {
      attempts += 1;

      if (attempts === 1) {
        return apiResponse(
          { error: "Pending status unavailable." },
          false,
        );
      }

      return apiResponse({
        transfer: pendingTransfer,
      });
    });

    render(<AdminsTable />);

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "Pending status unavailable.",
    );

    expect(
      screen.getByRole("heading", {
        name: "Pending Ownership Transfer",
      }),
    ).toBeTruthy();

    const refresh = screen.getByRole("button", {
      name: "Refresh Status",
    });

    expect(refresh.hasAttribute("disabled")).toBe(false);

    fireEvent.click(refresh);

    await waitFor(() => {
      expect(attempts).toBe(2);
    });

    await screen.findByRole("button", {
      name: "Cancel Transfer",
    });

    expect(
      screen.queryByText("Pending status unavailable."),
    ).toBeNull();
  });

  // Simulate the UI flow for creating and canceling an offer.
  // The mocked endpoint never touches the real database.
  it("reveals the section after creating an offer and removes it after cancellation", async () => {
    let pending = false;

    mocks.fetch.mockImplementation(
      async (url: string, options?: RequestInit) => {
        if (url !== "/api/admin/ownership-transfer") {
          throw new Error(`Unexpected request: ${url}`);
        }

        const method = options?.method ?? "GET";

        if (method === "GET") {
          return apiResponse({
            transfer: pending ? pendingTransfer : null,
          });
        }

        if (method === "POST") {
          pending = true;

          return apiResponse({
            invitation: {
              message: "Ownership offer created.",
            },
          });
        }

        if (method === "DELETE") {
          pending = false;

          return apiResponse({
            message: "Ownership transfer canceled.",
          });
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    );

    render(<AdminsTable />);

    // Wait until the initial status lookup permits initiation.
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalled();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Actions for Test Admin",
      }),
    );

    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Transfer Ownership",
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: "Transfer Ownership",
      }),
    ).toBeTruthy();

    // The confirmation requires explicit acknowledgment.
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Send Ownership Offer",
      }),
    );

    await screen.findByRole("heading", {
      name: "Pending Ownership Transfer",
    });

    expect(
      wasRequested("/api/admin/ownership-transfer", "POST"),
    ).toBe(true);

    // Cancel the pending offer using the redesigned controls.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel Transfer",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Yes, Cancel Transfer",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", {
          name: "Pending Ownership Transfer",
        }),
      ).toBeNull();
    });

    expect(
      wasRequested("/api/admin/ownership-transfer", "DELETE"),
    ).toBe(true);

    // Neither operation changed the mocked account roles.
    expect(owner.role).toBe(1);
    expect(admin.role).toBe(2);
  });

  // If cancellation fails, the pending section must remain
  // visible so the Owner can review or retry the operation.
  it("keeps the pending section visible when cancellation fails", async () => {
    mocks.fetch.mockImplementation(
      async (
        url: string,
        options?: RequestInit,
      ) => {
        if (url !== "/api/admin/ownership-transfer") {
          throw new Error(`Unexpected request: ${url}`);
        }

        if (options?.method === "DELETE") {
          return apiResponse(
            { error: "Unable to cancel ownership transfer." },
            false,
          );
        }

        return apiResponse({
          transfer: pendingTransfer,
        });
      },
    );

    render(<AdminsTable />);

    await screen.findByRole("button", {
      name: "Cancel Transfer",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel Transfer",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Yes, Cancel Transfer",
      }),
    );

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toContain(
      "Unable to cancel ownership transfer.",
    );

    expect(
      screen.getByRole("heading", {
        name: "Pending Ownership Transfer",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Refresh Status",
      }),
    ).toBeTruthy();
  });
});
