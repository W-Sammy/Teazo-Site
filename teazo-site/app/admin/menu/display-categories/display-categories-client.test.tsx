// @vitest-environment jsdom
import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DisplayCategoriesClient from "./display-categories-client";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("updates only the selected category's item visibility and includes the category when saving", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const sections: ComponentProps<typeof DisplayCategoriesClient>["initialSections"] = ["Tea", "Specials"].map((title, index) => ({
    id: title, title, squareCategoryId: title, sectionType: "square", sortOrder: index,
    isPublished: true, defaultItemVisible: true, itemIds: [],
  }));
  render(<DisplayCategoriesClient
    items={[{
      catalogObjectId: "tea", name: "Milk Tea", description: "", variationId: "variation",
      priceCents: 500, currency: "USD", imageUrl: null, modifiers: [],
      categories: [{ id: "Tea", name: "Tea" }, { id: "Specials", name: "Specials" }],
    }]}
    initialSections={sections}
    initialItemSettings={sections.map((section) => ({ sectionId: section.id, squareCatalogObjectId: "tea", visible: true }))}
  />);
  fireEvent.click(screen.getByRole("button", { name: /▸\s*Tea/ }));
  fireEvent.click(screen.getByRole("switch", { name: "Show Milk Tea on public menu" }));
  await waitFor(() => expect(screen.getByRole("switch", { name: "Show Milk Tea on public menu" }).getAttribute("aria-checked")).toBe("false"));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    action: "update-item", sectionId: "Tea", itemId: "tea", visible: false,
  });
  fireEvent.click(screen.getByRole("button", { name: /▸\s*Specials/ }));
  expect(screen.getByRole("switch", { name: "Show Milk Tea on public menu" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /▸\s*Tea/ }));
  expect(screen.getByRole("switch", { name: "Show Milk Tea on public menu" }).getAttribute("aria-checked")).toBe("false");
});
