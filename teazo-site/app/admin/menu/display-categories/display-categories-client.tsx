"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import type { SquareEnvironmentName } from "@/app/lib/square-environment";
import type { MenuItem } from "@/app/types/menu-item";
import type { MenuDisplayItem, MenuDisplaySection } from "@/app/lib/queries/menu-display";
import AdminForm from "@/app/admin/components/admin-form-page";
import { adminButtonStyles } from "@/app/admin/components/admin-button-styles";

type DisplayCategory = MenuDisplaySection & {
  items: MenuItem[];
};

type Props = {
  squareEnvironment?: SquareEnvironmentName;
  items: MenuItem[];
  initialSections: MenuDisplaySection[];
  initialItemSettings: MenuDisplayItem[];
};

const uncategorizedId = "uncategorized";

function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    function positionTooltip() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;
      const bounds = trigger.getBoundingClientRect();
      const { width, height } = tooltip.getBoundingClientRect();
      const left = Math.max(12, Math.min(bounds.left + bounds.width / 2 - width / 2, window.innerWidth - width - 12));
      const top = bounds.top >= height + 20 ? bounds.top - height - 8 : bounds.bottom + 8;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px`;
    }
    positionTooltip();
    window.addEventListener("resize", positionTooltip);
    window.addEventListener("scroll", positionTooltip, true);
    return () => {
      window.removeEventListener("resize", positionTooltip);
      window.removeEventListener("scroll", positionTooltip, true);
    };
  }, [open]);

  return (
    <span className="inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-500 outline-none focus:ring-2 focus:ring-[#dbb082]"
      >
        i
      </button>
      {open && createPortal(
        <span ref={tooltipRef} id={tooltipId} role="tooltip" className="pointer-events-none fixed z-[100] w-56 max-w-[calc(100vw-24px)] rounded-lg bg-gray-900 px-3 py-2 text-left text-xs font-normal normal-case leading-5 tracking-normal text-white shadow-lg">
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}

function WebsiteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.8 10h14.4M10 2.5c2 2.1 3 4.6 3 7.5s-1 5.4-3 7.5c-2-2.1-3-4.6-3-7.5s1-5.4 3-7.5Z" />
    </svg>
  );
}

function ItemThumbnail({ imageUrl }: { imageUrl: MenuItem["imageUrl"] }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = imageUrl?.trim() || null;
  const useLogo = !source || failedUrl === source;

  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-[#dbb082]/40 bg-[#fffaf6]">
      <Image
        src={useLogo ? "/TEAZO_logo.svg" : source}
        alt=""
        fill
        sizes="36px"
        className={useLogo ? "object-contain p-1" : "object-cover"}
        onError={() => { if (source) setFailedUrl(source); }}
      />
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  small = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#dbb082] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        small ? "h-5 w-9" : "h-6 w-11"
      } ${checked ? "bg-[#b98555]" : "bg-gray-300"}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block rounded-full bg-white shadow transition-transform ${
          small ? "h-3.5 w-3.5" : "h-4.5 w-4.5"
        } ${checked ? (small ? "translate-x-4" : "translate-x-5.5") : "translate-x-1"}`}
      />
    </button>
  );
}

function sortCategories(a: DisplayCategory, b: DisplayCategory) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
}

