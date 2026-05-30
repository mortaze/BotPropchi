// src/components/layout/Header.tsx
"use client";
import { usePathname } from "next/navigation";
import { Bell, Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "next-themes";
import { useUIStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";

const pageTitles: Record<string, string> = {
  "/dashboard": "داشبورد",
  "/dashboard/users": "مدیریت کاربران",
  "/dashboard/discounts": "کدهای تخفیف",
  "/dashboard/prop-firms": "پراپ فرم‌ها",
  "/dashboard/lotteries": "قرعه‌کشی",
  "/dashboard/referrals": "دعوت دوستان",
  "/dashboard/membership": "عضویت اجباری",
  "/dashboard/support": "پشتیبانی",
  "/dashboard/settings": "تنظیمات",
};

export default function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar } = useUIStore();
  const { username } = useAuthStore();
  const title = pageTitles[pathname] || "پنل مدیریت";

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors">
          <Menu className="w-4 h-4" />
        </button>
        <div>
          <h1 className="font-bold text-foreground text-base">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button className="relative p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
        </button>
        <div className="flex items-center gap-2 pr-2 border-r border-border mr-1">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
            {username?.[0]?.toUpperCase() || "A"}
          </div>
          <span className="text-sm font-medium text-foreground hidden sm:block">{username}</span>
        </div>
      </div>
    </header>
  );
}