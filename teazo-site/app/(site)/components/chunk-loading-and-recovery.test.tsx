/**
 * Focused tests for customizer loading states, error boundaries,
 * recovery/retry lifecycle, accessibility, and focus restoration.
 */

// @vitest-environment jsdom

import React, { Suspense, lazy, useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import CustomizerLoadingModal from "./customizer-loading-modal";
import ChunkErrorBoundary, { isChunkLoadError } from "./chunk-error-boundary";

describe("CustomizerLoadingModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with accessible dialog attributes", () => {
    render(<CustomizerLoadingModal />);

    const dialog = screen.getByRole("dialog", { name: "Loading drink customizer" });
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-busy")).toBe("true");
  });

  it("locks body scroll on mount and restores it on unmount", () => {
    document.body.style.overflow = "visible";

    const { unmount } = render(<CustomizerLoadingModal />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("visible");
  });

  it("calls onDismiss when Escape is pressed", () => {
    const onDismiss = vi.fn();
    render(<CustomizerLoadingModal onDismiss={onDismiss} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Cancel button is clicked", () => {
    const onDismiss = vi.fn();
    render(<CustomizerLoadingModal onDismiss={onDismiss} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when clicking backdrop", () => {
    const onDismiss = vi.fn();
    render(<CustomizerLoadingModal onDismiss={onDismiss} />);

    const backdrop = screen.getByRole("dialog");
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not call onDismiss when clicking inside the modal card", () => {
    const onDismiss = vi.fn();
    render(<CustomizerLoadingModal onDismiss={onDismiss} />);

    const text = screen.getByText("Loading customization options...");
    fireEvent.click(text);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("moves initial focus to the Cancel button and restores focus on unmount", async () => {
    const triggerButton = document.createElement("button");
    triggerButton.textContent = "Open Customizer";
    document.body.appendChild(triggerButton);
    triggerButton.focus();
    expect(document.activeElement).toBe(triggerButton);

    const { unmount } = render(<CustomizerLoadingModal onDismiss={() => {}} />);

    await waitFor(() => {
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      expect(document.activeElement).toBe(cancelButton);
    });

    unmount();

    expect(document.activeElement).toBe(triggerButton);
    document.body.removeChild(triggerButton);
  });
});

describe("ChunkErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
      throw new Error("Failed to load chunk / static script");
    }
    return <div>Loaded content successfully</div>;
  }

  it("renders children when no error occurs", () => {
    render(
      <ChunkErrorBoundary>
        <div>Normal content</div>
      </ChunkErrorBoundary>
    );

    expect(screen.getByText("Normal content")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rethrows non-chunk errors to the outer boundary instead of showing a connection message", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    function BuggyChild(): React.ReactElement {
      throw new TypeError("Cannot read properties of undefined (reading 'name')");
    }

    class OuterBoundary extends React.Component<
      { children: React.ReactNode },
      { caught: boolean }
    > {
      state = { caught: false };
      static getDerivedStateFromError() {
        return { caught: true };
      }
      render() {
        return this.state.caught ? <div>Outer boundary caught it</div> : this.props.children;
      }
    }

    render(
      <OuterBoundary>
        <ChunkErrorBoundary onDismiss={() => {}} onRetry={() => {}}>
          <BuggyChild />
        </ChunkErrorBoundary>
      </OuterBoundary>
    );

    expect(screen.getByText("Outer boundary caught it")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText(/check your connection/i)).toBeNull();

    consoleSpy.mockRestore();
  });

  it("classifies chunk-load failures", () => {
    const chunkNamed = new Error("boom");
    chunkNamed.name = "ChunkLoadError";

    expect(isChunkLoadError(chunkNamed)).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 1184 failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /x.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("x is undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("catches errors and displays error UI with retry and dismiss options", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ChunkErrorBoundary
        fallbackTitle="Custom failure title"
        fallbackDescription="Check internet"
        onDismiss={() => {}}
        onRetry={() => {}}
      >
        <ThrowingChild shouldThrow={true} />
      </ChunkErrorBoundary>
    );

    expect(screen.getByText("Custom failure title")).toBeTruthy();
    expect(screen.getByText("Check internet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it("calls onDismiss when Cancel is clicked", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onDismiss = vi.fn();

    render(
      <ChunkErrorBoundary onDismiss={onDismiss}>
        <ThrowingChild shouldThrow={true} />
      </ChunkErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("calls onDismiss when Escape is pressed in modal variant", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onDismiss = vi.fn();

    render(
      <ChunkErrorBoundary onDismiss={onDismiss}>
        <ThrowingChild shouldThrow={true} />
      </ChunkErrorBoundary>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("renders inline variant correctly with alert role", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ChunkErrorBoundary variant="inline" onDismiss={() => {}}>
        <ThrowingChild shouldThrow={true} />
      </ChunkErrorBoundary>
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it("handles retry lifecycle allowing fresh component resolution", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let attemptCount = 0;
    let dynamicLoader = lazy(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("ChunkLoadError: Connection failed");
      }
      return {
        default: () => <div>Recovered dynamic component!</div>,
      };
    });

    function TestDynamicComponent() {
      const Comp = dynamicLoader;
      return <Comp />;
    }

    function RecoverableHarness() {
      const [retryKey, setRetryKey] = useState(0);

      const handleRetry = () => {
        dynamicLoader = lazy(async () => {
          attemptCount++;
          return {
            default: () => <div>Recovered dynamic component!</div>,
          };
        });
        setRetryKey((k) => k + 1);
      };

      return (
        <ChunkErrorBoundary
          key={retryKey}
          onRetry={handleRetry}
          onDismiss={() => {}}
        >
          <Suspense fallback={<div>Loading component...</div>}>
            <TestDynamicComponent key={retryKey} />
          </Suspense>
        </ChunkErrorBoundary>
      );
    }

    render(<RecoverableHarness />);

    // First attempt fails and boundary catches it
    expect(await screen.findByRole("dialog", { name: "Error loading content" })).toBeTruthy();

    // User clicks Retry
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);

    // Second attempt succeeds
    expect(await screen.findByText("Recovered dynamic component!")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    consoleSpy.mockRestore();
  });
});
