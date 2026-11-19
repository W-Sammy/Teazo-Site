import type { Metadata } from "next";
import WebsiteContentClient from "./components/website-content-client";
import WebsiteContentUnavailable from "./components/website-content-unavailable";
import { getWebsiteContent } from "./handlers/get-website-content";
import { requireAdminPage } from "@/app/lib/admin";
import type { SectionId } from "./components/types";
import type { WebsiteContent } from "@/app/types/website-content";

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
  await requireAdminPage(2);

  const sectionParam = (await searchParams).section;
  const initialSection: SectionId | null =
    sectionParam === "hours" || sectionParam === "holidays"
      ? sectionParam
      : null;

  let initialContent: WebsiteContent;
  try {
    initialContent = await getWebsiteContent();
  } catch (error) {
    console.error("Admin website content page failed to load authoritative content:", error);
    return <WebsiteContentUnavailable />;
  }

  return (
    <WebsiteContentClient
      key={initialSection ?? "closed"}
      initialContent={initialContent}
      initialSection={initialSection}
    />
  );
}
