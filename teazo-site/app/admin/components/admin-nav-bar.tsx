"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The layout owns mobile navigation state; callbacks keep this sidebar reusable.
type SidebarProps = {
  mobileOpen?: boolean;
  onMobileToggle?: () => void;
  onMobileClose?: () => void;
};

export default function Sidebar({
  mobileOpen = false,
  onMobileToggle = () => {},
  onMobileClose = () => {},
}: SidebarProps) {
  // Active pages use colored icons; inactive pages use the black variants.
  const colorIconRoot =
    "/admin_icons/"; // will eventually change this to "/admin_icons/admin_svg/"

  const blackIconRoot =
    "/admin_icons/black_icons/"; // remove later once all admin svgs are completed


  // Read the current route to highlight the matching navigation entry.
  const pathname = usePathname();

  // Keep labels, destinations, and icon filenames together for each primary link.
  const adminPages = [
    {
      id: "dashboard",
      label: "Dashboard",
      img: "admin_svg/teazo_dash_icon.svg",
      img_b:
        "teazo_dash_icon_black.png",
      href: "/admin",
    },
    {
      id: "menu",
      label: "Menu",
      img: "admin_svg/teazo_menu_icon.svg",
      img_b:
        "teazo_menu_icon_black.png",
      href: "/admin/menu",
    },
    {
      id: "gallery",
      label: "Gallery",
      img: "admin_svg/teazo_gallery_icon.svg",
      img_b:
        "teazo_gallery_icon_black.png",
      href: "/admin/gallery",
    },
    {
      id: "events",
      label: "Events",
      img: "admin_svg/teazo_event_icon.svg",
      img_b:
        "teazo_event_icon_black.png",
      href: "/admin/events",
    },
    {
      id: "settings",
      label: "Settings",
      img: "admin_svg/teazo_setting_icon.svg",
      img_b:
        "teazo_setting_icon_black.png",
      href: "/admin/settings",
    },
  ];

  // These are links only. Logout currently navigates home; it does not call sign-out.
  const controls = [
    {
      id: "website-content",
      label: "Website Content",
      href: "/admin/website-content",
    },
    {
      id: "userview",
      label: "User View",
      href: "/",
    },
    {
      id: "logout",
      label: "Logout",
      href: "/",
    },
  ];

  // Reserve a narrow mobile rail while the expanded fixed navigation overlays content.
  return (
    <div className="relative h-dvh w-16 shrink-0 md:w-auto">
      <nav
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh flex-col gap-2 overflow-y-auto bg-[#E5E7EB] p-2 transition-[width] duration-300 md:static md:w-fit md:shadow-none ${
          mobileOpen
            ? "w-64 shadow-xl"
            : "w-16"
        }`}
        aria-label="Admin navigation"
      >
        {/* Mobile navigation toggle */}
        <div
          className={`flex md:hidden ${
            mobileOpen
              ? "justify-end"
              : "justify-center"
          }`}
        >
          <button
            type="button"
            onClick={onMobileToggle}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-gray-700 hover:bg-white"
            aria-label={
              mobileOpen
                ? "Collapse admin navigation"
                : "Expand admin navigation"
            }
            aria-expanded={mobileOpen}
            aria-controls="admin-navigation-links"
          >
            {mobileOpen ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            )}
          </button>
        </div>

        <div
          id="admin-navigation-links"
          className="flex flex-col gap-2"
        >
          {adminPages.map((page) => {
            // Dashboard matches exactly; other sections also match their nested routes.
            const isActive =
              page.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(
                    page.href,
                  );

            return (
              <Link
                key={page.id}
                href={page.href}
                onClick={onMobileClose}
                aria-current={
                  isActive
                    ? "page"
                    : undefined
                }
                title={
                  mobileOpen
                    ? undefined
                    : page.label
                }
                className="block"
              >
                {/*
                 * Keep collapsed mobile icons centered.
                 * On desktop, left-align every icon and label consistently.
                 */}
                <div
                  className={`flex items-center rounded-lg py-3 transition-all duration-200 ${
                    mobileOpen
                      ? "gap-3 px-2"
                      : "justify-center px-1"
                  } md:justify-start md:gap-3 md:px-2`}
                  style={{
                    color: isActive
                      ? "#dbb082"
                      : "#374151",
                    backgroundColor:
                      isActive
                        ? "#ffffff"
                        : "transparent",
                  }}
                >
                  <Image
                    src={
                      isActive || page.img.endsWith(".svg") // OR prevents svg from using img_b
                        ? colorIconRoot +
                          page.img
                        : blackIconRoot +
                          page.img_b
                    }
                    alt={`${page.label} icon`}
                    width={24}
                    height={24}
                    className="h-6 w-6 shrink-0 object-contain"
                    // filter svg black if on page/is active
                    style={{filter: !isActive && page.img.endsWith(".svg") 
                      ? "brightness(0)" 
                      : "none"}}
                  />

                  <span
                    className={`whitespace-nowrap text-sm font-medium ${
                      mobileOpen
                        ? "block"
                        : "hidden"
                    } md:block`}
                  >
                    {page.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Secondary links stay at the bottom and hide when mobile navigation is collapsed. */}
        <div
          className={`mt-auto flex-col pb-6 md:flex md:pb-20 ${
            mobileOpen
              ? "flex"
              : "hidden"
          }`}
        >
          {controls.map(
            (control) => (
              <Link
                key={control.id}
                href={control.href}
                onClick={onMobileClose}
              >
                <div className="flex items-center gap-3 rounded-lg px-2 py-3 transition-all duration-200">
                  <span className="whitespace-nowrap text-base font-medium text-gray-700 transition-all duration-200 hover:text-[#dbb082]">
                    {control.label}
                  </span>
                </div>
              </Link>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}