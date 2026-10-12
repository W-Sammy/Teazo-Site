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

    const dragStartX = useRef<number>(0);
    const isDragging = useRef<boolean>(false);
    const isAnimating = useRef<boolean>(false);
    const clickedImageIndex = useRef<number | null>(null);

    const getOffset = (imageIndex: number): number => { 
        let offset = imageIndex - index; 
        if (offset > images.length / 2) { offset -= images.length; } 
        if (offset < -images.length / 2) { offset += images.length; } 
        return offset; 
    };

    const changeSlide = (newIndex: number): void => { 
        if (newIndex === index || isAnimating.current) { 
            return; 
        } 
        
        isAnimating.current = true; 
        setIndex(newIndex);
        setTimeout(() => { isAnimating.current = false; }, 500); 
    };
    
    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }
        if (!event.isPrimary) {
        return;
        }

        dragStartX.current = event.clientX;
        isDragging.current = true;

        const target = event.target as HTMLElement;
        const slide = target.closest("[data-carousel-index]") as HTMLElement | null;

        clickedImageIndex.current = slide ? Number(slide.dataset.carouselIndex): null;

        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (!isDragging.current) {
            return;
        }

        const dragDistance = event.clientX - dragStartX.current;
        const swipeThreshold = 75;
        const clickedIndex = clickedImageIndex.current;

        isDragging.current = false;
        clickedImageIndex.current = null;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) { 
            event.currentTarget.releasePointerCapture(event.pointerId); 
        }
    
        if (Math.abs(dragDistance) >= swipeThreshold) { 
            const direction = dragDistance < 0 ? 1 : -1; 
            changeSlide((index + direction + images.length) % images.length);
        }   
        else if (clickedIndex !== null) {
            changeSlide(clickedIndex);
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
        if (!isDragging.current) {
            return;
        }

        event.preventDefault();
    };

    const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => { 
        isDragging.current = false; 
        if (event.currentTarget.hasPointerCapture(event.pointerId)) { 
            event.currentTarget.releasePointerCapture(event.pointerId); 
        } 
    };

    {/* Transition Timer */}    
    useEffect(() => {
        const timer = setInterval(() => {
            if (!isDragging.current && !isAnimating.current) {
                changeSlide( index === images.length - 1 ? 0 : index + 1);
            } 
        }, 5000);
    
        return () => clearInterval(timer);
    }, [index]);
    

    const prevSlide = (): void => {
        changeSlide( index === 0 ? images.length - 1 : index - 1);
    };

    const nextSlide = (): void => {
        changeSlide( index === images.length - 1 ? 0 : index + 1);
    };

    {/* Display */}
    return (
        <div
            className="relative w-full flex flex-col items-center">

            <div 
                className="relative w-full h-100 sm:h-140 flex items-center justify-center overflow-hidden"
                onPointerDown={handlePointerDown} 
                onPointerUp={handlePointerUp} 
                onPointerMove={handlePointerMove}
                onPointerCancel={handlePointerCancel} 
                style={{ touchAction: "pan-y", userSelect: "none", 
                }}
            >
                {images.map((image, imageIndex) => { const offset = getOffset(imageIndex);
                const isVisible = Math.abs(offset) <= 1;
                const isCenter = offset === 0;
                const width = isCenter ? "w-65 sm:w-120" : "w-60 sm:w-100";
                const height = isCenter ? "h-65 sm:h-120" : "h-60 sm:h-100";
                const sideDistance = isHovered ? 380 : 260;
                let translateX = 0; if (offset < 0) { translateX = offset * sideDistance; } else if (offset > 0) { translateX = offset * sideDistance; }
                const zIndex = 30 - Math.abs(offset) * 5;

                return ( 
                    <div 
                        key={image} 
                        data-carousel-index={imageIndex}
                        className={` absolute ${width} ${height} rounded-xl overflow-hidden transition-all duration-500 ease-in-out `} 
                        style={{ transform: `translateX(${translateX}px)`, opacity: isVisible ? 1 : 0, zIndex, pointerEvents: isVisible ? "auto" : "none", }} 
            
                        onMouseEnter={() => setIsHovered(true) } 
                        onMouseLeave={() => setIsHovered(false) } 
                    > 
                        <Image 
                            src={image} 
                            alt={`Tea image ${ imageIndex + 1 }`} 
                            fill 
                            sizes="400px" 
                            draggable={false} 
                            className="object-cover rounded-xl" 
                        /> 
                    </div> 
                ); 
                })} 
            </div>
           

            {/* Dots */}
            <div
                className="flex items-center justify-center gap-3 mb-6"
                onTouchStart={(event) => {dragStartX.current = event.touches[0].clientX;}}
                onTouchEnd={(event) => {
                    const endX = event.changedTouches[0].clientX;
                    const distance = endX - dragStartX.current;

                    if (Math.abs(distance) >= 40) {
                        const direction = distance < 0 ? 1 : -1;
                        changeSlide((index + direction + images.length) % images.length);
                    }}}
            >
                
                {images.map((_, dotIndex) => (
                    <button
                        key={dotIndex}
                        type="button" 
                        onClick={() => changeSlide(dotIndex)}
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
