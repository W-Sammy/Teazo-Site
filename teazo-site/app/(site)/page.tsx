import Image from "next/image";

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

// Decorative pink underline behind the section heading.
// Decorative pink scribble behind the section heading.
function PaintStroke() {
    return (
        <div className="absolute left-1/2 top-1/2 h-[120px] w-[680px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2">
            <Image
                src="/pink_scribble.png"
                alt=""
                aria-hidden="true"
                fill
                className="object-contain"
            />
        </div>
    );
}

export default function Home() {
  return (
    <main className="relative z-0 bg-[#FFF8F9] min-h-screen pb-20">
            {/* bubble background */}
            <div className="absolute inset-0 -z-10">
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

            {/* buttons */}
            <div className="absolute z-20 w-full flex items-center justify-center pt-175 gap-12">
                <GeneralButton text="ORDER NOW" href="" />    
                </div>

			<div className="relative mt-14 inline-flex items-center justify-center sm:mt-250">
				<PaintStroke />
				<h2
					className={`${cabinSketch.className} relative z-20 px-180 text-center text-[3.1rem] uppercase leading-[0.92] tracking-[0.035em] text-[#161616] sm:text-[4.5rem] lg:text-[5rem] whitespace-nowrap`}
				>
					OUR STORY
				</h2>
            </div>


        <div className="relative mt-14 inline-flex items-center justify-center sm:mt-20"> </div>
        
         <div className="flex justify-center items-center">
            <ImageCarousel />
        </div>       
        
        {/*textbox with company message and icons*/}
        <section className=" relative z-10 mx-auto mt-16 mb-20  w-full max-w-[1000px] bg-white px-4 py-5 sm:px-6 sm:py-6 lg:mt-20 lg:px-7 lg:py-7 xl:max-w-[900px]"> 
        <div className="grid gap-7 lg:grid-cols-1">

            <div className="ml-5 space-y-4 text-[#161616]">
            
                <p> TEAZO is specializing in bringing you high qualities drink, snack and dessert.</p>

                <p> We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used.From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!
TEAZO is specializing in bringing you high qualities drink, snack and dessert.We provide premium tea leaves from Taiwan tea farmer directly, all of our products come with a guarantee of the finest ingredients are being used.</p>
                
                <p> From our team to yours, we pay careful attention to each item. We hope you enjoy our products as much as we enjoy bringing it to you!</p>


                {/*social media icons*/}
                <div className="mt-6 flex justify-center items-center gap-6">
                    <a href="">
                    <img src="/social_icons/teazo_fb_icon.png" alt="Order" className="w-16 h-16" />
                    </a>
                    <a href="">
                    <img src="/social_icons/teazo_email_icon.png" alt="Order" className="w-16 h-16" />
                    </a>
                    <a href="">
                    <img src="/social_icons/teazo_insta_icon.png" alt="Order" className="w-16 h-16" />
                    </a>
                    <a href="">
                    <img src="/social_icons/teazo_yelp_icon.png" alt="Order" className="w-16 h-16" />
                    </a>
                </div>

            </div>

        </div>
        </section>

    </main>
  )
}
