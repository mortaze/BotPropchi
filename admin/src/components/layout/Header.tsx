"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui";
import { useUIStore } from "@/store/ui.store";

const labels: Record<string, string> = {
  dashboard: "داشبورد",
  users: "کاربران",
  lotteries: "قرعه‌کشی‌ها",
  discounts: "تخفیف‌ها",
  referrals: "دعوت دوستان",
  "prop-firms": "پراپ فرم‌ها",
  create: "ایجاد",
  edit: "ویرایش",
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, logout } = useAuthStore();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button type="button" onClick={toggleSidebar} className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" aria-label="باز کردن منو"><Menu className="h-5 w-5" /></button>
            {segments.map((segment, index) => (
              <span key={`${segment}-${index}`} className="flex items-center gap-2">
                {index > 0 && <span>/</span>}
                <Link href={`/${segments.slice(0, index + 1).join("/")}`} className="hover:text-foreground">
                  {labels[segment] ?? segment}
                </Link>
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{admin?.username ? `وارد شده با ${admin.username}` : "پنل مدیریت"}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" />
          خروج
        </Button>
      </div>
    </header>
  );
}
