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
export default function NavBar() {
    // separate from teazo logo because it'll be styled differently 
    const navItems = ["HOME", "MENU", "GALLERY", "CONTACT"];


    return (
        // 50% opacity white "rectangle"
        <header className="fixed top-0 w-full z-50 bg-white/50">
            <nav className="mx-auto flex items-center justify-between px-10 py-6">
                    
                {/* teazo logo - gold, cabin sketch & underlined (no change during hover) */}
                <Link href="/" 
                      className={`${cabinSketch.className} text-[64px] font-normal border-b-2 border-[#DBAF82] leading-[0.8] text-[#DBAF82]`}
                >
                    TEAZO
                </Link>


                {/* navItems - black, monserrat, underlined when hovered */}
                <div className="flex gap-12">
                    {navItems.map((item) => (
                        <Link
                            key={item}
                            href={item == "HOME" ? "/" : `/${item.toLowerCase()}`} // route HOME to just "/" instead of "/home"
                            className={`${montserrat.className} text-[18px] font-bold tracking-[0.05em] text-black transition border-b-2 border-transparent hover:border-black pb-1`}
                        >
                            {item}
                        </Link>
                    ))}
                </div>

            </nav>
        </header>
    );
}
