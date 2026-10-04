import type { Metadata } from "next";
import Image from "next/image";

import Subtitle from "@/app/(site)/components/sub-title"

//import carousel
import ImageCarousel from "@/app/(site)/components/image-carousel";

// import font & bubbles
import { Montserrat, Cabin_Sketch } from "next/font/google";
import { BubbleField } from "@/app/components/bubble-field";
import { getContactContent } from "@/app/(site)/contact/contact-content";
import GeneralButton from "@/app/components/general-button";
import { getWebsiteContent } from "@/app/lib/website-content";

// added page metadata so the browser tab shows TEAZO for the landing page
export const metadata: Metadata = {
    title: {
        absolute: "Teazo",
    },
    description: "Teazo Home",
};

// setup fonts
const cabinSketch = Cabin_Sketch({
    subsets: ['latin'], // import only letters, num
    weight: ['400'] // normal
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "700"],
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

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.8 3.7h3.4l1.5 4.4-2 1.7a16 16 0 0 0 6.2 6.2l1.7-2 4.4 1.5v3.4A1.8 1.8 0 0 1 18.2 21C10.9 21 3 13.1 3 5.8A1.8 1.8 0 0 1 4.8 3.7Z" />
    </svg>
  );
}

export default async function Home() {
  const content = await getWebsiteContent();
  const logoSrc = content.logo || "/TEAZO_logo.svg";
  const contactData = await getContactContent();
  const {
    location,
    hours,
    contactFormEnabled,
    logo,
    socialLinks: dynamicSocialLinks,
  } = contactData;
  const fbLink = content.socialLinks.find((l) => l.id === "facebook" && l.enabled)?.url || "https://www.facebook.com/people/TEAZO/100063111166083";
  const igLink = content.socialLinks.find((l) => l.id === "instagram" && l.enabled)?.url || "https://www.instagram.com/teazosf/";
  const yelpLink = content.socialLinks.find((l) => l.id === "yelp" && l.enabled)?.url || "https://www.yelp.com/biz/teazo-san-francisco";
  const emailHref = `mailto:${content.address.email || "teazosf@hotmail.com"}`;
  const opensWebmail = false;
  const phoneDigits = location.phone.replace(/[^\d+]/g, "");
  const phoneHref = `tel:${phoneDigits || "+14157487398"}`;
  const isYelpEnabled = dynamicSocialLinks?.find((l) => l.id === "yelp")?.enabled ?? true;
  const isFbEnabled = dynamicSocialLinks?.find((l) => l.id === "facebook")?.enabled ?? true;
  const isIgEnabled = dynamicSocialLinks?.find((l) => l.id === "instagram")?.enabled ?? true;
  const storyParagraphs = content.story ? content.story.split(/\n\s*\n|\n/) : [];

  return (
    <main className="relative z-0 bg-[#FFF8F9] min-h-screen pb-20 overflow-hidden">
            {/* bubble background */}
            <div className="absolute inset-0 -z-10">
                <BubbleField />
            </div>
    
            {/* logo */}
            {/* changed from absolute positioning to normal page flow so mobile content does not overlap */}
            <section className="relative z-20 mx-auto flex w-full max-w-[1440px] flex-col items-center justify-center px-5 pt-45 text-center sm:px-8 lg:px-10">
                <Image
                    src={logoSrc}
                    alt="TEAZO logo"
                    aria-hidden="true"
                    width={389}
                    height={397}
                    className="h-[170px] w-auto sm:h-[195px]"
                    priority
                    unoptimized={logoSrc.startsWith("data:") || logoSrc.startsWith("http")}
                />

            {/* TEAZO part */}
            <h1 className={`${cabinSketch.className} mt-3 text-[70px] text-[#D9AE81]`}>
                TEAZO
            </h1>

            {/* description text */}
           {/* changed text sizes and spacing to be responsive on mobile */}
           <div className="mt-3 flex w-full flex-col items-center justify-center gap-1 sm:mt-5">
               <h1 className={`${mediumMontserrat.className} text-[1.35rem] leading-tight text-black tracking-[0.14em] sm:text-[1.55rem]`}>
                   TO SHARE BOBA LIFE
                </h1>
                <h1 className={`${boldMontserrat.className} text-[2rem] leading-tight text-black tracking-[0.06em] sm:text-[2.5rem]`}>
                    WITH ALL BOBA LOVERS
                </h1>
            </div>

            {/* button */}
            {/* changed from absolute positioning to normal page flow so button does not cover text */}
            <div className="mt-6 flex w-full items-center justify-center">
                <GeneralButton text="ORDER NOW" href="/menu" />    
                </div>
        </section>

            {/*import image carousel*/}
                <div className="relative z-10 flex justify-center items-center px-4 py-15">
                <ImageCarousel />
            </div> 

            <div className="relative z-10 mt-14 mb-10 flex w-full justify-center px-4 sm:mt-16">
                <Subtitle text={"OUR STORY"} />
            </div>
      
        
        {/*textbox with company message and icons*/}
        <section className="relative z-10 mx-auto mt-12 mb-20 w-[calc(100%-2rem)] max-w-[1000px] bg-white px-6 py-7 sm:px-8 sm:py-8 lg:mt-16 lg:px-7 lg:py-8 xl:max-w-[900px]"> 
        <div className="grid gap-7 lg:grid-cols-1">

            {/* fixed className template string so the Montserrat font applies correctly */}
            <div className={`${mediumMontserrat.className} space-y-6 text-[20px] leading-relaxed text-[#000000] sm:text-[24px]`}>
                {storyParagraphs.map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                ))}

            </div>
        </div>
        </section>

