import type { Metadata } from "next";
import AdminsTable from "@/app/admin/settings/components/admin-table";
import { requireAdminPage } from "@/app/lib/admin";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Settings",
  },
};

export default async function AdminSettingsPage() {
  // Only the Owner may access Admin Settings.
  await requireAdminPage(1);

  return (
    <div className="w-full min-w-0 overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 md:px-8 md:pt-10">
      <AdminsTable />
    </div>
  );
}