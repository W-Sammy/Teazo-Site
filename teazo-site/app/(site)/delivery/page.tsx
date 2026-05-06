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
    <main className="relative z-0 bg-[#FFF8F9] min-h-screen flex flex-col items-center justify-center">
        {/* name of the website on tab*/}
        <title>Delivery</title>

        {/* bubble background */}
        <div className="absolute inset-0 z-10 pointer-events-none">
            <BubbleField />
        </div>

        {/* content */}
        <div className="relative z-20 flex flex-col items-center w-full px-6 py-45">
            {/* logo */}
            <div className="flex flex-col items-center">
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
                <h1 className={`${cabinSketch.className} text-[70px] text-[#D9AE81] py-3`}>
                    DELIVERY
                </h1>
            </div>
        

            {/* description text */}
            <div className="relative z-20 flex flex-col items-center text-center mt-4">
                <h1 className={`${mediumMontserrat.className} text-[24px] md:text-[32px] text-black tracking-[0.1em]`}>
                    HUNGRY AT HOME?
                </h1>
                <h1 className={`${boldMontserrat.className} text-[28px] md:text-[36px] text-black tracking-[0.1em]`}>
                    WE DELIVER.
                </h1>
            </div>
            
            {/* buttons */}
            <div className="relative z-20 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 w-full mt-19">
                <GeneralButton text="UBER EATS" href="https://www.ubereats.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg?srsltid=AfmBOoranl_YtSY-qug2w6ZzmFcwawnUN1t6RJMvTnqq32BwwVXubRgr" />
                <GeneralButton text="DOORDASH" href="https://www.doordash.com/en/store/teazo-san-francisco-849601/1213761/?srsltid=AfmBOortGz8HB9dVSbrcnGxXWHRoalBu_ObBQ_Fv-r0SRKiFrYvWQawu" />
                <GeneralButton text="POSTMATES" href="https://postmates.com/store/teazo/HmB7kkvSQdeWw6qSClzgzg" />
            </div>
        </div>
    </main>
  );
}
