'use client';

import { usePathname } from "next/navigation";
import Image from 'next/image'
import Link from 'next/link'

export default function Sidebar() {
  const colorIconRoot = "/admin_icons/"
  const blackIconRoot = "/admin_icons/black_icons/"
  const pathname = usePathname();

  const adminPages = [
    { id: "dashboard", label: "Dashboard", img: "teazo_dash_icon.png", img_b: "teazo_dash_icon_black.png", href: "/admin"},
    { id: "menu", label: "Menu", img: "teazo_menu_icon.png" , img_b: "teazo_menu_icon_black.png", href: "/admin/menu" },
    { id: "gallery", label: "Gallery", img: "teazo_gallery_icon.png", img_b: "teazo_gallery_icon_black.png", href: "/admin/gallery"},
    { id: "events", label: "Events", img: "teazo_event_icon.png", img_b: "teazo_event_icon_black.png", href: "/admin/events" },
    { id: "settings", label: "Settings", img: "teazo_setting_icon.png", img_b: "teazo_setting_icon_black.png", href: "/admin/settings" },
  ];

  const controls = [
    { id: "website-content", label: "Website Content", href: "/admin/website-content"},
    { id: "userview", label: "User View", href: "/"},
    { id: "logout", label: "Logout", href: "/"},
  ]
  return (

    
    <div
      className="flex flex-col w-fit h-screen p-2 gap-2"
      style={{ backgroundColor: "#E5E7EB" }}
    >
      
      
      {/*sets the active sidebar tab based on the url */}
      <div className = "flex flex-col gap-2">
        {adminPages.map((page) => {
          const isActive =
            page.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(page.href);

          return (
            <Link key = {page.id} href = {page.href}>
              <div
              className="flex items-center gap-3 py-3 px-2 rounded-lg transition-all duration-200"
                style={{
                  color: isActive ? "#dbb082" : "#374151",
                  backgroundColor: isActive ? "#ffffff" : "transparent",
                }}
              >
                {/* image color based off whether page is active or not */}
                <Image
                  src = {isActive ? colorIconRoot+page.img: blackIconRoot+page.img_b}
                  alt = "icon"
                  width = {24}
                  height = {24}
                />
                <span className="text-sm font-medium">{page.label}</span>
              </div>
            </Link>

          );
        })}
      </div>

      {/*user view and logout*/}
      <div className = "flex flex-col mt-auto pb-20"> 
        {controls.map((control) => {
          return (
            <Link key = {control.id} href = {control.href}>
              <div className = "flex items-center gap-3 py-3 px-2 rounded-lg transition-all duration-200">
                <span className="text-base font-medium text-gray-700 hover:text-[#dbb082] transition-all duration-200">{control.label}</span>
              </div>
            </Link>
          )
        })}
      </div>

    </div>

    
  );
}