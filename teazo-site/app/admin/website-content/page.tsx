import type { Metadata } from "next";
import WebsiteContentClient from "./components/website-content-client";
import { getWebsiteContent } from "./handlers/get-website-content";
import { requireAdminPage } from "@/app/lib/admin";
import type { SectionId } from "./components/types";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Website Content Admin",
  },
};

export default async function AdminWebsiteContentPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  await requireAdminPage(3)

  const sectionParam = (await searchParams).section;
  const initialSection: SectionId | null =
    sectionParam === "hours" || sectionParam === "holidays"
      ? sectionParam
      : null;
  const initialContent = await getWebsiteContent();
  return (
    <WebsiteContentClient
      key={initialSection ?? "closed"}
      initialContent={initialContent}
      initialSection={initialSection}
    />
  );
}
