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
    const [isCenterHovered, setIsCenterHovered] = useState<boolean>(false);
    

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
        
        <div
            className="relative w-full flex flex-col items-center">
                    
            <div className="relative w-full h-175 flex items-center justify-center">
           
                {/* Left */}
                <div className = {`
                            absolute w-75 h-125 z-10 
                            transition-all duration-500 ease-in-out
                            ${isCenterHovered ? "-translate-x-200" : "-translate-x-62.5"}
                            `}
                >

                <Image
                    src={leftImage}
                    alt="previous image-carousel"
                    fill
                    sizes = "10w"
                    className="object-cover rounded-xl" 
                /> 
                </div>

                {/* Center */}  
                <div className = {`absolute w-100 h-150 z-30
                                   onMouseEnter={() => setIsCenterHovered(true)} 
                                   onMouseLeave={() => setIsCenterHovered(false)}
                                `}
                >

                <Image
                    src={currentImage}
                    alt="image-carousel"
                    fill
                    sizes = "12w"
                    className="object-cover rounded-xl" 
                />  
                </div>

                {/* Right */}
                <div className = {`
                            absolute w-75 h-125 z-10
                            transition-all duration-500 ease-in-out
                            ${isCenterHovered ? "translate-x-100" : "translate-x-62.5"}
                            `}
                >
                    
                <Image
                    src={rightImage}
                    alt="image-carousel"
                    fill
                    sizes = "10w"
                    className="object-cover rounded-xl"
                />
                </div>
            </div>

            {/* Dots */}
            <div className="flex items-center justify-center gap-3 mt-6">
                {images.map((_, dotIndex) => (
                    <button
                        key={dotIndex}
                        type="button" 
                        onClick={() => setIndex(dotIndex)} 
                        aria-label={`Go to image ${dotIndex + 1}`} 
                        className={`
                            rounded-full
                            transition-all duration-300
                            ${ index === dotIndex ? "w-3 h-3 bg-black" : "w-2.5 h-2.5 bg-gray-400 hover:bg-gray-600"}
                            `}
                        />
                    ))}
            </div>
        </div>
        
    );
}