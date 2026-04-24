"use client";

import MenulessNavBar from "@/app/(site)/components/nav-bar-no-menu";
import Footer from "@/app/(site)/components/footer";

import { BubbleField } from "@/app/components/bubble-field";

import Link from "next/link";
import Image from "next/image";
import { useState} from "react";



export default function AdminLoginPage() {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

  return (
    <div className="relative min-h-screen flex flex-col bg-[#f4efeb] overflow-hidden">
      {/* Background effects layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <BubbleField />
      </div>

      {/* Top of page navbar */}
      <div className="relative z-20">
        <MenulessNavBar />
      </div>

      {/* Page content */}
      <main className="relative z-10 flex-1 flex flex-col gap-6 justify-center items-center px-4 pt-30 pb-12">
        <div className="w-full max-w-[470px] bg-white px-10 pt-12 pb-10 shadow-sm">
          {/* Teazo Logo */}
          <div className="flex flex-col items-center">
            <Image
              src="/teazo_logo_text.png"
              alt="Teazo logo with text"
              width={180}
              height={180}
              className="mb-3 h-auto w-auto"
              priority
            />

            <h1 className="text-[22px] tracking-[0.25em] font-semibold text-black text-center">
              ADMIN PORTAL
            </h1>
          </div>

          {/* Login Form */}
          <form className="relative mt-8 flex flex-col items-center gap-5">
            <input
              type="email"
              name="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="EMAIL"
              className="h-[42px] w-full rounded-md border-2 border-gray-400 px-3 text-[12px] text-black tracking-[0.08em] uppercase outline-none placeholder:text-gray-500 focus:border-[#D9AB79]"
            />

            <input
              type="password"
              name="password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="PASSWORD"
              className="h-[42px] w-full rounded-md border-2 border-gray-400 px-3 text-[12px] text-black tracking-[0.08em] uppercase outline-none placeholder:text-gray-500 focus:border-[#D9AB79]"
            />

            {(!email || !password) && (
              <p className="absolute top-17 mt-10 text-sm text-red-500">
                Email or password cannot be empty 
              </p>
            )}

            <button
              type="submit"
              disabled={!email || !password}
              style={{ cursor: !email || !password ? "not-allowed" : "pointer" }}
              className="mx-auto mt-3 h-[40px] w-[135px] bg-black text-white text-[14px] font-semibold tracking-[0.12em] transition hover:bg-[#FFBDC7] "
            >
              SIGN IN
            </button>

            

            {/* [!] Needs to be update once account administrative workflow has been developed */}
            <Link
              href="/404"
              className="text-center text-[14px] font-semibold tracking-[0.03em] text-black hover:underline"
            >
              FORGOT PASSWORD?
            </Link>
          </form>
        </div>

        {/* Google SSO container */}
        <div className="relative flex flex-col mb-20 w-full max-w-[470px] bg-white  shadow-sm">
          <button
            type="button"
            className="group flex h-[60px] w-full cursor-pointer items-center justify-center gap-4 border border-gray-200 bg-white text-[14px] font-semibold tracking-[0.04em] text-black transition hover:bg-gray-50"
          >
            {/* Google Icon official SVG */}
            <Image
              src="/google-color.svg"
              alt="Google icon"
              width={22}
              height={22}
            />
            <span className="group-hover:underline">CONTINUE WITH GOOGLE</span>
          </button>
        </div>
      </main>

      {/* End of page footer */}
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}