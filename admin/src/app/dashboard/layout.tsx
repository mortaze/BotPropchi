"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { useAuthStore } from "@/store/auth.store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrate = useAuthStore((state) => state.hydrate);
  const redirected = useRef(false);

  useEffect(() => {
    hydrate();
    if (!redirected.current && !Cookies.get("admin_token")) {
      redirected.current = true;
      router.replace("/login");
    }
  }, [hydrate]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="min-h-screen md:mr-64">
        <Header />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
