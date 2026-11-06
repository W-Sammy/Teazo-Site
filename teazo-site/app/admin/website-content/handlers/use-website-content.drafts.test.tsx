// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebsiteContent } from "./use-website-content";
import { DEFAULT_WEBSITE_CONTENT } from "@/app/lib/website-content";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url === "/api/admin/website-content/carousel"
      ? Promise.resolve(Response.json({ success: true, images: [] }))
      : fetchMock(url, init));
  fetchMock.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function editor() {
  return renderHook(() => useWebsiteContent(structuredClone(DEFAULT_WEBSITE_CONTENT)));
}

describe("discarding client drafts", () => {
  it("removes a blank holiday locally without sending a delete or consuming a revision", async () => {
    const { result } = editor();
    act(() => { result.current.addHoliday(); });
    const draft = result.current.content.holidays.at(-1)!;
    await act(async () => { expect(await result.current.removeHoliday(draft.id)).toBeNull(); });
    expect(result.current.content.holidays.some((entry) => entry.id === draft.id)).toBe(false);
    expect(result.current.content.collectionsRevision).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes a fully filled but unsubmitted social draft from the debounce queue too", async () => {
    const { result } = editor();
    act(() => { result.current.addSocialLink(); });
    const id = result.current.content.socialLinks.at(-1)!.id;
    act(() => { result.current.updateSocialLink(id, { label: "TikTok", url: "https://tiktok.com/@teazo" }); });
    await act(async () => { expect(await result.current.removeSocialLink(id)).toBeNull(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    act(() => window.dispatchEvent(new Event("beforeunload")));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves unrelated queued edits when a draft is discarded", async () => {
    fetchMock.mockResolvedValue(Response.json({ collectionsRevision: 1 }));
    const { result } = editor();
    act(() => { result.current.updateSocialLink("facebook", { url: "https://facebook.com/changed" }); });
    act(() => { result.current.addSocialLink(); });
    const id = result.current.content.socialLinks.at(-1)!.id;
    await act(async () => { await result.current.removeSocialLink(id); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetchMock).toHaveBeenCalledOnce();
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.socialLinks.find((entry: { id: string }) => entry.id === "facebook").url).toBe("https://facebook.com/changed");
    expect(payload.socialLinks.some((entry: { id: string }) => entry.id === id)).toBe(false);
  });

  it("deletes a saved holiday even when its ID starts with holiday-", async () => {
    fetchMock.mockResolvedValue(Response.json({ collectionsRevision: 1 }));
    const initial = structuredClone(DEFAULT_WEBSITE_CONTENT);
    initial.holidays = [{ id: "holiday-12-25", name: "Christmas", date: "12-25", closed: true }];
    const { result } = renderHook(() => useWebsiteContent(initial));
    await act(async () => { await result.current.removeHoliday("holiday-12-25"); });
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBe("12-25");
  });

  it("waits for an in-flight draft save before deleting its persisted entry", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(Response.json({ collectionsRevision: 2 }));
    const { result } = editor();
    act(() => { result.current.addSocialLink(); });
    const id = result.current.content.socialLinks.at(-1)!.id;
    act(() => { result.current.updateSocialLink(id, { label: "TikTok", url: "https://tiktok.com/@teazo" }); });
    let save!: Promise<boolean>;
    act(() => { save = result.current.flushPatch(); });
    let deletion!: Promise<string | null>;
    act(() => { deletion = result.current.removeSocialLink(id); });
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => { finish(Response.json({ collectionsRevision: 1 })); await save; await deletion; });
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PATCH", "DELETE"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ collection: "socialLinks", id, revision: 1 });
  });
});
