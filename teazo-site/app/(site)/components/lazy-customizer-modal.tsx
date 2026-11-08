"use client";

import React, { lazy } from "react";
import type { ItemCustomizerModalProps } from "./item-customizer-modal";

let customizerModule = lazy(() => import("./item-customizer-modal"));

/** Recreates the lazy import promise so a retry attempt re-triggers chunk fetching. */
export function resetCustomizerModule(): void {
  customizerModule = lazy(() => import("./item-customizer-modal"));
}

export default function LazyCustomizerModal(props: ItemCustomizerModalProps) {
  const Component = customizerModule;
  return <Component {...props} />;
}
