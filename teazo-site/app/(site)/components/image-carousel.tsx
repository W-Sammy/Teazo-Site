"use client";

import Image from "next/image";
import { useState, useEffect, JSX } from "react";

export default function ImageCarousel(): JSX.Element {
    const images: string[] = [
        "/carousel_images/menu.jpg",
        "/carousel_images/fresh_leaf.jpg",
        "/carousel_images/leaf_basket.jpeg",
        "/carousel_images/dried_leaves.jpg",
        "/carousel_images/drink.jpg"
    ];

    const [index, setIndex] = useState<number>(0);

    const prevSlide = (): void => {
        setIndex((prev) =>
            prev === 0 ? images.length - 1 : prev - 1
        );
    };

    const nextSlide = (): void => {
        setIndex((prev) =>
            prev === images.length - 1 ? 0 : prev + 1
        );
    };

    useEffect(() => {
        const interval = setInterval(nextSlide, 3000);
        return () => clearInterval(interval);
    }, []);

    const currentImage = images[index] || "/fallback.png";

    return (
        <div className="relative w-full flex flex-col items-center">
            {/* Image */}
            <div className="relative w-full h-[300px] sm:h-[400px]">
                <Image
                    src={currentImage}
                    alt="image-carousel"
                    fill
                    className="object-contain rounded-xl"
                />
            </div>
        </div>
    );
}