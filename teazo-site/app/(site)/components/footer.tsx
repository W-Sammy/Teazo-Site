import { Montserrat } from "next/font/google"; // font import
import { getWebsiteContent } from "@/app/lib/website-content";
import FooterContent from "./footer-content";

// font setup
const montserrat = Montserrat({
    subsets: ['latin'], // reduce amount of imports to just letters, nums
    weight: ['500'] // medium
});

// footer.
export default async function Footer() {
    const content = await getWebsiteContent();
    const email = content.address.email || "teazosf@hotmail.com";

    return <div className={montserrat.className}><FooterContent email={email} /></div>;
}
