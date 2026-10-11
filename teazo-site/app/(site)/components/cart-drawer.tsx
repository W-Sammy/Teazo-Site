"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { Montserrat, Cabin_Sketch } from "next/font/google";
import {
  useCart,
  recordPendingCheckoutOrder,
  MAX_ITEM_QUANTITY,
} from "@/app/context/cart-context";
import PaymentBadges from "@/app/(site)/components/payment-badges";
import {
  getAvailablePickupSlots,
  getPacificParts,
  formatMinuteOfDay,
  type DaySchedule,
  getStoreScheduleForDate,
} from "@/app/lib/store-hours";
import type { WebsiteContent } from "@/app/types/website-content";
import type { MenuItem } from "@/app/(site)/components/menu-item-card";
import type {
  CartItem,
  CheckoutRequestBody,
  CheckoutSuccessResponse,
  CheckoutErrorResponse,
  PickupScheduleType,
} from "@/app/types/checkout";
import ItemCustomizerModal from "@/app/(site)/components/item-customizer-modal";

const SAVED_CONTACT_STORAGE_KEY = "teazo_saved_contact";

// Fallback schedule guarantees no false "Store Closed" flash on initial load
const FALLBACK_WEBSITE_CONTENT: WebsiteContent = {
  logo: "/TEAZO_logo.svg",
  story: "",
  socialLinks: [],
  contactFormEnabled: true,
  hours: [
    { day: "Sun", start: 11.5, end: 20, closed: false },
    { day: "Mon", start: 11.5, end: 20, closed: false },
    { day: "Tue", start: 11.5, end: 20, closed: false },
    { day: "Wed", start: 11.5, end: 20, closed: false },
    { day: "Thu", start: 11.5, end: 20, closed: false },
    { day: "Fri", start: 11.5, end: 20, closed: false },
    { day: "Sat", start: 11.5, end: 20, closed: false },
  ],
  holidays: [],
  address: {
    businessName: "TEAZO",
    streetAddress: "1050 Taraval St",
    locality: "San Francisco, CA 94116",
    phone: "+1 (415) 748-7398",
    email: "teazosf@hotmail.com",
    mapQuery: "1050 Taraval St, San Francisco, CA 94116",
  },
};

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatSlotDisplay(isoString: string): string {
  try {
    const date = new Date(isoString);
    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return `Today at ${timeStr}`;
  } catch {
    return isoString;
  }
}

function subscribeContactStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("teazo_contact_sync", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("teazo_contact_sync", callback);
  };
}

function getContactSnapshot(): string {
  if (typeof window === "undefined") return "{}";
  return localStorage.getItem(SAVED_CONTACT_STORAGE_KEY) ?? "{}";
}

function getServerContactSnapshot(): string {
  return "{}";
}

