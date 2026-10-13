"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import AdminForm from "../../components/admin-form-page";
import AdminViewToggle, {
  GridViewIcon,
  ListViewIcon,
  type AdminViewOption,
} from "../../components/admin-view-toggle";
import type {
  AdminGalleryImage,
  GallerySortOption,
  GalleryViewMode,
} from "../../../types/gallery-image";
import AdminGalleryGrid from "./admin-gallery-grid";
import AdminGalleryList from "./admin-gallery-list";
import DeleteImageDialog from "./delete-image-dialog";
import DeleteSelectedImagesDialog, {
  type BulkDeleteResult,
} from "./delete-selected-images-dialog";
import GalleryUploadForm, {
  type GalleryUploadValues,
} from "./gallery-upload-form";

type AdminGalleryClientProps = {
  initialImages: AdminGalleryImage[];
};

// Filter labels include counts across the complete current image collection.
type TagOption = {
  name: string;
  count: number;
};

const galleryViewOptions: readonly AdminViewOption<GalleryViewMode>[] = [
  {
    value: "grid",
    label: "Image View",
    icon: <GridViewIcon />,
  },
  {
    value: "list",
    label: "List View",
    icon: <ListViewIcon />,
  },
];

// Limit parallel requests instead of sending the entire selection at once.
const MAX_BULK_DELETE_CONCURRENCY = 3;

