/**
 * Gallery images: storing, listing and removing them.
 *
 * The public gallery page calls getPublicGalleryImages(), and the rest are for
 * the admin gallery's routes. The SQL is in queries/gallery.ts and file storage
 * in media.ts. See docs/DEV-GUIDE.md sections 4.1 and 4.2.
 *
 * SERVER ONLY.
 */
import "server-only";
import sharp from "sharp";
import { unstable_rethrow } from "next/navigation";
import { D1Error } from "@/app/lib/d1";
import {
  deleteMediaNow,
  MAX_MEDIA_BYTES,
  mintKey,
  putMedia,
  toPublicUrl,
} from "@/app/lib/media";
import {
  deleteGalleryImage,
  getGalleryImage,
  listGalleryImages,
  listPublishedGalleryImages,
  MAX_GALLERY_TAGS,
  normalizeTag,
  recordGalleryImage,
  type GalleryImageRecord,
} from "@/app/lib/queries/gallery";
import type { AdminGalleryImage } from "@/app/types/gallery-image";

/** Upload types the admin can send. Every image is stored as WebP. */
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_NAME_LENGTH = 120;
const MAX_TAG_LENGTH = 40;
/** Longest side after resizing. A phone photo comes out at a few hundred KB. */
const MAX_SIDE = 2000;

/** Input the admin should correct. `status` is the HTTP status to answer with. */
export class GalleryInputError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GalleryInputError";
    this.status = status;
  }
}

function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new GalleryInputError("Give the image a name.");
  if (name.length > MAX_NAME_LENGTH) {
    throw new GalleryInputError(`Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  return name;
}

function cleanTags(values: unknown): string[] {
  if (!Array.isArray(values)) throw new GalleryInputError("Tags must be a list.");
  const tags = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string") throw new GalleryInputError("Each tag must be text.");
    const tag = value.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw new GalleryInputError(`Keep each tag to ${MAX_TAG_LENGTH} characters or fewer.`);
    }
    // "Milk Tea" and "milk  tea" are the same tag. The first spelling wins.
    if (!tags.has(normalizeTag(tag))) tags.set(normalizeTag(tag), tag);
  }
  if (tags.size > MAX_GALLERY_TAGS) {
    throw new GalleryInputError(`You can add up to ${MAX_GALLERY_TAGS} tags.`);
  }
  return [...tags.values()];
}

function toAdminImage(image: GalleryImageRecord): AdminGalleryImage {
  return {
    id: image.id,
    name: image.name,
    url: toPublicUrl(image.r2Key),
    tags: image.tags,
    createdAt: image.createdAt,
  };
}

// Re-encoding to WebP at most 2000px on its longest side is what keeps the
// free storage from filling up. rotate() applies the phone's orientation.
async function toWebp(file: File) {
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new GalleryInputError("That file couldn't be read as an image.", 415);
  }
}

/** Every live image, as the admin gallery lists them. */
export async function getAdminGalleryImages(): Promise<AdminGalleryImage[]> {
  return (await listGalleryImages()).map(toAdminImage);
}

/**
 * Resize, store and record a new gallery image. Call only after
 * requireAdminApi(request, 2). Throws GalleryInputError for input to fix,
 * MediaError when storing fails (507, 429 and 503 are refusals to explain to
 * the admin), and D1Error when the database fails.
 */
export async function saveGalleryImage(input: {
  file: unknown;
  name: unknown;
  tags: unknown;
  adminId: string;
}): Promise<AdminGalleryImage> {
  const name = cleanName(input.name);
  const tags = cleanTags(input.tags);
  const file = input.file;
  if (!(file instanceof File) || file.size === 0) {
    throw new GalleryInputError("Choose an image to upload.");
  }
  if (!UPLOAD_TYPES.has(file.type)) {
    throw new GalleryInputError("Upload a JPEG, PNG or WebP image.", 415);
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new GalleryInputError("The image is over 10 MB.", 413);
  }

  const resized = await toWebp(file);

  // Build the URL before storing anything, so missing configuration fails
  // before any bytes or rows are written.
  const key = mintKey("gallery", "webp");
  const url = toPublicUrl(key);

  // Store the bytes first, so a failure never leaves rows pointing at nothing.
  const stored = await putMedia(key, resized.data, "image/webp");

  const imageId = crypto.randomUUID();
  try {
    await recordGalleryImage({
      imageId,
      mediaId: crypto.randomUUID(),
      stored,
      mimeType: "image/webp",
      width: resized.info.width,
      height: resized.info.height,
      originalFilename: file.name,
      name,
      tags,
      adminId: input.adminId,
    });
  } catch (error) {
    // The database refused the rows, so nothing points at the file: remove it
    // now, or it counts toward the storage cap forever. With no status the
    // outcome is unknown, so leave it rather than risk rows with no file.
    if (error instanceof D1Error && error.status !== undefined && error.status < 500) {
      await deleteMediaNow(stored.key).catch((cleanup) => {
        console.error("Could not remove a gallery file the database refused:", stored.key, cleanup);
      });
    }
    throw error;
  }

  // Answer with what was stored, as the list shows it: a tag that already
  // existed keeps its first spelling, and tags come back sorted. The image is
  // saved either way, so a failed read must not look like a failed upload.
  try {
    const image = await getGalleryImage(imageId);
    if (image) return toAdminImage(image);
  } catch (error) {
    console.warn("Saved a gallery image but could not read it back:", imageId, error);
  }
  return { id: imageId, name, url, tags, createdAt: new Date().toISOString() };
}

/**
 * Remove an image from the gallery. Its file is deleted 24 hours later.
 * Returns false when there is no such image. Call only after
 * requireAdminApi(request, 2).
 */
export async function removeGalleryImage(id: string): Promise<boolean> {
  return deleteGalleryImage(id);
}

/** What the public gallery grid shows for one image. */
export type PublicGalleryImage = {
  id: string;
  url: string;
  alt: string;
  caption?: string;
};

let warnedAboutGallery = false;

/**
 * Published images for the public gallery, or null when they can't be read,
 * for example on a machine without the Worker running. The page then shows
 * its placeholder images instead of failing.
 */
export async function getPublicGalleryImages(): Promise<PublicGalleryImage[] | null> {
  try {
    return (await listPublishedGalleryImages()).map((image) => ({
      id: image.id,
      url: toPublicUrl(image.r2Key),
      alt: image.alt || image.name,
      caption: image.caption || image.name,
    }));
  } catch (error) {
    // Let Next.js's "render this page on every request" signal through.
    unstable_rethrow(error);
    if (!warnedAboutGallery) {
      warnedAboutGallery = true;
      console.warn("Could not load gallery images, showing the placeholders:", error);
    }
    return null;
  }
}
