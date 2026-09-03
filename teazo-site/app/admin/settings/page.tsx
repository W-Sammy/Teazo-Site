import type { Metadata } from "next";
import AdminsTable from "@/app/admin/settings/components/admin-table"

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Settings",
  },
};

export default function AdminSettingsPage(){
  return (
    <div>
      <h1>Hello World</h1>
      <AdminsTable/>
    </div>
  )
}