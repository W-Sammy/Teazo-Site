'use client'
import {ReactNode} from "react";
import Sidebar from "@/app/admin/components/admin-nav-bar"

export default function AdminLayout({
  children,
}: {
  children: ReactNode; 
}){
  return (
    <div className="flex h-full bg-white text-black">
      <aside className="sticky top-0 h-screen">
        <Sidebar />
      </aside>
      
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}