"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Sidebar from "@/app/admin/components/admin-nav-bar";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [
    mobileNavOpen,
    setMobileNavOpen,
  ] = useState(false);

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

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  );
}