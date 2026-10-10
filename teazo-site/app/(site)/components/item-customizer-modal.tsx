"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useId,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Montserrat, Cabin_Sketch } from "next/font/google";
import type { ModifierList, ModifierOption } from "@/app/types/menu-item";
import type { MenuItem } from "./menu-item-card";
import type { CartItem, CartModifierChoice } from "@/app/types/checkout";
import { useCart, MIN_ITEM_QUANTITY, MAX_ITEM_QUANTITY } from "@/app/context/cart-context";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cabinSketch = Cabin_Sketch({
  subsets: ["latin"],
  weight: ["400"],
});

const FALLBACK_IMAGE_SRC = "/TEAZO_logo.svg";

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export interface ItemCustomizerModalProps {
  item: MenuItem | null;
  initialCartItem?: CartItem | null;
  onClose: () => void;
}

/**
 * Inner modal content component.
 * Keyed by item.catalogObjectId or initialCartItem.cartItemId in the parent so that
 * opening a different drink cleanly resets all local state without invoking setState in useEffect.
 */
function ItemCustomizerModalContent({
  item,
  initialCartItem,
  onClose,
}: {
  item: MenuItem;
  initialCartItem?: CartItem | null;
  onClose: () => void;
}) {
  const { addItem, updateItem, openCart } = useCart();
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Quantity state
  const [quantity, setQuantity] = useState<number>(() => {
    return initialCartItem?.quantity ?? 1;
  });

  // Variations (if item has multiple Square variations)
  const variations = item.variations && item.variations.length > 0 ? item.variations : [];
  const hasMultipleVariations = variations.length > 1;

  const [selectedVariationId, setSelectedVariationId] = useState<string>(() => {
    return initialCartItem?.variationId || item.variationId || variations[0]?.id || "";
  });

  const selectedVariation = variations.find((v) => v.id === selectedVariationId) || variations[0];
  const basePriceCents = selectedVariation?.priceCents ?? item.priceCents;

  // Selected modifier options: listId -> optionId[]
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    if (initialCartItem && initialCartItem.selectedModifiers.length > 0) {
      for (const mod of initialCartItem.selectedModifiers) {
        if (!initial[mod.modifierListId]) {
          initial[mod.modifierListId] = [];
        }
        initial[mod.modifierListId].push(mod.optionId);
      }
      for (const ml of item.modifiers || []) {
        if (!initial[ml.id]) {
          initial[ml.id] = [];
        }
      }
      return initial;
    }

    for (const ml of item.modifiers || []) {
      const isSingle = ml.selectionType === "SINGLE" || ml.maxSelectedModifiers === 1;
      const minRequired = ml.minSelectedModifiers ?? (isSingle ? 1 : 0);
      if (minRequired >= 1 && ml.options.length > 0) {
        // Sensible default: prefer regular/standard or zero-cost included option
        const defaultOption =
          ml.options.find((o) => /regular|100%|normal|standard/i.test(o.name || "")) ||
          ml.options.find((o) => (o.priceCents ?? 0) === 0) ||
          ml.options[0];
        initial[ml.id] = [defaultOption.id];
      } else {
        initial[ml.id] = [];
      }
    }
    return initial;
  });

  // Special instructions (max 150 characters)
  const [notes, setNotes] = useState<string>(() => initialCartItem?.notes ?? "");

  // Validation / Feedback banner
  const [validationError, setValidationError] = useState<string | null>(null);

  // Compute live price
  let modifiersAddOnCents = 0;
  for (const [listId, optionIds] of Object.entries(selectedModifiers)) {
    const ml = item.modifiers?.find((m) => m.id === listId);
    if (!ml) continue;
    for (const optId of optionIds) {
      const opt = ml.options.find((o) => o.id === optId);
      if (opt && opt.priceCents) {
        modifiersAddOnCents += opt.priceCents;
      }
    }
  }

  const unitPriceCents = basePriceCents + modifiersAddOnCents;
  const totalPriceCents = unitPriceCents * quantity;

  // Modifier selection handlers
  const handleSingleSelect = (listId: string, optionId: string) => {
    setSelectedModifiers((prev) => ({
      ...prev,
      [listId]: [optionId],
    }));
    setValidationError(null);
  };

  const handleMultiToggle = (listId: string, optionId: string, max?: number) => {
    setSelectedModifiers((prev) => {
      const current = prev[listId] || [];
      const exists = current.includes(optionId);
      if (exists) {
        setValidationError(null);
        return {
          ...prev,
          [listId]: current.filter((id) => id !== optionId),
        };
      }
      if (max && max > 0 && current.length >= max) {
        setValidationError(`You can select up to ${max} option${max === 1 ? "" : "s"} for this customization.`);
        return prev;
      }
      setValidationError(null);
      return {
        ...prev,
        [listId]: [...current, optionId],
      };
    });
  };

  // Quantity stepper
  const handleDecreaseQuantity = () => {
    setQuantity((prev) => Math.max(MIN_ITEM_QUANTITY, prev - 1));
  };

  const handleIncreaseQuantity = () => {
    setQuantity((prev) => Math.min(MAX_ITEM_QUANTITY, prev + 1));
  };

  // Add to Cart
  const handleAddToCart = () => {
    const effectiveVariationId = selectedVariationId || item.variationId;
    if (!effectiveVariationId) {
      setValidationError("Unable to customize this drink: Missing size variation.");
      return;
    }

    // Validate required modifier lists
    for (const ml of item.modifiers || []) {
      const selected = selectedModifiers[ml.id] || [];
      const isSingle = ml.selectionType === "SINGLE" || ml.maxSelectedModifiers === 1;
      const min = ml.minSelectedModifiers ?? (isSingle ? 1 : 0);

      if (min > 0 && selected.length < min) {
        setValidationError(
          `Please select ${min === 1 ? "an option" : `at least ${min} options`} for "${ml.name || "Customization"}".`
        );
        return;
      }
    }

    // Build flattened CartModifierChoice array
    const chosenModifiers: CartModifierChoice[] = [];
    let detectedSizeName: string | undefined;

    for (const [listId, optionIds] of Object.entries(selectedModifiers)) {
      const ml = item.modifiers?.find((m) => m.id === listId);
      if (!ml) continue;
      const isSizeList = /size|cup\s*size/i.test(ml.name || "");

      for (const optId of optionIds) {
        const opt = ml.options.find((o) => o.id === optId);
        if (!opt) continue;

        if (isSizeList && !detectedSizeName) {
          detectedSizeName = opt.name;
        }

        chosenModifiers.push({
          modifierListId: ml.id,
          modifierListName: ml.name || "Customization",
          optionId: opt.id,
          optionName: opt.name || "Option",
          priceCents: opt.priceCents || 0,
        });
      }
    }

    const variationName = [
      hasMultipleVariations && selectedVariation?.name ? selectedVariation.name : null,
      detectedSizeName,
    ]
      .filter(Boolean)
      .join(" • ") || undefined;

    const cartItem: CartItem = {
      cartItemId: initialCartItem ? initialCartItem.cartItemId : crypto.randomUUID(),
      catalogObjectId: item.catalogObjectId,
      variationId: effectiveVariationId,
      variationName,
      name: item.name?.trim() || "Drink",
      basePriceCents,
      imageUrl: item.imageUrl ?? initialCartItem?.imageUrl ?? null,
      selectedModifiers: chosenModifiers,
      quantity,
      notes: notes.trim() || undefined,
      itemTotalCents: totalPriceCents,
    };

    if (initialCartItem) {
      updateItem(initialCartItem.cartItemId, cartItem);
    } else {
      addItem(cartItem);
    }
    openCart();
    onClose();
  };

  // Keyboard accessibility & Focus trap
  useEffect(() => {
    const previousActiveElement = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first interactive element or dialog
    modalRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab") {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Positioning: Bottom sheet on mobile, centered modal on desktop */}
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4 text-center">
        <div
          ref={modalRef}
          tabIndex={-1}
          className="relative flex flex-col w-full max-w-lg max-h-[92vh] sm:max-h-[85vh] overflow-hidden rounded-t-[28px] sm:rounded-2xl bg-[#fcfaf7] text-left shadow-2xl border border-stone-200 transition-all focus:outline-none"
        >
          {/* Header Bar */}
          <div className="relative border-b border-stone-200 bg-white px-5 py-4 flex items-center justify-between">
            <h2
              id={titleId}
              className={`${cabinSketch.className} text-2xl font-bold tracking-wide text-stone-900 truncate pr-8`}
            >
              {initialCartItem ? `Edit: ${item.name || "Drink"}` : (item.name || "Customize Item")}
            </h2>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close customizer"
              className="absolute right-4 top-4 p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-full transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {/* Drink Overview Header */}
            <div className="flex items-start gap-4 pb-4 border-b border-stone-200">
              <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-[#f3ece6]">
                <Image
                  src={item.imageUrl || FALLBACK_IMAGE_SRC}
                  alt={item.name || "Item photo"}
                  fill
                  className={item.imageUrl ? "object-cover" : "object-contain p-2"}
                  sizes="80px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className={`${montserrat.className} text-base font-bold text-stone-900 truncate`}>
                    {item.name}
                  </h3>
                  <span className={`${montserrat.className} text-base font-bold text-[#c68f5d] whitespace-nowrap`}>
                    {formatCurrency(basePriceCents)}
                  </span>
                </div>
                {item.description && (
                  <p className={`${montserrat.className} mt-1 text-xs text-stone-600 line-clamp-3 leading-relaxed`}>
                    {item.description}
                  </p>
                )}
              </div>
            </div>

            {/* Validation Feedback Banner */}
            {validationError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
              >
                <svg className="h-5 w-5 flex-shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className={`${montserrat.className} font-medium`}>{validationError}</p>
              </div>
            )}

            {/* Square Catalog Variations Selector (e.g. Regular vs Large) */}
            {hasMultipleVariations && (
              <fieldset className="space-y-3">
                <legend className={`${montserrat.className} flex items-center justify-between w-full text-sm font-bold uppercase tracking-wider text-stone-900`}>
                  <span>Size / Option</span>
                  <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    Required
                  </span>
                </legend>
                <div role="radiogroup" aria-label="Size / Option" className="grid grid-cols-2 gap-2">
                  {variations.map((v) => {
                    const isSelected = selectedVariationId === v.id;
                    const priceDiff = v.priceCents - item.priceCents;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setSelectedVariationId(v.id);
                          setValidationError(null);
                        }}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                            : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"
                        }`}
                      >
                        <span className={`${montserrat.className} text-sm font-semibold`}>
                          {v.name || "Option"}
                        </span>
                        <span className={`text-xs mt-0.5 ${isSelected ? "text-stone-300" : "text-stone-500"}`}>
                          {priceDiff > 0 ? `+${formatCurrency(priceDiff)}` : formatCurrency(v.priceCents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {/* Modifier Lists (Sweetness, Ice Level, Toppings, etc.) */}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="space-y-6">
                {item.modifiers.map((modifierList: ModifierList) => {
                  const isSingle =
                    modifierList.selectionType === "SINGLE" ||
                    modifierList.maxSelectedModifiers === 1;
                  const minRequired =
                    modifierList.minSelectedModifiers ?? (isSingle ? 1 : 0);
                  const maxAllowed = modifierList.maxSelectedModifiers;
                  const currentSelected = selectedModifiers[modifierList.id] || [];
                  const isSatisfied = currentSelected.length >= minRequired;

                  return (
                    <fieldset key={modifierList.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <legend className={`${montserrat.className} text-sm font-bold uppercase tracking-wider text-stone-900`}>
                          {modifierList.name || "Customization"}
                        </legend>

                        <div className="flex items-center gap-1.5">
                          {minRequired > 0 ? (
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                isSatisfied
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              Required {minRequired === 1 ? "(1)" : `(min ${minRequired})`}
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">
                              Optional {maxAllowed && maxAllowed > 0 ? `(up to ${maxAllowed})` : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Options Grid */}
                      <div
                        role={isSingle ? "radiogroup" : "group"}
                        aria-label={modifierList.name || "Customization options"}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                      >
                        {modifierList.options.map((option: ModifierOption) => {
                          const isOptionSelected = currentSelected.includes(option.id);

                          return (
                            <button
                              key={option.id}
                              type="button"
                              role={isSingle ? "radio" : "checkbox"}
                              aria-checked={isOptionSelected}
                              onClick={() => {
                                if (isSingle) {
                                  handleSingleSelect(modifierList.id, option.id);
                                } else {
                                  handleMultiToggle(modifierList.id, option.id, maxAllowed);
                                }
                              }}
                              className={`group flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                                isOptionSelected
                                  ? "border-stone-900 bg-stone-900 text-white shadow-sm"
                                  : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <span
                                  className={`flex h-4.5 w-4.5 flex-shrink-0 items-center justify-center ${
                                    isSingle ? "rounded-full" : "rounded-md"
                                  } border transition-colors ${
                                    isOptionSelected
                                      ? "border-white bg-white text-stone-900"
                                      : "border-stone-300 bg-stone-50 group-hover:border-stone-400"
                                  }`}
                                >
                                  {isOptionSelected && (
                                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  )}
                                </span>
                                <span className={`${montserrat.className} text-xs font-semibold truncate`}>
                                  {option.name || "Option"}
                                </span>
                              </div>

                              {option.priceCents > 0 && (
                                <span
                                  className={`text-xs font-medium whitespace-nowrap ${
                                    isOptionSelected ? "text-[#DBAF82]" : "text-[#c68f5d]"
                                  }`}
                                >
                                  +{formatCurrency(option.priceCents)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}

            {/* Special Instructions */}
            <div className="space-y-2 pt-2 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="special-instructions-input"
                  className={`${montserrat.className} text-sm font-bold uppercase tracking-wider text-stone-900`}
                >
                  Special Instructions
                </label>
                <span className="text-[11px] font-medium text-stone-500">
                  {notes.length}/150
                </span>
              </div>
              <textarea
                id="special-instructions-input"
                rows={2}
                maxLength={150}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, preferences, or ice adjustments..."
                className={`${montserrat.className} w-full rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none transition-colors resize-none`}
              />
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t border-stone-200 bg-white px-5 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-4">
              {/* Quantity Stepper */}
              <div className="flex items-center rounded-xl border border-stone-200 bg-stone-50 p-1">
                <button
                  type="button"
                  onClick={handleDecreaseQuantity}
                  disabled={quantity <= MIN_ITEM_QUANTITY}
                  aria-label="Decrease quantity"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 transition hover:bg-white hover:shadow-xs disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                  </svg>
                </button>

                <span
                  className={`${montserrat.className} flex h-9 w-10 items-center justify-center text-sm font-bold text-stone-900`}
                >
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={handleIncreaseQuantity}
                  disabled={quantity >= MAX_ITEM_QUANTITY}
                  aria-label="Increase quantity"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-600 transition hover:bg-white hover:shadow-xs disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Add to Bag Button */}
              <button
                type="button"
                onClick={handleAddToCart}
                className={`${montserrat.className} flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#161616] px-5 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-[#DBAF82] active:scale-[0.99]`}
              >
                <span>{initialCartItem ? "Update Drink" : "Add to Bag"}</span>
                <span className="text-[#DBAF82] font-semibold">•</span>
                <span>{formatCurrency(totalPriceCents)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Top-level Customizer Modal.
 * Renders null when no item is selected.
 */
function emptySubscribe() {
  return () => {};
}
function getClientMounted() {
  return true;
}
function getServerMounted() {
  return false;
}

export default function ItemCustomizerModal({
  item,
  initialCartItem,
  onClose,
}: ItemCustomizerModalProps) {
  const isMounted = useSyncExternalStore(emptySubscribe, getClientMounted, getServerMounted);

  if (!item || !isMounted || typeof document === "undefined") return null;

  return createPortal(
    <ItemCustomizerModalContent
      key={initialCartItem ? initialCartItem.cartItemId : item.catalogObjectId}
      item={item}
      initialCartItem={initialCartItem}
      onClose={onClose}
    />,
    document.body
  );
}
