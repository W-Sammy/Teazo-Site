"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { CartItem, CartModifierChoice } from "@/app/types/checkout";
import {
  advanceCartRevision,
  clearPendingCheckoutIfMatching,
  getPendingCheckout,
  paidOrderOwnsCurrentCart,
  savePendingCheckoutOwnership,
} from "@/app/lib/cart-payment-ownership";
import {
  clearPaidCheckoutAttempt,
  getCheckoutAttemptCartRevisionForOrder,
} from "@/app/lib/checkout-attempt-storage";

export const CART_STORAGE_KEY = "teazo_cart";
export const PENDING_CHECKOUT_STORAGE_KEY = "teazo_pending_checkout";
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 50;

/**
 * Computes a single item's subtotal including modifiers,
 * multiplied by quantity.
 */
export function calculateItemTotalCents(
  basePriceCents: number,
  selectedModifiers: CartModifierChoice[] = [],
  quantity: number = 1
): number {
  const modifiersTotalCents = selectedModifiers.reduce(
    (sum, mod) =>
      sum + (Number.isFinite(mod.priceCents) ? mod.priceCents : 0),
    0
  );
  return Math.max(0, (basePriceCents + modifiersTotalCents) * quantity);
}

/**
 * Generates a deterministic fingerprint from the variation,
 * selected modifiers, and special instructions.
 *
 * Identical customizations can be grouped into one cart line.
 */
export function getCustomizationFingerprint(item: {
  catalogObjectId?: string;
  variationId: string;
  selectedModifiers?: CartModifierChoice[];
  notes?: string;
}): string {
  const sortedOptionIds = [...(item.selectedModifiers ?? [])]
    .map((m) => m.optionId)
    .sort()
    .join(",");
  const normalizedNotes = (item.notes || "").trim().toLowerCase();
  return `${item.catalogObjectId || ""}::${item.variationId}::[${sortedOptionIds}]::${normalizedNotes}`;
}

export interface CartContextValue {
  items: CartItem[];
  totalCount: number;
  subtotalCents: number;
  isCartOpen: boolean;
  isHydrated: boolean;
  addItem: (item: CartItem) => void;
  updateItem: (cartItemId: string, updatedItem: CartItem) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  setQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

export const CartContext = createContext<
  CartContextValue | undefined
>(undefined);

export interface CartProviderProps {
  children: React.ReactNode;
  initialItems?: CartItem[];
  initialOpen?: boolean;
}

function parseValidItems(jsonString: string): CartItem[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (it): it is CartItem =>
            Boolean(it) &&
            typeof it.cartItemId === "string" &&
            typeof it.variationId === "string" &&
            typeof it.quantity === "number" &&
            it.quantity > 0 &&
            Array.isArray(it.selectedModifiers)
        )
        .map((it) => {
          const basePrice = Number.isFinite(it.basePriceCents)
            ? it.basePriceCents
            : 0;
          const calculatedTotal = calculateItemTotalCents(
            basePrice,
            it.selectedModifiers,
            it.quantity
          );
          const itemTotal =
            Number.isFinite(it.itemTotalCents) &&
            it.itemTotalCents > 0
              ? it.itemTotalCents
              : calculatedTotal;

          return {
            ...it,
            basePriceCents: basePrice,
            itemTotalCents: itemTotal,
          };
        });
    }
  } catch {
    // Ignore invalid JSON in storage.
  }
  return [];
}

const emptySubscribe = () => () => {};
const getClientHydrated = () => true;
const getServerHydrated = () => false;

// Session-level memory fallback if localStorage is unavailable.
let memoryCartSnapshot = "[]";
let isStorageWorking: boolean | null = null;

function checkStorageAvailability(): boolean {
  if (isStorageWorking !== null) return isStorageWorking;
  if (typeof window === "undefined") return false;

  try {
    const testKey = "__teazo_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    isStorageWorking = true;
  } catch {
    isStorageWorking = false;
  }

  return isStorageWorking;
}

