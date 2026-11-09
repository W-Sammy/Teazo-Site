/**
 * Gallery images: storing, listing, editing and removing them.
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
  replaceGalleryImageMedia,
  updateGalleryImageMetadata,
  type GalleryImageRecord,
} from "@/app/lib/queries/gallery";
import type { AdminGalleryImage, GalleryMediaType, } from "@/app/types/gallery-image";
import type { MediaType } from "@/app/lib/media";

/** Upload types the admin can send. Every image is stored as WebP. */
const IMAGE_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VIDEO_UPLOAD_TYPES = new Set([
  "video/mp4",
  "video/webm",
]);

const MAX_NAME_LENGTH = 120;

/** Matches the admin gallery form. */
const MAX_TAG_LENGTH = 30;

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
  const name =
    typeof value === "string"
      ? value.trim().replace(/\s+/g, " ")
      : "";

  if (!name) {
    throw new GalleryInputError("Give the item a name.");
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw new GalleryInputError(
      `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`,
    );
  }

  return name;
}

function cleanTags(values: unknown): string[] {
  if (!Array.isArray(values)) {
    throw new GalleryInputError("Tags must be a list.");
  }

  const tags = new Map<string, string>();

  for (const value of values) {
    if (typeof value !== "string") {
      throw new GalleryInputError("Each tag must be text.");
    }

    const tag = value.trim().replace(/\s+/g, " ");

    if (!tag) continue;

    if (tag.length > MAX_TAG_LENGTH) {
      throw new GalleryInputError(
        `Keep each tag to ${MAX_TAG_LENGTH} characters or fewer.`,
      );
    }

    // "Milk Tea" and "milk  tea" are the same tag. The first spelling wins.
    if (!tags.has(normalizeTag(tag))) {
      tags.set(normalizeTag(tag), tag);
    }
  }

  if (tags.size > MAX_GALLERY_TAGS) {
    throw new GalleryInputError(
      `You can add up to ${MAX_GALLERY_TAGS} tags.`,
    );
  }

  return [...tags.values()];
}

function toAdminImage(
  image: GalleryImageRecord,
): AdminGalleryImage {
  return {
    id: image.id,
    name: image.name,
    url: toPublicUrl(image.r2Key),
    tags: image.tags,
    createdAt: image.createdAt,
     mediaType: image.mimeType.startsWith("video/")
      ? "video"
      : "image",
  };
}

