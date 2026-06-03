"use client";

import { BRAND_NAME } from "@/config/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Building2, FileText, Gift, LayoutDashboard, MessageSquareReply, RadioTower, Settings, ShieldCheck, Share2, Star, Ticket, UserCog, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import { settingsApi } from "@/services/api";

const iconMap = { dashboard: LayoutDashboard, users: Users, lotteries: Ticket, discounts: Gift, "prop-firms": Building2, referrals: Share2, scoring: Star, "required-channels": RadioTower, groups: ShieldCheck, "keyword-replies": MessageSquareReply, "bot-admins": UserCog, "admin-users": UserCog, analytics: BarChart3, "system-logs": FileText, "mini-app-logs": Activity, settings: Settings } as const;
const fallback = [
  { key: "dashboard", href: "/dashboard", label: "داشبورد" },
  { key: "users", href: "/dashboard/users", label: "کاربران" },
  { key: "lotteries", href: "/dashboard/lotteries", label: "قرعه‌کشی‌ها" },
  { key: "discounts", href: "/dashboard/discounts", label: "تخفیف‌ها" },
  { key: "mini-app-logs", href: "/dashboard/mini-app-logs", label: "Mini App Logs" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const query = useQuery({ queryKey: ["menu-orders"], queryFn: settingsApi.getMenus, staleTime: 30_000, retry: 1 });
  const navItems = query.data?.items?.length ? query.data.items : fallback;

  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><BarChart3 className="h-5 w-5" /></div>
          <div><p className="font-bold text-foreground">{BRAND_NAME}</p><p className="text-xs text-sidebar-foreground">Admin Panel</p></div>
        </div>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" onClick={onNavigate} aria-label="بستن منو"><X className="h-5 w-5" /></button>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = iconMap[item.key as keyof typeof iconMap] ?? LayoutDashboard;
          return <Link key={item.key} href={item.href} onClick={onNavigate} className={cn("sidebar-item", active ? "sidebar-item-active" : "sidebar-item-inactive")}><Icon className="h-4 w-4" />{item.label}</Link>;
        })}
      </nav>
    </>
  );
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  return <>
    <aside className="fixed inset-y-0 right-0 z-30 hidden h-screen w-64 overflow-y-auto overscroll-contain border-l border-sidebar-border bg-sidebar p-4 md:block"><SidebarContent /></aside>
    <div className={cn("fixed inset-0 z-40 bg-black/45 opacity-0 backdrop-blur-sm transition-opacity duration-300 md:hidden", sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none")} onClick={() => setSidebarOpen(false)} />
    <aside className={cn("fixed inset-y-0 right-0 z-50 h-screen w-72 max-w-[82vw] overflow-y-auto overscroll-contain border-l border-sidebar-border bg-sidebar p-4 shadow-2xl transition-transform duration-300 ease-out md:hidden", sidebarOpen ? "translate-x-0" : "translate-x-full")} onClick={(event) => event.stopPropagation()}><SidebarContent onNavigate={() => setSidebarOpen(false)} /></aside>
  </>;
}
