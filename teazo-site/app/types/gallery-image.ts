export type GalleryMediaType = "image" | "video";

export type AdminGalleryImage = {
  id: string;
  name: string;
  url: string;
  tags: string[];
  createdAt: string;
  mediaType?: GalleryMediaType;
};

export type GallerySortOption =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc";

export type GalleryViewMode = "grid" | "list";