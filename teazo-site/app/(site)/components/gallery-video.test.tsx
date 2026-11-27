/**
 * Public Gallery delayed video-loading regression tests.
 *
 * Verify that a spinner only appears after a delay,
 * disappears when playback starts, reappears for stalls,
 * and is replaced with an error message on failure.
 *
 * Media events and timers are simulated in jsdom.
 * No real media or network requests are involved.
 */

// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import GalleryVideo from "./gallery-video";

describe("Public Gallery video playback feedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function renderVideo() {
    return render(
      <GalleryVideo
        src="/test-video.mp4"
        alt="Gallery test video"
      />,
    );
  }

  it("renders the video with existing autoplay settings", () => {
    const { container } = renderVideo();

    const video = container.querySelector("video");

    expect(video).not.toBeNull();
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.preload).toBe("metadata");
  });

  it("does not immediately display a loading indicator", () => {
    renderVideo();

    expect(
      screen.queryByText("Loading video..."),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1499);
    });

    expect(
      screen.queryByText("Loading video..."),
    ).toBeNull();
  });

  it("shows the indicator after 1.5 seconds", () => {
    renderVideo();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      screen.getByText("Loading video..."),
    ).toBeTruthy();
  });

  it("does not show the indicator if playback starts quickly", () => {
    const { container } = renderVideo();

    fireEvent.playing(
      container.querySelector("video")!,
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      screen.queryByText("Loading video..."),
    ).toBeNull();
  });

  it("hides a visible indicator when playback begins", () => {
    const { container } = renderVideo();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      screen.getByText("Loading video..."),
    ).toBeTruthy();

    fireEvent.playing(
      container.querySelector("video")!,
    );

    expect(
      screen.queryByText("Loading video..."),
    ).toBeNull();
  });

  it("shows the indicator after delayed playback stalls", () => {
    const { container } = renderVideo();
    const video = container.querySelector("video")!;

    fireEvent.playing(video);
    fireEvent.waiting(video);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      screen.getByText("Loading video..."),
    ).toBeTruthy();

    fireEvent.playing(video);

    expect(
      screen.queryByText("Loading video..."),
    ).toBeNull();
  });

  it("shows an unavailable message after a media error", () => {
    const { container } = renderVideo();

    fireEvent.error(
      container.querySelector("video")!,
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(
      screen.getByText("Video unavailable"),
    ).toBeTruthy();

    expect(
      screen.queryByText("Loading video..."),
    ).toBeNull();
  });
});
