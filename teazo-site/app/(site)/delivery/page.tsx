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

export default function Delivery() {
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

            {/* DELIVERY part */}
            <h1 className={`${cabinSketch.className} text-[70px] text-[#D9AE81]`}>
                DELIVERY
            </h1>
        </div>

        {/* description text */}
        <div className="absolute z-20 w-full flex flex-col items-center justify-center pt-130 gap-1">
            <h1 className={`${mediumMontserrat.className} text-[32px] text-black tracking-[0.1em]`}>
                HUNGRY AT HOME?
            </h1>
            <h1 className={`${boldMontserrat.className} text-[36px] text-black tracking-[0.1em]`}>
                WE DELIVER.
            </h1>
        </div>
        
        {/* buttons */}
        <div className="absolute z-20 w-full flex items-center justify-center pt-175 gap-12">
            <GeneralButton text="UBER EATS" href="https://www.ubereats.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg?srsltid=AfmBOoranl_YtSY-qug2w6ZzmFcwawnUN1t6RJMvTnqq32BwwVXubRgr" />
            <GeneralButton text="DOORDASH" href="https://www.doordash.com/en/store/teazo-san-francisco-849601/1213761/?srsltid=AfmBOortGz8HB9dVSbrcnGxXWHRoalBu_ObBQ_Fv-r0SRKiFrYvWQawu" />
            <GeneralButton text="POSTMATES" href="https://postmates.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg" />
        </div>
    </main>
  );
}