export default function DisplayCategoriesClient({
  squareEnvironment = "sandbox",
  items,
  initialSections,
  initialItemSettings,
}: Props) {
  const [sections, setSections] = useState(initialSections);
  const [itemSettings, setItemSettings] = useState(initialItemSettings);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const savingRef = useRef(false);
  const [categoryPanel, setCategoryPanel] = useState<DisplayCategory | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelName, setPanelName] = useState("");
  const [panelItemIds, setPanelItemIds] = useState<string[]>([]);
  const [deletePending, setDeletePending] = useState<DisplayCategory | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [hideHiddenCategories, setHideHiddenCategories] = useState(false);
  const [message, setMessage] = useState("");

  const categories = useMemo<DisplayCategory[]>(() => {
    const byCategory = new Map<string, DisplayCategory>();
    const savedBySquareId = new Map(
      sections
        .filter((section) => section.sectionType === "square" && section.squareCategoryId)
        .map((section) => [section.squareCategoryId as string, section]),
    );
    const savedUncategorized = sections.find(
      (section) => section.sectionType === "uncategorized",
    );

    for (const section of sections) {
      if (section.sectionType === "square" && section.squareCategoryId) {
        byCategory.set(section.squareCategoryId, { ...section, items: [] });
      }
    }

    if (savedUncategorized) {
      byCategory.set(uncategorizedId, { ...savedUncategorized, items: [] });
    }

    for (const item of items) {
      const categoryIds = item.categories.length
        ? [...new Set(item.categories.map((category) => category.id))]
        : [uncategorizedId];

      for (const categoryId of categoryIds) {
        const squareCategory = item.categories.find(
          (category) => category.id === categoryId,
        );
        const saved = categoryId === uncategorizedId
          ? savedUncategorized
          : savedBySquareId.get(categoryId);
        const fallbackOrder = 100000 + byCategory.size;
        const category: DisplayCategory = byCategory.get(categoryId) ?? {
          id: saved?.id ?? `category:${squareEnvironment}:${categoryId}`,
          squareCategoryId: categoryId === uncategorizedId ? null : categoryId,
          title: categoryId === uncategorizedId
            ? "Uncategorized"
            : squareCategory?.name?.trim() || "Unnamed category",
          sectionType: categoryId === uncategorizedId ? "uncategorized" : "square",
          sortOrder: saved?.sortOrder ?? (categoryId === uncategorizedId ? 999999 : fallbackOrder),
          isPublished: saved?.isPublished ?? (categoryId === uncategorizedId),
          defaultItemVisible: saved?.defaultItemVisible ?? (categoryId === uncategorizedId),
          itemIds: [],
          items: [],
        };

        category.items.push(item);
        byCategory.set(categoryId, category);
      }
    }

    for (const section of sections.filter((entry) => entry.sectionType === "custom")) {
      if (!byCategory.has(section.id)) {
        const itemById = new Map(items.map((item) => [item.catalogObjectId, item]));
        byCategory.set(section.id, {
          ...section,
          items: section.itemIds
            .map((itemId) => itemById.get(itemId))
            .filter((item): item is MenuItem => Boolean(item)),
        });
      }
    }

    return [...byCategory.values()].sort(sortCategories);
  }, [items, sections, squareEnvironment]);

  const visibleById = useMemo(
    () => new Map(itemSettings.map((setting) => [setting.squareCatalogObjectId, setting.visible])),
    [itemSettings],
  );

  async function saveSection(category: DisplayCategory, changes: Partial<MenuDisplaySection>) {
    const next = { ...category, ...changes };
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(category.id);
    setMessage("");

    try {
      const response = await fetch("/api/admin/menu/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-section",
          id: next.id,
          squareCategoryId: next.squareCategoryId,
          title: next.title,
          sectionType: next.sectionType,
          sortOrder: next.sortOrder,
          isPublished: next.isPublished,
          defaultItemVisible: next.defaultItemVisible,
          itemIds: next.itemIds,
        }),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();

      setSections((current) => {
        const saved = current.find((section) => section.id === category.id || (
          next.squareCategoryId && section.squareCategoryId === next.squareCategoryId
        ));
        const replacement = { ...next, id: result.section?.id ?? saved?.id ?? next.id };
        return saved
          ? current.map((section) => section.id === saved.id ? replacement : section)
          : [...current, replacement];
      });
    } catch {
      setMessage("The display setting could not be saved. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  async function setItemVisible(itemId: string, visible: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(itemId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/menu/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-item", itemId, visible }),
      });
      if (!response.ok) throw new Error();
      setItemSettings((current) => [
        ...current.filter((setting) => setting.squareCatalogObjectId !== itemId),
        { squareCatalogObjectId: itemId, visible },
      ]);
    } catch {
      setMessage("The item visibility could not be saved. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  const categoryReadOnly = Boolean(categoryPanel && categoryPanel.sectionType !== "custom");
  const categorySaving = saving === "category-panel";

  function closeCategoryPanel() {
    if (savingRef.current) return;
    setCategoryPanel(null);
    setPanelOpen(false);
  }

  function openCategoryPanel(category: DisplayCategory | null) {
    if (savingRef.current) return;
    setCategoryPanel(category);
    setPanelOpen(true);
    setPanelName(category?.title ?? "");
    setPanelItemIds(category?.itemIds ?? []);
    setMessage("");
  }

  async function saveCategoryPanel() {
    const title = panelName.trim();
    if (!title) return;

    if (savingRef.current) return;
    savingRef.current = true;
    setMessage("");
    setSaving("category-panel");
    try {
      const category = categoryPanel ?? {
        id: crypto.randomUUID(),
        squareCategoryId: null,
        title,
        sectionType: "custom" as const,
        sortOrder: Math.max(-1, ...categories.map((category) => category.sortOrder)) + 1,
        isPublished: true,
        defaultItemVisible: true,
        itemIds: [],
        items: [],
      };
      const response = await fetch("/api/admin/menu/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-section",
          id: category.id,
          squareCategoryId: null,
          title,
          sectionType: "custom",
          sortOrder: category.sortOrder,
          isPublished: category.isPublished,
          defaultItemVisible: category.defaultItemVisible,
          itemIds: panelItemIds,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error();
      const savedSection = {
        ...category,
        ...result.section,
        title,
        itemIds: panelItemIds,
      };
      setSections((current) => {
        const exists = current.some((section) => section.id === category.id);
        return exists
          ? current.map((section) => section.id === category.id ? savedSection : section)
          : [...current, savedSection];
      });
      if (result.itemSettings) {
        const updatedSettings: MenuDisplayItem[] = result.itemSettings;
        setItemSettings((current) => [
          ...current.filter((setting) => !updatedSettings.some(
            (updated) => updated.squareCatalogObjectId === setting.squareCatalogObjectId,
          )),
          ...updatedSettings,
        ]);
      }
      setCategoryPanel(null);
      setPanelOpen(false);
      setMessage(`${categoryPanel ? "Updated" : "Created"} website-only category “${title}”.`);
    } catch {
      setMessage("The website category could not be saved. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  async function reorderCategories(fromId: string, toId: string, position: "before" | "after") {
    if (fromId === toId) return;
    const reordered = [...categories];
    const fromIndex = reordered.findIndex((category) => category.id === fromId);
    if (fromIndex < 0 || !reordered.some((category) => category.id === toId)) return;
    const [moved] = reordered.splice(fromIndex, 1);
    const toIndex = reordered.findIndex((category) => category.id === toId);
    reordered.splice(toIndex + (position === "after" ? 1 : 0), 0, moved);
    if (reordered.every((category, index) => category.id === categories[index].id)) return;

    await persistCategoryOrder(reordered);
  }

  async function persistCategoryOrder(reordered: DisplayCategory[]) {
    if (savingRef.current) return;
    savingRef.current = true;
    setMessage("");
    const previousSections = sections;
    setSections(reordered.map((category, sortOrder) => ({ ...category, sortOrder })));

    setSaving("reorder");
    try {
      const response = await fetch("/api/admin/menu/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder-sections", sectionIds: reordered.map((category) => category.id) }),
      });
      if (!response.ok) throw new Error();
    } catch {
      setSections(previousSections);
      setMessage("The category order could not be saved. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  async function removeItemFromCategory(category: DisplayCategory, itemId: string) {
    if (category.sectionType !== "custom") {
      setMessage("Square category memberships must be changed in Square.");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setMessage("");
    setSaving(`${category.id}:${itemId}`);
    try {
      const response = await fetch("/api/admin/menu/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-item", sectionId: category.id, itemId }),
      });
      if (!response.ok) throw new Error();
      setSections((current) => current.map((section) => section.id === category.id
        ? { ...section, itemIds: section.itemIds.filter((id) => id !== itemId) }
        : section));
    } catch {
      setMessage("The item could not be removed from this category.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  async function deleteCategory(category: DisplayCategory) {
    if (category.sectionType !== "custom") {
      setMessage("This is a category that is pulled from Square and can only be deleted from the square dashboard");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setMessage("");
    setSaving(category.id);
    try {
      const response = await fetch("/api/admin/menu/display", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-category", id: category.id }),
      });
      if (!response.ok) throw new Error();
      setSections((current) => current.filter((section) => section.id !== category.id));
      setDeletePending(null);
      setMessage(`Deleted website-only category “${category.title}”.`);
    } catch {
      setMessage("The website category could not be deleted. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  return (
    <div className="relative flex h-dvh w-full min-w-0 overflow-hidden bg-white">
      <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-6 md:px-8">
        <div className="-mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#dbb082] p-3 sm:-mx-6 sm:p-4 md:-mx-8">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9b6d43]">
              Display Categories
            </h1>
            <InfoTip label="Display Categories" text="Control which Square items appear on the TEAZO website. These settings do not change Square." />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/menu"
              className={adminButtonStyles.navigation}
            >
              Back to Menu
            </Link>
            <button
              type="button"
              onClick={() => openCategoryPanel(null)}
              disabled={saving !== null}
              className={adminButtonStyles.primary}
            >
              Create custom category
            </button>
          </div>
        </div>

      <div className="relative flow-root min-h-[calc(100dvh-12rem)] md:-mx-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-52 hidden w-px bg-[#dbb082] md:block" />
        {message && (
          <p role="status" className={`mt-4 rounded-lg border px-4 py-3 text-sm [overflow-wrap:anywhere] md:ml-[15rem] md:mr-8 ${message.includes("could not") ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-gray-100 text-gray-700"}`}>
            {message}
          </p>
        )}

      <div className="relative mt-8 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-0">
        <aside className="-mx-4 border-b border-[#dbb082] px-4 pb-5 sm:-mx-6 sm:px-6 md:mx-0 md:sticky md:top-6 md:border-b-0 md:px-4 md:pb-0">
          <div className="mb-4 flex flex-col gap-3 border-b border-[#dbb082]/40 pb-4">
            <div className="flex items-center justify-between gap-3">
              <span id="hide-hidden-categories-label" className="text-xs font-medium leading-5 text-gray-700">Hide hidden categories</span>
              <Toggle
                checked={hideHiddenCategories}
                onChange={() => setHideHiddenCategories((current) => !current)}
                label="Hide hidden categories"
                small
              />
            </div>
            <button type="button" disabled={saving !== null || !categories.some((category) => !category.isPublished)} onClick={() => {
              const reordered = [...categories.filter((category) => category.isPublished), ...categories.filter((category) => !category.isPublished)];
              if (reordered.some((category, index) => category.id !== categories[index].id)) void persistCategoryOrder(reordered);
            }} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#dbb082]/60 bg-[#fffaf6] px-2 py-2 text-xs font-medium text-[#704b2d] transition-colors hover:border-[#b98555] hover:bg-[#f5e6d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dbb082] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 3v14m-4-4 4 4 4-4" />
              </svg>
              <span>Move hidden to bottom</span>
            </button>
          </div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            Category Order
            <InfoTip label="Category Order" text="Drag categories to change the order in which their sections appear on the public menu." />
          </h2>
          <p className="mt-2 text-xs text-gray-500">Drag to reorder. Drop at the line.</p>
          <div className="mt-3 space-y-1" onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
          }}>
            {categories.map((category, index) => hideHiddenCategories && !category.isPublished ? null : (
              <div
                key={category.id}
                draggable={saving === null}
                onDragStart={(event) => {
                  if (savingRef.current) { event.preventDefault(); return; }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", category.id);
                  setDraggedCategoryId(category.id);
                  setDropTarget(null);
                }}
                onDragEnd={() => { setDraggedCategoryId(null); setDropTarget(null); }}
                onDragOver={(event) => {
                  if (savingRef.current || !draggedCategoryId || draggedCategoryId === category.id) {
                    setDropTarget(null);
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setDropTarget({ id: category.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedCategoryId && dropTarget?.id === category.id) {
                    void reorderCategories(draggedCategoryId, category.id, dropTarget.position);
                  }
                  setDraggedCategoryId(null);
                  setDropTarget(null);
                }}
                className={`relative flex cursor-grab items-center rounded-md transition-colors active:cursor-grabbing ${draggedCategoryId === category.id ? "bg-[#fff0df] opacity-50" : "hover:bg-gray-50"}`}
              >
                {dropTarget?.id === category.id && (
                  <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-[#9b6d43] before:absolute before:-left-1 before:-top-0.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#9b6d43] ${dropTarget.position === "before" ? "-top-[3px]" : "-bottom-[3px]"}`} />
                )}
                <svg aria-hidden="true" viewBox="0 0 12 18" className="ml-2 h-4 w-3 shrink-0 text-gray-400" fill="currentColor">
                  {[4, 9, 14].flatMap((cy) => [3, 9].map((cx) => <circle key={`${cx}:${cy}`} cx={cx} cy={cy} r="1.4" />))}
                </svg>
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById(`display-category-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    openCategoryPanel(category);
                  }}
                  className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm ${category.isPublished ? "text-gray-800" : "text-gray-400 line-through"}`}
                  title={`${category.title} · ${category.items.length} ${category.items.length === 1 ? "item" : "items"}`}
                >
                  <span className="block truncate">{category.title}</span>
                </button>
                <span aria-label={`Menu order ${index + 1}`} className="mr-2 min-w-6 shrink-0 px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-gray-800">{index + 1}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 self-start md:px-8">
          <p className="mb-3 flex items-center gap-2 text-xs text-gray-600">
            <span className="shrink-0 text-[#9b6d43]"><WebsiteIcon /></span>
            Website-only category — created here and shown only on the TEAZO website.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[#dbb082]/60 bg-white">
          <div role="table" aria-label="Public menu categories" className="min-w-[760px]">
            <div role="row" className="grid grid-cols-[minmax(0,1fr)_12rem_9rem_8rem] border-b border-[#dbb082] bg-[#fffaf6] text-left text-sm text-gray-700">
              <div role="columnheader" className="px-3 py-3">Name</div>
              <div role="columnheader" className="flex items-center gap-2 px-3 py-3">
                New Item Default <InfoTip label="New Item Default" text="Sets visibility for newly discovered Square items or items newly added to a custom category. Items already in the category keep their visibility settings." />
              </div>
              <div role="columnheader" className="flex items-center gap-2 px-3 py-3">
                Visibility <InfoTip label="Visibility" text="Controls whether this category is shown on the public website. Item visibility is controlled on each item row." />
              </div>
              <div role="columnheader" className="px-3 py-3">Actions</div>
            </div>

            {categories.map((category) => (
              <div key={category.id} id={`display-category-${category.id}`} className="scroll-mt-6">
                <div role="row" className="grid grid-cols-[minmax(0,1fr)_12rem_9rem_8rem] items-center border-b border-[#dbb082]/60 bg-white text-sm hover:bg-[#dbb082]/15">
                  <div role="cell" className="min-w-0 px-3 py-2">
                    <button type="button" onClick={(event) => { event.stopPropagation(); setOpenCategory(openCategory === category.id ? null : category.id); }} className="flex min-w-0 items-center gap-3 text-left">
                      <span className="w-4 shrink-0 text-base text-gray-500">{openCategory === category.id ? "▾" : "▸"}</span>
                      <span className="min-w-0">
                        <span className={`flex items-center gap-2 truncate font-semibold ${category.isPublished ? "text-gray-900" : "text-gray-400 line-through"}`}>
                          <span className="truncate">{category.title}</span>
                          {category.sectionType === "custom" && <span className="shrink-0 text-[#9b6d43]" title="Website-only category"><WebsiteIcon /></span>}
                        </span>
                        <span className="block text-xs text-gray-500">{category.items.length} {category.items.length === 1 ? "item" : "items"}</span>
                      </span>
                    </button>
                  </div>
                  <div role="cell" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600">
                    <Toggle
                      checked={category.defaultItemVisible}
                      disabled={saving !== null}
                      onChange={() => void saveSection(category, { defaultItemVisible: !category.defaultItemVisible })}
                      label={`Make new ${category.title} items visible by default`}
                      small
                    />
                    <span>{category.defaultItemVisible ? "Visible" : "Hidden"}</span>
                  </div>
                  <div role="cell" className="flex items-center gap-2 px-3 py-2 text-xs font-medium">
                    <Toggle
                      checked={category.isPublished}
                      disabled={saving !== null}
                      onChange={() => void saveSection(category, { isPublished: !category.isPublished })}
                      label={`Show ${category.title} on public menu`}
                      small
                    />
                    <span className={category.isPublished ? "text-emerald-700" : "text-gray-400"}>
                      {category.isPublished ? "Shown" : "Hidden"}
                    </span>
                  </div>
                  <div role="cell" className="flex items-center gap-1 px-3 py-2">
                    <button type="button" disabled={saving !== null} onClick={(event) => { event.stopPropagation(); openCategoryPanel(category); }} className="rounded bg-[#dbb082] px-2 py-1 text-[10px] font-bold text-white hover:bg-[#c89968]" aria-label={`Edit ${category.title}`}>EDIT</button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (category.sectionType === "custom") setDeletePending(category);
                        else setMessage("This is a category that is pulled from Square and can only be deleted from the square dashboard");
                      }}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold ${category.sectionType === "custom" ? "text-red-500 hover:bg-red-50" : "cursor-not-allowed text-gray-300"}`}
                      disabled={saving !== null}
                      aria-label={`Delete ${category.title}`}
                      title={category.sectionType === "custom" ? "Delete category" : "This category can only be deleted from Square"}
                    >×</button>
                  </div>
                </div>

                {openCategory === category.id && (
                  <>
                    <div role="row" className="grid grid-cols-[minmax(0,1fr)_8rem_9rem_8rem] border-b border-[#dbb082]/40 bg-gray-50 pr-6 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      <div role="columnheader" className="px-3 py-2 pl-12">Name</div>
                      <div role="columnheader" />
                      <div role="columnheader" className="px-3 py-2">Visibility</div>
                      <div role="columnheader" className="px-3 py-2">Remove item</div>
                    </div>
                    {category.items.length === 0 ? (
                      <div role="row" className="border-b border-[#dbb082]/40 px-3 py-3 pl-12 text-sm text-gray-500">
                        No items are assigned to this category yet.
                      </div>
                    ) : category.items.map((item) => {
                    const visible = visibleById.get(item.catalogObjectId) ?? true;
                    return (
                      <div key={`${category.id}:${item.catalogObjectId}`} role="row" className="grid grid-cols-[minmax(0,1fr)_8rem_9rem_8rem] items-center border-b border-[#dbb082]/40 pr-6 text-sm hover:bg-[#dbb082]/15">
                        <div role="cell" className="flex min-w-0 items-center gap-3 px-3 py-2 pl-12">
                          <ItemThumbnail imageUrl={item.imageUrl} />
                          <div className="min-w-0">
                            <p className={`truncate font-medium ${visible ? "text-gray-900" : "text-gray-400 line-through"}`}>{item.name ?? "Unnamed item"}</p>
                            <p className="mt-0.5 text-xs text-gray-500">${(item.priceCents / 100).toFixed(2)}</p>
                          </div>
                        </div>
                        <div role="cell" />
                        <div role="cell" className="flex items-center gap-2 px-3 py-2 text-xs text-gray-600">
                          <Toggle
                            checked={visible}
                            disabled={saving !== null}
                            onChange={() => void setItemVisible(item.catalogObjectId, !visible)}
                            label={`Show ${item.name ?? "item"} on public menu`}
                            small
                          />
                          <span>{visible ? "Shown" : "Hidden"}</span>
                        </div>
                        <div role="cell" className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void removeItemFromCategory(category, item.catalogObjectId)}
                            disabled={category.sectionType !== "custom" || saving !== null}
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold ${category.sectionType === "custom" ? "text-red-500 hover:bg-red-50" : "cursor-not-allowed text-gray-300"}`}
                            aria-label={`Remove ${item.name ?? "item"} from category`}
                            title={category.sectionType === "custom" ? "Remove item from category" : "Square category memberships must be changed in Square"}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </>
                )}
              </div>
            ))}
          </div>
          </div>
        </main>
      </div>
      </div>

      </div>

      {panelOpen && (
        <AdminForm isOpen onClose={closeCategoryPanel} closeDisabled={categorySaving} mobileFullscreen>
          <form
            aria-labelledby="category-form-title"
            aria-busy={categorySaving}
            onSubmit={(event) => {
              event.preventDefault();
              if (!categoryReadOnly && !categorySaving) void saveCategoryPanel();
            }}
            className="flex min-h-full w-full min-w-0 flex-col pt-2 sm:pt-4"
          >
            <h2 id="category-form-title" className="mb-3 pr-10 text-center text-lg font-semibold [overflow-wrap:anywhere] sm:text-xl">
              {categoryPanel ? "Edit Category" : "Create New Category"}
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              {categoryReadOnly
                ? "This category is pulled from Square. Its name and item membership can only be changed in Square."
                : "This category appears only on the TEAZO website. Select the menu items to include below."}
            </p>

            <div className="min-w-0">
              <label htmlFor="category-name" className="mb-1 block text-sm text-gray-700">
                Name {!categoryReadOnly && <span className="text-red-600" aria-hidden="true">*</span>}
              </label>
              <input
                id="category-name"
                value={panelName}
                onChange={(event) => setPanelName(event.target.value)}
                maxLength={100}
                required
                disabled={categoryReadOnly || categorySaving}
                autoFocus={!categoryReadOnly}
                className="w-full min-w-0 rounded border border-[#dbb082] bg-white px-3 py-2 text-base text-gray-900 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 disabled:bg-gray-50 disabled:text-gray-500 md:text-sm"
              />
            </div>

            <fieldset disabled={categoryReadOnly || categorySaving} className="mt-4 min-w-0">
              <legend className="text-sm text-gray-700">Items</legend>
              <p className="mb-2 mt-1 text-xs text-gray-500">
                {categoryReadOnly ? `${categoryPanel?.items.length ?? 0} items in this Square category.` : `${panelItemIds.length} selected. Newly added items start ${categoryPanel?.defaultItemVisible === false ? "hidden" : "visible"}. Item visibility applies across the menu.`}
              </p>
              <div className="max-h-44 min-w-0 space-y-1 overflow-y-auto rounded border border-[#dbb082] p-2">
                {items.length === 0 && <p className="text-sm text-gray-500">No menu items available.</p>}
                {items.map((item) => {
                  const selected = categoryReadOnly
                    ? categoryPanel?.items.some((entry) => entry.catalogObjectId === item.catalogObjectId) ?? false
                    : panelItemIds.includes(item.catalogObjectId);
                  return (
                    <label key={item.catalogObjectId} className={`flex min-w-0 items-start gap-2 py-1 text-sm text-gray-700 ${categoryReadOnly || categorySaving ? "cursor-default" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setPanelItemIds((current) => selected ? current.filter((id) => id !== item.catalogObjectId) : [...current, item.catalogObjectId])}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#b98555]"
                      />
                      <ItemThumbnail imageUrl={item.imageUrl} />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{item.name ?? "Unnamed item"}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {message && <p role="alert" className="mt-4 text-sm text-red-600">{message}</p>}
            <div className="sticky bottom-0 z-10 mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 bg-white pb-2 pt-5 md:static md:mt-6 md:border-0">
              <button type="button" onClick={closeCategoryPanel} disabled={categorySaving} className={`min-w-0 ${adminButtonStyles.secondary}`}>
                {categoryReadOnly ? "Close" : "Cancel"}
              </button>
              {!categoryReadOnly && (
                <button type="submit" disabled={!panelName.trim() || categorySaving} className={`min-w-0 ${adminButtonStyles.primary} disabled:cursor-wait`}>
                  {categorySaving ? "Saving..." : categoryPanel ? "Save Changes" : "Add Category"}
                </button>
              )}
            </div>
          </form>
        </AdminForm>
      )}

      {deletePending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-category-heading" className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 id="delete-category-heading" className="text-xl font-semibold text-gray-900">Delete category?</h2>
            <p className="mt-3 text-sm text-gray-600">Delete “{deletePending.title}”? This removes the website category and its assignments, but does not delete any Square items.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={saving !== null} onClick={() => setDeletePending(null)} className={adminButtonStyles.secondary}>Cancel</button>
              <button type="button" onClick={() => void deleteCategory(deletePending)} disabled={saving === deletePending.id} className={adminButtonStyles.danger}>Delete category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
