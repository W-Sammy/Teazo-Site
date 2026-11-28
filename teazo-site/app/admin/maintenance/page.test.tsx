/**
 * Tests the Owner-exclusive Maintenance page.
 *
 * Covers:
 * - Server-side administrator authorization.
 * - Owner access to maintenance resources.
 * - Direct page access restrictions for regular Admins.
 * - Authentication failure handling.
 * - User Manual placeholder rendering.
 * - GitHub repository link configuration.
 * - External link security attributes.
 *
 * Authentication and Next.js navigation are mocked.
 * No real sessions or external services are accessed.
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
  render,
  screen,
  within,
} from "@testing-library/react";

import type { ComponentProps } from "react";

import { requireAdminPage } from "@/app/lib/admin";

// Isolate the page's authorization behavior from
// real authentication sessions and database requests.
vi.mock("@/app/lib/admin", () => ({
  requireAdminPage: vi.fn(),
}));

// Preserve internal link destinations without requiring
// the Next.js application router.
vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    ...props
  }: ComponentProps<"a">) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

import AdminMaintenancePage from "./page";

const owner = {
  id: "owner-1",
  role_id: 1,
};

const admin = {
  id: "admin-1",
  role_id: 2,
};

// Supply an authenticated administrator with a specific role.
// Only the role ID is used by the Maintenance page.
function authenticateAs(
  account: typeof owner | typeof admin,
) {
  vi.mocked(requireAdminPage).mockResolvedValue(
    account as Awaited<
      ReturnType<typeof requireAdminPage>
    >,
  );
}

// Resolve the async server component before rendering it.
// This tests the page's actual authorization branch.
async function renderMaintenancePage() {
  const page = await AdminMaintenancePage();

  return render(page);
}

describe("Owner-exclusive Maintenance page", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    authenticateAs(owner);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Every request must pass through the existing
  // administrator authentication guard.
  it("requires an authenticated administrator session", async () => {
    await renderMaintenancePage();

    expect(
      requireAdminPage,
    ).toHaveBeenCalledOnce();

    expect(
      requireAdminPage,
    ).toHaveBeenCalledWith(2);
  });

  // The Owner may access the Maintenance page and
  // its configured resource cards.
  it("allows the Owner to access Maintenance", async () => {
    authenticateAs(owner);

    await renderMaintenancePage();

    expect(
      screen.getByRole("heading", {
        name: "Maintenance",
        level: 1,
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("alert"),
    ).toBeNull();

    expect(
      screen.getByRole("heading", {
        name: "User Manual",
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole("heading", {
        name: "GitHub Repository",
      }),
    ).toBeTruthy();
  });

  // Direct page access must be denied to regular Admins,
  // independently of sidebar link visibility.
  it("denies direct Maintenance page access to regular Admins", async () => {
    authenticateAs(admin);

    await renderMaintenancePage();

    const alert = screen.getByRole("alert");

    expect(
      within(alert).getByRole("heading", {
        name: "Access denied",
      }),
    ).toBeTruthy();

    expect(
      within(alert).getByText(
        "Only the Owner can access maintenance resources.",
      ),
    ).toBeTruthy();
  });

  // Unauthorized administrators must not receive the
  // maintenance resource cards or external resource links.
  it("does not expose maintenance resources to regular Admins", async () => {
    authenticateAs(admin);

    await renderMaintenancePage();

    expect(
      screen.queryByRole("heading", {
        name: "Maintenance",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("heading", {
        name: "User Manual",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("heading", {
        name: "GitHub Repository",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("link", {
        name: "Open GitHub Repository",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("link", {
        name: "Open PDF",
      }),
    ).toBeNull();

    expect(
      screen.queryByText("Coming soon"),
    ).toBeNull();
  });

  // Denied administrators should have a clear route
  // back to the shared administration dashboard.
  it("provides a dashboard return link when access is denied", async () => {
    authenticateAs(admin);

    await renderMaintenancePage();

    const link = screen.getByRole("link", {
      name: "Return to Dashboard",
    });

    expect(
      link.getAttribute("href"),
    ).toBe("/admin");
  });

  // Authentication failures must prevent the page
  // from rendering any protected resources.
  it("propagates authentication failures without rendering resources", async () => {
    const authenticationFailure =
      new Error("Authentication required");

    vi.mocked(
      requireAdminPage,
    ).mockRejectedValueOnce(
      authenticationFailure,
    );

    await expect(
      AdminMaintenancePage(),
    ).rejects.toBe(
      authenticationFailure,
    );

    expect(
      screen.queryByRole("heading", {
        name: "User Manual",
      }),
    ).toBeNull();

    expect(
      screen.queryByRole("link", {
        name: "Open GitHub Repository",
      }),
    ).toBeNull();
  });

  // The page should explain its purpose in language
  // appropriate for the business Owner.
  it("displays the Maintenance page introduction", async () => {
    await renderMaintenancePage();

    expect(
      screen.getByText(
        "Access user guides and resources for your Teazo website.",
      ),
    ).toBeTruthy();
  });

  // Until the finalized PDF is available, the User Manual
  // card must display a non-clickable placeholder.
  it("displays Coming soon for the unavailable User Manual", async () => {
    await renderMaintenancePage();

    const heading = screen.getByRole("heading", {
      name: "User Manual",
    });

    const card = heading.closest("section");

    expect(card).not.toBeNull();

    expect(
      within(card!).getByText("Coming soon"),
    ).toBeTruthy();

    expect(
      within(card!).queryByRole("link"),
    ).toBeNull();
  });

  // The temporary static menu PDF was used only for
  // manual verification and must not remain linked.
  it("does not expose the temporary menu PDF", async () => {
    const { container } =
      await renderMaintenancePage();

    expect(
      container.querySelector(
        'a[href="/teazo-menu.pdf"]',
      ),
    ).toBeNull();

    expect(
      screen.queryByRole("link", {
        name: "Open PDF",
      }),
    ).toBeNull();
  });

  // Verify the repository destination is a plain URL
  // rather than an incorrectly formatted Markdown link.
  it("links to the correct Teazo GitHub repository", async () => {
    await renderMaintenancePage();

    const link = screen.getByRole("link", {
      name: "Open GitHub Repository",
    });

    expect(
      link.getAttribute("href"),
    ).toBe(
      "https://github.com/W-Sammy/Teazo-Site",
    );
  });

  // Resource links should open separately so the
  // Owner does not lose the current Maintenance page.
  it("opens external resources in a new browser tab", async () => {
    await renderMaintenancePage();

    const link = screen.getByRole("link", {
      name: "Open GitHub Repository",
    });

    expect(
      link.getAttribute("target"),
    ).toBe("_blank");
  });

  // External links opened in a new tab must retain
  // the appropriate browser security attributes.
  it("uses safe external link attributes", async () => {
    await renderMaintenancePage();

    const link = screen.getByRole("link", {
      name: "Open GitHub Repository",
    });

    const relationship =
      link.getAttribute("rel")?.split(/\s+/);

    expect(relationship).toContain("noopener");
    expect(relationship).toContain("noreferrer");
  });

  // Technical developer documentation must remain
  // outside the Owner-facing Maintenance page.
  it("does not display developer documentation resources", async () => {
    await renderMaintenancePage();

    for (const title of [
      "Developer Manual",
      "Developer Guide",
      "Automated Testing Guide",
      "Database Migration Guide",
    ]) {
      expect(
        screen.queryByRole("heading", {
          name: title,
        }),
      ).toBeNull();
    }
  });

  // The renamed page must no longer use Documentation
  // as its primary heading.
  it("uses Maintenance instead of the obsolete Documentation heading", async () => {
    await renderMaintenancePage();

    expect(
      screen.getByRole("heading", {
        name: "Maintenance",
        level: 1,
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole("heading", {
        name: "Documentation",
        level: 1,
      }),
    ).toBeNull();
  });
});