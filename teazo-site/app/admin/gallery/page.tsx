import type { Metadata } from "next";
import AdminGalleryClient from "./components/admin-gallery-client";
import { requireAdminPage } from "@/app/lib/admin";
import { getAdminGalleryImages } from "@/app/lib/gallery";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Gallery Admin",
  },
};

export default async function AdminGalleryPage() {
  await requireAdminPage(3);

  const initialImages = await getAdminGalleryImages();

  return <AdminGalleryClient initialImages={initialImages} />;
}
