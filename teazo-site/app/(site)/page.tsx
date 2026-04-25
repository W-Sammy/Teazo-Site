import Image from "next/image";

// import font & bubbles
import { Montserrat, Cabin_Sketch } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import GeneralButton from "@/app/components/general-button";

// setup fonts
const cabinSketch = Cabin_Sketch({
    subsets: ['latin'], // import only letters, num
    weight: ['400'] // normal
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

export default function Home() {
  return (
    <main className="relative z-0 bg-[#FFF8F9] min-h-screen">
            {/* bubble background */}
            <div className="">
                <BubbleField />
            </div>
    
            {/* logo */}
            <div className="absolute z-20 w-full flex flex-col items-center justify-center pt-45 gap-3">
                <Image
                    src="/TEAZO_logo.png"
                    alt="TEAZO logo"
                    aria-hidden="true"
                    width={389}
                    height={397}
                    className="h-[170px] w-auto sm:h-[195px]"
                    priority
                />

            {/* TEAZO part */}
            <h1 className={`${cabinSketch.className} text-[70px] text-[#D9AE81]`}>
                TEAZO
            </h1>
        </div>

            {/* description text */}
           <div className="absolute z-20 w-full flex flex-col items-center justify-center pt-130 gap-1">
               <h1 className={`${mediumMontserrat.className} text-[32px] text-black tracking-[0.1em]`}>
                   TO SHARE BOBA LIFE
                </h1>
                <h1 className={`${boldMontserrat.className} text-[36px] text-black tracking-[0.1em]`}>
                    WITH ALL BOBA LOVERS
                </h1>
            </div>
    </main>
  )
}
