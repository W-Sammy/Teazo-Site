import type { ReactNode } from "react";

import { requireAdminPage } from "@/app/lib/admin";
import AdminShell from "./components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPage(3);

  return <AdminShell>{children}</AdminShell>;
}