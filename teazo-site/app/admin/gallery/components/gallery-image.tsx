"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImageProps = {
  src: string;
  alt: string;
  sizes: string;
  loading?: "eager" | "lazy";
  className?: string;
};

export default function GalleryImage({
  src,
  alt,
  sizes,
  loading = "lazy",
  className = "object-cover",
}: GalleryImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-gray-100 px-3 text-center text-xs text-gray-500"
        role="img"
        aria-label={`${alt || "Gallery image"} could not be loaded`}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      loading={loading}
      unoptimized={src.startsWith("blob:")}
      className={className}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}