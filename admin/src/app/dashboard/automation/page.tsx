"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Clock, MessageSquareReply, BarChart2, History, Zap, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton } from "@/components/ui";
import { automationApi } from "@/services/api";

const sections = [
  {
    key: "scheduled",
    label: "پیام‌های خودکار",
    description: "مدیریت و مشاهده پیام‌های زمان‌بندی‌شده",
    href: "/dashboard/automation/scheduled",
    icon: Clock,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    key: "replies",
    label: "پاسخ‌های خودکار",
    description: "مدیریت کلمات کلیدی و پاسخ‌های خودکار",
    href: "/dashboard/automation/replies",
    icon: MessageSquareReply,
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
  {
    key: "analytics",
    label: "تحلیل و آمار",
    description: "تحلیل عملکرد سیستم اتوماسیون",
    href: "/dashboard/automation/analytics",
    icon: BarChart2,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    key: "logs",
    label: "تاریخچه فعالیت‌ها",
    description: "مشاهده تاریخچه تمام فعالیت‌های سیستم",
    href: "/dashboard/automation/logs",
    icon: History,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
];

export default function AutomationPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["automation", "dashboard"],
    queryFn: async () => {
      const res = await automationApi.getDashboard();
      return res.data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">اتوماسیون</h1>
            <p className="text-sm text-muted-foreground">مدیریت، مشاهده و تحلیل پیام‌های خودکار و پاسخ‌های خودکار</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">پاسخ‌های خودکار</p>
                    <p className="text-2xl font-bold">{data?.autoReplies?.total ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <MessageSquareReply className="h-5 w-5 text-green-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{data?.autoReplies?.active ?? 0} فعال</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کل تریگرها</p>
                    <p className="text-2xl font-bold">{data?.triggers?.total ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Zap className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">امروز: {data?.triggers?.today ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کلمات کلیدی</p>
                    <p className="text-2xl font-bold">{data?.keywords?.total ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <BarChart2 className="h-5 w-5 text-purple-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">نرخ موفقیت: {data?.triggers?.successRate ?? 0}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">آخرین فعالیت</p>
                    <p className="text-lg font-bold truncate">
                      {data?.lastActivity
                        ? new Date(data.lastActivity).toLocaleDateString("fa-IR")
                        : "—"}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                    <History className="h-5 w-5 text-orange-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">هفته: {data?.triggers?.week ?? 0} تریگر</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Section Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.key} href={section.href}>
              <Card className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${section.bg}`}>
                      <Icon className={`h-6 w-6 ${section.color}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {section.label}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                    </div>
                    <ArrowLeft className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick Stats Summary */}
      {!isLoading && data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">پیام‌های خودکار</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold">{data.scheduledMessages?.active ?? 0}</p>
                <span className="text-sm text-muted-foreground">فعال از {data.scheduledMessages?.total ?? 0}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">تریگرهای ماهانه</p>
              <p className="text-2xl font-bold">{data.triggers?.month ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">تریگرهای ناموفق</p>
              <p className="text-2xl font-bold text-red-500">{data.triggers?.failed ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
