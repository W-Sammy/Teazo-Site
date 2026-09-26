import type { Metadata } from "next";
import DashboardClient from "@/app/admin/components/dashboard-client";
import { getDashboardData } from "@/app/admin/handlers/dashboard-data";
import { requireAdminPage } from "@/app/lib/admin";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Dashboard",
  },
};

export default async function AdminPage() {
  await requireAdminPage(3)
  const dashboardData = await getDashboardData();

  return <DashboardClient {...dashboardData} />;
}
