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
      <div
        className="relative h-full w-full overflow-hidden bg-[#f3ece6]"
        role="img"
        aria-label={
          failed
            ? `${alt || "Gallery video"}: video preview unavailable`
            : `${alt || "Gallery video"}: video thumbnail`
        }
      >
        {!failed && (
          <video
            key={src}
            src={src}
            muted
            preload="metadata"
            playsInline
            tabIndex={-1}
            aria-hidden="true"
            className={`pointer-events-none h-full w-full ${className}`}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;

              // decode initial frame for thumbnail
              if (Number.isFinite(video.duration) && video.duration > 0) {
                try {
                  video.currentTime = Math.min(0.1, video.duration / 2);
                } catch {
                  // keep initial frame if browser can't seek yet
                }
              }
            }}
            onError={() => setFailed(true)}
          />
        )}

        {/* video marker sized for both list & grid thumbnails */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="flex aspect-square w-[45%] max-w-12 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-1/2 w-1/2"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>
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