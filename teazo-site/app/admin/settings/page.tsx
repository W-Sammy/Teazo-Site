import type { Metadata } from "next";
import AdminsTable from "@/app/admin/settings/components/admin-table";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Settings",
  },
};

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl min-w-0 overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 md:px-8 md:pt-10">
      <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <h2 className="text-xl font-bold text-slate-700">
          Admins
        </h2>

        <div className="min-w-0">
          <AdminsTable />
        </div>
      </section>

      <section className="mt-10 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <h2 className="text-xl font-bold text-slate-700">
          Ownership Transfer
        </h2>

        <div className="min-w-0">
          {/* Ownership transfer controls can be added here later. */}
        </div>
      </section>
    </div>
  );
}