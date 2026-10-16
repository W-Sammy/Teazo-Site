"use client";

import React, { useEffect, useState, useSyncExternalStore, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Montserrat, Cabin_Sketch } from "next/font/google";
import { useCart } from "@/app/context/cart-context";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

interface SquareOrderLineItem {
  uid?: string;
  name?: string;
  variationName?: string;
  quantity: string;
  note?: string;
  totalMoney?: {
    amount: number | string | bigint;
    currency?: string;
  };
  modifiers?: Array<{
    name?: string;
    totalMoney?: {
      amount: number | string | bigint;
    };
  }>;
}

interface SquareOrderDetails {
  id: string;
  state?: string;
  locationId?: string;
  lineItems?: SquareOrderLineItem[];
  fulfillments?: Array<{
    type?: string;
    state?: string;
    pickupDetails?: {
      scheduleType?: string;
      pickupAt?: string;
      recipient?: {
        displayName?: string;
        emailAddress?: string;
        phoneNumber?: string;
      };
      note?: string;
    };
  }>;
  totalTaxMoney?: {
    amount: number | string | bigint;
  };
  totalTipMoney?: {
    amount: number | string | bigint;
  };
  totalDiscountMoney?: {
    amount: number | string | bigint;
  };
  totalMoney?: {
    amount: number | string | bigint;
    currency?: string;
  };
}

function formatMoney(amount?: number | string | bigint): string {
  if (amount === undefined || amount === null) return "$0.00";
  const num = typeof amount === "bigint" ? Number(amount) : Number(amount);
  return `$${(num / 100).toFixed(2)}`;
}

function formatPickupTiming(scheduleType?: string, pickupAt?: string): string {
  if (scheduleType === "SCHEDULED" && pickupAt) {
    try {
      const date = new Date(pickupAt);
      const timeStr = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
      return `Scheduled: ${timeStr} PT`;
    } catch {
      return `Scheduled: ${pickupAt}`;
    }
  }
  return "Pickup ASAP (~20–25 minutes)";
}

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("teazo_cart_sync", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("teazo_cart_sync", callback);
  };
}

function getStoredOrderIdSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    const confirmed = sessionStorage.getItem("teazo_confirmed_order_id");
    if (confirmed && confirmed.trim().length > 0) return confirmed.trim();

    const sessionLast = sessionStorage.getItem("teazo_last_order_id");
    if (sessionLast && sessionLast.trim().length > 0) return sessionLast.trim();

    const raw = localStorage.getItem("teazo_pending_checkout");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.orderId && typeof parsed.orderId === "string") return parsed.orderId.trim();
    }

    const recent = localStorage.getItem("teazo_recent_order_id");
    if (recent && recent.trim().length > 0) return recent.trim();
  } catch {}
  return "";
}

