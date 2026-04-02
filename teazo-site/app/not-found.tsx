import { Cabin_Sketch, Montserrat } from "next/font/google";

const cabinSketch = Cabin_Sketch({
    weight: "400",
    style: "normal"
});

const montserrat = Montserrat({
    weight: ["400", "600", "800"],
    style: "normal"
});

export default function NotFound() {
    return (
        //placeholder bg for globalized spheres
        <div className="h-screen bg-white flex flex-col items-center pt-[35vh]"> 
            <h1 className={`${cabinSketch.className} text-4xl md:text-6xl lg:text-7xl text-black`}>
                404 ERROR
            </h1>
            <h2 className={`${montserrat.className} text-2xl md:text-4xl lg:text-5xl text-black text-center font-normal `}> 
                Oops!
            </h2>
            <p className={`${montserrat.className} text-base md:text-2xl lg:text-4xl text-black text-center font-normal`}>
              The page you were looking for doesn't exist.  
            </p>
            <p className={`${montserrat.className} text-base md:text-2xl lg:text-4xl text-black text-center font-normal`}>
              You may have misstyped the address or the page may have been moved.  
            </p>
        </div>
        
    )
}