export default function CartDrawer() {
  const {
    items,
    totalCount,
    subtotalCents,
    isCartOpen,
    isHydrated,
    openCart,
    closeCart,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCart();

  // Contact form state loaded seamlessly via external store to avoid setState-in-effect violations
  const savedContactJson = useSyncExternalStore(
    subscribeContactStorage,
    getContactSnapshot,
    getServerContactSnapshot
  );

  const savedContact = useMemo(() => {
    try {
      return JSON.parse(savedContactJson);
    } catch {
      return {};
    }
  }, [savedContactJson]);

  const [userEditedName, setUserEditedName] = useState<string | null>(null);
  const [userEditedPhone, setUserEditedPhone] = useState<string | null>(null);
  const [userEditedEmail, setUserEditedEmail] = useState<string | null>(null);

  const customerName = userEditedName !== null ? userEditedName : (savedContact.name ?? "");
  const customerPhone = userEditedPhone !== null ? userEditedPhone : (savedContact.phone ?? "");
  const customerEmail = userEditedEmail !== null ? userEditedEmail : (savedContact.email ?? "");

  // Timing state
  const [userSelectedPickupType, setUserSelectedPickupType] = useState<PickupScheduleType | null>(null);
  const [userSelectedSlot, setUserSelectedSlot] = useState<string>("");

  // Store hours / schedule initialized with fallback to avoid false "Closed" flash
  const [websiteContent, setWebsiteContent] = useState<WebsiteContent>(FALLBACK_WEBSITE_CONTENT);
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
    timing?: string;
  }>({});
  // Editing state for line items
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [editingLoadingId, setEditingLoadingId] = useState<string | null>(null);
  const menuItemCacheRef = useRef<Record<string, MenuItem>>({});

  const handleEditCartItem = async (cartItem: CartItem) => {
    setEditingLoadingId(cartItem.cartItemId);
    setErrorMessage(null);
    try {
      let menuItem = menuItemCacheRef.current[cartItem.catalogObjectId];
      if (!menuItem) {
        const res = await fetch(`/api/square/products/${cartItem.catalogObjectId}`);
        if (!res.ok) {
          throw new Error("Unable to load drink options from Square.");
        }
        const apiItem = await res.json();
        menuItem = {
          catalogObjectId: apiItem.catalogObjectId,
          name: apiItem.name?.trim() || cartItem.name,
          variationId: apiItem.variationId || null,
          priceCents: apiItem.priceCents,
          currency: apiItem.currency || "USD",
          imageUrl: apiItem.imageUrl || cartItem.imageUrl || null,
          categoryId: apiItem.categories?.[0]?.id || null,
          categoryName: apiItem.categories?.[0]?.name || null,
          description: apiItem.description,
          modifiers: apiItem.modifiers || [],
          variations: apiItem.variations || [],
        };
        menuItemCacheRef.current[cartItem.catalogObjectId] = menuItem;
      }
      setEditingCartItem(cartItem);
      setEditingMenuItem(menuItem);
      closeCart();
    } catch (err) {
      console.error("Failed to load item for editing:", err);
      setErrorMessage("Could not load customization options for this drink.");
    } finally {
      setEditingLoadingId(null);
    }
  };

  const asideRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  const nameInputId = useId();
  const phoneInputId = useId();
  const emailInputId = useId();
  const slotSelectId = useId();

  const saveContactToStorage = (name: string, phone: string, email: string) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        SAVED_CONTACT_STORAGE_KEY,
        JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() })
      );
      window.dispatchEvent(new Event("teazo_contact_sync"));
    } catch (err) {
      console.error("Failed to save contact to localStorage:", err);
    }
  };

  // Fetch live website content for database-backed schedule & holiday exceptions
  // Defer fetching until cart is opened or has items to avoid redundant background queries on all landing pages
  useEffect(() => {
    if (!isCartOpen && totalCount === 0) return;
    let isMounted = true;
    async function loadContent() {
      try {
        const res = await fetch("/api/website-content");
        if (res.ok) {
          const data: WebsiteContent = await res.json();
          if (isMounted) setWebsiteContent(data);
        }
      } catch (err) {
        console.error("Failed to fetch store schedule in CartDrawer:", err);
      }
    }

    loadContent();

    return () => {
      isMounted = false;
    };
  }, [isCartOpen, totalCount]);

  // Periodically refresh current time every 30s while drawer is open to eliminate time-drift
  useEffect(() => {
    if (!isCartOpen) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [isCartOpen]);

  // Compute available 15-minute pickup slots using latest currentTime
  const availableSlots = useMemo(() => {
    try {
      return getAvailablePickupSlots(websiteContent, currentTime);
    } catch {
      return [];
    }
  }, [websiteContent, currentTime]);

  // Today's schedule status
  const todaySchedule: DaySchedule | null = useMemo(() => {
    try {
      return getStoreScheduleForDate(currentTime, websiteContent);
    } catch {
      return null;
    }
  }, [websiteContent, currentTime]);

  // Evaluate whether ASAP ordering is currently open
  const isAsapAvailable = useMemo(() => {
    if (!todaySchedule || todaySchedule.closed) return false;
    const nowParts = getPacificParts(currentTime);
    return (
      nowParts.minuteOfDay >= todaySchedule.openMinuteOfDay &&
      nowParts.minuteOfDay <= todaySchedule.cutoffMinuteOfDay
    );
  }, [todaySchedule, currentTime]);

  // Derive effective pickup type gracefully: if ASAP is closed but scheduled slots exist, default to SCHEDULED
  const effectivePickupType: PickupScheduleType = useMemo(() => {
    if (userSelectedPickupType === "SCHEDULED") return "SCHEDULED";
    if (userSelectedPickupType === "ASAP" && isAsapAvailable) return "ASAP";
    if (!isAsapAvailable && availableSlots.length > 0) return "SCHEDULED";
    return "ASAP";
  }, [userSelectedPickupType, isAsapAvailable, availableSlots.length]);

  // Derive active scheduled slot without cascading render effect
  const activeSlot = useMemo(() => {
    if (userSelectedSlot && availableSlots.includes(userSelectedSlot)) {
      return userSelectedSlot;
    }
    return availableSlots[0] ?? "";
  }, [userSelectedSlot, availableSlots]);

  // Focus trapping, focus restoration, body scroll locking, and Escape key handling
  useEffect(() => {
    if (isCartOpen) {
      lastActiveElementRef.current = document.activeElement as HTMLElement | null;

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      // Set initial focus to close button
      const timer = setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeCart();
          return;
        }

        if (e.key === "Tab" && asideRef.current) {
          // WCAG: Only query non-disabled interactive elements
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
      // Restore focus to button that opened the drawer
      if (lastActiveElementRef.current) {
        lastActiveElementRef.current.focus();
      }
    }
  }, [isCartOpen, closeCart]);

  // Dynamic store address
  const storeAddressDisplay = useMemo(() => {
    const biz = websiteContent?.address?.businessName || "TEAZO";
    const street = websiteContent?.address?.streetAddress || "1050 Taraval St";
    const loc = websiteContent?.address?.locality || "San Francisco, CA 94116";
    return `${biz} — ${street}, ${loc}`;
  }, [websiteContent]);

  // Validate form inputs
  const validateForm = (): boolean => {
    const errors: {
      name?: string;
      phone?: string;
      email?: string;
      timing?: string;
    } = {};

    const cleanName = customerName.trim();
    if (!cleanName) {
      errors.name = "Full name is required";
    } else if (cleanName.length < 2) {
      errors.name = "Name must be at least 2 characters";
    }

    const cleanPhone = customerPhone.replace(/\D/g, "");
    if (!cleanPhone) {
      errors.phone = "Phone number is required for SMS order alerts";
    } else if (cleanPhone.length < 10) {
      errors.phone = "Please enter a valid 10-digit phone number";
    }

    const cleanEmail = customerEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail) {
      errors.email = "Email address is required for receipt";
    } else if (!emailRegex.test(cleanEmail)) {
      errors.email = "Please enter a valid email address";
    }

    if (effectivePickupType === "ASAP" && !isAsapAvailable) {
      errors.timing = "Store is currently closed for ASAP orders.";
    }

    if (effectivePickupType === "SCHEDULED") {
      if (availableSlots.length === 0) {
        errors.timing = "No scheduled slots available for today.";
      } else if (!activeSlot) {
        errors.timing = "Please select a pickup time.";
      } else {
        const slotTimeMs = new Date(activeSlot).getTime();
        // Ensure slot has not slipped past minimum 22-minute buffer (25m lead time - 3m grace)
        if (slotTimeMs < Date.now() + 22 * 60 * 1000) {
          errors.timing = "Selected pickup time has expired. Please select an updated slot.";
        }
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit checkout
  const handleProceedToCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (items.length === 0) {
      setErrorMessage("Your cart is empty. Add drinks to proceed.");
      return;
    }

    if (!validateForm()) {
      // Prevent mobile dead-button feeling by displaying visible alert and scrolling to error
      setErrorMessage("Please complete the required contact and pickup details above.");
      setTimeout(() => {
        const firstErrorField = asideRef.current?.querySelector('[aria-invalid="true"]');
        firstErrorField?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (firstErrorField instanceof HTMLElement) {
          firstErrorField.focus();
        }
      }, 50);
      return;
    }

    // Persist contact details for returning visits
    saveContactToStorage(customerName, customerPhone, customerEmail);

    setIsSubmitting(true);

    try {
      // Normalize phone to E.164 (+1XXXXXXXXXX) format for Square Orders API compliance
      const digits = customerPhone.replace(/\D/g, "");
      const e164Phone = digits.length === 10
        ? `+1${digits}`
        : digits.startsWith("1") && digits.length === 11
        ? `+${digits}`
        : `+1${digits}`;

      const body: CheckoutRequestBody = {
        customer: {
          displayName: customerName.trim(),
          email: customerEmail.trim(),
          phone: e164Phone,
        },
        pickupTiming:
          effectivePickupType === "SCHEDULED" && activeSlot
            ? { type: "SCHEDULED", pickupAt: activeSlot }
            : { type: "ASAP" },
        items: items.map((it) => ({
          variationId: it.variationId,
          quantity: it.quantity,
          notes: it.notes?.trim() || undefined,
          modifierOptionIds: it.selectedModifiers.map((m) => m.optionId),
        })),
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData: CheckoutErrorResponse = await res.json().catch(() => ({
          error: "Checkout service returned an error. Please try again.",
        }));
        throw new Error(errorData.error || "Failed to create checkout session.");
      }

      const data: CheckoutSuccessResponse = await res.json();
      if (!data.checkoutUrl) {
        throw new Error("Missing checkout URL from server.");
      }

      // Record pending order ID in case customer completes payment but closes tab before redirecting back
      if (data.orderId) {
        recordPendingCheckoutOrder(data.orderId);
      }

      // Redirect customer to Square Hosted Checkout
      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error("Checkout submission failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred during checkout."
      );
      setIsSubmitting(false);
    }
  };

  const isCheckoutDisabled =
    isSubmitting ||
    items.length === 0 ||
    (effectivePickupType === "ASAP" && !isAsapAvailable) ||
    (effectivePickupType === "SCHEDULED" && (availableSlots.length === 0 || !activeSlot));

  if (!isHydrated || typeof document === "undefined") return null;

  return createPortal(
    <>
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
          className={`w-screen max-w-md bg-white shadow-2xl flex flex-col pointer-events-auto transition-transform duration-300 ease-in-out ${
            isCartOpen ? "translate-x-0" : "translate-x-full"
          } ${montserrat.className}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-[#FAF7F2]">
            <div className="flex items-center gap-3">
              <span className={`${cabinSketch.className} text-[32px] font-bold text-[#DBAF82] leading-none`}>
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

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Empty State */}
            {isHydrated && items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-[#FAF7F2] flex items-center justify-center text-[#DBAF82]">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Your bag is currently empty</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs">
                    Explore our hand-crafted milk teas, fruit blends, and fresh toppings.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
                  <Link
                    href="/menu"
                    onClick={closeCart}
                    className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-[#DBAF82] text-white text-xs font-bold tracking-wider hover:bg-[#c69a6d] transition shadow-sm"
                  >
                    EXPLORE MENU
                  </Link>
                  {process.env.NODE_ENV === "development" && (
                    <button
                      type="button"
                      onClick={() => {
                        addItem({
                          cartItemId: `test-item-${Date.now()}`,
                          catalogObjectId: "ITEM_TARO",
                          variationId: "VAR_REGULAR",
                          variationName: "Regular",
                          name: "Taro Milk Tea",
                          basePriceCents: 575,
                          imageUrl: null,
                          selectedModifiers: [
                            {
                              modifierListId: "M_SWEET",
                              modifierListName: "Sweetness",
                              optionId: "SWEET_50",
                              optionName: "50% Sweet",
                              priceCents: 0,
                            },
                            {
                              modifierListId: "M_TOPPINGS",
                              modifierListName: "Toppings",
                              optionId: "TOPPING_BOBA",
                              optionName: "Honey Boba",
                              priceCents: 50,
                            },
                          ],
                          quantity: 1,
                          notes: "Less ice please",
                          itemTotalCents: 625,
                        });
                      }}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-full border border-dashed border-[#DBAF82] text-[#DBAF82] hover:bg-[#FAF7F2] text-[11px] font-semibold transition"
                    >
                      + Add Sample Drink (Dev Test)
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Items List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Selected Items
                    </span>
                    <button
                      onClick={clearCart}
                      className="text-[11px] font-medium text-gray-400 hover:text-red-500 transition"
                    >
                      Clear All
                    </button>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {items.map((item) => (
                      <div key={item.cartItemId} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-2">
                        {/* Title, Thumbnail & Price */}
                        <div className="flex items-start gap-3">
                          {/* Drink Thumbnail */}
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              width={56}
                              height={56}
                              unoptimized
                              className="w-14 h-14 rounded-lg object-cover border border-gray-100 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-[#FAF7F2] border border-[#F0EAE1] flex items-center justify-center text-xl shrink-0">
                              🧋
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            {/* Drink Name & Variation Size */}
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <h4 className="text-sm font-bold text-gray-900 leading-snug">
                                {item.name}
                              </h4>
                              {item.variationName && (
                                <span className="text-xs text-gray-500 font-medium shrink-0">
                                  ({item.variationName})
                                </span>
                              )}
                            </div>

                            {/* Modifiers Chips */}
                            {item.selectedModifiers.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.selectedModifiers.map((mod) => (
                                  <span
                                    key={mod.optionId}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#FAF7F2] text-gray-700 border border-gray-100"
                                  >
                                    {mod.optionName}
                                    {mod.priceCents > 0 && (
                                      <span className="text-gray-400 ml-1">
                                        (+{formatPrice(mod.priceCents)})
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Special Instructions */}
                            {item.notes && (
                              <p className="text-[11px] text-gray-500 italic bg-gray-50 px-2 py-0.5 rounded mt-1">
                                Note: &ldquo;{item.notes}&rdquo;
                              </p>
                            )}
                          </div>

                          {/* Price Breakdown */}
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-gray-900 block whitespace-nowrap">
                              {formatPrice(item.itemTotalCents)}
                            </span>
                            {item.quantity > 1 && (
                              <span className="text-[10px] text-gray-400 block whitespace-nowrap">
                                {formatPrice(Math.round(item.itemTotalCents / item.quantity))} each
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quantity Stepper & Remove */}
                        <div className="flex items-center justify-between mt-1 pt-1 pl-[68px]">
                          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  removeItem(item.cartItemId);
                                } else {
                                  updateQuantity(item.cartItemId, -1);
                                }
                              }}
                              className="w-9 h-9 flex items-center justify-center text-sm font-bold transition select-none text-gray-600 hover:text-black hover:bg-gray-50"
                              aria-label={item.quantity <= 1 ? "Remove item" : "Decrease quantity"}
                            >
                              {item.quantity <= 1 ? (
                                <svg className="w-3.5 h-3.5 text-gray-400 hover:text-red-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              ) : (
                                "-"
                              )}
                            </button>
                            <span className="px-3 py-1 text-xs font-bold text-gray-800 select-none">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.cartItemId, 1)}
                              disabled={item.quantity >= MAX_ITEM_QUANTITY}
                              className={`w-9 h-9 flex items-center justify-center text-sm font-bold transition select-none ${
                                item.quantity >= MAX_ITEM_QUANTITY
                                  ? "text-gray-300 cursor-not-allowed bg-gray-50"
                                  : "text-gray-600 hover:text-black hover:bg-gray-50"
                              }`}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleEditCartItem(item)}
                              disabled={editingLoadingId === item.cartItemId}
                              className="text-[11px] font-semibold text-[#c68f5d] hover:text-[#a06b3a] transition underline disabled:opacity-50"
                            >
                              {editingLoadingId === item.cartItemId ? "Loading..." : "Edit"}
                            </button>

                            <button
                              type="button"
                              onClick={() => removeItem(item.cartItemId)}
                              className="text-[11px] font-medium text-gray-400 hover:text-red-500 transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pickup Location Card */}
                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#F0EAE1] space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      In-Store Pickup Location
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 font-semibold pl-4">
                    {storeAddressDisplay}
                  </p>
                  <p className="text-[11px] text-gray-500 pl-4">
                    Show your order confirmation at the counter upon arrival.
                  </p>
                </div>

                {/* Pickup Timing Selection */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                    Pickup Timing
                  </label>

                  {/* ASAP vs Scheduled Segmented Buttons */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                    <button
                      type="button"
                      disabled={!isAsapAvailable}
                      onClick={() => {
                        setUserSelectedPickupType("ASAP");
                        setFormErrors((prev) => ({ ...prev, timing: undefined }));
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold tracking-tight transition ${
                        effectivePickupType === "ASAP"
                          ? "bg-white text-gray-900 shadow-sm"
                          : isAsapAvailable
                          ? "text-gray-500 hover:text-gray-900"
                          : "text-gray-400 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      {isAsapAvailable ? "ASAP (~20–25m)" : "ASAP (Closed)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserSelectedPickupType("SCHEDULED");
                        setFormErrors((prev) => ({ ...prev, timing: undefined }));
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold tracking-tight transition ${
                        effectivePickupType === "SCHEDULED"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-900"
                      }`}
                    >
                      Schedule Later
                    </button>
                  </div>

                  {/* Store Closed for ASAP Alert */}
                  {!isAsapAvailable && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <span>⏰ Store Currently Closed for ASAP Orders</span>
                      </div>
                      <p className="text-[11px] text-amber-700 leading-relaxed">
                        {todaySchedule?.closed
                          ? "Online ordering is unavailable today."
                          : todaySchedule
                          ? `Orders are accepted daily ${formatMinuteOfDay(todaySchedule.openMinuteOfDay)} – ${formatMinuteOfDay(todaySchedule.cutoffMinuteOfDay)} PT.`
                          : "Store is currently closed."}
                      </p>
                    </div>
                  )}

                  {/* Scheduled Slot Dropdown */}
                  {effectivePickupType === "SCHEDULED" && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <label htmlFor={slotSelectId} className="text-[11px] font-semibold text-gray-600 block">
                        Select Pickup Time (Pacific Time)
                      </label>
                      {availableSlots.length > 0 ? (
                        <select
                          id={slotSelectId}
                          value={activeSlot}
                          onChange={(e) => {
                            setUserSelectedSlot(e.target.value);
                            setFormErrors((prev) => ({ ...prev, timing: undefined }));
                          }}
                          className="w-full px-3 py-2 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#DBAF82] focus:border-[#DBAF82] bg-white font-medium text-stone-900"
                        >
                          {availableSlots.map((slot) => (
                            <option key={slot} value={slot}>
                              {formatSlotDisplay(slot)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                          {todaySchedule?.closed
                            ? "Store is closed today. Scheduled orders are currently unavailable."
                            : "Same-day ordering cutoff has passed for today. Last pickup orders are accepted 30 minutes before closing."}
                        </div>
                      )}
                      {formErrors.timing && (
                        <p className="text-[11px] text-red-500 font-medium">{formErrors.timing}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Customer Details Form */}
                <form id="checkout-contact-form" onSubmit={handleProceedToCheckout} className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                      Contact & Receipt Info
                    </span>
                  </div>

                  {/* Full Name */}
                  <div className="space-y-1">
                    <label htmlFor={nameInputId} className="text-[11px] font-semibold text-stone-800 flex justify-between">
                      <span>Full Name</span>
                      <span className="text-stone-400">*</span>
                    </label>
                    <input
                      id={nameInputId}
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Alex Smith"
                      value={customerName}
                      aria-invalid={Boolean(formErrors.name)}
                      onChange={(e) => {
                        setUserEditedName(e.target.value);
                        if (formErrors.name) setFormErrors((p) => ({ ...p, name: undefined }));
                      }}
                      onBlur={() => saveContactToStorage(customerName, customerPhone, customerEmail)}
                      className={`w-full px-3 py-2 text-xs font-medium text-stone-900 bg-white placeholder:text-stone-400 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#DBAF82] transition ${
                        formErrors.name ? "border-red-400 bg-red-50/20" : "border-stone-200"
                      }`}
                    />
                    {formErrors.name && (
                      <p className="text-[10px] text-red-500 font-medium">{formErrors.name}</p>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <label htmlFor={phoneInputId} className="text-[11px] font-semibold text-stone-800 flex justify-between">
                      <span>Mobile Phone (for SMS order ready alert)</span>
                      <span className="text-stone-400">*</span>
                    </label>
                    <input
                      id={phoneInputId}
                      type="tel"
                      autoComplete="tel"
                      placeholder="e.g. (415) 555-0199"
                      value={customerPhone}
                      aria-invalid={Boolean(formErrors.phone)}
                      onChange={(e) => {
                        setUserEditedPhone(e.target.value);
                        if (formErrors.phone) setFormErrors((p) => ({ ...p, phone: undefined }));
                      }}
                      onBlur={() => saveContactToStorage(customerName, customerPhone, customerEmail)}
                      className={`w-full px-3 py-2 text-xs font-medium text-stone-900 bg-white placeholder:text-stone-400 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#DBAF82] transition ${
                        formErrors.phone ? "border-red-400 bg-red-50/20" : "border-stone-200"
                      }`}
                    />
                    {formErrors.phone && (
                      <p className="text-[10px] text-red-500 font-medium">{formErrors.phone}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label htmlFor={emailInputId} className="text-[11px] font-semibold text-stone-800 flex justify-between">
                      <span>Email Address (for receipt)</span>
                      <span className="text-stone-400">*</span>
                    </label>
                    <input
                      id={emailInputId}
                      type="email"
                      autoComplete="email"
                      placeholder="e.g. alex@example.com"
                      value={customerEmail}
                      aria-invalid={Boolean(formErrors.email)}
                      onChange={(e) => {
                        setUserEditedEmail(e.target.value);
                        if (formErrors.email) setFormErrors((p) => ({ ...p, email: undefined }));
                      }}
                      onBlur={() => saveContactToStorage(customerName, customerPhone, customerEmail)}
                      className={`w-full px-3 py-2 text-xs font-medium text-stone-900 bg-white placeholder:text-stone-400 border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#DBAF82] transition ${
                        formErrors.email ? "border-red-400 bg-red-50/20" : "border-stone-200"
                      }`}
                    />
                    {formErrors.email && (
                      <p className="text-[10px] text-red-500 font-medium">{formErrors.email}</p>
                    )}
                  </div>
                </form>

                {/* Payment Badges */}
                <div className="pt-2 border-t border-gray-100">
                  <PaymentBadges />
                </div>
              </>
            )}
          </div>

          {/* Footer & Checkout CTA */}
          {items.length > 0 && (
            <div className="p-6 border-t border-gray-100 bg-white space-y-3">
              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Subtotal Breakdown */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subtotal ({totalCount} items)</span>
                  <span className="font-bold text-gray-900">{formatPrice(subtotalCents)}</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-tight">
                  Taxes & optional tips calculated securely by Square during payment.
                </p>
              </div>

              {/* Proceed Button */}
              <button
                type="submit"
                form="checkout-contact-form"
                disabled={isCheckoutDisabled}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide transition flex items-center justify-center gap-2 shadow-md ${
                  isCheckoutDisabled
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-[#DBAF82] text-white hover:bg-[#c69a6d] active:scale-[0.99]"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Redirecting to Square...
                  </>
                ) : (
                  <>
                    <span>Proceed to Checkout</span>
                    <span>•</span>
                    <span>{formatPrice(subtotalCents)}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>

    {/* Drink Customization / Edit Modal */}
    <ItemCustomizerModal
      item={editingMenuItem}
      initialCartItem={editingCartItem}
      onClose={() => {
        setEditingCartItem(null);
        setEditingMenuItem(null);
        openCart();
      }}
    />
  </>,
  document.body
);
}
