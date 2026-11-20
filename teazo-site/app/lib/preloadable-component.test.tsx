// @vitest-environment jsdom

import React, { Suspense, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChunkErrorBoundary from "@/app/(site)/components/chunk-error-boundary";
import { createPreloadableComponent } from "./preloadable-component";

const ready = { default: () => <div>Interior ready</div> };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("preloadable components", () => {
  it("shares an in-flight import and renders a completed warm-up without even mounting the fallback", async () => {
    let resolve!: (module: typeof ready) => void;
    const load = vi.fn(() => new Promise<typeof ready>((done) => { resolve = done; }));
    const { Content, preload } = createPreloadableComponent(load);
    const fallback = vi.fn(() => <div>Loading</div>);
    const Fallback = fallback;

    preload();
    preload();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(ready); });
    preload();
    render(<React.StrictMode><Suspense fallback={<Fallback />}><Content /></Suspense></React.StrictMode>);

    expect(screen.getByText("Interior ready")).toBeTruthy();
    expect(fallback).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps speculative failures silent, exposes rendering failures, and retries through the boundary", async () => {
    const error = Object.assign(new Error("Loading chunk 5085 failed"), { name: "ChunkLoadError" });
    const load = vi.fn<() => Promise<typeof ready>>().mockRejectedValue(error);
    const resource = createPreloadableComponent(load);
    const Content = resource.Content;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => { resource.preload(); });
    expect(consoleError).not.toHaveBeenCalled();

    function Drawer() {
      const [attempt, setAttempt] = useState(0);
      return (
        <ChunkErrorBoundary key={attempt} variant="inline" onRetry={() => {
          resource.reset();
          setAttempt((value) => value + 1);
        }}>
          <Suspense fallback={<div>Loading</div>}><Content /></Suspense>
        </ChunkErrorBoundary>
      );
    }

    render(<Drawer />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(2);

    load.mockResolvedValue(ready);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Interior ready")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("allows a later intent to recover from a failed preload without rendering an error", async () => {
    const load = vi.fn<() => Promise<typeof ready>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(ready);
    const { Content, preload } = createPreloadableComponent(load);
    await act(async () => { preload(); });
    await act(async () => { preload(); });
    render(<Suspense fallback={<div>Loading</div>}><Content /></Suspense>);

    expect(screen.getByText("Interior ready")).toBeTruthy();
    expect(screen.queryByText("Loading")).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("ignores completion of an obsolete load after reset", async () => {
    let finishOld!: (module: typeof ready) => void;
    const old = new Promise<typeof ready>((resolve) => { finishOld = resolve; });
    const load = vi.fn<() => Promise<typeof ready>>()
      .mockReturnValueOnce(old)
      .mockResolvedValue(ready);
    const { Content, preload, reset } = createPreloadableComponent(load);

    preload();
    reset();
    await act(async () => { preload(); });
    await act(async () => { finishOld({ default: () => <div>Obsolete content</div> }); });
    render(<Suspense fallback={<div>Loading</div>}><Content /></Suspense>);

    expect(screen.getByText("Interior ready")).toBeTruthy();
    expect(screen.queryByText("Obsolete content")).toBeNull();
  });
});
