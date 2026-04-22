'use client'
import Image from "next/image";

type Row = Partial<Record<string, string | string[] | number | number[] | boolean | null>>;

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
    const src = getImageSrc(value) ?? "/TEAZO_logo.png";
    const cItemName = checkString(itemName) ?? "No Name"

    //makes the images pretty small since that is not the focus
    return (
      <Image
        src={src}
        alt={cItemName}
        width={40}
        height={40}
        className="w-8 h-8 object-cover rounded shrink-0"
      />
    );
  }

export default function ListView({items} :  {items: Row[]}){
  /* checks if there is data */
  if (!items || items.length == 0) {
    return <div> No data found </div> 
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
      <table className = "w-full border-collapse">
        {/*creates the column names takes into account delete and edit buttons*/}
        <thead>
          <tr className="border-b border-[#dbb082]">
            <th className="w-6"></th> 
            <th className="w-10"></th>
            {keys.filter((key) => key !== "id" && key !== "category_id").map((key) => (
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
                  { key === "price"
                    ? `$${Number(item[key] ?? 0).toFixed(2)}`
                    : key === "img"
                    ? displayIcon(item[key], item.id)
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



