// Minor deviation of global nav-bar.tsx to be used exclusively for the login page

import Link from "next/link";
import { Montserrat, Cabin_Sketch } from "next/font/google"; // import fonts

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
export default function MenulessNavBar() {
    // separate from teazo logo because it'll be styled differently 
    const navItems = ["BACK TO USER VIEW"];


    return (
        // 50% opacity white "rectangle"
        <header className="fixed top-0 w-full z-50 bg-white/50 backdrop-blur-md">
            <nav className="mx-auto flex items-center justify-between px-10 py-6">
                    
                {/* teazo logo - gold, cabin sketch & underlined (no change during hover) */}
                <Link 
                    href="/" 
                    className={`${cabinSketch.className} text-[64px] font-normal border-b-2 border-[#DBAF82] leading-[0.8] text-[#DBAF82] tracking-[0.05em]`}
                >
                    TEAZO
                </Link>


                {/* navItems - black, monserrat, underlined when hovered */}
                <div className="hidden md:flex gap-12">
                    {navItems.map((item) => (
                        <Link
                            key={item}
                            href="/" // Hardcoding to route back to public home page as there is only a single item in this custom navbar
                            className={`${montserrat.className} text-[18px] font-bold tracking-[0.05em] text-black transition border-b-2 border-transparent hover:border-black pb-1 tracking-[0.05em]`}
                        >
                            {item}
                        </Link>
                    ))}
                </div>

            </nav>
        </header>
    );
}
