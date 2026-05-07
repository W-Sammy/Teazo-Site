import type { Metadata } from "next";

import NavBar from "@/app/(site)/components/nav-bar";
import Footer from "@/app/(site)/components/footer";

import Image from "next/image";

import { BubbleField } from "./components/bubble-field";
import { Cabin_Sketch, Montserrat } from "next/font/google";

// change browser tab name for the 404 page
export const metadata: Metadata = {
    title: {
        absolute: "Error 404 (Not Found)",
    },
};

// Site fonts
const cabinSketch = Cabin_Sketch({
    weight: "400",
    style: "normal"
});

const montserrat = Montserrat({
    weight: ["400", "600", "800"],
    style: "normal"
});

export default function NotFound() {
    return (
        <main className="min-h-screen flex flex-col bg-[#f4efeb]">
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
                    src="/pink_scribble.png"
                    alt="Pink Scribble"
                    width={800}
                    height={800}
                    className="absolute z-0 opacity-90 w-[350px] md:w-[400px] lg:w-[800px] h-auto"
                    priority
                />
                <h1 className={`${cabinSketch.className} relative z-10 text-7xl md:text-7xl lg:text-9xl text-black`}>
                    404 ERROR
                </h1>
                <h2 className={`${montserrat.className} text-2xl md:text-4xl lg:text-5xl text-black text-center font-semibold `}> 
                    OOPS!
                </h2>
                <p className={`${montserrat.className} text-base md:text-2xl lg:text-4xl text-black text-center font-normal`}>
                The page you were looking for doesn't exist.  
                </p>
                <p className={`${montserrat.className} text-base md:text-2xl lg:text-4xl text-black text-center font-normal`}>
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