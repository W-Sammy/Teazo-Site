// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebsiteContentClient from "./website-content-client";
import { DEFAULT_WEBSITE_CONTENT } from "@/app/lib/website-content";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url === "/api/admin/website-content/carousel"
      ? Promise.resolve(Response.json({ success: true, images: [] }))
      : fetchMock(url, init));
  fetchMock.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openSocialRemoval() {
  render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
  fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "social" } });
  fireEvent.click(screen.getByRole("button", { name: "Remove Facebook" }));
}

describe("confirmed website content deletion (TZ-239, TZ-240)", () => {
  it("prompts before requesting deletion and allows cancellation", () => {
    openSocialRemoval();
    expect(screen.getByRole("dialog", { name: "Delete content entry?" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Facebook" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waits for persistence and blocks duplicate confirmation clicks", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    openSocialRemoval();
    const button = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Remove Facebook", hidden: true })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ collection: "socialLinks", id: "facebook", revision: 0 });
    await act(async () => finish(Response.json({ collectionsRevision: 1 })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Remove Facebook" })).toBeNull();
  });

  it("keeps the entry and confirmation open on server failure, then allows retry", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Storage is temporarily unavailable." }, { status: 503 }));
    openSocialRemoval();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Storage is temporarily unavailable.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Facebook", hidden: true })).toBeTruthy();
    fetchMock.mockResolvedValueOnce(Response.json({ collectionsRevision: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("confirms holiday deletion and addresses the stored date", async () => {
    fetchMock.mockResolvedValue(Response.json({ collectionsRevision: 1 }));
    render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "holidays" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Christmas" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ collection: "holidays", id: "12-25", revision: 0 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Remove Christmas" })).toBeNull();
  });

  it("saves pending edits before deletion and uses the returned revision", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ collectionsRevision: 1 }))
      .mockResolvedValueOnce(Response.json({ collectionsRevision: 2 }));
    render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "social" } });
    fireEvent.change(screen.getByLabelText("Facebook link"), { target: { value: "https://facebook.com/updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Facebook" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["PATCH", "DELETE"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).revision).toBe(1);
  });

  it("retains the entry on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    openSocialRemoval();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("The deletion could not be confirmed. Reload this page to check current content before trying again.");
    expect(screen.getByRole("button", { name: "Remove Facebook", hidden: true })).toBeTruthy();
  });

  it("stops further writes after a stale-session conflict", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Content changed. Reload this page." }, { status: 409 }));
    openSocialRemoval();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText(/Content changed\. Reload this page\./);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Save pending changes successfully before deleting, or reload this page.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps holiday confirmation informative on 404 and blocks retry until reload", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "This entry no longer exists." }, { status: 404 }));
    render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "holidays" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Christmas" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("This entry no longer exists. Reload this page before making more changes.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Christmas", hidden: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Save pending changes successfully before deleting, or reload this page.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("disables content mutation controls for view-only admins", () => {
    render(<WebsiteContentClient canEdit={false} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "social" } });
    expect(screen.getByRole("button", { name: "Remove Facebook" }).matches(":disabled")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders reload recovery button inside deletion dialog on conflict and warns of unsaved edits", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
    });

    fetchMock.mockResolvedValueOnce(Response.json({ error: "Content changed. Reload this page." }, { status: 409 }));
    render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);

    // Make a local edit in story (so hasUnsavedEdits is true)
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "story" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Our Story" }), {
      target: { value: "Unsaved local story edit" },
    });

    // Attempt deletion of Facebook link
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "social" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Facebook" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await screen.findByText(/Content changed\. Reload this page\./);
    expect(screen.getByText(/You have unsaved changes in other sections/i)).toBeTruthy();

    const reloadBtn = screen.getByRole("button", { name: "Discard edits & Reload" });
    fireEvent.click(reloadBtn);
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it("disables add controls and displays helper text when social links or holidays are at capacity", () => {
    const atCapacityContent = structuredClone(DEFAULT_WEBSITE_CONTENT);
    atCapacityContent.socialLinks = Array.from({ length: 10 }, (_, i) => ({
      id: `social-${i + 1}`,
      label: `Platform ${i + 1}`,
      icon: "",
      url: `https://example.com/${i + 1}`,
      enabled: true,
    }));
    atCapacityContent.holidays = Array.from({ length: 16 }, (_, i) => ({
      id: `holiday-${i + 1}`,
      name: `Holiday ${i + 1}`,
      date: `12-${String(i + 1).padStart(2, "0")}`,
      closed: true,
    }));

    render(<WebsiteContentClient canEdit={true} initialContent={atCapacityContent} />);

    // Check social
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "social" } });
    const addSocialBtn = screen.getByRole("button", { name: "New Social Media +" }) as HTMLButtonElement;
    expect(addSocialBtn.disabled).toBe(true);
    expect(screen.getByText(/Maximum limit of 10 social links reached/i)).toBeTruthy();

    // Check holidays
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "holidays" } });
    const addHolidayBtn = screen.getByRole("button", { name: "New Holiday +" }) as HTMLButtonElement;
    expect(addHolidayBtn.disabled).toBe(true);
    expect(screen.getByText(/Maximum limit of 16 holiday exceptions reached/i)).toBeTruthy();
  });

  it("displays distinct status badges: unsaved edits and all changes saved to storage", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true, collectionsRevision: 0 }));

    render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "story" } });

    // Typing triggers unsaved status badge
    fireEvent.change(screen.getByRole("textbox", { name: "Our Story" }), {
      target: { value: "Updated story content" },
    });
    expect(screen.getByText("Unsaved edits")).toBeTruthy();

    // Blur triggers flushPatch and confirmation
    fireEvent.blur(screen.getByRole("textbox", { name: "Our Story" }));
    await screen.findByText("All changes saved to storage");
  });

  it("warns before conflict recovery discards an invalid local story", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Content changed. Reload this page." }, { status: 409 }));
    render(<WebsiteContentClient canEdit={true} initialContent={structuredClone(DEFAULT_WEBSITE_CONTENT)} />);
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "story" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Our Story" }), { target: { value: "" } });
    fireEvent.blur(screen.getByRole("textbox", { name: "Our Story" }));
    expect(screen.getByText("Unsaved edits")).toBeTruthy();
    expect(screen.queryByText("All changes saved to storage")).toBeNull();

    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "social" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Facebook" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText(/Content changed\. Reload this page\./);
    expect(screen.getByText(/Reloading will discard those local edits/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard edits & Reload" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByLabelText("Sections"), { target: { value: "story" } });
    expect((screen.getByRole("textbox", { name: "Our Story" }) as HTMLTextAreaElement).value).toBe("");
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(["DELETE"]);
  });

  it("disables delivery additions at capacity and explains the limit", () => {
    const initialContent = structuredClone(DEFAULT_WEBSITE_CONTENT);
    initialContent.deliveryLinks = Array.from({ length: 10 }, (_, i) => ({
      id: `delivery-${i}`, label: `Delivery ${i}`, icon: "", url: `https://example.com/${i}`, enabled: true,
    }));
    render(<WebsiteContentClient initialContent={initialContent} initialSection="delivery" />);
    expect((screen.getByRole("button", { name: "New Delivery Link +" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Maximum limit of 10 delivery links reached/)).toBeTruthy();
  });
});
