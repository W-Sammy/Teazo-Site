import Link from "next/link";
import { Montserrat } from "next/font/google"; // import fonts

// setup fonts
const montserrat = Montserrat({
    subsets: ['latin'], // reduce amount of importing to just letters & nums
    weight: ['600'] // semibold
});

// allow pages to edit the text & hyperlinks
interface Editables {
    text: string;
    href: string;
}

// button.
export default function GeneralButton({ text, href }: Editables) {
    return (
        <Link href={href} className="block w-[213px]">
            <button className={`${montserrat.className} w-[213px] h-[70px] bg-black text-white text-18px flex items-center justify-center hover:bg-[#FFBDC7] transition-colors`}>
                {text}
            </button>
        </Link>
    );
}