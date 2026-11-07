"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImageProps = {
  src: string;
  alt: string;
  sizes: string;
  loading?: "eager" | "lazy";
  className?: string;
  mediaType?: "image" | "video";
};

export default function GalleryImage({
  src,
  alt,
  sizes,
  loading = "lazy",
  className = "object-cover",
  mediaType = "image",
}: GalleryImageProps) {
  const [failed, setFailed] = useState(false);

  if (mediaType === "video") {
  return (
    <video
      src={src}
      controls
      preload="metadata"
      playsInline
      className={`h-full w-full ${className}`}
      aria-label={alt || "Gallery video"}
    >
      Your browser does not support video playback.
    </video>
  );
}

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