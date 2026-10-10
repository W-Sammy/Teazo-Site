"use client";

import { Montserrat } from "next/font/google";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500"],
});

export default function StaticFooter() {
  return (
    <footer className={`${montserrat.className} relative z-40 flex w-full flex-col items-center justify-center gap-4 bg-black py-10 text-[16px] text-white`}>
      <a href="mailto:teazosf@hotmail.com" className="transition hover:opacity-80">
        teazosf@hotmail.com
      </a>
      <span>© {new Date().getFullYear()} TEAZO. All rights reserved.</span>
    </footer>
  );
}
