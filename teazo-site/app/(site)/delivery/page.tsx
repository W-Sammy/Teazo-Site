import Image from "next/image";

// import font & bubbles
import { Cabin_Sketch } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";

// setup font
const cabinSketch = Cabin_Sketch({
    subsets: ['latin'], // import only letters, num
    weight: ['400'] // normal
});

export default function Delivery() {
  return (
    <main className="bg-[#FFF8F9] min-h-screen">
        {/* logo */}
        <div className="w-full flex flex-col items-center pt-45 gap-3">
            <Image
                src="/TEAZO_logo.png"
                alt="TEAZO logo"
                aria-hidden="true"
                width={389}
                height={397}
                className="h-[170px] w-auto sm:h-[195px]"
                priority
            />

            {/* DELIVERY part */}
            <h1 className={`${cabinSketch.className} text-[70px] text-[#D9AE81]`}>
                DELIVERY
            </h1>
        </div>
        
        {/* button components will be here... */}
    </main>
  );
}
