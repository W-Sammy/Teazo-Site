import ListView from "@/app/admin/components/admin-list-view"

export default function AdminMenuPage(){
  const sampodata = [
    {id: 1, name: "Tea", price: 100, category: [1], 
      chickenchicckecicnekcichchiekchciekchceic: "asdfassdfasdfasdfasdfasdf"},
    {id: 2, name: "Matcha", category: [3,4,5], 
      chickenchicckecicnekcichchiekchciekchceic: "asdfasdfasdffasdfasdfasasd"}
  ]
  return (
    <div>
      <ListView items={sampodata}/>
    </div>
  )
}