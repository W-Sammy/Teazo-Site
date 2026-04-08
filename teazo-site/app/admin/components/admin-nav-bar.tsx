'use client';

import { usePathname } from "next/navigation";
import Image from 'next/image'
import Link from 'next/link'

export default function Sidebar() {
  const colorIconRoot = "/admin_icons/"
  const blackIconRoot = "/admin_icons/black_icons/"
  const pathname = usePathname();

  const items = [
    { id: "dashboard", label: "Dashboard", img: "teazo_dash_icon.png", img_b: "teazo_dash_icon_black.png", href: "/admin"},
    { id: "menu", label: "Menu", img: "teazo_menu_icon.png" , img_b: "teazo_menu_icon_black.png", href: "/admin/menu" },
    { id: "gallery", label: "Gallery", img: "teazo_gallery_icon.png", img_b: "teazo_gallery_icon_black.png", href: "/admin/gallery"},
    { id: "events", label: "Events", img: "teazo_event_icon.png", img_b: "teazo_event_icon_black.png", href: "/admin/events" },
    { id: "settings", label: "Settings", img: "teazo_setting_icon.png", img_b: "teazo_setting_icon_black.png", href: "/admin/settings" },
  ];

  return (
    <div
      className="flex flex-col w-fit h-full p-2 gap-2"
      style={{ backgroundColor: "#E5E7EB" }}
    >
      
      {
      //sets the active sidebar tab based on the url
      items.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);

        return (
          <Link key = {item.id} href = {item.href}>
            <div
             className="flex items-center gap-3 py-3 px-2 rounded-lg transition-all duration-200"
              style={{
                color: isActive ? "#dbb082" : "#374151",
                backgroundColor: isActive ? "#ffffff" : "transparent",
              }}
            >
              {/* image color based off whether page is active or not */}
              <Image
                src = {isActive ? colorIconRoot+item.img: blackIconRoot+item.img_b}
                alt = "icon"
                width = {24}
                height = {24}
              />
              <span className="text-sm font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}