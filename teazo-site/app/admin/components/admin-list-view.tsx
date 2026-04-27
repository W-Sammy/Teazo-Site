'use client'
import Image from "next/image";
import { allowedHosts } from "@/app/lib/imageHosts";
import { ItemCategory } from "@/app/types/menu-item";



type CellValue =
  | string
  | string[]
  | number
  | number[]
  | boolean
  | null
  | ItemCategory[];

type Row = Partial<Record<string, CellValue>>;

  function checkCell(value: unknown) {
    if (value == null) return "N/A";
    if (Array.isArray(value)) {
      if (value.length === 0) return "N/A";
      if (value.length === 1) return String(value[0]);
      return "...";
    }
    const str = String(value);
    return str.length > 20 ? str.slice(0, 20) + "…" : str;
  }

  //data type checker for images
  function getImageSrc(value: unknown): string | null {
    if (typeof value !== "string") return null;
    if (!value.trim()) return null;
    return value;
  }

  //data type checker for string types
  function checkString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    else return value;
  }

  function displayIcon(value: unknown, itemName: unknown) {
    const rawSrc = getImageSrc(value);
    const safeSrc =
      typeof rawSrc === "string" && checkURL(rawSrc)
        ? rawSrc
        : "/TEAZO_logo.png";
    const cItemName = checkString(itemName) ?? "No Name"



    //makes the images pretty small since that is not the focus
    return (
      <Image
        src={safeSrc}
        alt={cItemName}
        width={40}
        height={40}
        className="w-8 h-8 object-cover rounded shrink-0"
        onError={(e) => {
          e.currentTarget.src = "/TEAZO_logo.png";
        }}
      />
    );
  }

  function displayCategories(value: unknown) {
    if (!Array.isArray(value)) return "N/A";

    const categories = value.filter(
      (cat): cat is { id: string; name: string | null } =>
        typeof cat === "object" &&
        cat !== null &&
        "id" in cat &&
        "name" in cat
    );

    if (categories.length === 0) return "N/A";

    if (categories.length === 1) {
      return categories[0].name ?? "Unnamed category";
    }

    return (
      <div className="relative inline-block group">
        <span className="cursor-pointer font-bold text-blue-600 hover:underline">
          {categories.length}
        </span>

        <div className="absolute left-0 top-full z-20 mt-1 hidden min-w-[160px] rounded border bg-white p-2 shadow-lg group-hover:block">
          <ul className="space-y-1 text-sm text-gray-700">
            {categories.map((category) => (
              <li key={category.id}>
                {category.name ?? "Unnamed category"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  function checkURL(url: string): boolean {
    try {
      const { hostname } = new URL(url);

      return allowedHosts.some(allowed =>
        hostname === allowed || hostname.endsWith(`.${allowed}`)
      );
    } catch {
      return false;
    }
  }


export default function ListView({items} :  {items: Row[]}){
  /* checks if there is data */
  if (!items || items.length == 0) {
    return <div className = "px-4"> No data found </div> 
  }

  /* gets the different keys of the json array */
  const keys = Array.from(new Set(items.flatMap((item) => Object.keys(item))))
  //need to implement function to ensure there exist an id column

  function editHandler(item: Row){
    console.log("edit");
  }
  function deleteHandler(item: Row){
    console.log("delete")
  }

  return (
    <div className="w-full">
      <table className = "w-full min-w-[700px] border-collapse">
        {/*creates the column names takes into account delete and edit buttons*/}
        <thead>
          <tr className="border-b border-[#dbb082]">
            <th className="w-6"></th> 
            <th className="w-10"></th>
            {keys.filter((key) => key !== "id").map((key) => (
              <th key = {key} className = "pr-1 py-2 text-left">
                  
                  {checkCell(key)}
                
              </th>
            ))}
          </tr>
        </thead>

        {/*prints the row dakines*/}
        <tbody>
          {items.map((item, row_i) => (
            <tr
              key={row_i}
              onClick={() => editHandler(item)}
              className="border-b border-[#dbb082]/50 cursor-pointer hover:bg-[#dbb082]/25"
            >
              <td className="pr-2 py-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteHandler(item);
                  }}
                  className="pl-4 text-red-500 hover:text-red-700 cursor-pointer"
                >
                  ✕
                </button>
              </td>
              <td className="pr-6 py-2">
                <button 
                  className="bg-[#dbb082] text-xs px-1.5 py-0.5 rounded cursor-pointer font-bold text-white"
                  onClick={(e) => {
                    e.stopPropagation(); //prevents row click
                    editHandler(item);
                  }}
                > 
                  EDIT 
                </button>
              </td>
              {keys.filter((key) => key !== "id" && key !== "category_id").map((key)=>(
                <td key={key} className=" py-2">
                  {key === "price"
                    ? `$${Number(item[key] ?? 0).toFixed(2)}`
                    : key === "img"
                    ? displayIcon(item[key], item.id)
                    : key === "categories"
                    ? displayCategories(item[key])
                    : checkCell(item[key])
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>

      </table>

    </div>
  )
}



