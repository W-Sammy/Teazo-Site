import type { Metadata } from "next";
import DashboardClient from "@/app/admin/components/dashboard-client";
import { getDashboardData } from "@/app/admin/handlers/dashboard-data";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Admin Dashboard",
  },
};

export default async function AdminPage() {
  const dashboardData = await getDashboardData();

  return <DashboardClient {...dashboardData} />;
}
