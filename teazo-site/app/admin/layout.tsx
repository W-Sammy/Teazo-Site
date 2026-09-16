"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Sidebar from "@/app/admin/components/admin-nav-bar";

// Shared admin shell: navigation stays beside the active page content.
export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // The layout owns mobile navigation so its backdrop and sidebar stay in sync.
  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] = useState(false);

  // Listen for Escape only while mobile navigation is open, and remove the listener afterward.
  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [mobileNavOpen]);

  return (
    <div className="relative flex h-dvh min-w-0 overflow-hidden bg-white text-black">
      {/* The mobile backdrop sits below the sidebar and dismisses it on click. */}
      {mobileNavOpen && (
        <button
          type="button"
          onClick={() =>
            setMobileNavOpen(false)
          }
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          aria-label="Close admin navigation"
        />
      )}

      {/* Navigation links can close the mobile drawer through the supplied callback. */}
      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileToggle={() =>
          setMobileNavOpen(
            (current) => !current,
          )
        }
        onMobileClose={() =>
          setMobileNavOpen(false)
        }
      />

      {/* Let page content shrink within the flex layout and scroll without widening the shell. */}
      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  );
}