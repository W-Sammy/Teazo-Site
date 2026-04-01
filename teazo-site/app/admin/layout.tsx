'use client'
import {ReactNode} from "react";
import Sidebar from "@/app/admin/components/admin-nav-bar"

export default function AdminLayout({
  children,
}: {
  children: ReactNode; 
}){
  return (
    <div className="flex h-full">
      <aside className="sticky top-16 h-[100vh] w-32 ">
        <Sidebar />
      </aside>
      
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}