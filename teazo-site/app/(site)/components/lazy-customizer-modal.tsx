"use client";

import React, { lazy } from "react";
import type { ItemCustomizerModalProps } from "./item-customizer-modal";

let customizerModule = lazy(() => import("./item-customizer-modal"));

/** Recreates the lazy import promise so a retry attempt re-triggers chunk fetching. */
export function resetCustomizerModule(): void {
  customizerModule = lazy(() => import("./item-customizer-modal"));
}

/** Starts fetching the customizer chunk without rendering it; lazy() reuses the same import. */
export function preloadCustomizerModule(): void {
  void import("./item-customizer-modal").catch(() => {
    // A failed preload is surfaced by the lazy render and its retry boundary.
  });
}

export default function LazyCustomizerModal(props: ItemCustomizerModalProps) {
  const Component = customizerModule;
  return <Component {...props} />;
}
