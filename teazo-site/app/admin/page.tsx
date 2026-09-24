import type { Metadata } from "next";
import { requireAdminPage } from "@/app/lib/admin";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Dashboard",
  },
};

export default async function AdminPage(){
  await requireAdminPage(3)
  
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  )
}