/**
 * Records a checkout order for recovery if the customer
 * closes Square before returning to the confirmation page.
 *
 * The revision belongs to the original checkout submission,
 * not the potentially modified cart at response time.
 *
 * Legacy records without a revision remain readable, but
 * cannot authorize automatic cart clearing.
 */
export function recordPendingCheckoutOrder(orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;

  const submittedRevision =
    getCheckoutAttemptCartRevisionForOrder(orderId);

  try {
    if (
      !savePendingCheckoutOwnership(
        orderId,
        submittedRevision
      )
    ) {
      localStorage.setItem(
        PENDING_CHECKOUT_STORAGE_KEY,
        JSON.stringify({
          orderId,
          timestamp: Date.now(),
        })
      );
    }

    sessionStorage.setItem("teazo_last_order_id", orderId);
    localStorage.setItem("teazo_recent_order_id", orderId);
  } catch {
    // Storage may be blocked. Do not throw into checkout.
  }
}

export function clearPendingCheckoutOrder(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
  } catch {
    // Storage may be unavailable.
  }
}

function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("teazo_cart_sync", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("teazo_cart_sync", callback);
  };
}

function getStorageSnapshot(): string {
  if (typeof window === "undefined") return "[]";

  if (checkStorageAvailability()) {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored !== null) {
        memoryCartSnapshot = stored;
        return stored;
      }

      memoryCartSnapshot = "[]";
      return "[]";
    } catch {
      return memoryCartSnapshot;
    }
  }

  return memoryCartSnapshot;
}

function getServerSnapshot(): string {
  return "[]";
}

