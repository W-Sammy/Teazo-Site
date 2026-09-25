export type StorageService = "D1" | "R2";

export type StorageUsage = {
  service: StorageService;
  currentBytes: number;
  maxBytes: number;
};
