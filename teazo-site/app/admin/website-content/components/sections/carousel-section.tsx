"use client";

import { AccordionItem } from "../section-shell";
import { fieldClass, ErrorText } from "../field-controls";
export type { CarouselImage } from "@/app/types/website-content";
import { IconCarousel } from "../icons";
import type { useWebsiteContent } from "../../handlers/use-website-content";
type CarouselEditor = ReturnType<typeof useWebsiteContent>["carousel"];

export default function CarouselSection({
    carousel,
    isOpen,
    onToggle,
    setRef,
}: {
    carousel: CarouselEditor;
    isOpen: boolean;
    onToggle: () => void;
    setRef: (el: HTMLDivElement | null) => void;
}) {
    const {
        carouselImages,
        carouselReady,
        carouselLoadError,
        retryLoading,
        carouselHasError,
        carouselSaveErrors,
        flushAllCarouselSettings,
        addCarouselImage,
        updateCarouselImage,
        handleImageFile,
        handleRemoveImage,
        uploading,
        deleting,
        imageErrors,
    } = carousel;

    // carousel section.
    return (
        // expands/collapses
        <AccordionItem
            id="carousel"
            label="Image Carousel"
            icon={<IconCarousel />}
            isOpen={isOpen}
            onToggle={onToggle}
            setRef={setRef}
        >
            {/* error messages with retry button */}
            {/* error loading imgs */}
            {carouselLoadError && (
                <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    <p>
                        {carouselLoadError}
                    </p>

                    <button
                        type="button"
                        onClick={retryLoading}
                        className="mt-2 cursor-pointer underline"
                    >
                        Retry loading images
                    </button>
                </div>
            )}

            {/* error saving changes */}
            {carouselHasError && (
                <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    <p>
                        {Object.values(carouselSaveErrors).find(Boolean) || "Couldn't save carousel changes."}
                    </p>

                    <button type="button" onClick={flushAllCarouselSettings} className="mt-2 cursor-pointer underline">
                        Retry saving carousel changes
                    </button>
                </div>
            )}

            {/* desc for carousel */}
            <p className="mb-1 text-xs text-gray-400">
                Images shown in the landing page carousel. Turn an image off to hide it.
            </p>

            {/* explain how to start when there's no items */}
            {carouselImages.length === 0 && (
                <p className="py-4 text-sm text-[#a99584]">
                    No carousel images yet. Add an image to get started!
                </p>
            )}

            {/* preview of img & controls for each item in carousel via rows */}
            <div className="flex min-w-0 flex-col divide-y divide-[#f3ece4]">
                {carouselImages.map((image, index) => (
                    <div
                        key={image.id}
                        className="flex min-w-0 flex-col gap-3 py-3.5 first:pt-3 last:pb-0"
                    >
                        {/* image num/placement in carousel */}
                        <div className="flex min-w-0 items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-[#4a3418]">
                                Image {index + 1}
                            </span>

                            {/* disable visibility & removal during upload/removal */}
                            <div className="flex shrink-0 items-center gap-2 lg:gap-4">
                                {/* handles visibility (aka hiding an item from img carousel on landing pg) */}
                                <button
                                    type="button"
                                    role="switch"
                                    disabled={!carouselReady || uploading[image.id] || deleting[image.id]}
                                    aria-checked={image.enabled}
                                    aria-label={`Show image ${index + 1} in the carousel`}
                                    onClick={() =>
                                        updateCarouselImage(image.id, { enabled: !image.enabled })
                                    }
                                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg lg:h-[18px] lg:w-8"
                                >
                                    <span
                                        className={`relative block h-[18px] w-8 rounded-full transition-colors ${
                                            image.enabled ? "bg-[#6f8f6a]" : "bg-[#dbb082]"
                                        }`}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                                                image.enabled ? "left-4" : "left-0.5"
                                            }`}
                                        />
                                    </span>
                                </button>

                                {/* remove item once deletion is confirmed */}
                                <button
                                    type="button"
                                    aria-label={`Remove carousel image ${index + 1}`}
                                    disabled={!carouselReady || uploading[image.id] || deleting[image.id]}
                                    onClick={() => { void handleRemoveImage(image.id); }}
                                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#c0553f] transition-colors hover:bg-[#f3d9d2] lg:h-5 lg:w-5"
                                >
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 20 20"
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                    >
                                        <path d="M5 5l10 10M15 5L5 15" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* upload img onto carousel */}
                        <div className="grid min-w-0 gap-3 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-4">

                            {/* current img preview/placeholder text for an empty item */}
                            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[#fbf3ea]">
                                {image.src ? (
                                    <img
                                        src={image.src}
                                        alt={image.alt || `Carousel image ${index + 1} preview`}
                                        className="h-full w-full object-contain"
                                    />
                                ) : (
                                    <span className="text-xs text-[#a99584]">No image selected</span>
                                )}
                            </div>

                            <div className="flex min-w-0 flex-col gap-3">
                                <div>
                                    {/* change label depending on whether item has an img or not */}
                                    <label
                                        htmlFor={`carousel-file-${image.id}`}
                                        className="mb-1 block text-xs font-semibold text-[#4a3418]"
                                    >
                                        {image.src ? "Upload another image" : "Upload image"}
                                    </label>

                                    {/* only accept png, jpg, webp */}
                                    <input
                                        id={`carousel-file-${image.id}`}
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        disabled={!carouselReady || uploading[image.id] || deleting[image.id]}
                                        aria-invalid={Boolean(imageErrors[image.id])}
                                        aria-describedby={imageErrors[image.id] ? `carousel-error-${image.id}` : undefined}
                                        onChange={(event) => {
                                            void handleImageFile(image.id, event.target.files?.[0]);
                                            event.target.value = "";
                                        }}
                                        className="hidden"
                                    />

                                    <label
                                        htmlFor={`carousel-file-${image.id}`}
                                        className={`inline-flex min-h-11 w-fit max-w-full items-center justify-center rounded-full border border-[#dbb082] px-4 py-1.5 text-center text-xs font-semibold text-[#a5652b] transition-colors sm:min-h-0 ${
                                            !carouselReady || uploading[image.id] || deleting[image.id]
                                                ? "cursor-not-allowed opacity-50"
                                                : "cursor-pointer hover:bg-[#fbf3ea]"
                                        }`}
                                    >
                                        Choose file
                                    </label>
                                </div>

                                <div>
                                    <label
                                        htmlFor={`carousel-alt-${image.id}`}
                                        className="mb-1 block text-xs font-semibold text-[#4a3418]"
                                    >
                                        Image description
                                    </label>
                                    
                                    {/* save screen reader descriptions while typing */}
                                    <input
                                        id={`carousel-alt-${image.id}`}
                                        type="text"
                                        disabled={!carouselReady || uploading[image.id] || deleting[image.id]}
                                        value={image.alt}
                                        onChange={(event) => updateCarouselImage(image.id, { alt: event.target.value })}
                                        onBlur={flushAllCarouselSettings}
                                        placeholder="Describe the image for screen readers!"
                                        className={`${fieldClass(false)} w-full min-w-0`}
                                    />
                                </div>

                                {/* details next to item when error occurs */}
                                {imageErrors[image.id] && (
                                    <div id={`carousel-error-${image.id}`} role="alert">
                                        <ErrorText>
                                            {imageErrors[image.id]}
                                        </ErrorText>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* button to add a new item */}
            <button
                type="button"
                onClick={addCarouselImage}
                disabled={!carouselReady}
                className="mt-4 min-h-11 w-full cursor-pointer rounded-2xl bg-[#F59AA3] px-[18px] py-2 text-[13px] font-semibold text-white transition-colors enabled:hover:bg-black disabled:cursor-not-allowed disabled:bg-[#FFBDC7] sm:min-h-0 sm:w-auto"
            >
                New Carousel Image +
            </button>
        </AccordionItem>
    );
}
