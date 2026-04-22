
import MenulessNavBar from "@/app/(site)/components/nav-bar-no-menu";
import Footer from "@/app/(site)/components/footer";

import { BubbleField } from "@/app/components/bubble-field";
import { Cabin_Sketch, Montserrat } from "next/font/google";

// Site fonts
const cabinSketch = Cabin_Sketch({
    weight: "400",
    style: "normal"
});

const montserrat = Montserrat({
    weight: ["400", "600", "800"],
    style: "normal"
});


export default function AdminLoginPage(){
  return (
    <main className="min-h-screen flex flex-col bg-[#f4efeb]">
      {/* Top of page navbar */}
        <div>
            <MenulessNavBar />
        </div>
        {/* Background effects layer */}
        <div className="absolute inset-0 z-0 pointer-events-none">
            <BubbleField />
        </div>
        {/* Page text content */}
        <div className="relative z-10 h-screen flex flex-col items-center pt-[35vh] gap-4 md:gap-6 lg:gap-8"> 
            
        </div>

        { /* End of page footer */}
        <div>
            <Footer />
        </div>
    
    </main>
  )
}