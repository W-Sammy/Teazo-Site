// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import StaticMenuContent from "./static-menu-content";

vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "test-montserrat" }),
}));

// Exercise preview eligibility without loading PDF.js or fetching a document.
vi.mock("@/app/components/pdf-preview", () => ({
  default: ({ fileUrl }: { fileUrl: string }) => (
    <div data-testid="pdf-preview" data-url={fileUrl} />
  ),
}));

vi.mock("@/app/components/general-button", () => ({
  default: ({ text, href }: { text: string; href: string }) => (
    <a href={href}>{text}</a>
  ),
}));

const originalWidth = window.innerWidth;
const chrome = "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36";

function resize(width: number) {
  window.innerWidth = width;
  fireEvent(window, new Event("resize"));
}

beforeEach(() => {
  window.innerWidth = 1024;
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(chrome);
});

afterEach(() => {
  cleanup();
  window.innerWidth = originalWidth;
  vi.restoreAllMocks();
});

describe("static menu preview eligibility", () => {
  it("hydrates the server fallback before enabling the desktop preview", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<StaticMenuContent />);
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();

    expect(container.querySelector('[data-testid="pdf-preview"]')).toBeNull();
    expect(container.querySelector("a")?.textContent).toBe("OPEN PDF");

    const root = hydrateRoot(container, <StaticMenuContent />, { onRecoverableError });
    try {
      await act(async () => {});
      expect(container.querySelector('[data-testid="pdf-preview"]')).not.toBeNull();
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("mounts and unmounts the preview at the 640px breakpoint", () => {
    window.innerWidth = 639;
    render(<StaticMenuContent />);
    const pdfUrl = screen.getByRole("link", { name: "OPEN PDF" }).getAttribute("href");

    expect(screen.queryByTestId("pdf-preview")).toBeNull();
    resize(640);
    expect(screen.getByTestId("pdf-preview").getAttribute("data-url")).toBe(pdfUrl);
    resize(639);
    expect(screen.queryByTestId("pdf-preview")).toBeNull();
    expect(screen.getByRole("link", { name: "OPEN PDF" }).getAttribute("href")).toBe(pdfUrl);
    resize(1024);
    expect(screen.getByTestId("pdf-preview")).toBeTruthy();
  });

  it("keeps the PDF link available in Safari without mounting the preview", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 Version/18.0 Safari/605.1.15",
    );
    render(<StaticMenuContent />);

    expect(screen.queryByTestId("pdf-preview")).toBeNull();
    resize(639);
    resize(1200);
    expect(screen.queryByTestId("pdf-preview")).toBeNull();
    expect(screen.getByRole("link", { name: "OPEN PDF" })).toBeTruthy();
  });
});
