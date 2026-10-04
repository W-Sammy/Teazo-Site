"use client";

import Image from "next/image";
import { useEffect, useRef, useState, JSX } from "react"; 

export default function ImageCarousel(): JSX.Element {
    const images: string[] = [
        "/carousel_images/Tea_Gather.jpg",
        "/carousel_images/fresh_leaf.jpg",
        "/carousel_images/leaf_basket.jpeg",
        "/carousel_images/dried_leaves.jpg",
        "/carousel_images/Tea_Leaf_Basket.jpeg"
    ];
    
    const [index, setIndex] = useState<number>(0);
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const [dragOffset, setDragOffset] = useState<number>(0);
    const dragStartX = useRef<number>(0);
    const isDragging = useRef<boolean>(false);
    const isAnimating = useRef<boolean>(false);

    const handlePointerDown = (
        event: React.PointerEvent<HTMLDivElement>
    ): void => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }
        
        if (!event.isPrimary) {
        return;
        }

        dragStartX.current = event.clientX;
        isDragging.current = true;

        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = ( 
        event: React.PointerEvent<HTMLDivElement> 
    ): void => { 
        if (!isDragging.current) { 
            return; } const distance = event.clientX - dragStartX.current; 
            setDragOffset(distance); 
    };

    const handlePointerUp = (
        event: React.PointerEvent<HTMLDivElement>
    ): void => {
        if (!isDragging.current) {
            return;
        }

        const dragDistance =
            event.clientX - dragStartX.current;

        const swipeThreshold = 75;

        isDragging.current = false;

        if ( 
            event.currentTarget.hasPointerCapture( 
                event.pointerId 
            ) 
        ) { 
            event.currentTarget.releasePointerCapture( 
                event.pointerId 
            ); 
        }

        const numberOfSlides = Math.floor(
        Math.abs(dragDistance) / swipeThreshold
    );

    const direction = dragDistance < 0 ? 1 : -1;
    const slideDistance = 400 * numberOfSlides;
    isAnimating.current = true;

    {/* Handling Left and Right*/}
    if (numberOfSlides > 0) {

        if (dragDistance < 0) {
            setIndex((prev) => {
                return (
                    (prev + numberOfSlides) % images.length
                );
            });
        } 
        else {
            setIndex((prev) => {
                return (
                    (prev - numberOfSlides + images.length * 10)
                    % images.length
                );
            });
            }
        }

        isDragging.current = false;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

    const handlePointerCancel = (
        event: React.PointerEvent<HTMLDivElement>
    ): void => {
        isDragging.current = false;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    };

{/* Transition Timer */}    
useEffect(() => {
    const timer = setInterval(() => {
        if (!isDragging.current && !isAnimating.current) {
            setIndex((prev) => 
                prev === images.length - 1 ? 0 : prev + 1 
            );
        } }, 5000);
    
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
                            transition-transform duration-500 ease-in-out
                            ${isHovered ? "-translate-x-95" : "-translate-x-65"}
                            `}
                            onMouseEnter={() => setIsHovered(true)} 
                            onMouseLeave={() => setIsHovered(false)}
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                            style={{
                                touchAction: "pan-y",
                                userSelect: "none",
                            }}
                >
                    <Image
                        src={leftImage}
                        alt="image-carousel"
                        fill
                        sizes = "12w"
                        draggable={false}
                        className="object-cover rounded-xl" 
                    /> 
                </div>

                {/* Center */}  
                <div className = {`absolute w-100 h-150 z-30
                                   transition-transform duration-500 ease-in-out
                                 `}
                            onMouseEnter={() => setIsHovered(true)} 
                            onMouseLeave={() => setIsHovered(false)}   
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                            style={{
                                touchAction: "pan-y",
                                userSelect: "none",
                            }}
                >
                    <Image
                        src={currentImage}
                        alt="image-carousel"
                        fill
                        sizes = "12w"
                        draggable={false}
                        className="object-cover rounded-xl" 
                    />  
                </div>

                {/* Right */}
                <div className = {`
                            absolute w-75 h-125 z-10
                            transition-transform duration-500 ease-in-out
                            ${isHovered ? "translate-x-95" : "translate-x-65"}
                            `}
                            onMouseEnter={() => setIsHovered(true)} 
                            onMouseLeave={() => setIsHovered(false)} 
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                            style={{
                                touchAction: "pan-y",
                                userSelect: "none",
                            }}
                >                   
                    <Image
                        src={rightImage}
                        alt="image-carousel"
                        fill
                        sizes = "12w"
                        draggable={false}
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