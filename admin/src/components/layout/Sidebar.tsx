"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, FileText, Gift, LayoutDashboard, Megaphone, MessageSquareReply, RadioTower, ShieldCheck, Share2, Ticket, UserCog, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui.store";

const navItems = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "کاربران", icon: Users },
  { href: "/dashboard/lotteries", label: "قرعه‌کشی‌ها", icon: Ticket },
  { href: "/dashboard/discounts", label: "تخفیف‌ها", icon: Gift },
  { href: "/dashboard/prop-firms", label: "پراپ فرم‌ها", icon: Building2 },
  { href: "/dashboard/referrals", label: "دعوت دوستان", icon: Share2 },
  { href: "/dashboard/required-channels", label: "عضویت اجباری", icon: RadioTower },
  { href: "/dashboard/groups", label: "مدیریت گروه‌ها", icon: ShieldCheck },
  { href: "/dashboard/keyword-replies", label: "پاسخ‌های خودکار", icon: MessageSquareReply },
  { href: "/dashboard/broadcasts", label: "پیام همگانی", icon: Megaphone },
  { href: "/dashboard/bot-admins", label: "ادمین‌های ربات", icon: UserCog },
  { href: "/dashboard/analytics", label: "گزارشات", icon: BarChart3 },
  { href: "/dashboard/system-logs", label: "لاگ سیستم", icon: FileText },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-foreground">BotPropchi</p>
            <p className="text-xs text-sidebar-foreground">Admin Panel</p>
          </div>
        </div>
        <button className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" onClick={onNavigate} aria-label="بستن منو">
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={cn("sidebar-item", active ? "sidebar-item-active" : "sidebar-item-inactive")}>
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  return (
    <>
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 border-l border-sidebar-border bg-sidebar p-4 md:block">
        <SidebarContent />
      </aside>
      <div
        className={cn("fixed inset-0 z-40 bg-black/45 opacity-0 backdrop-blur-sm transition-opacity duration-300 md:hidden", sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none")}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-72 max-w-[82vw] border-l border-sidebar-border bg-sidebar p-4 shadow-2xl transition-transform duration-300 ease-out md:hidden",
          sidebarOpen ? "translate-x-0" : "translate-x-full",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <SidebarContent onNavigate={() => setSidebarOpen(false)} />
      </aside>
    </>
  );
}
