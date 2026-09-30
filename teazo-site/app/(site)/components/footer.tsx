import { Montserrat } from "next/font/google"; // font import
import { getWebsiteContent } from "@/app/lib/website-content";

// font setup
const montserrat = Montserrat({
    subsets: ['latin'], // reduce amount of imports to just letters, nums
    weight: ['500'] // medium
});

// footer.
export default async function Footer() {
    const content = await getWebsiteContent();
    const email = content.address.email || "teazosf@hotmail.com";

    return (
        <footer className={`${montserrat.className} relative z-40 text-white text-[16px] w-full bg-black flex flex-col items-center justify-center gap-4 py-10`}>
            <a href={`mailto:${email}`} className="transition hover:opacity-80">
                {email}
            </a>

            {/* fetch current year */}
            <span>© {new Date().getFullYear()} TEAZO. All rights reserved.</span>
        </footer>
    );
}