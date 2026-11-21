"use client";

import { createElement, lazy, useState, type ComponentType } from "react";

/** Share one import between intent preloading and Suspense rendering. */
export function createPreloadableComponent<Props extends object>(
  importModule: () => Promise<{ default: ComponentType<Props> }>,
) {
  type Module = Awaited<ReturnType<typeof importModule>>;
  let loaded: Module | undefined;
  let pending: Promise<Module> | undefined;

  function load(): Promise<Module> {
    if (!pending) {
      const request: Promise<Module> = importModule().then(
        (module) => {
          if (pending === request) loaded = module;
          return module;
        },
        (error: unknown) => {
          // A failed speculative load must not poison the next attempt.
          if (pending === request) pending = undefined;
          throw error;
        },
      );
      pending = request;
    }
    return pending;
  }

  let lazyComponent = lazy(load);

  function Content(props: Props) {
    // A cached import alone still suspends on lazy()'s first render. Prefer the
    // resolved component, and keep its type stable after mounting to retain state.
    const [Component] = useState(() => loaded?.default ?? lazyComponent);
    return createElement(Component, props);
  }

  return {
    Content,
    preload(): void {
      void load().catch(() => {
        // Only speculative failures are swallowed. The lazy render still rejects.
      });
    },
    reset(): void {
      loaded = undefined;
      pending = undefined;
      lazyComponent = lazy(load);
    },
  };
}
