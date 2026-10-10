"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { MenuItem } from "./menu-item-card";
import MenuItemsSection from "./menu-items-section";
import ItemCustomizerModal from "./item-customizer-modal";

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

  // Initialize selectedItem directly from initialItemId (avoiding setState in useEffect on mount)
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(() => {
    if (!initialItemId) return null;
    return allItems.find((it) => it.catalogObjectId === initialItemId) || null;
  });

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

      {/* Drink Customization Modal */}
      <ItemCustomizerModal item={selectedItem} onClose={handleCloseModal} />
    </>
  );
}
