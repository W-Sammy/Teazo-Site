// Browser-only image conversion helpers. Call these from client components.

const defaultMaxFileSize = 10 * 1024 * 1024;

export function isWebpImage(file: File): boolean {
  return (
    file.type.toLowerCase() === "image/webp" ||
    /\.webp$/i.test(file.name)
  );
}

/** Convert a WebP file to a Square-compatible JPEG in the browser. */
export async function convertWebpToJpeg(
  file: File,
  maxFileSize = defaultMaxFileSize,
): Promise<File> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = new window.Image();
    image.src = sourceUrl;
    await image.decode();

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("The WebP image has no dimensions.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The browser could not create an image canvas.");
    }

    // JPEG has no transparency, so use white instead of a black default.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );

    if (!jpegBlob || jpegBlob.size === 0) {
      throw new Error("The converted image was empty.");
    }

    if (jpegBlob.size > maxFileSize) {
      throw new Error("The converted image exceeds the file size limit.");
    }

    return new File(
      [jpegBlob],
      file.name.replace(/\.webp$/i, "") + ".jpg",
      {
        type: "image/jpeg",
        lastModified: file.lastModified,
      },
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
