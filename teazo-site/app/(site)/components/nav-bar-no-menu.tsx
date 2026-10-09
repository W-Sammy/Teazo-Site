// Minor deviation of global nav-bar.tsx to be used exclusively for the login page

"use client"; // import required for userPathname

import Link from "next/link";
import { Montserrat, Cabin_Sketch } from "next/font/google"; // import fonts
import { usePathname } from "next/navigation";

import type { MouseEvent } from "react"; // for mobile menu

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
    const navItems = ["BACK TO USER VIEW"];
    const pathName = usePathname();

    // check which link/page/route is currently active
    const active = (item: string) => {
        const href = item === "BACK TO USER VIEW" ? "/" : `/${item.toLowerCase()}`;
        return pathName === href;
    };

    // mobile menu
    const mobileToggle = (event: MouseEvent<HTMLElement>) => {
        const mobileMenu = event.currentTarget.parentElement;

        // check if menu's open
        if (!(mobileMenu instanceof HTMLDetailsElement) || !mobileMenu.open) {
            return;
        }

        // wait for menu to finish transition before closing it
        event.preventDefault();

        // check if "closing" already exists
        if (mobileMenu.classList.contains("closing")) {
            return;
        }

        // otherwise create "closing"
        mobileMenu.classList.add("closing");

        // if reduce motion enabled
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

                    {/* nav menu icons for mobile view.*/}
                    <details className="mobile-menu static md:hidden">
                        {/* menu icon */}
                        <summary
                            onClick={mobileToggle}
                            className="absolute right-0 top-1/2 z-[10000] flex h-12 w-12 -translate-y-1/2 touch-manipulation cursor-pointer list-none items-center justify-center rounded-md pointer-events-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black [&::-webkit-details-marker]:hidden"
                            aria-label="Open or Close Navigational Menu"
                        >
                            <span className="relative block h-6 w-7">
                                <span className="hamburger-line hamburger-top" />
                                <span className="hamburger-line hamburger-middle" />
                                <span className="hamburger-line hamburger-bottom" />
                            </span>
                        </summary>

                        {/* dropdown menu - mobile view items */}
                        <div className="mobile-dropdown fixed inset-x-0 top-20 z-[9999] max-h-[calc(100dvh-5rem)] w-screen overflow-y-auto bg-white/50 backdrop-blur-md">

                            {/* navItems - black, montserrat, 
                                underlined when currently active on page*/}
                            <div className="flex flex-col px-6 py-3">
                                {navItems.map((item) => (
                                    <Link
                                        key={item}
                                        href={item === "BACK TO USER VIEW" ? "/" : `/${item.toLowerCase()}`}

                                        className={`${montserrat.className} px-4 py-4 text-center text-sm font-bold tracking-[0.05em] transition-colors ${
                                            active(item)
                                                ? "text-black underline decoration-2 underline-offset-8"
                                                : "text-black hover:underline hover:decoration-2 hover:underline-offset-8"
                                        }`}
                                    >
                                        {item}
                                    </Link>
                                ))}
                            </div>

                        </div>
                    </details>

                    {/* css transitions for the menu icon & mobile menu*/}
                    <style>
                        {`
                            /* basic hamburger line for icons */
                            .hamburger-line {
                                position: absolute;
                                left: 0;
                                display: block;
                                width: 28px;
                                height: 2px;
                                background: black;
                                transform-origin: center;
                            }

                            /* icon transitions */
                            /* initial positions as menu icon*/
                            .hamburger-top {
                                top: 3px;
                                transition: transform 200ms ease;
                            }

                            .hamburger-middle {
                                top: 11px;
                                transition: opacity 200ms ease;
                            }

                            .hamburger-bottom {
                                top: 19px;
                                transition: transform 200ms ease;
                            }


                            /* transitions into exit icon via opening mobile menu */
                            .mobile-menu[open] .hamburger-top {
                                transform: translateY(8px) rotate(45deg);
                            }

                            .mobile-menu[open] .hamburger-middle {
                                opacity: 0;
                            }

                            .mobile-menu[open] .hamburger-bottom {
                                transform: translateY(-8px) rotate(-45deg);
                            }


                            /* transitions back into menu icon via closing mobile menu */
                            .mobile-menu.closing .hamburger-top,
                            .mobile-menu.closing .hamburger-bottom {
                                transform: none;
                            }

                            .mobile-menu.closing .hamburger-middle {
                                opacity: 1;
                            }


                            /* mobile menu transitions */
                            /* mobile menu sliding down to open */
                            .mobile-menu[open] .mobile-dropdown {
                                animation: menu-slide-down 240ms
                                    cubic-bezier(0.22, 1, 0.36, 1) both;
                            }

                            /* mobile menu sliding up to close */
                            .mobile-menu.closing .mobile-dropdown {
                                animation: menu-slide-up 240ms
                                    cubic-bezier(0.22, 1, 0.36, 1) both;
                                pointer-events: none;
                            }

                            
                            /* menu animations */
                            /* menu open */
                            @keyframes menu-slide-down {
                                from {
                                    opacity: 0;
                                    transform: translateY(-16px);
                                }

                                to {
                                    opacity: 1;
                                    transform: translateY(0);
                                }
                            }

                            /* menu close */
                            @keyframes menu-slide-up {
                                from {
                                    opacity: 1;
                                    transform: translateY(0);
                                }

                                to {
                                    opacity: 0;
                                    transform: translateY(-16px);
                                }
                            }

                            /* remove reduced motion when reduced motion enabled */
                            @media (prefers-reduced-motion: reduce) {
                                .mobile-menu .hamburger-line {
                                    transition-duration: 0ms;
                                }

                                .mobile-menu[open] .mobile-dropdown,
                                .mobile-menu.closing .mobile-dropdown {
                                    animation-duration: 0ms;
                                }
                            }
                        `}
                    </style>
                </div>

                {/* desktop view items */}
                {/* navItems - black, montserrat, underlined when hovered & active on page
                    right on desktop, hidden for mobile */}
                <div className="hidden items-center gap-12 md:flex">
                    {navItems.map((item) => (
                        <Link
                            key={item}
                            href={item === "BACK TO USER VIEW" ? "/" : `/${item.toLowerCase()}`}
                            className={`${montserrat.className} text-[10px] md:text-[18px] font-bold tracking-[0.05em] text-black text-center transition pb-1 border-b-2 hover:border-black 
                                ${active(item) 
                                    ? "border-black" 
                                    : "border-transparent"
                            }`}
                        >
                            {item}
                        </Link>
                    ))}
                </div>

            </nav>
        </header>
    );
}
