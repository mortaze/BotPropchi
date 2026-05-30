// src/components/layout/Sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Tag, Building2, Trophy,
  UserPlus, Radio, HeadphonesIcon, Settings,
  Bot, LogOut, ChevronLeft, Menu,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "کاربران", icon: Users },
  { href: "/dashboard/discounts", label: "کدهای تخفیف", icon: Tag },
  { href: "/dashboard/prop-firms", label: "پراپ فرم‌ها", icon: Building2 },
  { href: "/dashboard/lotteries", label: "قرعه‌کشی", icon: Trophy },
  { href: "/dashboard/referrals", label: "دعوت دوستان", icon: UserPlus },
  { href: "/dashboard/membership", label: "عضویت اجباری", icon: Radio },
  { href: "/dashboard/support", label: "پشتیبانی", icon: HeadphonesIcon },
  { href: "/dashboard/settings", label: "تنظیمات", icon: Settings },
];

export default function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { username, logout } = useAuthStore();
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => toggleSidebar()} />
      )}

      <aside className={cn(
        "fixed right-0 top-0 h-full bg-sidebar border-l border-sidebar-border z-50 flex flex-col transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16",
        "max-md:translate-x-full max-md:w-64",
        sidebarOpen && "max-md:translate-x-0"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border h-16">
          {sidebarOpen && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-foreground text-sm">BotPropchi</span>
            </div>
          )}
          <button onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sidebar-foreground hover:text-foreground ml-auto">
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href}
              className={cn(
                "sidebar-item",
                isActive(href, exact) ? "sidebar-item-active" : "sidebar-item-inactive"
              )}>
              <Icon className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>{label}</span>}
              {isActive(href, exact) && sidebarOpen && (
                <span className="mr-auto w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-2 border-t border-sidebar-border">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                {username?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{username}</p>
                <p className="text-xs text-muted-foreground">مدیر ارشد</p>
              </div>
              <button onClick={logout}
                className="p-1 hover:text-destructive transition-colors text-sidebar-foreground">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={logout}
              className="sidebar-item sidebar-item-inactive w-full justify-center text-destructive/70 hover:text-destructive">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}