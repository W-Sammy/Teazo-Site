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

    const leftImage = images[(index - 1 + images.length) % images.length] || "/fallback.png";
    const currentImage = images[index] || "/fallback.png";
    const rightImage = images[(index + 1) % images.length] || "/fallback.png"; 

    return (
        <div className="relative w-full flex justify-center">
            {/* Image */}
            <div className="flex items-center gap-20 justify-center"> {/* need images to fit next to each other */}

                {/* Left */}
                <div className = "absolute w-75 h-125 -translate-x-62.5 -rotate-6 z-10">

                <Image
                    src={leftImage}
                    alt="previous image-carousel"
                    fill
                    className="object-cover rounded-xl" 
                /> 
                </div>

                {/* Center */}  
                <div className = " absolute w-100 h-150 z-30">

                <Image
                    src={currentImage}
                    alt="image-carousel"
                    fill
                    className="object-cover rounded-xl" 
                />  {/* switch to object-cover */}
                </div>

                {/* Right */}
                <div className = "absolute w-75 h-125 translate-x-62.5 rotate-6 z-10">
                <Image
                    src={rightImage}
                    alt="image-carousel"
                    fill
                    className="object-cover rounded-xl"
                />
                </div>
            </div>
        </div>
        
    );
}