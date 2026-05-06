import Image from "next/image";
import { Cabin_Sketch } from "next/font/google"; // import fonts

// setup fonts
const cabinSketch = Cabin_Sketch({
    subsets: ['latin'], // reduce amount of importing to just letters, nums
    weight: ['400'] // normal
});

interface Editables {
    text: string;
}

export default function Subtitle({ text }: Editables) {
    return (
        <div className="relative inline-block">
            {/* pink scribble */}
            <Image
                src="/pink_scribble.png"
                alt="Pink Silhouette of a Chalk Scribble"
                aria-hidden="true"
                width={582}
                height={104}
                className="w-[355px] h-[63px] md:w-[582px] md:h-[104px]"
                priority
            />

            {/* text */}
            <div className="absolute inset-0 flex items-center justify-center">
                {/* locked to uppercase, wraps for mobile view */}
                <h2 className={`${cabinSketch.className} text-[48px] md:text-[64px] text-black uppercase pt-4 leading-[0.9] md:leading-none md:whitespace-nowrap`}>
                    {text}
                </h2>
            </div>
        </div>
        
    );
}