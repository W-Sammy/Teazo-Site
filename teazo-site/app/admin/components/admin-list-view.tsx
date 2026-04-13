'use client'
type Row = Partial<Record<string, string | string[] | number | number[] | boolean | null>>;

export default function ListView({items} :  {items: Row[]}){
  /* checks if there is data */
  if (!items || items.length == 0) {
    return <div> No data found </div> 
  }

  /* gets the different keys of the json array */
  const keys = Array.from(new Set(items.flatMap((item) => Object.keys(item))))
  //need to implement function to ensure there exist an id column

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

  function editHandler(item: Row){
    console.log("edit");
  }
  function deleteHandler(item: Row){
    console.log("delete")
  }

  return (
    <div className="w-full">
      <table className = "w-full border-collapse">
        {/*creates the column names*/}
        <thead>
          <tr className="border-b border-[#dbb082]">
            <th className="w-6"></th>  {/* dele column */}
            <th className="w-10"></th> {/* edit column */}
            {keys.map((key) => (
              <th key = {key} className = "pr-1 py-2 text-left">
                <div title={key}>
                  {checkCell(key)}
                </div>
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
              {/* delete cell */}
              <td className="pr-2 py-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation(); //prevents row click
                    deleteHandler(item);
                  }}
                  className="text-red-500 hover:text-red-700 cursor-pointer"
                >
                  ✕
                </button>
              </td>

              {/* edit cell */}
              <td className="pr-6 py-2">
                <button 
                  className="bg-[#dbb082] text-xs px-1.5 py-0.5 rounded cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation(); //prevents row click
                    editHandler(item);
                  }}
                > 
                  EDIT 
                </button>
              </td>
              {keys.map((key)=>(
                <td key={key} className=" pr-1 py-2">
                  <div title={String(item[key])}>
                    {checkCell(item[key])}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>


      </table>

    </div>
  )
}



