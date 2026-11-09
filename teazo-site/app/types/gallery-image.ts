export type AdminGalleryImage = {
  id: string;
  name: string;
  url: string;
  tags: string[];
  createdAt: string;
};

export type GallerySortOption =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc";

export type GalleryViewMode = "grid" | "list";