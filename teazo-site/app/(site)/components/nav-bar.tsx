"use client"; // import required for userPathname

import Link from "next/link";
import { Montserrat, Cabin_Sketch } from "next/font/google"; // import fonts
import { usePathname } from "next/navigation";

// setup fonts
const montserrat = Montserrat({
    subsets: ['latin'], // reduce amount of importing to just letters, nums
    weight: ['700'] // bold
});

const cabinSketch = Cabin_Sketch({
    subsets: ['latin'], // same as above
    weight: ['400'] // normal
});

// navigation bar.
export default function NavBar() {
    // separate from teazo logo because it'll be styled differently 
    const navItems = ["HOME", "MENU", "GALLERY", "CONTACT", "DELIVERY"];
    const pathName = usePathname();

    // check which link/page/route is currently active
    const active = (item: string) => {
        const href = item === "HOME" ? "/" : `/${item.toLowerCase()}`;
        return pathName === href;
    }

    return (
        // 50% opacity white "rectangle"
        <header className="fixed top-0 w-full z-50 bg-white/50">
            <nav className="mx-auto flex flex-col md:flex-row items-center justify-center md:justify-between px-6 py-4 md:px-10 md:py-6 gap-4 md:gap-0">
                    
                {/* teazo logo - gold, cabin sketch & underlined (no change during hover)
                    left on desktop, centered on mobile */}
                <Link 
                    href="/" 
                    className={`${cabinSketch.className} text-[48px] md:text-[64px] font-normal border-b-2 border-[#DBAF82] leading-[0.8] text-[#DBAF82] tracking-[0.05em]`}
                >
                    TEAZO
                </Link>

                {/* navItems - black, monserrat, underlined when hovered & active on page
                    right on desktop, centered & below logo on mobile */}
                <div className="grid grid-cols-5 w-full md:w-auto md:flex gap-2 md:gap-12">
                    {navItems.map((item) => (
                        <Link
                            key={item}
                            href={item === "HOME" ? "/" : `/${item.toLowerCase()}`}
                            className={`${montserrat.className} text-[10px] md:text-[18px] font-bold tracking-[0.05em] text-black text-center transition pb-1 border-b-2 hover:border-black ${active(item) ? "border-black" : "border-transparent"}`}
                        >
                            {item}
                        </Link>
                    ))}
                </div>

            </nav>
        </header>
    );
}
