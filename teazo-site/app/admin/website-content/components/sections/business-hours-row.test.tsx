// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import type { DayHours } from "@/app/types/website-content";
import BusinessHoursRow from "./business-hours-row";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pointer(target: HTMLElement, type: string, clientX: number, pointerId = 1) {
  // MouseEvent supplies coordinates in jsdom; attach the pointer identity used by the handler.
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  fireEvent(target, event);
}

function renderHours() {
  const onChange = vi.fn();
  function Editor() {
    const [entry, setEntry] = useState<DayHours>({
      day: "Mon", start: 9, end: 17, closed: false,
    });
    return <BusinessHoursRow entry={entry} onChange={(patch) => {
      onChange(patch);
      setEntry((current) => ({ ...current, ...patch }));
    }} />;
  }

  const { container } = render(<Editor />);
  // The bar and its edge handles are pointer-only controls without accessible names.
  const bar = container.querySelector<HTMLDivElement>(".cursor-grab")!;
  const track = bar.parentElement!;
  const start = bar.querySelector<HTMLDivElement>(".left-0")!;
  const end = bar.querySelector<HTMLDivElement>(".right-0")!;
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    left: 100, right: 340, width: 240, top: 0, bottom: 44, height: 44,
    x: 100, y: 0, toJSON: () => ({}),
  });

  for (const target of [bar, start, end]) {
    Object.assign(target, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
  }
  return { bar, start, end, onChange };
}

describe("business hours pointer editing", () => {
  it("slides from the original position across rerenders while preserving duration", () => {
    const { bar, onChange } = renderHours();
    pointer(bar, "pointerdown", 190);
    pointer(bar, "pointermove", 206);
    expect(onChange).toHaveBeenLastCalledWith({ start: 10.5, end: 18.5 });
    pointer(bar, "pointermove", 210);
    expect(onChange).toHaveBeenLastCalledWith({ start: 11, end: 19 });
    pointer(bar, "pointermove", 500);
    expect(onChange).toHaveBeenLastCalledWith({ start: 16, end: 24 });
    pointer(bar, "pointermove", 0);
    expect(onChange).toHaveBeenLastCalledWith({ start: 0, end: 8 });
    pointer(bar, "pointerup", 0);
  });

  it("snaps the opening edge and prevents it crossing the closing edge", () => {
    const { start, onChange } = renderHours();
    pointer(start, "pointerdown", 190);
    pointer(start, "pointermove", 206);
    expect(onChange).toHaveBeenLastCalledWith({ start: 10.5 });
    pointer(start, "pointermove", 400);
    expect(onChange).toHaveBeenLastCalledWith({ start: 16.5 });
    pointer(start, "pointermove", 0);
    expect(onChange).toHaveBeenLastCalledWith({ start: 0 });
    pointer(start, "pointerup", 0);
  });

  it("snaps the closing edge and prevents it crossing the opening edge", () => {
    const { end, onChange } = renderHours();
    pointer(end, "pointerdown", 270);
    pointer(end, "pointermove", 286);
    expect(onChange).toHaveBeenLastCalledWith({ end: 18.5 });
    pointer(end, "pointermove", 0);
    expect(onChange).toHaveBeenLastCalledWith({ end: 9.5 });
    pointer(end, "pointermove", 400);
    expect(onChange).toHaveBeenLastCalledWith({ end: 24 });
    pointer(end, "pointerup", 400);
  });

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "ignores other pointers and stops updating after %s", (endEvent) => {
      const { bar, onChange } = renderHours();
      pointer(bar, "pointerdown", 190);
      expect(bar.setPointerCapture).toHaveBeenCalledWith(1);
      pointer(bar, "pointermove", 210, 2);
      pointer(bar, endEvent, 210, 2);
      expect(onChange).not.toHaveBeenCalled();
      pointer(bar, "pointermove", 210);
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ start: 11, end: 19 });
      pointer(bar, endEvent, 210);
      expect(bar.releasePointerCapture).toHaveBeenCalledWith(1);
      pointer(bar, "pointermove", 230);
      expect(onChange).toHaveBeenCalledTimes(1);
    },
  );
});
