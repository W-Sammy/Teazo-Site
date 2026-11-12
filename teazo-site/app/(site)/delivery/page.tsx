import Image from "next/image";

// import font & bubbles
import { Cabin_Sketch } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import GeneralButton from "@/app/components/general-button";
import { getWebsiteContent } from "@/app/lib/website-content";
import { montserrat500, montserrat800 } from "@/app/fonts";
import { heroLogoSrc } from "@/app/lib/default-logo";

// setup fonts
const cabinSketch = Cabin_Sketch({
    preload: false, // preloading every font held back first paint on phones (TZ-515)
    subsets: ['latin'], // import only letters, num
    weight: ['400'] // normal
});

// extra bold montserrat
const boldMontserrat = montserrat800;

// medium montserrat
const mediumMontserrat = montserrat500;

export default async function Delivery() {
  const content = await getWebsiteContent();
  const logoSrc = heroLogoSrc(content.logo);
  const deliveryLinks = (content.deliveryLinks ?? []).filter(
    (link) => link.enabled && link.label.trim() && link.url.trim(),
  );

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
                    src={logoSrc}
                    alt="TEAZO logo"
                    aria-hidden="true"
                    width={389}
                    height={397}
                    className="h-[170px] w-auto sm:h-[195px]"
                    priority={!logoSrc.startsWith("data:")}
                    fetchPriority="high"
                    unoptimized={logoSrc.startsWith("data:") || logoSrc.startsWith("http")}
                />

                {/* DELIVERY part */}
                <h1 className={`${cabinSketch.className} text-[70px] text-[#B28458] py-3`}>
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
            
            <div className="relative z-20 flex flex-col md:flex-row md:flex-wrap items-center justify-center gap-6 md:gap-12 w-full mt-19">
                {deliveryLinks.map((link) => (
                    <GeneralButton key={link.id} text={link.label.toUpperCase()} href={link.url} />
                ))}
            </div>
        </div>
    </main>
  );
}
