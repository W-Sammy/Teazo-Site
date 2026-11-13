import { getWebsiteContent } from "@/app/lib/website-content";
import { montserrat500 } from "@/app/fonts";

// font setup
const montserrat = montserrat500;

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