
import type { Metadata } from "next";
import Link from "next/link";

import AdminsTable from "@/app/admin/settings/components/admin-table";
import { requireAdminPage } from "@/app/lib/admin";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Settings",
  },
};

export default async function AdminSettingsPage() {
  // Require a valid Owner or Admin session before rendering this page.
  const admin = await requireAdminPage(2);

  // Only the Owner may view administrator settings.
  // Show authenticated Admins an access-denied message without
  // redirecting them to Login or exposing administrator records.
  if (admin.role_id !== 1) {
    return (
      <div className="w-full min-w-0 overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 md:px-8 md:pt-10">
        <section
          role="alert"
          className="max-w-xl rounded-lg border border-[#dbb082] bg-[#1c1917] p-6 text-white"
        >
          <h1 className="text-xl font-semibold">
            Access denied
          </h1>

          <p className="mt-3 text-sm text-gray-300">
            Only the Owner can access Settings.
          </p>

          <Link
            href="/admin"
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-[#dbb082] bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#252525]"
          >
            Return to Dashboard
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-x-hidden px-4 pb-12 pt-6 sm:px-6 md:px-8 md:pt-10">
      <AdminsTable />
    </div>
  );
}
