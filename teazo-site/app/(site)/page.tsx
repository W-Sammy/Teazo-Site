import Image from "next/image";

import Subtitle from "@/app/(site)/components/sub-title"

//import carousel
import ImageCarousel from "@/app/(site)/components/image-carousel";

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
    <main className="relative z-0 bg-[#FFF8F9] min-h-screen pb-20 overflow-hidden">
            {/* bubble background */}
            <div className="absolute inset-0 -z-10">
                <BubbleField />
            </div>
    
            {/* logo */}
            {/* changed from absolute positioning to normal page flow so mobile content does not overlap */}
            <section className="relative z-20 flex min-h-[calc(100vh-120px)] w-full flex-col items-center justify-center px-4 py-16 text-center sm:py-20">
                <Image
                    src="/TEAZO_logo.png"
                    alt="TEAZO logo"
                    aria-hidden="true"
                    width={389}
                    height={397}
                    className="h-[135px] w-auto sm:h-[170px] md:h-[195px]"
                    priority
                />

            {/* TEAZO part */}
            <h1 className={`${cabinSketch.className} mt-2 text-[52px] leading-none text-[#D9AE81] sm:text-[70px]`}>
                TEAZO
            </h1>

            {/* description text */}
           {/* changed text sizes and spacing to be responsive on mobile */}
           <div className="mt-10 flex w-full flex-col items-center justify-center gap-2">
               <h1 className={`${mediumMontserrat.className} text-[24px] leading-tight text-black tracking-[0.08em] sm:text-[32px] md:text-[40px]`}>
                   TO SHARE BOBA LIFE
                </h1>
                <h1 className={`${boldMontserrat.className} text-[27px] leading-tight text-black tracking-[0.08em] sm:text-[36px] md:text-[46px]`}>
                    WITH ALL BOBA LOVERS
                </h1>
            </div>

            {/* button */}
            {/* changed from absolute positioning to normal page flow so button does not cover text */}
            <div className="mt-10 flex w-full items-center justify-center">
                <GeneralButton text="ORDER NOW" href="" />    
                </div>
        </section>

			<div className="relative z-10 mb-10 flex w-full justify-center px-4">
				<Subtitle text={"OUR STORY"} />
            </div>

            {/*import image carousel*/}
                <div className="relative z-10 flex justify-center items-center px-4">
                <ImageCarousel />
            </div>       
        
        {/*textbox with company message and icons*/}
        <section className="relative z-10 mx-auto mt-12 mb-20 w-[calc(100%-2rem)] max-w-[1000px] bg-white px-6 py-7 sm:px-8 sm:py-8 lg:mt-16 lg:px-7 lg:py-7 xl:max-w-[900px]"> 
        <div className="grid gap-7 lg:grid-cols-1">

            {/* fixed className template string so the Montserrat font applies correctly */}
            <div className={`${mediumMontserrat.className} space-y-6 text-[20px] leading-relaxed text-[#000000] sm:text-[24px]`}>
            
                <p> TEAZO is specializing in bringing you high qualities drink, snack and dessert.</p>

                <p> We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used.From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!
TEAZO is specializing in bringing you high qualities drink, snack and dessert.We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used.</p>
                
                <p> From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!</p>


                {/*social media icons*/}
                <div className="mt-8 flex flex-wrap justify-center items-center gap-6 sm:gap-10">
                    <a href="">
                    <img src="/social_icons/teazo_fb_icon.png" alt="Order" className="w-14 h-14 sm:w-16 sm:h-16" />
                    </a>
                    <a href="">
                    <img src="/social_icons/teazo_email_icon.png" alt="Order" className="w-14 h-14 sm:w-16 sm:h-16" />
                    </a>
                    <a href="">
                    <img src="/social_icons/teazo_insta_icon.png" alt="Order" className="w-14 h-14 sm:w-16 sm:h-16" />
                    </a>
                    <a href="">
                    <img src="/social_icons/teazo_yelp_icon.png" alt="Order" className="w-14 h-14 sm:w-16 sm:h-16" />
                    </a>
                </div>

            </div>

        </div>
        </section>

    </main>
  )
}