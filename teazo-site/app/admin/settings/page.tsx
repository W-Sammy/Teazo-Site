import type { Metadata } from "next";
import AdminsTable from "@/app/admin/settings/components/admin-table"

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Settings",
  },
};

export default function AdminSettingsPage(){
  return (
    <div className="pl-5 pt-10">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr] md:gap-12">
        <h2 className="text-lg font-medium font-bold text-slate-700">Admins</h2>
        <AdminsTable />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr] md:gap-12">
        <h2 className="text-lg font-medium font-bold text-slate-700 pt-6">Ownership Transfer</h2>
      </section>
    </div>
  )
}