import type { Metadata } from "next";
import WebsiteContentClient from "./components/website-content-client";
import { getWebsiteContent } from "./handlers/get-website-content";
import { requireAdminPage } from "@/app/lib/admin";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Website Content Admin",
  },
};

export default async function AdminWebsiteContentPage() {
  await requireAdminPage(3)
   
  const initialContent = await getWebsiteContent();
  return <WebsiteContentClient initialContent={initialContent} />;
}
