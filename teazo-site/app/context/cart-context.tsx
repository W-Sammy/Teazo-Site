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

export const CART_STORAGE_KEY = "teazo_cart";
export const PENDING_CHECKOUT_STORAGE_KEY = "teazo_pending_checkout";
export const MIN_ITEM_QUANTITY = 1;
export const MAX_ITEM_QUANTITY = 50;

/**
 * Computes single item subtotal including all modifier add-on prices,
 * multiplied by quantity.
 */
export function calculateItemTotalCents(
  basePriceCents: number,
  selectedModifiers: CartModifierChoice[] = [],
  quantity: number = 1
): number {
  const modifiersTotalCents = selectedModifiers.reduce(
    (sum, mod) => sum + (Number.isFinite(mod.priceCents) ? mod.priceCents : 0),
    0
  );
  return Math.max(0, (basePriceCents + modifiersTotalCents) * quantity);
}

/**
 * Generates a deterministic fingerprint based on variation ID, sorted modifier option IDs,
 * and trimmed special instructions. Allows grouping identical customized items.
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

export const CartContext = createContext<CartContextValue | undefined>(undefined);

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
          const basePrice = Number.isFinite(it.basePriceCents) ? it.basePriceCents : 0;
          const calculatedTotal = calculateItemTotalCents(basePrice, it.selectedModifiers, it.quantity);
          const itemTotal =
            Number.isFinite(it.itemTotalCents) && it.itemTotalCents > 0
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
    // Ignore invalid JSON in storage
  }
  return [];
}

const emptySubscribe = () => () => {};
const getClientHydrated = () => true;
const getServerHydrated = () => false;

// Session-level in-memory fallback cache if localStorage is unavailable or throws
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

export function recordPendingCheckoutOrder(orderId: string): void {
  if (typeof window === "undefined" || !orderId) return;
  try {
    localStorage.setItem(
      PENDING_CHECKOUT_STORAGE_KEY,
      JSON.stringify({ orderId, timestamp: Date.now() })
    );
    sessionStorage.setItem("teazo_last_order_id", orderId);
    localStorage.setItem("teazo_recent_order_id", orderId);
  } catch {
    // If storage is blocked, ignore
  }
}

export function clearPendingCheckoutOrder(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PENDING_CHECKOUT_STORAGE_KEY);
  } catch {}
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
  const [isCartOpen, setIsCartOpen] = useState<boolean>(initialOpen);

  // useSyncExternalStore provides safe SSR hydration and instant multi-tab sync without cascading render effects
  const rawCartJson = useSyncExternalStore(subscribeStorage, getStorageSnapshot, getServerSnapshot);
  const isHydrated = useSyncExternalStore(emptySubscribe, getClientHydrated, getServerHydrated);

  const items = useMemo(() => parseValidItems(rawCartJson), [rawCartJson]);

  // Total count of all drink items
  const totalCount = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  // Aggregate subtotal in integer cents
  const subtotalCents = useMemo(() => {
    return items.reduce((sum, item) => sum + item.itemTotalCents, 0);
  }, [items]);

  // Helper to commit new items directly to localStorage (or in-memory fallback) and broadcast sync event
  const commitItems = useCallback((updater: (prev: CartItem[]) => CartItem[]) => {
    if (typeof window === "undefined") return;

    let currentJson = memoryCartSnapshot;
    if (checkStorageAvailability()) {
      try {
        currentJson = localStorage.getItem(CART_STORAGE_KEY) ?? memoryCartSnapshot;
      } catch {
        currentJson = memoryCartSnapshot;
      }
    }

    const current = parseValidItems(currentJson);
    const next = updater(current);
    const nextJson = JSON.stringify(next);

    // Always update session in-memory snapshot
    memoryCartSnapshot = next.length === 0 ? "[]" : nextJson;

    // Attempt persistence to disk
    if (checkStorageAvailability()) {
      try {
        if (next.length === 0) {
          localStorage.removeItem(CART_STORAGE_KEY);
        } else {
          localStorage.setItem(CART_STORAGE_KEY, nextJson);
        }
      } catch (err) {
        isStorageWorking = false;
        console.warn("[cart-context] Storage unavailable, using session memory fallback:", err);
      }
    }

    window.dispatchEvent(new Event("teazo_cart_sync"));
  }, []);

  // Add item: merges quantity if identical customization already in cart, otherwise appends
  const addItem = useCallback((newItem: CartItem) => {
    commitItems((prevItems) => {
      const targetFingerprint = getCustomizationFingerprint(newItem);
      const existingIndex = prevItems.findIndex(
        (existing) => getCustomizationFingerprint(existing) === targetFingerprint
      );

      if (existingIndex >= 0) {
        const existing = prevItems[existingIndex];
        const updatedQuantity = Math.max(
          MIN_ITEM_QUANTITY,
          Math.min(MAX_ITEM_QUANTITY, existing.quantity + newItem.quantity)
        );
        const updatedItemTotal = calculateItemTotalCents(
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
        Math.min(MAX_ITEM_QUANTITY, newItem.quantity)
      );
      const computedItemTotal = calculateItemTotalCents(
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
  }, [commitItems]);

  // Update item: modifies existing cart item by ID. If modified item matches another item in the cart, merges them.
  const updateItem = useCallback((cartItemId: string, updatedItem: CartItem) => {
    commitItems((prevItems) => {
      const index = prevItems.findIndex((it) => it.cartItemId === cartItemId);
      if (index === -1) return prevItems;

      const clampedQuantity = Math.max(
        MIN_ITEM_QUANTITY,
        Math.min(MAX_ITEM_QUANTITY, updatedItem.quantity)
      );
      const computedItemTotal = calculateItemTotalCents(
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

      const targetFingerprint = getCustomizationFingerprint(targetItem);
      const duplicateIndex = prevItems.findIndex(
        (it, idx) => idx !== index && getCustomizationFingerprint(it) === targetFingerprint
      );

      if (duplicateIndex >= 0) {
        // Merge into existing duplicate and remove this row
        const existing = prevItems[duplicateIndex];
        const mergedQty = Math.max(
          MIN_ITEM_QUANTITY,
          Math.min(MAX_ITEM_QUANTITY, existing.quantity + targetItem.quantity)
        );
        const mergedTotal = calculateItemTotalCents(
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
          .filter((it) => it.cartItemId !== cartItemId);
      }

      const next = [...prevItems];
      next[index] = targetItem;
      return next;
    });
  }, [commitItems]);

  // Remove item by unique cartItemId
  const removeItem = useCallback((cartItemId: string) => {
    commitItems((prevItems) => prevItems.filter((item) => item.cartItemId !== cartItemId));
  }, [commitItems]);

  // Update quantity by a delta (+1, -1, etc.). Clamps between MIN_ITEM_QUANTITY and MAX_ITEM_QUANTITY
  const updateQuantity = useCallback((cartItemId: string, delta: number) => {
    commitItems((prevItems) =>
      prevItems.map((item) => {
        if (item.cartItemId !== cartItemId) return item;
        const newQuantity = Math.max(
          MIN_ITEM_QUANTITY,
          Math.min(MAX_ITEM_QUANTITY, item.quantity + delta)
        );
        return {
          ...item,
          quantity: newQuantity,
          itemTotalCents: calculateItemTotalCents(
            item.basePriceCents,
            item.selectedModifiers,
            newQuantity
          ),
        };
      })
    );
  }, [commitItems]);

  // Set absolute quantity directly. Drops item if quantity < 1, otherwise clamps to MAX_ITEM_QUANTITY
  const setQuantity = useCallback((cartItemId: string, quantity: number) => {
    commitItems((prevItems) => {
      if (quantity < MIN_ITEM_QUANTITY) {
        return prevItems.filter((item) => item.cartItemId !== cartItemId);
      }
      const clampedQty = Math.min(MAX_ITEM_QUANTITY, quantity);
      return prevItems.map((item) => {
        if (item.cartItemId !== cartItemId) return item;
        return {
          ...item,
          quantity: clampedQty,
          itemTotalCents: calculateItemTotalCents(
            item.basePriceCents,
            item.selectedModifiers,
            clampedQty
          ),
        };
      });
    });
  }, [commitItems]);

  // Clear all items from cart and remove from localStorage
  const clearCart = useCallback(() => {
    clearPendingCheckoutOrder();
    commitItems(() => []);
  }, [commitItems]);

  // Silently recover and clear cart if customer paid on Square Hosted Checkout
  // but closed browser tab before redirecting back to /order/confirmation
  useEffect(() => {
    if (typeof window === "undefined") return;
    let pendingData: { orderId: string; timestamp: number } | null = null;
    try {
      const raw = localStorage.getItem(PENDING_CHECKOUT_STORAGE_KEY);
      if (raw) pendingData = JSON.parse(raw);
    } catch {
      pendingData = null;
    }

    if (!pendingData || !pendingData.orderId) return;

    // Discard checkouts older than 24 hours
    const ageMs = Date.now() - (pendingData.timestamp || 0);
    if (ageMs > 24 * 60 * 60 * 1000) {
      clearPendingCheckoutOrder();
      return;
    }

    const orderIdToCheck = pendingData.orderId;
    let isCancelled = false;

    async function checkPendingOrderStatus() {
      // Do not race with or wipe the pending checkout order if the user is currently on the confirmation page
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/order/confirmation")) {
        return;
      }

      try {
        const res = await fetch(`/api/orders/${orderIdToCheck}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isCancelled) return;

        const order = data?.order;
        const isPaid = Boolean(order?.isPaid || order?.state === "COMPLETED");

        // ONLY clear cart if payment was actually completed!
        // If the customer abandoned checkout on Square without paying (e.g. order is OPEN but not paid),
        // retain their cart items so they do not lose their customized drinks.
        if (isPaid) {
          clearCart();
          clearPendingCheckoutOrder();
        } else if (order?.state === "CANCELED") {
          clearPendingCheckoutOrder();
        }
      } catch (err) {
        console.warn("[cart-context] Error verifying pending order:", err);
      }
    }

    checkPendingOrderStatus();

    return () => {
      isCancelled = true;
    };
  }, [clearCart]);

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);
  const toggleCart = useCallback(() => setIsCartOpen((prev) => !prev), []);

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

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
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
