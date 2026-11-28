/**
 * Tests administrator navigation and Owner-only access
 * to the Maintenance and administrator management tabs.
 *
 * Covers:
 * - Owner and regular Admin navigation visibility.
 * - Maintenance route and icon configuration.
 * - Active navigation state.
 * - Expanded and collapsed mobile navigation.
 * - Preservation of shared administrator navigation.
 *
 * Next.js routing, images, and authentication are mocked.
 * No external services or real sessions are accessed.
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
  within,
} from "@testing-library/react";

import type {
  ComponentProps,
  ReactNode,
} from "react";

const mocks = vi.hoisted(() => ({
  pathname: "/admin",
  signOut: vi.fn(),
}));

// Provide a controllable current route without
// starting the Next.js development server.
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
}));

// Preserve link destinations and accessibility attributes
// while avoiding Next.js client-side router dependencies.
vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
  }) => (
    <a
      {...props}
      onClick={(event) => {
        // Prevent unsupported document navigation in jsdom
        // while preserving the component's click behavior.
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

// Expose image paths and styling without loading SVG assets.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    style,
  }: {
    src: string;
    alt: string;
    style?: React.CSSProperties;
  }) => (
    <span
      role="img"
      aria-label={alt}
      data-src={src}
      style={style}
    />
  ),
}));

import Sidebar from "./admin-nav-bar";

function renderNavigation(
  isOwner: boolean,
  mobileOpen = false,
) {
  const onMobileToggle = vi.fn();
  const onMobileClose = vi.fn();

  const view = render(
    <Sidebar
      isOwner={isOwner}
      mobileOpen={mobileOpen}
      onMobileToggle={onMobileToggle}
      onMobileClose={onMobileClose}
    />,
  );

  return {
    ...view,
    onMobileToggle,
    onMobileClose,
  };
}

function navigation() {
  return screen.getByRole("navigation", {
    name: "Admin navigation",
  });
}

function maintenanceLink() {
  return within(navigation()).getByRole("link", {
    name: /Maintenance/i,
  });
}

describe("Admin navigation and Maintenance access", () => {
  beforeEach(() => {
    mocks.pathname = "/admin";
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // The Owner must have access to the Maintenance tab.
  it("displays the Maintenance tab for the Owner", () => {
    renderNavigation(true);

    expect(maintenanceLink()).toBeTruthy();
  });

  // Regular Admins must not be offered a Maintenance link.
  it("hides the Maintenance tab from regular Admins", () => {
    renderNavigation(false);

    expect(
      within(navigation()).queryByRole("link", {
        name: /Maintenance/i,
      }),
    ).toBeNull();

    expect(
      navigation().querySelector(
        'a[href="/admin/maintenance"]',
      ),
    ).toBeNull();
  });

  // The Maintenance tab must reference the renamed route.
  it("links to the correct Maintenance page", () => {
    renderNavigation(true);

    expect(
      maintenanceLink().getAttribute("href"),
    ).toBe("/admin/maintenance");
  });

  // Verify the Maintenance SVG filename and location.
  it("uses the Maintenance navigation SVG", () => {
    renderNavigation(true);

    const image = within(
      maintenanceLink(),
    ).getByRole("img", {
      name: "Maintenance icon",
    });

    expect(image.getAttribute("data-src")).toBe(
      "/admin_icons/admin_svg/teazo_maintenance_icon.svg",
    );
  });

  // The Maintenance page must be identified as the current
  // page when its route is active.
  it("marks Maintenance as the active navigation page", () => {
    mocks.pathname = "/admin/maintenance";

    renderNavigation(true);

    expect(
      maintenanceLink().getAttribute("aria-current"),
    ).toBe("page");
  });

  // Maintenance must not be highlighted when the Owner
  // is visiting a different administrator page.
  it("does not mark Maintenance active on unrelated pages", () => {
    mocks.pathname = "/admin/events";

    renderNavigation(true);

    expect(
      maintenanceLink().getAttribute("aria-current"),
    ).toBeNull();
  });

  // Preserve the existing icon convention: active icons
  // use their original color and inactive icons are black.
  it("uses the original SVG color when Maintenance is active", () => {
    mocks.pathname = "/admin/maintenance";

    renderNavigation(true);

    const image = within(
      maintenanceLink(),
    ).getByRole("img", {
      name: "Maintenance icon",
    });

    expect(image.style.filter).toBe("none");
  });

  // Inactive Maintenance icons follow the same styling
  // convention as the other administrator navigation icons.
  it("uses black icon styling when Maintenance is inactive", () => {
    renderNavigation(true);

    const image = within(
      maintenanceLink(),
    ).getByRole("img", {
      name: "Maintenance icon",
    });

    expect(image.style.filter).toBe("brightness(0)");
  });

  // The Maintenance tab is placed immediately after
  // administrator management in the primary navigation.
  it("places Maintenance after the Admin tab", () => {
    renderNavigation(true);

    const links = Array.from(
      document.querySelectorAll(
        "#admin-navigation-links a",
      ),
    );

    expect(
      links.map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual([
      "/admin",
      "/admin/menu",
      "/admin/gallery",
      "/admin/events",
      "/admin/settings",
      "/admin/maintenance",
    ]);
  });

  // Adding Maintenance must not remove any shared
  // administrator navigation destinations.
  it.each([true, false])(
    "preserves shared navigation when isOwner is %s",
    (isOwner) => {
      renderNavigation(isOwner);

      const links = Array.from(
        navigation().querySelectorAll("a"),
      );

      const destinations = links.map((link) =>
        link.getAttribute("href"),
      );

      expect(destinations).toEqual(
        expect.arrayContaining([
          "/admin",
          "/admin/menu",
          "/admin/gallery",
          "/admin/events",
          "/admin/website-content",
          "/",
        ]),
      );

      expect(
        within(navigation()).getByRole("button", {
          name: /Logout/i,
        }),
      ).toBeTruthy();
    },
  );

  // Existing Owner-only administrator management
  // visibility must remain unchanged.
  it.each([true, false])(
    "preserves Admin tab permissions when isOwner is %s",
    (isOwner) => {
      renderNavigation(isOwner);

      const adminLink = navigation().querySelector(
        'a[href="/admin/settings"]',
      );

      if (isOwner) {
        expect(adminLink).not.toBeNull();
      } else {
        expect(adminLink).toBeNull();
      }
    },
  );

  // The Owner must retain access when the mobile
  // navigation is expanded or collapsed.
  it.each([true, false])(
    "retains Owner Maintenance access when mobileOpen is %s",
    (mobileOpen) => {
      renderNavigation(true, mobileOpen);

      expect(maintenanceLink()).toBeTruthy();
    },
  );

  // Expanding the mobile sidebar must not expose
  // Owner-only destinations to a regular Admin.
  it.each([true, false])(
    "hides Maintenance from Admins when mobileOpen is %s",
    (mobileOpen) => {
      renderNavigation(false, mobileOpen);

      expect(
        within(navigation()).queryByRole("link", {
          name: /Maintenance/i,
        }),
      ).toBeNull();
    },
  );

  // The existing mobile navigation toggle remains usable.
  it("calls the mobile navigation toggle callback", () => {
    const { onMobileToggle } =
      renderNavigation(true);

    fireEvent.click(
      within(navigation()).getByRole("button", {
        name: "Expand admin navigation",
      }),
    );

    expect(onMobileToggle).toHaveBeenCalledOnce();
  });

  // Visiting the already-selected Maintenance page
  // should close the expanded mobile navigation.
  it("closes mobile navigation when selecting the current Maintenance page", () => {
    mocks.pathname = "/admin/maintenance";

    const { onMobileClose } =
      renderNavigation(true, true);

    // Ignore the initial route-synchronization effect.
    onMobileClose.mockClear();

    fireEvent.click(maintenanceLink());

    expect(onMobileClose).toHaveBeenCalledOnce();
  });

  // The renamed feature must not retain obsolete
  // Documentation navigation destinations.
  it("does not expose the old Documentation route", () => {
    renderNavigation(true);

    expect(
      navigation().querySelector(
        'a[href="/admin/documentation"]',
      ),
    ).toBeNull();

    expect(
      within(navigation()).queryByRole("link", {
        name: /Documentation/i,
      }),
    ).toBeNull();
  });
});