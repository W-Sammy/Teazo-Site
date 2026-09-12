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
    const nextImage = images[(index + 1) % images.length] || "/fallback.png"; {/* for 2-image carousel like in Figma */}

    return (
        <div className="relative w-full flex justify-center">
            {/* Image */}
            <div className="flex items-center gap-20 justify-center"> {/* need images to fit next to each other */}

                {/* LEFT BUTTON */}
                <button
                    onClick={prevSlide}
                    className=" bg-black/40 text-white px-3 py-2 rounded-full hover:bg-black/60 mr-4 z-10"
                >
                    ◀
                </button>

                {/* Left */}
                <div className = "relative w-[400px] h-[600px]">
                <Image
                    src={currentImage}
                    alt="image-carousel"
                    fill
                    className="object-cover rounded-xl" 
                />  {/* switch to object-cover */}
                </div>

                {/* Right */}
                <div className = "relative w-[400px] h-[600px] ml-2">
                <Image
                    src={nextImage}
                    alt="image-carousel"
                    fill
                    className="object-cover rounded-xl"
                />
                </div>

                {/* RIGHT BUTTON */}
                <button
                    onClick={nextSlide}
                    className=" bg-black/40 text-white px-3 py-2 rounded-full hover:bg-black/60 m1-4 z-10"
                >
                    ▶
                </button>
            </div>
        </div>
        
    );
}