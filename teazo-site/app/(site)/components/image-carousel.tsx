"use client";

import Image from "next/image";
import { useState, JSX, useEffect } from "react"; 

export default function ImageCarousel(): JSX.Element {
    const images: string[] = [
        "/carousel_images/menu.jpg",
        "/carousel_images/fresh_leaf.jpg",
        "/carousel_images/leaf_basket.jpeg",
        "/carousel_images/dried_leaves.jpg",
        "/carousel_images/drink.jpg"
    ];

    const [index, setIndex] = useState<number>(0);

{/* Transition Timer */}    
useEffect(() => {
    const timer = setInterval(() => {
        setIndex((prev) =>
            prev === images.length - 1 ? 0 : prev + 1
        );
    }, 5000);
    
    return () => clearInterval(timer);
}, [images.length]);

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
                
                {/* LEFT BUTTON */}
                <button
                    onClick={prevSlide}
                    className="absolute left-1/4 top-1/2 -translate-y-1/2 bg-black/40 text-white px-3 py-2 rounded-full hover:bg-black/60"
                >
                    ◀
                </button>

                {/* RIGHT BUTTON */}
                <button
                    onClick={nextSlide}
                    className="absolute right-1/4 top-1/2 -translate-y-1/2 bg-black/40 text-white px-3 py-2 rounded-full hover:bg-black/60"
                >
                    ▶
                </button>
            </div>
        </div>
        
    );
}