/**
 * MenuCatalog deep-link preload tests.
 *
 * The preload runs when the module loads, so each case resets modules
 * and sets the URL before importing. Child modules are mocked.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const preloadCustomizerModule = vi.fn();
const prefetchItemAvailability = vi.fn();

vi.mock("./lazy-customizer-modal", () => ({
  default: () => null,
  preloadCustomizerModule,
  resetCustomizerModule: vi.fn(),
}));
vi.mock("./customizer-availability-prefetch", () => ({ prefetchItemAvailability }));
vi.mock("./menu-items-section", () => ({ default: () => null }));
vi.mock("./customizer-loading-modal", () => ({ default: () => null }));
vi.mock("./chunk-error-boundary", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

async function loadMenuCatalogAt(url: string) {
  window.history.replaceState({}, "", url);
  vi.resetModules();
  await import("./menu-catalog");
}

describe("MenuCatalog deep-link preload", () => {
  beforeEach(() => {
    preloadCustomizerModule.mockClear();
    prefetchItemAvailability.mockClear();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("starts the customizer chunk and availability request for ?item=", async () => {
    await loadMenuCatalogAt("/menu?item=ITEM123");

    expect(preloadCustomizerModule).toHaveBeenCalledTimes(1);
    expect(prefetchItemAvailability).toHaveBeenCalledWith("ITEM123");
  });

  it("does nothing on an ordinary menu visit", async () => {
    await loadMenuCatalogAt("/menu");

    expect(preloadCustomizerModule).not.toHaveBeenCalled();
    expect(prefetchItemAvailability).not.toHaveBeenCalled();
  });

  it("does nothing for an empty item parameter", async () => {
    await loadMenuCatalogAt("/menu?item=");

    expect(preloadCustomizerModule).not.toHaveBeenCalled();
    expect(prefetchItemAvailability).not.toHaveBeenCalled();
  });
});
