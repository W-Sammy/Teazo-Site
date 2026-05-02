import { Montserrat } from "next/font/google"; // font import

// font setup
const montserrat = Montserrat({
    subsets: ['latin'], // reduce amount of imports to just letters, nums
    weight: ['500'] // medium
});

// footer.
export default function Footer() {
    return (
        <footer className={`${montserrat.className} relative z-40 text-white text-[16px] w-full bg-black flex flex-col items-center justify-center gap-4 py-10`}>
            <span>teazosf@hotmail.com</span>

            {/* fetch current year */}
            <span>© {new Date().getFullYear()} TEAZO. All rights reserved.</span>
        </footer>
    );
}