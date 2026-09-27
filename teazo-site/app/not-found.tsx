import type { Metadata } from "next";

import NavBar from "@/app/(site)/components/nav-bar";
import Footer from "@/app/(site)/components/footer";

import Image from "next/image";

import { BubbleField } from "./components/bubble-field";
import { Cabin_Sketch, Montserrat } from "next/font/google";

// change browser tab name for the 404 page
export const metadata: Metadata = {
    title: {
        absolute: "404 Not Found",
    },
};

// Site fonts
const cabinSketch = Cabin_Sketch({
    weight: "400",
    style: "normal"
});

// extra bold montserrat
const boldMontserrat = Montserrat({
    subsets: ['latin'],
    weight: ['800'] // extra bold
});

// medium montserrat
const mediumMontserrat = Montserrat({
    subsets: ['latin'],
    weight: ['500']
});

export default function NotFound() {
    return (
        <main className="min-h-screen flex flex-col bg-[#FFF8F9]">
            {/* Top of page navbar */}
            <div>
                <NavBar />
            </div>
            {/* Background effects layer */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <BubbleField />
            </div>
            {/* Page text content */}
            <div className="relative z-10 h-screen flex flex-col items-center pt-[35vh] gap-4 md:gap-6 lg:gap-8"> 
                <Image
                    src="/pink_scribble.svg"
                    alt="Pink Silhouette of a Drink Splash"
                    width={800}
                    height={206}
                    className="absolute z-0 w-[350px] h-[90px] md:w-[800px] md:h-[206px] top-1/3 md:top-[30%]"
                    priority
                />
                <h1 className={`${cabinSketch.className} relative z-10 text-[48px] md:text-7xl lg:text-9xl text-center text-black`}>
                    404 ERROR
                </h1>
                <h2 className={`${boldMontserrat.className} text-2xl md:text-4xl lg:text-5xl text-black text-center font-semibold `}> 
                    OOPS!
                </h2>
                <p className={`${mediumMontserrat.className} text-base md:text-2xl lg:text-4xl text-black text-center font-normal`}>
                The page you were looking for doesn't exist.  
                </p>
                <p className={`${mediumMontserrat.className} text-base md:text-2xl lg:text-4xl text-black text-center font-normal`}>
                You may have mistyped the address or the page may have been moved.  
                </p>
            </div>

            { /* End of page footer */}
            <div>
                <Footer />
            </div>
        </main>
    )
}