import type { Metadata } from "next";
import WebsiteContentClient from "./components/website-content-client";
import { getWebsiteContent } from "./handlers/get-website-content";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Website Content Admin",
  },
};

export default async function AdminWebsiteContentPage() {
  const initialContent = await getWebsiteContent();
  return <WebsiteContentClient initialContent={initialContent} />;
}
