/**
 * Browser-only image preparation for the Admin Gallery.
 *
 * Keep pixel dimensions unchanged when compressing images
 * to fit Vercel's request-body limit. Never downscale images.
 *
 * Ordinary images below the limit remain unchanged. HEIC/HEIF
 * images are converted to JPEG first because the server does
 * not accept HEIC/HEIF directly.
 */

export const MAX_GALLERY_UPLOAD_BYTES = 4 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const WEBP_QUALITIES = [
  0.90,
  0.85,
  0.80,
  0.75,
  0.70,
  0.65,
  0.60,
];

function isHeicImage(file: File): boolean {
  return (
    ["image/heic", "image/heif"].includes(
      file.type.toLowerCase(),
    ) || /\.(heic|heif)$/i.test(file.name)
  );
}

async function convertHeicImage(file: File): Promise<File> {
  const { heicTo } = await import("heic-to");

  const converted = await heicTo({
    blob: file,
    type: "image/jpeg",
    quality: 0.90,
  });

  if (!converted || converted.size === 0) {
    throw new Error(
      "The HEIC/HEIF image could not be converted.",
    );
  }

  return new File(
    [converted],
    file.name.replace(/\.(heic|heif)$/i, "") + ".jpg",
    {
      type: "image/jpeg",
      lastModified: file.lastModified,
    },
  );
}

async function decodeImage(
  file: File,
): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = new window.Image();
    image.src = objectUrl;

    await image.decode();

    if (
      !Number.isFinite(image.naturalWidth) ||
      !Number.isFinite(image.naturalHeight) ||
      image.naturalWidth < 1 ||
      image.naturalHeight < 1
    ) {
      throw new Error("The image has invalid dimensions.");
    }

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function encodeWebp(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (
          !blob ||
          blob.size === 0 ||
          blob.type !== "image/webp"
        ) {
          reject(
            new Error(
              "This browser could not encode the image as WebP.",
            ),
          );
          return;
        }

        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

/**
 * Prepare a Gallery image without lowering its pixel resolution.
 *
 * JPEG, PNG and WebP images at or below 4 MiB are returned
 * unchanged. Larger images are encoded as WebP at the same
 * dimensions, using progressively lower quality settings.
 *
 * HEIC/HEIF files must first be converted to JPEG. The
 * HEIC decoder is responsible for its initial orientation
 * and conversion; subsequent compression does not resize it.
 *
 * If compression cannot meet the limit, reject the image
 * rather than changing its dimensions.
 */
export async function prepareGalleryImage(
  originalFile: File,
): Promise<File> {
  if (originalFile.size === 0) {
    throw new Error("The selected image must be nonempty.");
  }

  const file = isHeicImage(originalFile)
    ? await convertHeicImage(originalFile)
    : originalFile;

  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error(
      "Choose a JPG, PNG, WebP, HEIC, or HEIF image.",
    );
  }

  if (file.size <= MAX_GALLERY_UPLOAD_BYTES) {
    return file;
  }

  let image: HTMLImageElement;

  try {
    image = await decodeImage(file);
  } catch {
    throw new Error(
      "The image could not be decoded for compression.",
    );
  }

  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;

  const canvas = document.createElement("canvas");

  // Preserve the exact displayed pixel dimensions.
  canvas.width = originalWidth;
  canvas.height = originalHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "The browser could not prepare the image for compression.",
    );
  }

  // WebP supports transparency, unlike JPEG.
  context.drawImage(
    image,
    0,
    0,
    originalWidth,
    originalHeight,
  );

  for (const quality of WEBP_QUALITIES) {
    const blob = await encodeWebp(canvas, quality);

    if (blob.size <= MAX_GALLERY_UPLOAD_BYTES) {
      const filename = file.name.replace(
        /\.[^/.]+$/,
        "",
      ) + ".webp";

      return new File(
        [blob],
        filename,
        {
          type: "image/webp",
          lastModified: originalFile.lastModified,
        },
      );
    }
  }

  throw new Error(
    "This image could not be compressed below 4 MB without reducing its resolution. Please choose a smaller image or compress it manually.",
  );
}