// Reuse the existing per-image endpoint for single and bulk deletion.
async function requestImageDeletion(id: string): Promise<string | null> {
  try {
    const response = await fetch(
      `/api/admin/gallery/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
        redirect: "error",
      },
    );

    // The endpoint confirms deletion with an empty 204 response.
    if (response.status === 204) {
      return null;
    }

    const result: unknown = await response.json().catch(() => null);

    if (
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
    ) {
      return result.error;
    }

    return `The image could not be deleted (HTTP ${response.status}). Please try again.`;
  } catch (error) {
    console.error("Gallery image deletion request failed:", id, error);

    return "The deletion request could not be completed. Check your connection and try again.";
  }
}

export default function AdminGalleryClient({
  initialImages,
}: AdminGalleryClientProps) {
  // Start with database images; uploads and deletions are saved through the API.
  const [images, setImages] =
    useState<AdminGalleryImage[]>(initialImages);

  // Matching controls are independent of the chosen image/list presentation.
  const [search, setSearch] = useState("");

  const [selectedTags, setSelectedTags] =
    useState<string[]>([]);

  const [sortBy, setSortBy] =
    useState<GallerySortOption>("name-asc");

  // Start in List View on both mobile and desktop.
  const [viewMode, setViewMode] =
    useState<GalleryViewMode>("list");

  /*
   * Desktop filters use a collapsible sidebar.
   */
  const [filtersOpen, setFiltersOpen] =
    useState(true);

  /*
   * Mobile filters use an overlay drawer so they do
   * not push the gallery horizontally off the screen.
   */
  const [
    mobileFiltersOpen,
    setMobileFiltersOpen,
  ] = useState(false);

  // A null editingImage selects create mode; deletion waits for confirmation.
  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [editingImage, setEditingImage] =
    useState<AdminGalleryImage | null>(null);

  const [
    imagePendingDelete,
    setImagePendingDelete,
  ] = useState<AdminGalleryImage | null>(null);

  // Image selection is shared by List View and Image View.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Freeze the confirmed targets; after a partial failure, retain only failures.
  const [imagesPendingBulkDelete, setImagesPendingBulkDelete] =
    useState<AdminGalleryImage[] | null>(null);

  const [isMutating, setIsMutating] = useState(false);
  const mutationInFlight = useRef(false);

  // Repeated confirmation clicks reuse the pending operation.
  const singleDeleteInFlight =
    useRef<Promise<string | null> | null>(null);

  const bulkDeleteInFlight =
    useRef<Promise<BulkDeleteResult> | null>(null);

  const interactionLocked =
    isMutating ||
    imagePendingDelete !== null ||
    imagesPendingBulkDelete !== null;

  // These URLs belong to the gallery, separate from the upload form's preview URLs.
  const managedObjectUrls =
    useRef<Set<string>>(new Set());

  // Release all gallery-owned blob URLs when leaving this component.
  useEffect(() => {
    const urls = managedObjectUrls.current;

    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });

      urls.clear();
    };
  }, []);

  // Rebuild alphabetized tag counts whenever the local image collection changes.
  const tagOptions = useMemo<TagOption[]>(() => {
    const counts = new Map<string, number>();

    images.forEach((image) => {
      image.tags.forEach((tag: string) => {
        counts.set(
          tag,
          (counts.get(tag) ?? 0) + 1,
        );
      });
    });

    return Array.from(
      counts,
      ([name, count]) => ({
        name,
        count,
      }),
    ).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [images]);

  // Match any selected tag AND a case-insensitive name/tag search.
  const filteredImages = useMemo(() => {
    const query = search
      .trim()
      .toLocaleLowerCase();

    const filtered = images.filter((image) => {
      const matchesTags =
        selectedTags.length === 0 ||
        image.tags.some((tag: string) =>
          selectedTags.includes(tag),
        );

      const matchesSearch =
        !query ||
        image.name
          .toLocaleLowerCase()
          .includes(query) ||
        image.tags.some((tag: string) =>
          tag
            .toLocaleLowerCase()
            .includes(query),
        );

      return matchesTags && matchesSearch;
    });

    // Sort a copy without rearranging the source state array.
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "name-desc":
          return b.name.localeCompare(a.name);

        case "date-desc":
          return (
            Date.parse(b.createdAt) -
            Date.parse(a.createdAt)
          );

        case "date-asc":
          return (
            Date.parse(a.createdAt) -
            Date.parse(b.createdAt)
          );

        case "name-asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [
    images,
    search,
    selectedTags,
    sortBy,
  ]);

  const selectedIdSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const selectedImages = useMemo(
    () => images.filter((image) => selectedIdSet.has(image.id)),
    [images, selectedIdSet],
  );

  const allDisplayedSelected =
    filteredImages.length > 0 &&
    filteredImages.every((image) => selectedIdSet.has(image.id));

  const someDisplayedSelected = filteredImages.some((image) =>
    selectedIdSet.has(image.id),
  );

  function toggleImageSelection(id: string) {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setSelectedIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((selectedId) => selectedId !== id)
        : [...currentIds, id],
    );
  }

  // Select/deselect only images matching the current search and tag filters.
  function selectAllDisplayed(selected: boolean) {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    const displayedIds = new Set(
      filteredImages.map((image) => image.id),
    );

    setSelectedIds((currentIds) =>
      selected
        ? Array.from(new Set([...currentIds, ...displayedIds]))
        : currentIds.filter((id) => !displayedIds.has(id)),
    );
  }

  function clearImageSelection() {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setSelectedIds([]);
  }

  // Clear selection when the matching criteria change, so hidden images
  // are not accidentally included in a later bulk deletion.
  function changeSearch(event: ChangeEvent<HTMLInputElement>) {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setSearch(event.target.value);
    setSelectedIds([]);
  }

  // Toggle one tag without mutating the existing selected-tags array.
  function toggleTag(tagName: string) {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setSelectedIds([]);

    setSelectedTags((currentTags) =>
      currentTags.includes(tagName)
        ? currentTags.filter(
            (tag: string) => tag !== tagName,
          )
        : [...currentTags, tagName],
    );
  }

  // Remove selected filters whose tags disappeared after an edit or deletion.
  function keepAvailableSelectedTags(
    nextImages: AdminGalleryImage[],
  ) {
    const availableTags = new Set(
      nextImages.flatMap(
        (image) => image.tags,
      ),
    );

    setSelectedTags((currentTags) =>
      currentTags.filter((tag: string) =>
        availableTags.has(tag),
      ),
    );
  }

  // Clear the edit target so a later create action starts with a blank form.
  function closeDrawer() {
    setDrawerOpen(false);
    setEditingImage(null);
  }

  // Explicitly reset edit mode before opening the create form.
  function openNewImageDrawer() {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setEditingImage(null);
    setDrawerOpen(true);
  }

  // Reuse the upload form to edit the selected image's metadata or file.
  function openEditDrawer(
    image: AdminGalleryImage,
  ) {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setEditingImage(image);
    setDrawerOpen(true);
  }

  // Keep a saved local preview alive after the upload form unmounts.
  function createManagedObjectUrl(file: File) {
    const url = URL.createObjectURL(file);

    managedObjectUrls.current.add(url);

    return url;
  }

  // Revoke only URLs created here; leave supplied asset and remote URLs untouched.
  function revokeManagedObjectUrl(
    url: string,
  ) {
    if (!managedObjectUrls.current.has(url)) {
      return;
    }

    URL.revokeObjectURL(url);
    managedObjectUrls.current.delete(url);
  }

  // Upload new images through the admin gallery API.
  // Existing image edits remain local until their API is implemented.
  async function handleSave(
    values: GalleryUploadValues,
  ): Promise<void> {
    if (mutationInFlight.current || interactionLocked) {
      throw new Error("Wait for the current gallery action to finish.");
    }

    mutationInFlight.current = true;
    setIsMutating(true);

    try {
      if (editingImage) {
        const nextUrl = values.file
          ? createManagedObjectUrl(values.file)
          : editingImage.url;

        const nextImages = images.map((image) =>
          image.id === editingImage.id
            ? {
                ...image,
                name: values.name,
                tags: values.tags,
                url: nextUrl,
              }
            : image,
        );

        if (values.file) {
          revokeManagedObjectUrl(editingImage.url);
        }

        setImages(nextImages);
        keepAvailableSelectedTags(nextImages);
        closeDrawer();
        return;
      }

      if (!values.file) {
        throw new Error("Select an image before saving.");
      }

      const formData = new FormData();
      formData.append("file", values.file);
      formData.append("name", values.name);
      formData.append("tags", JSON.stringify(values.tags));

      const response = await fetch("/api/admin/gallery", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);

        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "The image could not be uploaded. Please try again.",
        );
      }

      const savedImage =
        (await response.json()) as AdminGalleryImage;

      setImages((currentImages) => [
        savedImage,
        ...currentImages,
      ]);

      closeDrawer();
    } finally {
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  }

  // Apply only server-confirmed removals. Bulk callers pass cumulative
  // successes so tag counts stay correct across multiple request batches.
  function removeConfirmedImages(
    deletedImages: AdminGalleryImage[],
  ) {
    if (deletedImages.length === 0) {
      return;
    }

    const deletedIds = new Set(
      deletedImages.map((image) => image.id),
    );

    const nextImages = images.filter(
      (image) => !deletedIds.has(image.id),
    );

    deletedImages.forEach((image) => {
      revokeManagedObjectUrl(image.url);
    });

    setImages((currentImages) =>
      currentImages.filter(
        (image) => !deletedIds.has(image.id),
      ),
    );

    keepAvailableSelectedTags(nextImages);

    setSelectedIds((currentIds) =>
      currentIds.filter((id) => !deletedIds.has(id)),
    );

    if (editingImage && deletedIds.has(editingImage.id)) {
      closeDrawer();
    }
  }

  function openSingleDeleteDialog(
    image: AdminGalleryImage,
  ) {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setImagePendingDelete(image);
  }

  function cancelSingleDelete() {
    if (mutationInFlight.current) {
      return;
    }

    setImagePendingDelete(null);
  }

  async function performSingleDelete(
    imageToDelete: AdminGalleryImage,
  ): Promise<string | null> {
    mutationInFlight.current = true;
    setIsMutating(true);

    try {
      const errorMessage = await requestImageDeletion(
        imageToDelete.id,
      );

      if (errorMessage) {
        return errorMessage;
      }

      removeConfirmedImages([imageToDelete]);
      setImagePendingDelete(null);

      return null;
    } finally {
      singleDeleteInFlight.current = null;
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  }

  function confirmDelete(): Promise<string | null> {
    if (singleDeleteInFlight.current) {
      return singleDeleteInFlight.current;
    }

    if (!imagePendingDelete) {
      return Promise.resolve(null);
    }

    if (mutationInFlight.current) {
      return Promise.resolve(
        "Wait for the current gallery action to finish.",
      );
    }

    const operation = performSingleDelete(
      imagePendingDelete,
    );

    singleDeleteInFlight.current = operation;

    return operation;
  }

  function openBulkDeleteDialog() {
    if (
      mutationInFlight.current ||
      interactionLocked ||
      drawerOpen ||
      selectedImages.length === 0
    ) {
      return;
    }

    setImagesPendingBulkDelete([...selectedImages]);
  }

  function cancelBulkDelete() {
    if (mutationInFlight.current) {
      return;
    }

    // Keep the selection when the administrator cancels the confirmation.
    setImagesPendingBulkDelete(null);
  }

  async function performBulkDelete(
    targets: AdminGalleryImage[],
  ): Promise<BulkDeleteResult> {
    mutationInFlight.current = true;
    setIsMutating(true);

    const deletedImages: AdminGalleryImage[] = [];
    const failedImages: AdminGalleryImage[] = [];

    try {
      for (
        let start = 0;
        start < targets.length;
        start += MAX_BULK_DELETE_CONCURRENCY
      ) {
        const batch = targets.slice(
          start,
          start + MAX_BULK_DELETE_CONCURRENCY,
        );

        // Each request catches its own failure, so one rejection does not
        // discard the successful results for other selected images.
        const results = await Promise.all(
          batch.map(async (image) => ({
            image,
            errorMessage: await requestImageDeletion(image.id),
          })),
        );

        for (const result of results) {
          if (result.errorMessage) {
            failedImages.push(result.image);

            console.error(
              "Could not delete selected gallery image:",
              result.image.id,
              result.errorMessage,
            );
          } else {
            deletedImages.push(result.image);
          }
        }

        removeConfirmedImages(deletedImages);
      }

      // Keep failures visible and selected. Retrying this dialog sends
      // requests only for these remaining images, not prior successes.
      setImagesPendingBulkDelete(
        failedImages.length > 0 ? failedImages : null,
      );

      return {
        deletedCount: deletedImages.length,
        failedNames: failedImages.map(
          (image) => image.name,
        ),
      };
    } finally {
      bulkDeleteInFlight.current = null;
      mutationInFlight.current = false;
      setIsMutating(false);
    }
  }

  function confirmBulkDelete(): Promise<BulkDeleteResult> {
    if (bulkDeleteInFlight.current) {
      return bulkDeleteInFlight.current;
    }

    if (
      !imagesPendingBulkDelete ||
      imagesPendingBulkDelete.length === 0
    ) {
      return Promise.resolve({
        deletedCount: 0,
        failedNames: [],
      });
    }

    if (mutationInFlight.current) {
      return Promise.reject(
        new Error(
          "Wait for the current gallery action to finish.",
        ),
      );
    }

    const operation = performBulkDelete([
      ...imagesPendingBulkDelete,
    ]);

    bulkDeleteInFlight.current = operation;

    return operation;
  }

  // Clear only tag matching; preserve search text, sorting, and view mode.
  function clearTagFilters() {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setSelectedIds([]);
    setSelectedTags([]);
  }

  // Reset search as well as tags, without changing presentation preferences.
  function clearAllSearchAndFilters() {
    if (mutationInFlight.current || interactionLocked) {
      return;
    }

    setSearch("");
    clearTagFilters();
  }

  return (
    <div className="relative flex h-dvh w-full min-w-0 overflow-hidden bg-white">
      {/* Darkened background behind the mobile filter drawer. */}
      {mobileFiltersOpen && (
        <button
          type="button"
          onClick={() =>
            setMobileFiltersOpen(false)
          }
          className="absolute inset-0 z-30 bg-black/30 md:hidden"
          aria-label="Close gallery filters"
        />
      )}

      {/* Filter panel */}
      <aside
        id="gallery-filter-panel"
        className={`absolute inset-y-0 left-0 z-40 h-full w-64 max-w-[calc(100%-1rem)] overflow-y-auto border-r border-[#dbb082] bg-white p-4 shadow-xl transition-transform duration-300 md:static md:z-auto md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none md:transition-all ${
          mobileFiltersOpen
            ? "translate-x-0"
            : "-translate-x-full"
        } ${
          filtersOpen
            ? "md:w-52 md:p-4"
            : "md:w-11 md:p-2"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            className={`font-semibold ${
              filtersOpen
                ? "md:block"
                : "md:hidden"
            }`}
          >
            Filters
          </h2>

          {/* Mobile close button */}
          <button
            type="button"
            onClick={() =>
              setMobileFiltersOpen(false)
            }
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded text-xl font-bold hover:bg-gray-100 md:hidden"
            aria-label="Close filters"
            title="Close filters"
          >
            ×
          </button>

          {/* Desktop collapse button */}
          <button
            type="button"
            onClick={() =>
              setFiltersOpen(
                (isOpen) => !isOpen,
              )
            }
            className="hidden cursor-pointer rounded px-2 py-1 text-lg font-bold hover:bg-gray-100 md:inline-flex"
            aria-label={
              filtersOpen
                ? "Collapse filters"
                : "Expand filters"
            }
            title={
              filtersOpen
                ? "Collapse filters"
                : "Expand filters"
            }
          >
            {filtersOpen ? "←" : "→"}
          </button>
        </div>

        <div
          className={`space-y-3 ${
            filtersOpen
              ? "md:block"
              : "md:hidden"
          }`}
        >
          {/* Gallery sorting */}
          <div>
            <label
              htmlFor="gallery-sort"
              className="mb-1 block text-sm text-gray-600"
            >
              Sort by:
            </label>

            <div className="relative">
              <select
                id="gallery-sort"
                value={sortBy}
                disabled={interactionLocked}
                onChange={(
                  event: ChangeEvent<HTMLSelectElement>,
                ) =>
                  setSortBy(
                    event.target
                      .value as GallerySortOption,
                  )
                }
                className="w-full cursor-pointer appearance-none rounded bg-gray-200 px-3 py-2 pr-10 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-[#FFBDC7]/50 "
              >
                <option value="name-asc">
                  Name A to Z
                </option>

                <option value="name-desc">
                  Name Z to A
                </option>

                <option value="date-desc">
                  Date (Latest)
                </option>

                <option value="date-asc">
                  Date (Oldest)
                </option>
              </select>

              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 7 5 5 5-5" />
              </svg>
            </div>
          </div>

          <button
            type="button"
            onClick={clearTagFilters}
            disabled={interactionLocked}
            className="cursor-pointer text-xs text-blue-500 hover:underline"
          >
            Clear filters
          </button>

          <div className="space-y-1">
            {tagOptions.length > 0 ? (
              tagOptions.map((tag) => (
                <label
                  key={tag.name}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-[#fffaf6]"
                >
                  <input
                    type="checkbox"
                    disabled={interactionLocked}
                    checked={selectedTags.includes(
                      tag.name,
                    )}
                    onChange={() =>
                      toggleTag(tag.name)
                    }
                    className="scale-110 accent-[#b98555]"
                  />

                  <span className="min-w-0 flex-1 truncate">
                    {tag.name}
                  </span>

                  <span className="text-xs text-gray-400">
                    ({tag.count})
                  </span>
                </label>
              ))
            ) : (
              <p className="py-2 text-xs text-gray-400">
                No tags available
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main gallery area */}
      <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="shrink-0 border-b border-[#dbb082] p-3 sm:p-4">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:flex-nowrap lg:items-center">
              <div className="flex w-full min-w-0 items-center gap-2 lg:min-w-40 lg:max-w-64 lg:flex-1">
                {/* Mobile filter button */}
                <button
                  type="button"
                  onClick={() =>
                    setMobileFiltersOpen(true)
                  }
                  className="shrink-0 cursor-pointer rounded-lg border border-[#dbb082] px-3 py-2 text-sm font-semibold text-[#9b6d43] hover:bg-[#fffaf6] md:hidden"
                  aria-controls="gallery-filter-panel"
                  aria-expanded={mobileFiltersOpen}
                >
                  Filters
                </button>

                <input
                  id="gallery-photo-search"
                  name="galleryPhotoSearch"
                  type="search"
                  value={search}
                  onChange={changeSearch}
                  disabled={interactionLocked}
                  placeholder="Search photos"
                  aria-label="Search photos"
                  className="min-w-0 flex-1 rounded bg-gray-200 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-[#FFBDC7]/50"
                />
              </div>

              <AdminViewToggle
                value={viewMode}
                options={galleryViewOptions}
                onChange={(nextView) => {
                  if (
                    !mutationInFlight.current &&
                    !interactionLocked
                  ) {
                    setViewMode(nextView);
                  }
                }}
                ariaLabel="Gallery view"
                className="max-w-full self-start lg:self-auto"
              />
            </div>

            <button
              type="button"
              onClick={openNewImageDrawer}
              disabled={interactionLocked}
              className="inline-flex w-full shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-bold text-white hover:bg-[#F59AA3] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:self-end lg:ml-4 lg:self-auto"
            >
              New Image +
            </button>
          </div>

          {/* Shared bulk-selection controls for both gallery views. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#dbb082]/40 pt-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={allDisplayedSelected}
                disabled={
                  filteredImages.length === 0 ||
                  interactionLocked
                }
                onChange={(event) =>
                  selectAllDisplayed(event.target.checked)
                }
                ref={(element) => {
                  if (element) {
                    element.indeterminate =
                      someDisplayedSelected &&
                      !allDisplayedSelected;
                  }
                }}
                className="h-4 w-4 cursor-pointer accent-[#b98555] disabled:cursor-not-allowed"
              />

              Select all displayed
            </label>

            <span
              className="text-sm text-gray-500"
              role="status"
            >
              {selectedImages.length} selected
            </span>

            <button
              type="button"
              onClick={clearImageSelection}
              disabled={
                selectedImages.length === 0 ||
                interactionLocked
              }
              className="cursor-pointer text-sm text-blue-500 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear selection
            </button>

            <button
              type="button"
              onClick={openBulkDeleteDialog}
              disabled={
                selectedImages.length === 0 ||
                interactionLocked ||
                drawerOpen
              }
              title={
                drawerOpen
                  ? "Close the image form before deleting selected images."
                  : undefined
              }
              className="w-full cursor-pointer rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto"
            >
              Delete selected ({selectedImages.length})
            </button>
          </div>

          <p className="mt-2 text-xs text-gray-500">
            Selection stays when switching views or sorting.
            Changing search or tag filters clears the selection.
          </p>
        </div>

        {/* Gallery content */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm text-gray-500">
            <span>
              {filteredImages.length}{" "}
              {filteredImages.length === 1
                ? "image"
                : "images"}
            </span>

            {(search ||
              selectedTags.length > 0) && (
              <button
                type="button"
                onClick={
                  clearAllSearchAndFilters
                }
                className="cursor-pointer text-blue-500 hover:underline"
              >
                Clear search and filters
              </button>
            )}
          </div>

          {filteredImages.length > 0 ? (
            viewMode === "grid" ? (
              <AdminGalleryGrid
                images={filteredImages}
                onEdit={openEditDrawer}
                onDelete={openSingleDeleteDialog}
                selectedIds={selectedIds}
                onToggleSelect={toggleImageSelection}
              />
            ) : (
              <AdminGalleryList
                images={filteredImages}
                onEdit={openEditDrawer}
                onDelete={openSingleDeleteDialog}
                selectedIds={selectedIds}
                onToggleSelect={toggleImageSelection}
                onSelectAll={selectAllDisplayed}
              />
            )
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#dbb082]/60 bg-[#fffaf6] px-6 text-center">
              <h2 className="text-lg font-semibold text-gray-800">
                {images.length === 0
                  ? "No gallery images yet"
                  : "No images found"}
              </h2>

              <p className="mt-2 max-w-md text-sm text-gray-500">
                {images.length === 0
                  ? "Use the New Image button to add your first gallery image."
                  : "Try changing the photo search or clearing the selected tags."}
              </p>

              {images.length === 0 ? (
                <button
                  type="button"
                  onClick={
                    openNewImageDrawer
                  }
                  className="mt-4 cursor-pointer rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#F59AA3]"
                >
                  Add an image
                </button>
              ) : (
                <button
                  type="button"
                  onClick={
                    clearAllSearchAndFilters
                  }
                  className="mt-4 cursor-pointer rounded-lg border border-[#dbb082] px-4 py-2 text-sm font-semibold text-[#9b6d43] hover:bg-white"
                >
                  Clear search and filters
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Right-side upload/edit form */}
      {/* Mount a fresh form for each selected record, and unmount its contents on close. */}
      <AdminForm
        isOpen={drawerOpen}
        onClose={() => {
          if (
            !mutationInFlight.current &&
            !interactionLocked
          ) {
            closeDrawer();
          }
        }}
        mobileFullscreen
      >
        {drawerOpen && (
          <GalleryUploadForm
            key={
              editingImage?.id ??
              "new-image"
            }
            initialImage={editingImage}
            onCancel={() => {
              if (
                !mutationInFlight.current &&
                !interactionLocked
              ) {
                closeDrawer();
              }
            }}
            onSave={handleSave}
          />
        )}
      </AdminForm>

      {/* Selecting Delete opens this dialog before the image is deleted. */}
      {imagePendingDelete && (
        <DeleteImageDialog
          key={imagePendingDelete.id}
          image={imagePendingDelete}
          onCancel={cancelSingleDelete}
          onConfirm={confirmDelete}
        />
      )}

      {/* Keep this mounted after a partial failure so its error stays visible. */}
      {imagesPendingBulkDelete !== null && (
        <DeleteSelectedImagesDialog
          images={imagesPendingBulkDelete}
          onCancel={cancelBulkDelete}
          onConfirm={confirmBulkDelete}
        />
      )}
    </div>
  );
}