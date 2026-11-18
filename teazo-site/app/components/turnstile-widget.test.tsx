// @vitest-environment jsdom

import { afterAll, afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import TurnstileWidget from "./turnstile-widget";

const originalKey = vi.hoisted(() => {
  const value = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "";
  return value;
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
});
afterAll(() => {
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalKey;
});

it("reports a missing key without creating a widget, including after retry", () => {
  const failed = vi.fn();
  window.turnstile = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
  const view = render(<TurnstileWidget action="checkout" onFailedChange={failed} resetKey={0} />);
  expect(failed).toHaveBeenLastCalledWith(true);
  expect(window.turnstile.render).not.toHaveBeenCalled();
  failed.mockClear();
  view.rerender(<TurnstileWidget action="checkout" onFailedChange={failed} resetKey={1} />);
  expect(failed).toHaveBeenLastCalledWith(true);
  expect(window.turnstile.render).not.toHaveBeenCalled();
});
