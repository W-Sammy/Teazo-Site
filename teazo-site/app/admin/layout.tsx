import type { ReactNode } from "react";

import { requireAdminPage } from "@/app/lib/admin";
import AdminShell from "./components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdminPage(2);

  return (
    <AdminShell isOwner={admin.role_id === 1}>
      {children}
    </AdminShell>
  );
}