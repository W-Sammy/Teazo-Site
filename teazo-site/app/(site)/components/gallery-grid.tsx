import Image from "next/image";

export type GalleryImage = {
  id: string;
  url: string;
  alt: string;
  caption?: string;
};

type GalleryGridProps = {
  images: GalleryImage[];
};

/* Display images in a responsive grid */
export default function GalleryGrid({ images }: GalleryGridProps) {
  return (
      /*
        Grid layout:
        - 1 column  -> small phones
        - 2 columns -> tablets
        - 3 columns -> desktops
      */
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">

        {images.map((image, index) => (
            <figure
                key={image.id}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-[#f3ece6]"
            >
              <Image
                  src={image.url}
                  alt={image.alt}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  // The first row is on screen at load (TZ-515); the rest wait until scrolled to.
                  loading={index < 3 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
              />

              {/* Optional Caption */}
              {image.caption && (
                  <figcaption className="absolute bottom-0 left-0 right-0 translate-y-full bg-black/50 px-4 py-3 text-sm font-medium text-white transition duration-300 group-hover:translate-y-0">
                    {image.caption}
                  </figcaption>
              )}
            </figure>
        ))}
      </div>
  );
}