{/* Call To Action */}
        <section
                  className={`${montserrat.className} mx-auto mt-10 w-full max-w-[1320px] rounded-[28px] border border-[#e9dbd5] bg-[#faf6f3] px-5 py-7 shadow-sm sm:px-7 sm:py-8 lg:px-10 lg:py-9`}
                >
                  <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center justify-between gap-6 text-center lg:flex-row lg:text-left">
                    <div className="max-w-3xl">
                      <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#cd8f84]">
                        Group Orders
                      </p>
                      <h2
                        className={`${cabinSketch.className} mt-3 text-[2.8rem] uppercase leading-[0.95] text-[#D9AE81] sm:text-[3.5rem]`}
                      >
                        Planning for a Crowd?
                      </h2>
                      <p className="mt-4 text-base font-medium leading-7 text-stone-700 sm:text-lg">
                        Call us for group ordering and discounted pricing on larger
                        drink, snack, and dessert orders.
                      </p>
        
                      <div className="mt-6 flex items-center justify-center gap-4 lg:justify-start">
                        {isFbEnabled && (
                          <a
                            href={fbLink}
                            aria-label={`${location.businessName} on Facebook`}
                            target="_blank"
                            rel="noreferrer"
                            className="block transition hover:opacity-70"
                          >
                            <Image
                              src="/social_icons/social_svg/teazo_fb_icon.svg"
                              alt=""
                              aria-hidden="true"
                              width={64}
                              height={64}
                              className="h-12 w-12 object-contain"
                            />
                          </a>
                        )}
                        <a
                          href={emailHref}
                          aria-label={`Email ${location.businessName}`}
                          target={opensWebmail ? "_blank" : undefined}
                          rel={opensWebmail ? "noreferrer" : undefined}
                          className="block transition hover:opacity-70"
                        >
                          <Image
                            src="/social_icons/social_svg/teazo_email_icon.svg"
                            alt=""
                            aria-hidden="true"
                            width={64}
                            height={64}
                            className="h-12 w-12 object-contain"
                          />
                        </a>
                        {isIgEnabled && (
                          <a
                            href={igLink}
                            aria-label={`${location.businessName} on Instagram`}
                            target="_blank"
                            rel="noreferrer"
                            className="block transition hover:opacity-70"
                          >
                            <Image
                              src="/social_icons/social_svg/teazo_insta_icon.svg"
                              alt=""
                              aria-hidden="true"
                              width={64}
                              height={64}
                              className="h-12 w-12 object-contain"
                            />
                          </a>
                        )}
                        {isYelpEnabled && (
                          <a
                            href={yelpLink}
                            aria-label={`${location.businessName} on Yelp`}
                            target="_blank"
                            rel="noreferrer"
                            className="block transition hover:opacity-70"
                          >
                            <Image
                              src="/social_icons/social_svg/teazo_yelp_icon.svg"
                              alt=""
                              aria-hidden="true"
                              width={64}
                              height={64}
                              className="h-12 w-12 object-contain"
                            />
                          </a>
                        )}
                      </div>
                    </div>
        
                    <a
                      href={phoneHref}
                      className="flex h-[66px] w-full max-w-[260px] cursor-pointer items-center justify-center gap-3 bg-black px-6 text-[0.95rem] font-bold tracking-[0.1em] text-white transition hover:bg-[#FFBDC7] sm:w-[260px]"
                    >
                      <PhoneIcon />
                      CALL TO ORDER
                    </a>
                  </div>
                </section>

    </main>
  )
}