export function CartProvider({
  children,
  initialOpen = false,
}: CartProviderProps) {
  const [isCartOpen, setIsCartOpen] =
    useState<boolean>(initialOpen);

  // Hydrate from storage without cascading setState effects.
  const rawCartJson = useSyncExternalStore(
    subscribeStorage,
    getStorageSnapshot,
    getServerSnapshot
  );

  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    getClientHydrated,
    getServerHydrated
  );

  const items = useMemo(
    () => parseValidItems(rawCartJson),
    [rawCartJson]
  );

  const totalCount = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
  }, [items]);

  const subtotalCents = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + item.itemTotalCents,
      0
    );
  }, [items]);

  // Commit cart updates and advance the revision only when
  // the actual cart contents change.
  const commitItems = useCallback(
    (updater: (prev: CartItem[]) => CartItem[]) => {
      if (typeof window === "undefined") return;

      let currentJson = memoryCartSnapshot;

      if (checkStorageAvailability()) {
        try {
          currentJson =
            localStorage.getItem(CART_STORAGE_KEY) ??
            memoryCartSnapshot;
        } catch {
          currentJson = memoryCartSnapshot;
        }
      }

      const current = parseValidItems(currentJson);
      const next = updater(current);
      const nextJson = JSON.stringify(next);
      const currentNormalizedJson = JSON.stringify(current);

      // A new revision prevents a previous paid order from
      // clearing a cart modified during checkout.
      if (nextJson !== currentNormalizedJson) {
        advanceCartRevision();
      }

      memoryCartSnapshot =
        next.length === 0 ? "[]" : nextJson;

      if (checkStorageAvailability()) {
        try {
          if (next.length === 0) {
            localStorage.removeItem(CART_STORAGE_KEY);
          } else {
            localStorage.setItem(
              CART_STORAGE_KEY,
              nextJson
            );
          }
        } catch (err) {
          isStorageWorking = false;
          console.warn(
            "[cart-context] Storage unavailable, using session memory fallback:",
            err
          );
        }
      }

      window.dispatchEvent(
        new Event("teazo_cart_sync")
      );
    },
    []
  );

  // Add an item, merging quantities for identical customizations.
  const addItem = useCallback(
    (newItem: CartItem) => {
      commitItems((prevItems) => {
        const targetFingerprint =
          getCustomizationFingerprint(newItem);
        const existingIndex = prevItems.findIndex(
          (existing) =>
            getCustomizationFingerprint(existing) ===
            targetFingerprint
        );

        if (existingIndex >= 0) {
          const existing = prevItems[existingIndex];
          const updatedQuantity = Math.max(
            MIN_ITEM_QUANTITY,
            Math.min(
              MAX_ITEM_QUANTITY,
              existing.quantity + newItem.quantity
            )
          );
          const updatedItemTotal =
            calculateItemTotalCents(
              existing.basePriceCents,
              existing.selectedModifiers,
              updatedQuantity
            );

          const next = [...prevItems];
          next[existingIndex] = {
            ...existing,
            quantity: updatedQuantity,
            itemTotalCents: updatedItemTotal,
          };
          return next;
        }

        const clampedQuantity = Math.max(
          MIN_ITEM_QUANTITY,
          Math.min(
            MAX_ITEM_QUANTITY,
            newItem.quantity
          )
        );
        const computedItemTotal =
          calculateItemTotalCents(
            newItem.basePriceCents,
            newItem.selectedModifiers,
            clampedQuantity
          );

        return [
          ...prevItems,
          {
            ...newItem,
            quantity: clampedQuantity,
            itemTotalCents: computedItemTotal,
          },
        ];
      });
    },
    [commitItems]
  );

  // Update an existing customization, merging duplicates.
  const updateItem = useCallback(
    (cartItemId: string, updatedItem: CartItem) => {
      commitItems((prevItems) => {
        const index = prevItems.findIndex(
          (it) => it.cartItemId === cartItemId
        );

        if (index === -1) return prevItems;

        const clampedQuantity = Math.max(
          MIN_ITEM_QUANTITY,
          Math.min(
            MAX_ITEM_QUANTITY,
            updatedItem.quantity
          )
        );
        const computedItemTotal =
          calculateItemTotalCents(
            updatedItem.basePriceCents,
            updatedItem.selectedModifiers,
            clampedQuantity
          );

        const targetItem: CartItem = {
          ...updatedItem,
          cartItemId,
          quantity: clampedQuantity,
          itemTotalCents: computedItemTotal,
        };

        const targetFingerprint =
          getCustomizationFingerprint(targetItem);
        const duplicateIndex = prevItems.findIndex(
          (it, idx) =>
            idx !== index &&
            getCustomizationFingerprint(it) ===
              targetFingerprint
        );

        if (duplicateIndex >= 0) {
          const existing = prevItems[duplicateIndex];
          const mergedQty = Math.max(
            MIN_ITEM_QUANTITY,
            Math.min(
              MAX_ITEM_QUANTITY,
              existing.quantity + targetItem.quantity
            )
          );
          const mergedTotal =
            calculateItemTotalCents(
              existing.basePriceCents,
              existing.selectedModifiers,
              mergedQty
            );

          return prevItems
            .map((it, idx) => {
              if (idx === duplicateIndex) {
                return {
                  ...existing,
                  quantity: mergedQty,
                  itemTotalCents: mergedTotal,
                };
              }
              return it;
            })
            .filter(
              (it) => it.cartItemId !== cartItemId
            );
        }

        const next = [...prevItems];
        next[index] = targetItem;
        return next;
      });
    },
    [commitItems]
  );

  const removeItem = useCallback(
    (cartItemId: string) => {
      commitItems((prevItems) =>
        prevItems.filter(
          (item) =>
            item.cartItemId !== cartItemId
        )
      );
    },
    [commitItems]
  );

  // Update quantity by a delta, clamping to supported limits.
  const updateQuantity = useCallback(
    (cartItemId: string, delta: number) => {
      commitItems((prevItems) =>
        prevItems.map((item) => {
          if (item.cartItemId !== cartItemId) {
            return item;
          }

          const newQuantity = Math.max(
            MIN_ITEM_QUANTITY,
            Math.min(
              MAX_ITEM_QUANTITY,
              item.quantity + delta
            )
          );

          return {
            ...item,
            quantity: newQuantity,
            itemTotalCents:
              calculateItemTotalCents(
                item.basePriceCents,
                item.selectedModifiers,
                newQuantity
              ),
          };
        })
      );
    },
    [commitItems]
  );

  // Set absolute quantity; remove the item if it drops below one.
  const setQuantity = useCallback(
    (cartItemId: string, quantity: number) => {
      commitItems((prevItems) => {
        if (quantity < MIN_ITEM_QUANTITY) {
          return prevItems.filter(
            (item) =>
              item.cartItemId !== cartItemId
          );
        }

        const clampedQty = Math.min(
          MAX_ITEM_QUANTITY,
          quantity
        );

        return prevItems.map((item) => {
          if (item.cartItemId !== cartItemId) {
            return item;
          }

          return {
            ...item,
            quantity: clampedQty,
            itemTotalCents:
              calculateItemTotalCents(
                item.basePriceCents,
                item.selectedModifiers,
                clampedQty
              ),
          };
        });
      });
    },
    [commitItems]
  );

  // Manual cart clearing removes items and pending order state.
  const clearCart = useCallback(() => {
    clearPendingCheckoutOrder();
    commitItems(() => []);
  }, [commitItems]);

  // Recover a paid checkout when the customer closes Square
  // before returning to the confirmation page.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const pendingData = getPendingCheckout();
    if (!pendingData) return;

    // Keep the existing 24-hour recovery window.
    const ageMs =
      Date.now() - pendingData.timestamp;

    if (
      ageMs > 24 * 60 * 60 * 1000
    ) {
      clearPendingCheckoutIfMatching(
        pendingData.orderId
      );
      return;
    }

    const orderIdToCheck = pendingData.orderId;
    let isCancelled = false;

    async function checkPendingOrderStatus() {
      // The confirmation page handles its own payment verification.
      if (
        typeof window !== "undefined" &&
        window.location.pathname.startsWith(
          "/order/confirmation"
        )
      ) {
        return;
      }

      try {
        const res = await fetch(
          `/api/orders/${orderIdToCheck}`
        );
        if (!res.ok) return;

        const data = await res.json();
        if (isCancelled) return;

        const order = data?.order;
        const isPaid = Boolean(
          order?.isPaid ||
          order?.state === "COMPLETED"
        );

        if (isPaid) {
          // Check ownership immediately before clearing.
          // A changed cart or different pending order is preserved.
          const ownsCart =
            paidOrderOwnsCurrentCart(
              orderIdToCheck
            );

          clearPaidCheckoutAttempt(
            orderIdToCheck
          );

          if (ownsCart) {
            clearCart();
          }

          clearPendingCheckoutIfMatching(
            orderIdToCheck
          );
        } else if (
          order?.state === "CANCELED"
        ) {
          clearPendingCheckoutIfMatching(
            orderIdToCheck
          );
        }
      } catch (err) {
        console.warn(
          "[cart-context] Error verifying pending order:",
          err
        );
      }
    }

    checkPendingOrderStatus();

    return () => {
      isCancelled = true;
    };
  }, [clearCart]);

  const openCart = useCallback(
    () => setIsCartOpen(true),
    []
  );

  const closeCart = useCallback(
    () => setIsCartOpen(false),
    []
  );

  const toggleCart = useCallback(
    () => setIsCartOpen((prev) => !prev),
    []
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalCount,
      subtotalCents,
      isCartOpen,
      isHydrated,
      addItem,
      updateItem,
      removeItem,
      updateQuantity,
      setQuantity,
      clearCart,
      openCart,
      closeCart,
      toggleCart,
    }),
    [
      items,
      totalCount,
      subtotalCents,
      isCartOpen,
      isHydrated,
      addItem,
      updateItem,
      removeItem,
      updateQuantity,
      setQuantity,
      clearCart,
      openCart,
      closeCart,
      toggleCart,
    ]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

const fallbackCartContext: CartContextValue = {
  items: [],
  totalCount: 0,
  subtotalCents: 0,
  isCartOpen: false,
  isHydrated: true,
  addItem: () => {},
  updateItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  setQuantity: () => {},
  clearCart: () => {},
  openCart: () => {},
  closeCart: () => {},
  toggleCart: () => {},
};

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  return context ?? fallbackCartContext;
}
