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
import GalleryUploadForm, {
  type GalleryUploadValues,
} from "./gallery-upload-form";

type AdminGalleryClientProps = {
  initialImages: AdminGalleryImage[];
};

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

function createImageId() {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `gallery-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export default function AdminGalleryClient({
  initialImages,
}: AdminGalleryClientProps) {
  const [images, setImages] =
    useState<AdminGalleryImage[]>(initialImages);

  const [search, setSearch] = useState("");

  const [selectedTags, setSelectedTags] =
    useState<string[]>([]);

  const [sortBy, setSortBy] =
    useState<GallerySortOption>("name-asc");

  const [viewMode, setViewMode] =
    useState<GalleryViewMode>("grid");

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

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [editingImage, setEditingImage] =
    useState<AdminGalleryImage | null>(null);

  const [
    imagePendingDelete,
    setImagePendingDelete,
  ] = useState<AdminGalleryImage | null>(null);

  const managedObjectUrls =
    useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = managedObjectUrls.current;

    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });

      urls.clear();
    };
  }, []);

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

  function toggleTag(tagName: string) {
    setSelectedTags((currentTags) =>
      currentTags.includes(tagName)
        ? currentTags.filter(
            (tag: string) => tag !== tagName,
          )
        : [...currentTags, tagName],
    );
  }

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

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingImage(null);
  }

  function openNewImageDrawer() {
    setEditingImage(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(
    image: AdminGalleryImage,
  ) {
    setEditingImage(image);
    setDrawerOpen(true);
  }

  function createManagedObjectUrl(file: File) {
    const url = URL.createObjectURL(file);

    managedObjectUrls.current.add(url);

    return url;
  }

  function revokeManagedObjectUrl(
    url: string,
  ) {
    if (!managedObjectUrls.current.has(url)) {
      return;
    }

    URL.revokeObjectURL(url);
    managedObjectUrls.current.delete(url);
  }

  function handleSave(
    values: GalleryUploadValues,
  ) {
    let nextImages: AdminGalleryImage[];

    if (editingImage) {
      const nextUrl = values.file
        ? createManagedObjectUrl(values.file)
        : editingImage.url;

      nextImages = images.map((image) =>
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
        revokeManagedObjectUrl(
          editingImage.url,
        );
      }
    } else {
      if (!values.file) {
        return;
      }

      const newImage: AdminGalleryImage = {
        id: createImageId(),
        name: values.name,
        tags: values.tags,
        url: createManagedObjectUrl(
          values.file,
        ),
        createdAt: new Date().toISOString(),
      };

      nextImages = [newImage, ...images];
    }

    setImages(nextImages);
    keepAvailableSelectedTags(nextImages);
    closeDrawer();
  }

  function confirmDelete() {
    if (!imagePendingDelete) {
      return;
    }

    const nextImages = images.filter(
      (image) =>
        image.id !== imagePendingDelete.id,
    );

    revokeManagedObjectUrl(
      imagePendingDelete.url,
    );

    setImages(nextImages);
    keepAvailableSelectedTags(nextImages);

    if (
      editingImage?.id ===
      imagePendingDelete.id
    ) {
      closeDrawer();
    }

    setImagePendingDelete(null);
  }

  function clearTagFilters() {
    setSelectedTags([]);
  }

  function clearAllSearchAndFilters() {
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
                  onChange={(
                    event: ChangeEvent<HTMLInputElement>,
                  ) => setSearch(event.target.value)}
                  placeholder="Search photos"
                  aria-label="Search photos"
                  className="min-w-0 flex-1 rounded bg-gray-200 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-[#FFBDC7]/50"
                />
              </div>

              <AdminViewToggle
                value={viewMode}
                options={galleryViewOptions}
                onChange={(nextView) =>
                  setViewMode(nextView)
                }
                ariaLabel="Gallery view"
                className="max-w-full self-start lg:self-auto"
              />
            </div>

            <button
              type="button"
              onClick={openNewImageDrawer}
              className="inline-flex w-full shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg bg-[#FFBDC7] px-4 py-2 text-sm font-bold text-white hover:bg-[#F59AA3] sm:w-auto sm:self-end lg:ml-4 lg:self-auto"
            >
              New Image +
            </button>
          </div>
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
                onDelete={
                  setImagePendingDelete
                }
              />
            ) : (
              <AdminGalleryList
                images={filteredImages}
                onEdit={openEditDrawer}
                onDelete={
                  setImagePendingDelete
                }
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
                  ? "Use the New Image button to add the first temporary gallery image."
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
      <AdminForm
        isOpen={drawerOpen}
        onClose={closeDrawer}
      >
        {drawerOpen && (
          <GalleryUploadForm
            key={
              editingImage?.id ??
              "new-image"
            }
            initialImage={editingImage}
            onCancel={closeDrawer}
            onSave={handleSave}
          />
        )}
      </AdminForm>

      <DeleteImageDialog
        image={imagePendingDelete}
        onCancel={() =>
          setImagePendingDelete(null)
        }
        onConfirm={confirmDelete}
      />
    </div>
  );
}