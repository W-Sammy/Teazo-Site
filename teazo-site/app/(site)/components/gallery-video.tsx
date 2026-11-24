"use client";

/**
 * Public Gallery video with delayed playback feedback.
 *
 * Avoid showing a loading indicator for videos that start
 * promptly. If autoplay is delayed or playback stalls, show
 * a nonblocking indicator after 1.5 seconds.
 *
 * The indicator clears when playback resumes. An actual
 * media error displays an unavailable message instead.
 */

import { useEffect, useRef, useState } from "react";

type GalleryVideoProps = {
  src: string;
  alt: string;
};

const LOADING_DELAY_MS = 1500;

export default function GalleryVideo({
  src,
  alt,
}: GalleryVideoProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // All initial-loading and buffering timers use one reference
  // so playback events can cancel whichever timer is active.
  const loadingTimer = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  function clearLoadingTimer() {
    if (loadingTimer.current !== null) {
      clearTimeout(loadingTimer.current);
      loadingTimer.current = null;
    }
  }

  function scheduleLoadingIndicator() {
    clearLoadingTimer();

    loadingTimer.current = setTimeout(() => {
      loadingTimer.current = null;
      setIsLoading(true);
    }, LOADING_DELAY_MS);
  }

  function handleLoadStart() {
    setHasError(false);
    setIsLoading(false);
    scheduleLoadingIndicator();
  }

  function handleWaiting() {
    if (!hasError) {
      scheduleLoadingIndicator();
    }
  }

  function handlePlaying() {
    // This now cancels the initial timer as well as
    // any timer scheduled by a playback stall.
    clearLoadingTimer();
    setIsLoading(false);
    setHasError(false);
  }

  function handleError() {
    clearLoadingTimer();
    setIsLoading(false);
    setHasError(true);
  }

  useEffect(() => {
    // Schedule initial feedback even if the browser has not
    // emitted loadstart yet (also supports jsdom tests).
    const timer = setTimeout(() => {
      loadingTimer.current = null;
      setIsLoading(true);
    }, LOADING_DELAY_MS);

    loadingTimer.current = timer;

    return () => {
      // Clean up whichever timer is currently pending,
      // including one scheduled by a buffering event.
      if (loadingTimer.current !== null) {
        clearTimeout(loadingTimer.current);
        loadingTimer.current = null;
      }
    };
  }, [src]);

  return (
    <div className="absolute inset-0">
      <video
        src={src}
        aria-label={alt}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onPlaying={handlePlaying}
        onWaiting={handleWaiting}
        onLoadStart={handleLoadStart}
        onError={handleError}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {hasError ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 px-4 text-center text-sm font-medium text-white"
        >
          Video unavailable
        </div>
      ) : isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/25 px-4 text-center text-sm font-medium text-white"
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/40 border-t-white motion-reduce:animate-none"
          />
          <span>Loading video...</span>
        </div>
      ) : null}
    </div>
  );
}
