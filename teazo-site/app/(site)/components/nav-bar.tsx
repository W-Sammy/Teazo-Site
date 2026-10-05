"use client"; // import required for userPathname

import Link from "next/link";
import { Montserrat, Cabin_Sketch } from "next/font/google"; // import fonts
import { usePathname } from "next/navigation";

import { MouseEvent } from "react"; // for mobile menu

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
    };

    // mobile menu
    const mobileToggle = (event: MouseEvent<HTMLElement>) => {
        const mobileMenu = event.currentTarget.parentElement;

        // check if menu's open
        if (!(mobileMenu instanceof HTMLDetailsElement) || !mobileMenu.open) {
            return;
        }

        // wait for menu to finish that...sultry transition...before closing it
        event.preventDefault();

        // check if "closing" already exists
        if (mobileMenu.classList.contains("closing")) {
            return;
        }

        // otherwise create it
        mobileMenu.classList.add("closing");

        // create a reduce motion var for that sultry transition...
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)",).matches;

        // close menu.
        window.setTimeout(
            () => {
                mobileMenu.open = false;
                mobileMenu?.classList.remove("closing");
            }, reduceMotion ? 0 : 240,
        );
    };

    return (
        <header className="fixed inset-x-0 top-0 z-[9999] w-full">
            {/* 50% opacity white "rectangle" */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-white/50 backdrop-blur-md"
            />
            
            {/* navigational */}
            <nav
                className="relative z-10 mx-auto px-6 py-4 md:flex md:items-center md:justify-between md:px-10 md:py-6"
                aria-label="Main Navigation"
            >  

            <div className="relative flex min-h-12 items-center justify-center md:contents">
                {/* teazo logo - gold, cabin sketch & underlined (no change during hover)
                    left on desktop, centered on mobile */}
                <Link 
                    href="/" 
                    className={`${cabinSketch.className} border-b-2 border-[#DBAF82] text-[48px] font-normal leading-[0.8] tracking-[0.05em] text-[#DBAF82] md:text-[64px]`}
                >
                    TEAZO
                </Link>

                {/* hamburger icon for mobile view.*/}

                {/* navItems - black, monserrat, underlined when hovered & active on page
                    right on desktop, hidden in mobile */}
                <div className="hidden items-center gap-12 md:flex">
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
            </div>

            </nav>
        </header>
    );
}
