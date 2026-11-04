/**
 * Cache tag for the Square catalog the public menu loads. The Square catalog
 * webhook clears it, and the menu also refreshes it every 60 seconds in case
 * a webhook is missed.
 */
export const SQUARE_CATALOG_TAG = "square-catalog";

/** Cache tag for the images the public gallery shows. Every admin gallery save clears it. */
export const GALLERY_TAG = "gallery";