// Re-encoding to WebP at most 2000px on its longest side is what keeps the
// free storage from filling up. rotate() applies the phone's orientation.
async function toWebp(file: File) {
  try {
    return await sharp(
      Buffer.from(await file.arrayBuffer()),
    )
      .rotate()
      .resize({
        width: MAX_SIDE,
        height: MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new GalleryInputError(
      "That file couldn't be read as an image.",
      415,
    );
  }
}


type PreparedGalleryMedia = {
  data: Uint8Array;
  mimeType: MediaType;
  extension: string;
  width: number | null;
  height: number | null;
  mediaType: GalleryMediaType;
};

async function prepareGalleryMedia(
  file: File,
): Promise<PreparedGalleryMedia> {
  if (file.size === 0) {
    throw new GalleryInputError(
      "Choose a file to upload.",
    );
  }

  if (file.size > MAX_MEDIA_BYTES) {
    throw new GalleryInputError(
      "The file is over 10 MB.",
      413,
    );
  }

  if (IMAGE_UPLOAD_TYPES.has(file.type)) {
    const resized = await toWebp(file);

    return {
      data: resized.data,
      mimeType: "image/webp",
      extension: "webp",
      width: resized.info.width,
      height: resized.info.height,
      mediaType: "image",
    };
  }

  if (VIDEO_UPLOAD_TYPES.has(file.type)) {
    const mimeType = file.type as
      | "video/mp4"
      | "video/webm";

    return {
      data: new Uint8Array(await file.arrayBuffer()),
      mimeType,
      extension: mimeType === "video/mp4" ? "mp4" : "webm",
      width: null,
      height: null,
      mediaType: "video",
    };
  }

  throw new GalleryInputError(
    "Upload a JPEG, PNG, WebP, MP4 or WebM file.",
    415,
  );
}


/** Every live image, as the admin gallery lists them. */
export async function getAdminGalleryImages(): Promise<
  AdminGalleryImage[]
> {
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
  throw new GalleryInputError(
    "Choose an image or video to upload.",
  );
}

const prepared = await prepareGalleryMedia(file);

// Validate URL configuration before uploading.
const key = mintKey("gallery", prepared.extension);
const url = toPublicUrl(key);

const stored = await putMedia(
  key,
  prepared.data,
  prepared.mimeType,
);


  const imageId = crypto.randomUUID();

  try {
    await recordGalleryImage({
      imageId,
      mediaId: crypto.randomUUID(),
      stored,
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      originalFilename: file.name,
      name,
      tags,
      adminId: input.adminId,
    });
  } catch (error) {
    // The database refused the rows, so nothing points at the file: remove it
    // now, or it counts toward the storage cap forever. With no status the
    // outcome is unknown, so leave it rather than risk rows with no file.
    if (
      error instanceof D1Error &&
      error.status !== undefined &&
      error.status < 500
    ) {
      await deleteMediaNow(stored.key).catch((cleanup) => {
        console.error(
          "Could not remove a gallery file the database refused:",
          stored.key,
          cleanup,
        );
      });
    }

    throw error;
  }

  // Answer with what was stored, as the list shows it: a tag that already
  // existed keeps its first spelling, and tags come back sorted. The image is
  // saved either way, so a failed read must not look like a failed upload.
  try {
    const image = await getGalleryImage(imageId);

    if (image) {
      return toAdminImage(image);
    }
  } catch (error) {
    console.warn(
      "Saved a gallery image but could not read it back:",
      imageId,
      error,
    );
  }

  return {
    id: imageId,
    name,
    url,
    tags,
    createdAt: new Date().toISOString(),
    mediaType: prepared.mediaType,
  };
}

/**
 * Persist name and tag edits without changing the stored image file.
 * Call only after requireAdminApi(request, 2).
 */
export async function editGalleryImageMetadata(input: {
  id: string;
  name: unknown;
  tags: unknown;
}): Promise<AdminGalleryImage> {
  const id = input.id.trim();

  if (!id) {
    throw new GalleryInputError(
      "An image ID is required.",
    );
  }

  const name = cleanName(input.name);
  const tags = cleanTags(input.tags);
  const existingImage = await getGalleryImage(id);

  if (!existingImage) {
    throw new GalleryInputError(
      "The gallery image was not found.",
      404,
    );
  }

  // Validate URL configuration before changing database records.
  toPublicUrl(existingImage.r2Key);

  const updatedImage = await updateGalleryImageMetadata({
    id,
    name,
    tags,
  });

  // The image could have been deleted after the initial read. The query
  // guards its writes again inside the transaction and returns null then.
  if (!updatedImage) {
    throw new GalleryInputError(
      "The gallery image was not found.",
      404,
    );
  }

  return toAdminImage(updatedImage);
}

/** Replace an existing gallery image file, preserving its image ID and metadata. */

export async function replaceGalleryImage(input: {
  id: string;
  file: unknown;
  name: unknown;
  tags: unknown;
  adminId: string;
}): Promise<AdminGalleryImage> {
  const id = input.id.trim();

  if (!id) {
    throw new GalleryInputError(
      "A gallery item ID is required.",
    );
  }

  const name = cleanName(input.name);
  const tags = cleanTags(input.tags);
  const file = input.file;

  if (!(file instanceof File) || file.size === 0) {
    throw new GalleryInputError(
      "Choose a replacement image or video.",
    );
  }

  const original = await getGalleryImage(id);

  if (!original) {
    throw new GalleryInputError(
      "The gallery item was not found.",
      404,
    );
  }

  // Process images with Sharp; keep videos in their original format.
  const prepared = await prepareGalleryMedia(file);

  const key = mintKey("gallery", prepared.extension);

  // Fail before uploading if the public URL is not configured.
  toPublicUrl(key);

  const stored = await putMedia(
    key,
    prepared.data,
    prepared.mimeType,
  );

  let saved: GalleryImageRecord | null;

  try {
    saved = await replaceGalleryImageMedia({
      id,
      expectedMediaId: original.mediaId,
      newMediaId: crypto.randomUUID(),
      stored,
      mimeType: prepared.mimeType,
      width: prepared.width,
      height: prepared.height,
      originalFilename: file.name,
      adminId: input.adminId,
      name,
      tags,
    });
  } catch (error) {
    // Remove files only when the database definitely rejected the update.
    if (
      error instanceof D1Error &&
      error.status !== undefined &&
      error.status < 500
    ) {
      await deleteMediaNow(stored.key).catch((cleanup) =>
        console.error(
          "Could not clean up rejected replacement:",
          stored.key,
          cleanup,
        ),
      );
    }

    throw error;
  }

  if (!saved) {
    // Another edit or deletion won the race.
    await deleteMediaNow(stored.key).catch((cleanup) =>
      console.error(
        "Could not clean up stale replacement:",
        stored.key,
        cleanup,
      ),
    );

    throw new GalleryInputError(
      "This gallery item changed while you were editing. Refresh the gallery and try again.",
      409,
    );
  }

  return toAdminImage(saved);
}


/**
 * Remove an image from the gallery. Its file is deleted 24 hours later.
 * Returns false when there is no such image. Call only after
 * requireAdminApi(request, 2).
 */
export async function removeGalleryImage(
  id: string,
): Promise<boolean> {
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
export async function getPublicGalleryImages(): Promise<
  PublicGalleryImage[] | null
> {
  try {
    return (await listPublishedGalleryImages()).map(
      (image) => ({
        id: image.id,
        url: toPublicUrl(image.r2Key),
        alt: image.alt || image.name,
        caption: image.caption || image.name,
      }),
    );
  } catch (error) {
    // Let Next.js's "render this page on every request" signal through.
    unstable_rethrow(error);

    if (!warnedAboutGallery) {
      warnedAboutGallery = true;

      console.warn(
        "Could not load gallery images, showing the placeholders:",
        error,
      );
    }

    return null;
  }
}