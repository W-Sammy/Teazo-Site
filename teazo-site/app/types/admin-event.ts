export type AdminEvent = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  startAt: string;
  endAt: string;
  appliesToAll: boolean;
  categoryIds: string[];
  itemIds: string[];
};

export type EventFormValues = Omit<AdminEvent, "id" | "imageUrl"> & {
  imageFile: File | null;
};

export type EventCatalogItem = {
  id: string;
  name: string;
  categoryIds: string[];
};

export type EventCategory = {
  id: string;
  name: string;
};

export type EventSortOption =
  | "name-asc"
  | "name-desc"
  | "start-asc"
  | "start-desc";

export type EventStatus = "upcoming" | "active" | "ended";

export type EventViewMode = "grid" | "list";
