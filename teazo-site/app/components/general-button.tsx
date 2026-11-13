import Link from "next/link";
import { montserrat600 } from "@/app/fonts";

// setup fonts
const montserrat = montserrat600;

// allow pages to edit the text & hyperlinks
interface Editables {
    text: string;
    href: string;
}

// button.
export default function GeneralButton({ text, href }: Editables) {
    return (
        <Link 
            href={href} 
            className="block w-[213px] cursor-pointer"
            target="_blank"
            rel="noopener noreferrer"
        >
            <button className={`${montserrat.className} w-[213px] h-[70px] cursor-pointer bg-black text-white text-[18px] flex items-center justify-center hover:bg-[#FFBDC7] transition-colors tracking-[0.05em] uppercase`}>
                {text}
            </button>
        </Link>
    );
}