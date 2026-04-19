'use client';
import Link from "next/link";
import { Montserrat, Cabin_Sketch } from "next/font/google"; // import fonts
import { useState } from "react";

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

    // for mobile view, hamburger menu
    const [open, setOpen] = useState(false);
    const hamburger = () => setOpen(!open);

    return (
        // 50% opacity white "rectangle"
	    <header className={`fixed top-0 w-full z-50 bg-white/50 backdrop-blur-sm transition-[height] duration-500 ease-in-out overflow-hidden 
            ${open ? 'h-screen' : 'h-[100px]'}`}>

            <nav className="mx-auto flex px-10 py-6 h-[100px] items-center justify-between relative">
                
                {/* teazo logo - gold, cabin sketch & underlined (no change during hover) */}
                <Link 
                    href="/" 
                    className={`${cabinSketch.className} text-[64px] font-normal border-b-2 border-[#DBAF82] leading-[0.8] text-[#DBAF82] tracking-[0.05em] z-50 absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 transition-none`}
                >
                    TEAZO
                </Link>

                {/* desktop view */}
                {/* navItems - black, monserrat, underlined when hovered */}
                <div className="hidden md:flex gap-12">
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

                {/* mobile view */}
                {/* mobile view icons */}
                <div className="md:hidden flex w-full justify-end items-center h-full">
                    <button
                        className="z-50 text-black absolute right-3"
                        onClick={hamburger}
                        aria-label={open ? "Close Menu" : "Open Menu"}
                    >
                        {open ? ( // exit icon
                            <svg 
                                width="50" 
                                height="50" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="black" 
                                strokeWidth="1"
                            >
                                <path d="M18 6 6 18"/>
                                <path d="m6 6 12 12"/>
                            </svg>
                        ) : (
                            <svg 
                                width="50" 
                                height="50" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="black" 
                                strokeWidth="1"
                            >
                                <line x1="4" x2="20" y1="18" y2="18"/>
                                <line x1="4" x2="20" y1="12" y2="12"/>
                                <line x1="4" x2="20" y1="6" y2="6"/>
                            </svg>
                        )}
                    </button>
                </div>
            </nav>

            {/* mobile view nav items */}
            <div className={`md:hidden flex flex-col items-center transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex flex-col items-center gap-8 mt-20">
                    {navItems.map((item) => (
                        <Link
                            key={item}
                            href={item == "HOME" ? "/" : `/${item.toLowerCase()}`}
                            onClick={() => setOpen(false)}
                            className={`${montserrat.className} text-[24px] font-bold text-black tracking-[0.1em] hover:text-[#DBAF82] transition-colors`}
                        >
                            {item}
                        </Link>
                    ))}
                </div>
            </div>
        </header>
    );
}