function getServerStoredOrderIdSnapshot(): string {
  return "";
}

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const rawOrderId =
    searchParams.get("orderId") ||
    searchParams.get("order_id") ||
    searchParams.get("id");
  const urlOrderId =
    rawOrderId && rawOrderId !== "{ORDER_ID}" && rawOrderId.trim().length > 0
      ? rawOrderId.trim()
      : null;

  const storedOrderId = useSyncExternalStore(
    subscribeStorage,
    getStoredOrderIdSnapshot,
    getServerStoredOrderIdSnapshot
  );

  const orderId =
    urlOrderId || (storedOrderId.length > 0 ? storedOrderId : null);

  const { clearCart } = useCart();
  const [order, setOrder] = useState<SquareOrderDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derived loading state: true while an orderId exists and neither receipt nor error has resolved
  const isLoading = Boolean(orderId) && order === null && errorMessage === null;

  // Fetch verified order receipt from Square API
  useEffect(() => {
    if (!orderId) {
      return;
    }
    const validOrderId: string = orderId;

    let isMounted = true;

    async function loadOrder() {
      try {
        const res = await fetch(`/api/orders/${validOrderId}`);
        if (!res.ok) {
          throw new Error("Unable to load order receipt from Square.");
        }
        const data = await res.json();
        if (isMounted) {
          setOrder(data.order);
          // Persist confirmed order ID in session so refreshing preserves receipt
          try {
            sessionStorage.setItem("teazo_confirmed_order_id", validOrderId);
          } catch {}
          // Clear active cart now that the order has been completed and displayed
          clearCart();
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to fetch order confirmation:", err);
          setErrorMessage(err instanceof Error ? err.message : "Failed to load order.");
        }
      }
    }

    loadOrder();

    return () => {
      isMounted = false;
    };
  }, [orderId, clearCart]);

  if (isLoading) {
    return (
      <div className={`min-h-screen pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-[#FAF7F2] text-stone-900 ${montserrat.className} flex flex-col items-center justify-center`}>
        <div className="w-12 h-12 border-4 border-[#DBAF82] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-stone-600 font-medium text-sm">Verifying your order with Square...</p>
      </div>
    );
  }

  if (!orderId || errorMessage || !order) {
    return (
      <div className={`min-h-screen pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-[#FAF7F2] text-stone-900 ${montserrat.className} flex items-center justify-center`}>
        <div className="max-w-md w-full bg-white rounded-2xl p-8 sm:p-10 text-center shadow-sm border border-stone-200/60 space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mx-auto">
            ℹ️
          </div>
          <h1 className="text-xl font-bold text-stone-900">Order Not Found</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            {errorMessage ||
              "We could not find an active order reference. If you completed a payment, please check your email for your Square receipt."}
          </p>
          <div className="pt-2">
            <Link
              href="/menu"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-[#DBAF82] text-white font-bold text-xs tracking-wider hover:bg-[#c69a6d] transition shadow-sm"
            >
              EXPLORE MENU
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (order.state === "CANCELED") {
    return (
      <div className={`min-h-screen pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-[#FAF7F2] text-stone-900 ${montserrat.className} flex items-center justify-center`}>
        <div className="max-w-md w-full bg-white rounded-2xl p-8 sm:p-10 text-center shadow-sm border border-stone-200/60 space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-2xl mx-auto">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-stone-900">Order Cancelled</h1>
          <p className="text-sm text-stone-600 leading-relaxed">
            This order was cancelled or voided. If you believe this was an error, please contact TEAZO store staff.
          </p>
          <div className="pt-2">
            <Link
              href="/menu"
              className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-[#DBAF82] text-white font-bold text-xs tracking-wider hover:bg-[#c69a6d] transition shadow-sm"
            >
              BACK TO MENU
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pickupDetails = order.fulfillments?.[0]?.pickupDetails;
  const recipient = pickupDetails?.recipient;
  const lineItems = order.lineItems ?? [];

  return (
    <div className={`min-h-screen pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-[#FAF7F2] ${montserrat.className}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Success Header Card */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 text-center shadow-sm border border-gray-100">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className={`${cabinSketch.className} text-4xl sm:text-5xl font-bold text-[#DBAF82] mb-1`}>
            Order Confirmed!
          </h1>
          <p className="text-sm text-gray-600">
            Thank you for ordering with TEAZO. Your drinks are being sent to our kitchen.
          </p>
          <div className="mt-3 inline-block px-3 py-1 bg-gray-50 rounded-full border border-gray-200 text-xs text-gray-500 font-mono">
            Order Reference: {order.id.slice(0, 16)}...
          </div>
        </div>

        {/* Pickup Fulfillment Details Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              Pickup Instructions
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-gray-400 font-medium uppercase tracking-wider block text-[10px]">
                Pickup Location
              </span>
              <p className="font-bold text-gray-900">TEAZO</p>
              <p className="text-gray-600">1050 Taraval St</p>
              <p className="text-gray-600">San Francisco, CA 94116</p>
            </div>

            <div className="space-y-1">
              <span className="text-gray-400 font-medium uppercase tracking-wider block text-[10px]">
                Estimated Ready Time
              </span>
              <p className="font-bold text-gray-900 text-sm">
                {formatPickupTiming(pickupDetails?.scheduleType, pickupDetails?.pickupAt)}
              </p>
              {recipient?.displayName && (
                <p className="text-gray-600 mt-1">Customer: <span className="font-semibold text-gray-800">{recipient.displayName}</span></p>
              )}
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl text-amber-800 text-xs">
            💬 <strong>At the Counter:</strong> Show your name or this confirmation screen when you arrive. A receipt has also been sent to your email.
          </div>
        </div>

        {/* Itemized Receipt Breakdown Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              Itemized Receipt
            </h2>
            <span className="text-xs text-gray-400 font-medium">
              {lineItems.length} {lineItems.length === 1 ? "Item" : "Items"}
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {lineItems.map((item, idx) => (
              <div key={item.uid || idx} className="py-3 flex justify-between items-start gap-4 text-xs">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-gray-900">
                      {item.quantity}× {item.name}
                    </span>
                    {item.variationName && (
                      <span className="text-gray-500 font-medium">({item.variationName})</span>
                    )}
                  </div>

                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[11px] text-gray-600">
                      {item.modifiers.map((mod, mIdx) => (
                        <span key={mIdx} className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                          {mod.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.note && (
                    <p className="text-[11px] text-gray-500 italic">
                      Note: &ldquo;{item.note}&rdquo;
                    </p>
                  )}
                </div>

                <div className="font-bold text-gray-900 whitespace-nowrap text-right">
                  {formatMoney(item.totalMoney?.amount)}
                </div>
              </div>
            ))}
          </div>

          {/* Subtotal, Tax, Tip, Total */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs">
            {order.totalTaxMoney && (
              <div className="flex justify-between text-gray-600">
                <span>Sales Tax</span>
                <span>{formatMoney(order.totalTaxMoney.amount)}</span>
              </div>
            )}
            {order.totalTipMoney && Number(order.totalTipMoney.amount) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tip</span>
                <span>{formatMoney(order.totalTipMoney.amount)}</span>
              </div>
            )}
            {order.totalDiscountMoney && Number(order.totalDiscountMoney.amount) > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Discount</span>
                <span>-{formatMoney(order.totalDiscountMoney.amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-100">
              <span>Total Paid</span>
              <span className="text-base text-[#DBAF82] font-extrabold">{formatMoney(order.totalMoney?.amount)}</span>
            </div>
          </div>
        </div>

        {/* Back to Menu Action */}
        <div className="text-center pt-2">
          <Link
            href="/menu"
            className="inline-flex items-center justify-center px-8 py-3 rounded-full bg-[#DBAF82] text-white font-bold text-xs tracking-wider hover:bg-[#c69a6d] transition shadow-md"
          >
            ORDER MORE DRINKS
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className={`min-h-screen pt-28 pb-16 px-4 sm:px-6 lg:px-8 bg-[#FAF7F2] text-stone-900 ${montserrat.className} flex flex-col items-center justify-center`}>
          <div className="w-12 h-12 border-4 border-[#DBAF82] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-stone-600 font-medium text-sm">Loading order confirmation...</p>
        </div>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
