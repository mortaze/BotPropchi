"use client";

import { useState } from "react";
import { BRAND_NAME } from "@/config/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, Building2, ChevronDown, ChevronLeft, FileText, Gift, LayoutDashboard, MessageSquareReply, RadioTower, Settings, ShieldCheck, Share2, Star, Ticket, Trophy, UserCog, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";
import { settingsApi } from "@/services/api";

const iconMap = { dashboard: LayoutDashboard, users: Users, posts: FileText, menu: Settings, lotteries: Ticket, discounts: Gift, "prop-firms": Building2, referrals: Share2, scoring: Star, "required-channels": RadioTower, groups: ShieldCheck, "keyword-replies": MessageSquareReply, "bot-admins": UserCog, "admin-users": UserCog, analytics: BarChart3, "system-logs": FileText, "mini-app-logs": Activity, settings: Settings, "force-join": Settings, seasons: Trophy, leaderboard: Trophy } as const;

const subMenus: Record<string, { key: string; href: string; label: string }[]> = {
  referrals: [
    { key: "seasons", href: "/dashboard/seasons", label: "فصل‌ها" },
    { key: "leaderboard", href: "/dashboard/leaderboard", label: "لیدربورد" },
  ],
};

const fallback = [
  { key: "dashboard", href: "/dashboard", label: "داشبورد" },
  { key: "users", href: "/dashboard/users", label: "کاربران" },
  { key: "lotteries", href: "/dashboard/lotteries", label: "قرعه‌کشی‌ها" },
  { key: "discounts", href: "/dashboard/discounts", label: "تخفیف‌ها" },
  { key: "referrals", href: "/dashboard/referrals", label: "دعوت دوستان" },
  { key: "mini-app-logs", href: "/dashboard/mini-app-logs", label: "Mini App Logs" },
  { key: "force-join", href: "/dashboard/force-join", label: "متن‌های عضویت اجباری" },
  { key: "seasons", href: "/dashboard/seasons", label: "فصل‌ها" },
  { key: "leaderboard", href: "/dashboard/leaderboard", label: "لیدربورد" },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const query = useQuery({ queryKey: ["menu-orders"], queryFn: settingsApi.getMenus, staleTime: 30_000, retry: 1 });
  const apiItems = query.data?.items?.length ? query.data.items : null;

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => {
    const expanded: Record<string, boolean> = {};
    for (const parentKey of Object.keys(subMenus)) {
      expanded[parentKey] = apiItems
        ? apiItems.some((i) => i.key === parentKey || subMenus[parentKey].some((sub) => sub.key === i.key))
        : fallback.some((i) => i.key === parentKey || subMenus[parentKey].some((sub) => sub.key === i.key));
    }
    return expanded;
  });

  const navItems = apiItems || fallback;

  const visibleParents = new Set<string>();
  for (const item of navItems) {
    if (subMenus[item.key]) {
      const hasVisibleChild = subMenus[item.key].some((sub) =>
        navItems.some((n) => n.key === sub.key)
      );
      if (hasVisibleChild) visibleParents.add(item.key);
    }
  }

  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><BarChart3 className="h-5 w-5" /></div>
          <div><p className="font-bold text-foreground">{BRAND_NAME}</p><p className="text-xs text-sidebar-foreground">Admin Panel</p></div>
        </div>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" onClick={onNavigate} aria-label="بستن منو"><X className="h-5 w-5" /></button>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const submenu = subMenus[item.key];
          const hasSubmenu = submenu && submenu.some((sub) => navItems.some((n) => n.key === sub.key));
          const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
          const isExpanded = expandedMenus[item.key] ?? false;
          const Icon = iconMap[item.key as keyof typeof iconMap] ?? LayoutDashboard;

          if (hasSubmenu) {
            return (
              <div key={item.key}>
                <button
                  onClick={() => setExpandedMenus((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={cn("sidebar-item w-full text-right", active ? "sidebar-item-active" : "sidebar-item-inactive")}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-muted-foreground transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                </button>
                {isExpanded && (
                  <div className="mr-6 mt-1 space-y-1 border-r-2 border-sidebar-border pr-2">
                    {submenu
                      .filter((sub) => navItems.some((n) => n.key === sub.key))
                      .map((sub) => {
                        const subActive = pathname.startsWith(sub.href);
                        const SubIcon = iconMap[sub.key as keyof typeof iconMap] ?? Trophy;
                        return (
                          <Link key={sub.key} href={sub.href} onClick={onNavigate}
                            className={cn("sidebar-item", subActive ? "sidebar-item-active" : "sidebar-item-inactive")}
                          >
                            <SubIcon className="h-4 w-4" />{sub.label}
                          </Link>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link key={item.key} href={item.href} onClick={onNavigate}
              className={cn("sidebar-item", active ? "sidebar-item-active" : "sidebar-item-inactive")}
            >
              <Icon className="h-4 w-4" />{item.label}
            </Link>
          );
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
