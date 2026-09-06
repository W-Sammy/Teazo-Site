import type { Metadata } from "next";
import type { AdminGalleryImage } from "../../types/gallery-image";
import AdminGalleryClient from "./components/admin-gallery-client";

export const metadata: Metadata = {
  title: {
    absolute: "Teazo Gallery Admin",
  },
};

/*
 * Temporary gallery data for the front-end framework.
 * This can be replaced with API data when persistent storage is added.
 */
const initialImages: AdminGalleryImage[] = [
  {
    id: "gallery-1",
    name: "Matcha Slush",
    url: "/menu_items/matcha_slush.webp",
    tags: ["Matcha", "Recommendations"],
    createdAt: "2026-09-03T21:15:00.000Z",
  },
  {
    id: "gallery-2",
    name: "Matcha Latte",
    url: "/menu_items/matcha_latte.webp",
    tags: ["Matcha", "Milk Tea"],
    createdAt: "2026-09-02T18:30:00.000Z",
  },
  {
    id: "gallery-3",
    name: "Fresh Leaf",
    url: "/carousel_images/fresh_leaf.jpg",
    tags: ["Shop", "Recommendations"],
    createdAt: "2026-08-31T16:00:00.000Z",
  },
  {
    id: "gallery-4",
    name: "Red Envelopes",
    url: "/promotions/chinese_new_year.png",
    tags: ["Promotions", "Limited Time"],
    createdAt: "2026-08-29T20:45:00.000Z",
  },
  {
    id: "gallery-5",
    name: "Strawberry Matcha Cheezo",
    url: "/menu_items/strawberry_matcha_cheezo.webp",
    tags: ["Cheezo Tea", "Trending"],
    createdAt: "2026-08-27T19:10:00.000Z",
  },
  {
    id: "gallery-6",
    name: "Pork Floss Spam Musubi",
    url: "/menu_items/pork_floss_spam_musubi.webp",
    tags: ["Food", "Recommendations"],
    createdAt: "2026-08-25T17:20:00.000Z",
  },
];

export default function AdminGalleryPage() {
  return <AdminGalleryClient initialImages={initialImages} />;
}
