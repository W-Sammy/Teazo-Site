// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BubbleField } from "./bubble-field";

let reducedMotion: boolean;
let width: number;
let nextFrame: number;
let frames: Map<number, FrameRequestCallback>;
let listeners: Set<(event: MediaQueryListEvent) => void>;
let resize: ResizeObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;

function changeMotion(matches: boolean) {
  reducedMotion = matches;
  act(() => {
    for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
  });
}

function runFrame(time: number) {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => callbacks.forEach(callback => callback(time)));
}

beforeEach(() => {
  reducedMotion = false;
  width = 400;
  nextFrame = 0;
  frames = new Map();
  listeners = new Set();
  disconnect = vi.fn();

  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => {
    expect(query).toBe("(prefers-reduced-motion: reduce)");
    return {
      get matches() { return reducedMotion; },
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    };
  }));
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn((id: number) => frames.delete(id)));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BubbleField motion preference", () => {
  it("paints a static composition and repaints on resize without scheduling animation", () => {
    reducedMotion = true;
    const { container } = render(<BubbleField />);
    const bubbles = container.firstElementChild!.children;
    expect(bubbles).toHaveLength(13);
    const bubble = bubbles[0] as HTMLElement;
    expect(bubble.style.width).not.toBe("");
    expect(bubble.style.transform).toContain("translate3d");
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    const originalTransform = bubble.style.transform;
    width = 600;
    act(() => resize([], {} as ResizeObserver));
    expect(bubble.style.transform).not.toBe(originalTransform);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("freezes ongoing motion and resumes at most one loop when the preference changes", () => {
    const { container, unmount } = render(<BubbleField />);
    expect(frames.size).toBe(1);
    runFrame(1000);
    expect(frames.size).toBe(1);

    const bubble = container.firstElementChild!.firstElementChild as HTMLElement;
    const originalTransform = bubble.style.transform;
    changeMotion(true);
    expect(frames.size).toBe(0);
    runFrame(5000);
    expect(bubble.style.transform).toBe(originalTransform);

    changeMotion(false);
    changeMotion(false);
    expect(frames.size).toBe(1);
    runFrame(6000);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("cleans up after starting reduced and later enabling motion, including Strict Mode remounts", () => {
    reducedMotion = true;
    const { unmount } = render(<StrictMode><BubbleField /></StrictMode>);
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(1);
    changeMotion(false);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
    expect(listeners.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
