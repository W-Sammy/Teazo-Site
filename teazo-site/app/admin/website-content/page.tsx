import type { Metadata } from "next";
import WebsiteContentClient from "./components/website-content-client";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Website Content Admin",
  },
};

export default function AdminWebsiteContentPage() {
  return <WebsiteContentClient />;
}
