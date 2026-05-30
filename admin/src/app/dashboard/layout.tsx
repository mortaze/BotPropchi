// src/app/dashboard/layout.tsx
"use client";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useUIStore } from "@/store/ui.store";
import { cn } from "@/lib/utils";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useUIStore();
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300",
        sidebarOpen ? "md:mr-64" : "md:mr-16"
      )}>
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}