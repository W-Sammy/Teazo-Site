// Browser-only image preparation helpers. Call these from client components.

export const defaultMaxImageSize = 10 * 1024 * 1024;

const heicImageTypes = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export function isHeicImage(file: File): boolean {
  return heicImageTypes.has(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

export function isWebpImage(file: File): boolean {
  return file.type.toLowerCase() === "image/webp" || /\.webp$/i.test(file.name);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = new window.Image();
    image.src = sourceUrl;
    await image.decode();

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("The image has no dimensions.");
    }

    return image;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function fileExtensionForType(type: string): string {
  if (type === "image/webp") return ".webp";
  return type === "image/png" ? ".png" : ".jpg";
}

async function canvasToFile(
  image: HTMLImageElement,
  type: "image/jpeg" | "image/png" | "image/webp",
  name: string,
  width: number,
  height: number,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The browser could not create an image canvas.");
  }

  // JPEG has no transparency, so use white instead of a black default.
  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.85),
  );

  if (!blob || blob.size === 0) {
    throw new Error("The converted image was empty.");
  }

  return new File(
    [blob],
    name.replace(/\.(jpe?g|png|webp|heic|heif)$/i, "") + fileExtensionForType(type),
    { type, lastModified: Date.now() },
  );
}

/** Convert a WebP file to a Square-compatible JPEG in the browser. */
export async function convertWebpToJpeg(file: File, maxFileSize = defaultMaxImageSize): Promise<File> {
  const image = await loadImage(file);
  const converted = await canvasToFile(image, "image/jpeg", file.name, image.naturalWidth, image.naturalHeight);
  return converted.size <= maxFileSize ? converted : resizeImageToMaxFileSize(converted, maxFileSize);
}

/** Convert a HEIC/HEIF file to a Square-compatible JPEG in the browser. */
export async function convertHeicToJpeg(file: File, maxFileSize = defaultMaxImageSize): Promise<File> {
  const { heicTo } = await import("heic-to");
  const jpegBlob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.85 });

  if (!jpegBlob || jpegBlob.size === 0) {
    throw new Error("The converted image was empty.");
  }

  const converted = new File(
    [jpegBlob],
    file.name.replace(/\.(heic|heif)$/i, "") + ".jpg",
    { type: "image/jpeg", lastModified: file.lastModified },
  );

  return converted.size <= maxFileSize ? converted : resizeImageToMaxFileSize(converted, maxFileSize);
}

/** Reduce resolution while preserving JPEG or PNG format and transparency. */
export async function resizeImageToMaxFileSize(file: File, maxFileSize = defaultMaxImageSize): Promise<File> {
  if (file.size <= maxFileSize) return file;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Only JPEG, PNG, and WebP images can be resized in place.");
  }

  const image = await loadImage(file);
  const type = file.type as "image/jpeg" | "image/png" | "image/webp";
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  let resized = file;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    width *= 0.8;
    height *= 0.8;
    resized = await canvasToFile(image, type, file.name, width, height);

    if (resized.size <= maxFileSize) return resized;
  }

  throw new Error("The image could not be reduced below the file size limit.");
}

/** Prepare an image for Event/Gallery storage while preserving WebP files. */
export async function prepareImageForStorage(
  file: File,
  maxFileSize = defaultMaxImageSize,
): Promise<File> {
  if (isHeicImage(file)) return convertHeicToJpeg(file, maxFileSize);

  if (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp"
  ) {
    return resizeImageToMaxFileSize(file, maxFileSize);
  }

  return file;
}

/** Prepare an upload for Square while preserving JPEG and PNG formats. */
export async function prepareImageForUpload(file: File, maxFileSize = defaultMaxImageSize): Promise<File> {
  if (isHeicImage(file)) return convertHeicToJpeg(file, maxFileSize);
  if (isWebpImage(file)) return convertWebpToJpeg(file, maxFileSize);
  if (file.type === "image/jpeg" || file.type === "image/png") {
    return resizeImageToMaxFileSize(file, maxFileSize);
  }
  return file;
}
