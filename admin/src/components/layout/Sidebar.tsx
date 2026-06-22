"use client";

import { useState } from "react";
import { BRAND_NAME } from "@/config/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Building2, ChevronDown, FileText, Gift, LayoutDashboard, MessageSquareReply, Percent, RadioTower, Settings, ShieldCheck, Share2, Star, Ticket, Trophy, UserCog, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";

interface MenuItem {
  key: string;
  label: string;
  href: string;
  icon: any;
  children?: { key: string; label: string; href: string; icon: any }[];
}

const menuItems: MenuItem[] = [
  { key: "dashboard", label: "داشبورد", href: "/dashboard", icon: LayoutDashboard },
  { key: "users", label: "کاربران", href: "/dashboard/users", icon: Users },
  {
    key: "posts", label: "پست‌ها", href: "/dashboard/posts", icon: FileText,
    children: [
      { key: "menu", label: "ویرایش منو", href: "/dashboard/menu", icon: Settings },
    ],
  },
  { key: "lotteries", label: "قرعه‌کشی‌ها", href: "/dashboard/lotteries", icon: Ticket },
  { key: "discounts", label: "تخفیف‌ها", href: "/dashboard/discounts", icon: Percent },
  { key: "prop-firms", label: "پراپ فرم‌ها", href: "/dashboard/prop-firms", icon: Building2 },
  {
    key: "referrals", label: "دعوت دوستان", href: "/dashboard/referrals", icon: Share2,
    children: [
      { key: "seasons", label: "فصل‌ها", href: "/dashboard/seasons", icon: Trophy },
      { key: "leaderboard", label: "لیدربورد", href: "/dashboard/leaderboard", icon: Trophy },
    ],
  },
  { key: "scoring", label: "سیستم امتیازدهی", href: "/dashboard/scoring", icon: Star },
  {
    key: "required-channels", label: "عضویت اجباری", href: "/dashboard/required-channels", icon: RadioTower,
    children: [
      { key: "force-join", label: "متن‌های عضویت اجباری", href: "/dashboard/force-join", icon: Settings },
      { key: "groups", label: "مدیریت گروه‌ها", href: "/dashboard/groups", icon: ShieldCheck },
      { key: "keyword-replies", label: "پاسخ‌های خودکار", href: "/dashboard/keyword-replies", icon: MessageSquareReply },
    ],
  },
  { key: "analytics", label: "گزارشات", href: "/dashboard/analytics", icon: BarChart3 },
  {
    key: "settings", label: "تنظیمات", href: "/dashboard/settings", icon: Settings,
    children: [
      { key: "bot-admins", label: "ادمین‌های ربات", href: "/dashboard/bot-admins", icon: UserCog },
      { key: "admin-users", label: "مدیریت ادمین‌ها", href: "/dashboard/admin-users", icon: UserCog },
      { key: "mini-app-logs", label: "Mini App Logs", href: "/dashboard/mini-app-logs", icon: BarChart3 },
      { key: "system-logs", label: "لاگ سیستم", href: "/dashboard/system-logs", icon: FileText },
      { key: "ai-assistant", label: "AI Assistant", href: "/dashboard/ai-assistant", icon: Bot },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpanded = (key: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
        {menuItems.map((item) => {
          const isActive = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
          const hasSubmenu = item.children && item.children.length > 0;
          const isExpanded = expanded[item.key] ?? false;
          const Icon = item.icon;

          if (hasSubmenu) {
            const anyChildActive = item.children!.some((child) => pathname.startsWith(child.href));
            return (
              <div key={item.key}>
                <div className="flex items-center">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn("sidebar-item flex-1", isActive || anyChildActive ? "sidebar-item-active" : "sidebar-item-inactive")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                  <button
                    onClick={(e) => toggleExpanded(item.key, e)}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted",
                      (isActive || anyChildActive) && "text-sidebar-foreground"
                    )}
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded && "rotate-0", !isExpanded && "-rotate-90")} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="mr-6 mt-1 space-y-1 border-r-2 border-sidebar-border pr-2">
                    {item.children!.map((child) => {
                      const childActive = pathname.startsWith(child.href);
                      const ChildIcon = child.icon;
                      return (
                        <Link key={child.key} href={child.href} onClick={onNavigate}
                          className={cn("sidebar-item", childActive ? "sidebar-item-active" : "sidebar-item-inactive")}
                        >
                          <ChildIcon className="h-4 w-4" />{child.label}
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
              className={cn("sidebar-item", isActive ? "sidebar-item-active" : "sidebar-item-inactive")}
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
