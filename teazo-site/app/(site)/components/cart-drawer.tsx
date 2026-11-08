"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { Montserrat, Cabin_Sketch } from "next/font/google";
import { useCart } from "@/app/context/cart-context";
import CartDrawerSkeleton from "./cart-drawer-skeleton";
import ChunkErrorBoundary from "./chunk-error-boundary";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

let interiorModule = lazy(() => import("./cart-drawer-content"));

export function resetCartInteriorModule(): void {
  interiorModule = lazy(() => import("./cart-drawer-content"));
}

function LazyCartDrawerContent(props: { onClose: () => void }) {
  const Component = interiorModule;
  return <Component {...props} />;
}

export default function CartDrawer() {
  const { isCartOpen, isHydrated, closeCart, totalCount } = useCart();
  const [interiorRetryKey, setInteriorRetryKey] = useState(0);

  // Storing previous open state during render to derive hasOpenedOnce without an effect cascade
  const [prevIsOpen, setPrevIsOpen] = useState(isCartOpen);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(isCartOpen);

  if (isCartOpen !== prevIsOpen) {
    setPrevIsOpen(isCartOpen);
    if (isCartOpen && !hasOpenedOnce) {
      setHasOpenedOnce(true);
    }
  }

  const asideRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  const handleRetryInterior = useCallback(() => {
    resetCartInteriorModule();
    setInteriorRetryKey((k) => k + 1);
  }, []);

  // Focus trapping, focus restoration, body scroll locking, and Escape key handling in the outer shell
  // Assigned to the shell so they function consistently across pending, error, and loaded states
  useEffect(() => {
    if (isCartOpen) {
      lastActiveElementRef.current = document.activeElement as HTMLElement | null;

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Set initial focus to close button in header
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeCart();
          return;
        }

        if (e.key === "Tab" && asideRef.current) {
          const focusables = asideRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
          );
          if (focusables.length === 0) return;

          const firstElement = focusables[0];
          const lastElement = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      // Restore focus to element that opened the drawer
      if (lastActiveElementRef.current && document.contains(lastActiveElementRef.current)) {
        lastActiveElementRef.current.focus();
      }
    }
  }, [isCartOpen, closeCart]);

  // Keep unmounted until client hydration so SSR and hydration match cleanly
  if (!isHydrated || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[10050] overflow-hidden transition-all duration-300 ${
        isCartOpen ? "pointer-events-auto visible" : "pointer-events-none invisible"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Shopping Bag"
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isCartOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-none">
        <aside
          ref={asideRef}
          className={`w-screen max-w-md bg-white shadow-2xl flex flex-col pointer-events-auto transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
            isCartOpen ? "translate-x-0" : "translate-x-full"
          } ${montserrat.className}`}
        >
          {/* Header - Immediately painted and interactive */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-[#FBF4EE] shrink-0">
            <div className="flex items-center gap-3">
              <span className={`${cabinSketch.className} text-[32px] font-bold text-[#B28458] leading-none`}>
                TEAZO
              </span>
              <span className="text-gray-400 font-light">|</span>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Your Bag {totalCount > 0 && <span className="text-gray-500 font-normal">({totalCount})</span>}
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              onClick={closeCart}
              className="p-2 text-gray-400 hover:text-gray-700 transition rounded-full hover:bg-gray-100 focus:outline-none"
              aria-label="Close cart"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Dynamic Interior - Streamed on first user intent */}
          {hasOpenedOnce ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <ChunkErrorBoundary
                key={`cart-interior-boundary-${interiorRetryKey}`}
                variant="inline"
                fallbackTitle="Unable to load bag contents"
                fallbackDescription="A network error prevented loading your bag. Please check your connection."
                onRetry={handleRetryInterior}
                onDismiss={closeCart}
              >
                <Suspense fallback={<CartDrawerSkeleton />}>
                  <LazyCartDrawerContent
                    key={`interior-content-${interiorRetryKey}`}
                    onClose={closeCart}
                  />
                </Suspense>
              </ChunkErrorBoundary>
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
}
