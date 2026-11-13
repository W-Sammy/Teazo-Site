"use client";

import React from "react";
import { createPreloadableComponent } from "@/app/lib/preloadable-component";
import type { ItemCustomizerModalProps } from "./item-customizer-modal";
import { preloadCartInteriorModule } from "./cart-drawer";

const customizerModule = createPreloadableComponent<ItemCustomizerModalProps>(
  () => import("./item-customizer-modal"),
);
const CustomizerContent = customizerModule.Content;

/** Recreates the lazy import promise so a retry attempt re-triggers chunk fetching. */
export function resetCustomizerModule(): void {
  customizerModule.reset();
}

/** Warm both chunks at customization intent, before the customizer can suspend. */
export function preloadCustomizerModule(): void {
  preloadCartInteriorModule();
  customizerModule.preload();
}

export default function LazyCustomizerModal(props: ItemCustomizerModalProps) {
  return <CustomizerContent {...props} />;
}
