// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteD1 } from "@/test/sqlite-d1";
import { getWebsiteContent, updateWebsiteContent } from "@/app/lib/website-content";
import { getStoreScheduleForDate } from "@/app/lib/store-hours";
import { DELETE, GET, PATCH } from "@/app/api/website-content/route";
import { useWebsiteContent } from "./handlers/use-website-content";
import WebsiteContentClient from "./components/website-content-client";
import Home from "@/app/(site)/page";
import ContactPage from "@/app/(site)/contact/page";
import CartDrawer from "@/app/(site)/components/cart-drawer";
import { CART_STORAGE_KEY, CartProvider } from "@/app/context/cart-context";

vi.mock("@/app/lib/admin", () => ({ requireAdminApi: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/font/google", () => ({
  Montserrat: () => ({ className: "font" }), Cabin_Sketch: () => ({ className: "font" }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("@/app/components/bubble-field", () => ({ BubbleField: () => null }));
vi.mock("@/app/(site)/components/image-carousel", () => ({ default: () => null }));
vi.mock("@/app/(site)/components/live-events-sidebar", () => ({ default: () => null }));
vi.mock("@/app/(site)/contact/contact-form", () => ({ default: () => null }));
vi.mock("@/app/lib/queries/events", () => ({ listActiveEvents: async () => [] }));

const fetchMock = vi.fn();
// Keep the production D1 HTTP adapter in this path. Emulate only the Worker's
// /query and /batch endpoints, including its result envelope and error status.
async function sqliteProxyRequest(url: string, init: RequestInit) {
  const body = JSON.parse(String(init.body));
  try {
    if (url.endsWith("/batch")) {
      const statements = body.statements.map(({ sql, params }: { sql: string; params: unknown[] }) =>
        sqliteD1.module.prepare(sql).bind(...params));
      return Response.json(await sqliteD1.module.batch(statements));
    }
    return Response.json(await sqliteD1.module.prepare(body.sql).bind(...body.params).all());
  } catch (error) {
    return Response.json({ error: "d1_error", message: String(error) }, { status: 400 });
  }
}
async function contentRequest(_url: string, init: RequestInit = {}) {
  if (!init.method) return GET();
  const request = new Request("http://localhost/api/website-content", init);
  return init.method === "DELETE" ? DELETE(request) : PATCH(request);
}
beforeEach(async () => {
  process.env.D1_PROXY_URL = "http://d1.test";
  process.env.PROXY_TOKEN = "test-token";
  sqliteD1.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-26T20:00:00Z")); // Noon in the store's timezone.
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  fetchMock.mockReset().mockImplementation(contentRequest);
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) =>
    url.startsWith("http://d1.test/") ? sqliteProxyRequest(url, init)
      : url === "/api/admin/website-content/carousel"
        ? Promise.resolve(Response.json({ success: true, images: [] }))
        : fetchMock(url, init));
  await updateWebsiteContent({ collectionsRevision: 0, holidays: [
    { id: "christmas", name: "Christmas", date: "12-25", closed: true },
    { id: "thanksgiving", name: "Thanksgiving", date: "11-26", closed: true },
  ] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("holiday deletion through the editor, API, and SQLite", () => {
  it("serializes edits arriving during deletion without restoring the deleted holiday", async () => {
    const initial = await getWebsiteContent();
    const { result } = renderHook(() => useWebsiteContent(initial));
    const christmas = initial.holidays.find((h) => h.name === "Christmas")!;
    const thanksgiving = initial.holidays.find((h) => h.name === "Thanksgiving")!;
    let finish!: () => void;
    fetchMock.mockImplementationOnce(async (url, init) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return contentRequest(url, init);
    });
    let deletion!: Promise<string | null>;
    await act(async () => { deletion = result.current.removeHoliday(christmas.id); });
    await act(async () => {
      expect(await result.current.removeHoliday(christmas.id)).toBe("A deletion is already in progress.");
    });
    act(() => { result.current.updateHoliday(thanksgiving.id, { name: "Thanksgiving updated" }); });
    await act(async () => {
      expect(await result.current.flushPatch()).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
    });
    act(() => window.dispatchEvent(new Event("beforeunload")));
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => { finish(); expect(await deletion).toBeNull(); });
    await act(async () => { expect(await result.current.flushPatch()).toBe(true); });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["DELETE", "PATCH"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expect.objectContaining({
      collectionsRevision: 2,
      holidays: [expect.objectContaining({ name: "Thanksgiving updated" })],
    }));
    const fresh = await getWebsiteContent();
    expect(fresh.collectionsRevision).toBe(3);
    expect(fresh.holidays).toEqual([expect.objectContaining({ name: "Thanksgiving updated" })]);
  });

  it("requires reconciliation if committed deletion metadata cannot be confirmed", async () => {
    const initial = await getWebsiteContent();
    const { result } = renderHook(() => useWebsiteContent(initial));
    const christmas = initial.holidays.find((h) => h.name === "Christmas")!;
    const batch = sqliteD1.module.batch;
    vi.spyOn(sqliteD1.module, "batch").mockImplementationOnce(async (statements) => {
      await batch(statements);
      return { results: [] };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => { expect(await result.current.removeHoliday(christmas.id)).toMatch(/Reload/); });
    expect(result.current.content.holidays.some((h) => h.id === christmas.id)).toBe(true);
    await act(async () => { expect(await result.current.flushPatch()).toBe(false); });
    expect(fetchMock).toHaveBeenCalledOnce();
    const fresh = await getWebsiteContent();
    expect(fresh.collectionsRevision).toBe(2);
    expect(fresh.holidays.some((h) => h.name === "Christmas")).toBe(false);
  });

  it.each([false, true])("uses a newly confirmed date after a save (in flight: %s)", async (inFlight) => {
    const initial = await getWebsiteContent();
    const { result } = renderHook(() => useWebsiteContent(initial));
    const id = initial.holidays.find((h) => h.name === "Christmas")!.id;
    let finish!: () => void;
    fetchMock.mockImplementationOnce(async (url, init) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return contentRequest(url, init);
    });
    act(() => { result.current.updateHoliday(id, { date: "12-24" }); });
    let save!: Promise<boolean>;
    act(() => { save = result.current.flushPatch(); });
    if (!inFlight) await act(async () => { finish(); expect(await save).toBe(true); });
    // The date visible when confirming is neither the original nor the saved date.
    act(() => { result.current.updateHoliday(id, { date: "11-26", name: "" }); });
    let deletion!: Promise<string | null>;
    act(() => { deletion = result.current.removeHoliday(id); });
    if (inFlight) expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => {
      if (inFlight) finish();
      await save;
      expect(await deletion).toBeNull();
    });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PATCH", "DELETE"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ collection: "holidays", id: "12-24", revision: 2 });
    expect((await getWebsiteContent()).holidays).toEqual([expect.objectContaining({ name: "Thanksgiving" })]);
    expect((await getWebsiteContent()).collectionsRevision).toBe(3);
  });

  it("discards a never-submitted holiday without losing unrelated queued holiday edits", async () => {
    const initial = await getWebsiteContent();
    const { result } = renderHook(() => useWebsiteContent(initial));
    const thanksgiving = initial.holidays.find((h) => h.name === "Thanksgiving")!;
    act(() => { result.current.updateHoliday(thanksgiving.id, { name: "Thanksgiving updated" }); });
    act(() => { result.current.addHoliday(); });
    const id = result.current.content.holidays.at(-1)!.id;
    act(() => { result.current.updateHoliday(id, { name: "Draft", date: "07-04" }); });
    await act(async () => { expect(await result.current.removeHoliday(id)).toBeNull(); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PATCH"]);
    const fresh = await getWebsiteContent();
    expect(fresh.collectionsRevision).toBe(2);
    expect(fresh.holidays.map((h) => h.name).sort()).toEqual(["Christmas", "Thanksgiving updated"]);
  });

  it.each(["missing target", "stale revision"])("blocks a second session after %s until reload", async (scenario) => {
    const initial = await getWebsiteContent();
    const first = renderHook(() => useWebsiteContent(initial));
    const second = renderHook(() => useWebsiteContent(initial));
    const christmas = initial.holidays.find((h) => h.name === "Christmas")!;
    const thanksgiving = initial.holidays.find((h) => h.name === "Thanksgiving")!;
    await act(async () => {
      expect(await first.result.current.removeHoliday(scenario === "missing target" ? christmas.id : thanksgiving.id)).toBeNull();
      expect(await second.result.current.removeHoliday(christmas.id)).toMatch(/Reload/);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => { second.result.current.updateHoliday(thanksgiving.id, { name: "Unsaved edit" }); });
    await act(async () => { expect(await second.result.current.flushPatch()).toBe(false); await vi.advanceTimersByTimeAsync(1000); });
    act(() => window.dispatchEvent(new Event("beforeunload")));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await getWebsiteContent()).collectionsRevision).toBe(2);
    expect(second.result.current.content.holidays).toHaveLength(2);
  });

  it.each(["PATCH", "unload PATCH", "DELETE"])("requires reload after a committed %s response is lost", async (method) => {
    const initial = await getWebsiteContent();
    const { result, unmount } = renderHook(() => useWebsiteContent(initial));
    let id = initial.holidays.find((h) => h.name === "Christmas")!.id;
    fetchMock.mockImplementationOnce(async (url, init) => {
      const response = await contentRequest(url, init);
      expect(response.status).toBe(200);
      throw new TypeError("Connection lost after commit");
    });
    if (method !== "DELETE") {
      act(() => { result.current.addHoliday(); });
      id = result.current.content.holidays.at(-1)!.id;
      act(() => { result.current.updateHoliday(id, { name: "New holiday", date: "07-04" }); });
      await act(async () => {
        if (method === "unload PATCH") window.dispatchEvent(new Event("beforeunload"));
        else expect(await result.current.flushPatch()).toBe(false);
      });
      if (method === "unload PATCH") expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
    }
    await act(async () => { expect(await result.current.removeHoliday(id)).toMatch(/reload/i); });
    expect(result.current.content.holidays.some((h) => h.id === id)).toBe(true);
    act(() => { result.current.updateStory("A later unrelated edit"); });
    await act(async () => { expect(await result.current.flushPatch()).toBe(false); await vi.advanceTimersByTimeAsync(1000); });
    act(() => window.dispatchEvent(new Event("beforeunload")));
    expect(fetchMock).toHaveBeenCalledOnce();
    unmount();

    const fresh = await getWebsiteContent();
    expect(fresh.collectionsRevision).toBe(2);
    expect(fresh.holidays.some((h) => h.date === "07-04")).toBe(method !== "DELETE");
    expect(fresh.holidays.some((h) => h.date === "12-25")).toBe(method !== "DELETE");
    const reloaded = renderHook(() => useWebsiteContent(fresh));
    const remaining = fresh.holidays.find((h) => h.date === (method === "DELETE" ? "11-26" : "07-04"))!;
    await act(async () => { expect(await reloaded.result.current.removeHoliday(remaining.id)).toBeNull(); });
    expect((await getWebsiteContent()).collectionsRevision).toBe(3);
  });

  it.each(["colliding date and invalid name", "incomplete second draft", "incomplete date"])(
    "deletes the saved Christmas identity with %s and agrees after reload", async (edit) => {
      const initial = await getWebsiteContent();
      const { result, unmount } = renderHook(() => useWebsiteContent(initial));
      const id = initial.holidays.find((h) => h.name === "Christmas")!.id;
      act(() => { result.current.updateHoliday(id, { date: edit === "colliding date and invalid name" ? "11-26" : "12-24" }); });
      if (edit === "incomplete second draft") {
        act(() => { result.current.addHoliday(); });
        act(() => { result.current.updateHoliday(result.current.content.holidays.at(-1)!.id, { name: "Draft" }); });
      } else {
        act(() => { result.current.updateHoliday(id, edit === "incomplete date" ? { date: "" } : { name: "" }); });
      }
      await act(async () => { expect(await result.current.removeHoliday(id)).toBeNull(); });
      expect(result.current.content.holidays.some((h) => h.id === id)).toBe(false);
      expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).id).toBe("12-25");
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      act(() => window.dispatchEvent(new Event("beforeunload")));
      unmount();

      const fresh = await getWebsiteContent();
      expect(sqliteD1.db.prepare("SELECT date, note FROM hours_exception ORDER BY date").all())
        .toEqual([{ date: "11-26", note: "Thanksgiving" }]);
      expect(fresh.collectionsRevision).toBe(2);
      render(<WebsiteContentClient canEdit initialContent={fresh} />);
      fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "holidays" } });
      expect(screen.queryByRole("button", { name: "Remove Christmas" })).toBeNull();
      expect(screen.getByRole("button", { name: "Remove Thanksgiving" })).toBeTruthy();

      for (const date of ["2026-11-26T20:00:00Z", "2026-12-25T20:00:00Z"]) {
        vi.setSystemTime(new Date(date));
        const schedule = getStoreScheduleForDate(new Date(), fresh);
        expect(schedule.closed).toBe(date.includes("11-26"));
        {
          const html = renderToStaticMarkup(await ContactPage());
          const page = new DOMParser().parseFromString(html, "text/html");
          const day = Array.from(page.querySelectorAll("dt")).find((dt) => dt.textContent?.includes(date.includes("11-26") ? "Thursday" : "Friday"))!;
          expect(day).toBeTruthy();
          expect(day.parentElement!.textContent).toContain(date.includes("11-26") ? "Closed" : "11:00 AM - 10:00 PM");
          if (date.includes("11-26")) expect(day.textContent).toContain("Thanksgiving");
          expect(html).not.toContain("Christmas");
        }
        // Home gets pickup hours through the cart mounted by the shared site layout.
        const home = await Home();
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{
          cartItemId: "tea", catalogObjectId: "tea", variationId: "tea", name: "Tea", quantity: 1, imageUrl: null,
          basePriceCents: 500, itemTotalCents: 500, selectedModifiers: [],
        }]));
        const cart = render(<CartProvider initialOpen>{home}<CartDrawer /></CartProvider>);
        await act(async () => {});
        // The cart interior is lazy-loaded. Fake timers stall findBy's polling, so flush manually.
        for (let i = 0; i < 20 && !screen.queryByRole("button", { name: /ASAP \(/ }); i++) {
          await act(async () => { await vi.advanceTimersByTimeAsync(50); });
        }
        const asap = screen.getByRole("button", { name: /ASAP \(/ }) as HTMLButtonElement;
        expect(asap.disabled).toBe(date.includes("11-26"));
        expect(screen.queryByText(/The store is closed today\./) !== null).toBe(date.includes("11-26"));
        cart.unmount();
      }
    },
  );
});
