"use client";

import React, { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import type { MenuItem } from "./menu-item-card";
import MenuItemsSection from "./menu-items-section";
import CustomizerLoadingModal from "./customizer-loading-modal";
import ChunkErrorBoundary from "./chunk-error-boundary";
import { prefetchItemAvailability } from "./customizer-availability-prefetch";
import LazyCustomizerModal, { preloadCustomizerModule, resetCustomizerModule } from "./lazy-customizer-modal";

// Deep link: fetch the customizer chunk and availability while the page hydrates instead of after it.
const deepLinkItemId =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("item") : null;
if (deepLinkItemId) {
  preloadCustomizerModule();
  prefetchItemAvailability(deepLinkItemId);
}

export interface MenuSection {
  id: string;
  title: string;
  subtitle?: string;
  items: MenuItem[];
}

export interface MenuCatalogProps {
  specialSections: MenuSection[];
  menuSections: MenuSection[];
  initialItemId?: string;
  headingClassName: string;
  bodyClassName: string;
}

export default function MenuCatalog({
  specialSections,
  menuSections,
  initialItemId,
  headingClassName,
  bodyClassName,
}: MenuCatalogProps) {
  // Memoize all catalog items across sections for quick lookup
  const allItems = useMemo(() => {
    const list: MenuItem[] = [];
    for (const s of specialSections) {
      list.push(...s.items);
    }
    for (const s of menuSections) {
      list.push(...s.items);
    }
    return list;
  }, [specialSections, menuSections]);

  // Establish URL/selection consistency:
  // On client, check window.location.search first. If query param does not contain `item`,
  // do not open the modal even if a stale `initialItemId` is passed (e.g. Back navigation).
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(() => {
    if (typeof window !== "undefined") {
      const searchItem = new URLSearchParams(window.location.search).get("item");
      if (searchItem) {
        return allItems.find((it) => it.catalogObjectId === searchItem) || null;
      }
      return null;
    }
    if (!initialItemId) return null;
    return allItems.find((it) => it.catalogObjectId === initialItemId) || null;
  });

  const [customizerRetryKey, setCustomizerRetryKey] = useState(0);

  const handleRetryCustomizer = useCallback(() => {
    resetCustomizerModule();
    setCustomizerRetryKey((k) => k + 1);
  }, []);

  // Handle browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const itemParam = params.get("item");
      if (itemParam) {
        const found = allItems.find((it) => it.catalogObjectId === itemParam);
        if (found) {
          setSelectedItem(found);
          return;
        }
      }
      setSelectedItem(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [allItems]);

  // Open item customizer and sync to URL query (?item=id) without trapping browser back navigation
  const handleSelectItem = useCallback((item: MenuItem) => {
    setSelectedItem(item);
    void fetch("/api/analytics/menu-item-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.catalogObjectId, itemName: item.name }),
      keepalive: true,
    }).catch(() => {
      // Analytics must never prevent the item customizer from opening.
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("item", item.catalogObjectId);
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // Close item customizer and clean up URL query
  const handleCloseModal = useCallback(() => {
    setSelectedItem(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("item");
      window.history.replaceState(
        {},
        "",
        url.pathname + (url.search ? url.search : "")
      );
    }
  }, []);

  return (
    <>
      {/* Featured / Special Categories */}
      {specialSections.map((section) => (
        <MenuItemsSection
          key={section.id}
          title={section.title}
          subtitle={section.subtitle}
          items={section.items}
          className="mx-auto mt-12 max-w-[1320px] lg:mt-20"
          headingClassName={headingClassName}
          bodyClassName={bodyClassName}
          onCustomizeItem={handleSelectItem}
        />
      ))}

      {/* Main Menu Categories */}
      {menuSections.length > 0 && (
        <div className="mx-auto mt-16 grid max-w-[1320px] grid-cols-1 gap-6 lg:mt-20 lg:gap-8">
          {menuSections.map((section) => (
            <MenuItemsSection
              key={section.id}
              title={section.title}
              subtitle={section.subtitle}
              items={section.items}
              headingClassName={headingClassName}
              bodyClassName={bodyClassName}
              onCustomizeItem={handleSelectItem}
            />
          ))}
        </div>
      )}

      {/* Drink Customization Modal - Coordinated Lazy Loading with Suspense & Retry Error Boundary */}
      {selectedItem && (
        <ChunkErrorBoundary
          key={`customizer-boundary-${customizerRetryKey}`}
          onRetry={handleRetryCustomizer}
          onDismiss={handleCloseModal}
        >
          <Suspense fallback={<CustomizerLoadingModal onDismiss={handleCloseModal} />}>
            <LazyCustomizerModal
              key={`customizer-${customizerRetryKey}-${selectedItem.catalogObjectId}`}
              item={selectedItem}
              onClose={handleCloseModal}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}
    </>
  );
}
