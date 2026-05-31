"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, Gift, LayoutDashboard, Megaphone, MessageSquareReply, RadioTower, ShieldCheck, Share2, Ticket, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "کاربران", icon: Users },
  { href: "/dashboard/lotteries", label: "قرعه‌کشی‌ها", icon: Ticket },
  { href: "/dashboard/discounts", label: "تخفیف‌ها", icon: Gift },
  { href: "/dashboard/referrals", label: "دعوت دوستان", icon: Share2 },
  { href: "/dashboard/required-channels", label: "عضویت اجباری", icon: RadioTower },
  { href: "/dashboard/groups", label: "مدیریت گروه‌ها", icon: ShieldCheck },
  { href: "/dashboard/keyword-replies", label: "پاسخ‌های خودکار", icon: MessageSquareReply },
  { href: "/dashboard/broadcasts", label: "پیام همگانی", icon: Megaphone },
  { href: "/dashboard/prop-firms", label: "پراپ فرم‌ها", icon: Building2 },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 border-l border-sidebar-border bg-sidebar p-4 md:block">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <p className="font-bold text-foreground">BotPropchi</p>
          <p className="text-xs text-sidebar-foreground">Admin Panel</p>
        </div>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={cn("sidebar-item", active ? "sidebar-item-active" : "sidebar-item-inactive")}>
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
