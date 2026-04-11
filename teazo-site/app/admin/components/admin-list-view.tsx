
type Row = Partial<Record<string, string | string[] | number | number[] | boolean | null>>;

export default function ListView({items} :  {items: Row[]}){
  /* checks if there is data */
  if (!items || items.length == 0) {
    return <div> No data found </div> 
  }

  /* gets the different keys of the json array */
  const keys = Array.from(new Set(items.flatMap((item) => Object.keys(item))))

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

  return (
    <div className="w-full">
      <table className = "w-full border-collapse">
        {/*creates the column names*/}
        <thead>
          <tr className="border-b border-[#dbb082]">
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
            <tr key={row_i} className= "border-b border-[#dbb082]/50">
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



