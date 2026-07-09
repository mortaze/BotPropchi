"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Clock, MessageSquareReply, BarChart2, History, Zap, ArrowLeft } from "lucide-react";
import { Card, CardContent, Badge, StatCardSkeleton } from "@/components/ui";
import { scheduledMessagesApi, autoRepliesApi } from "@/services/api";

const sections = [
  { key: "scheduled", label: "پیام‌های خودکار", description: "مدیریت و مشاهده پیام‌های زمان‌بندی‌شده", href: "/dashboard/automation/scheduled", icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10" },
  { key: "replies", label: "پاسخ‌های خودکار", description: "مدیریت کلمات کلیدی و پاسخ‌های خودکار", href: "/dashboard/automation/replies", icon: MessageSquareReply, color: "text-green-500", bg: "bg-green-500/10" },
  { key: "analytics", label: "تحلیل و آمار", description: "تحلیل عملکرد سیستم اتوماسیون", href: "/dashboard/automation/analytics", icon: BarChart2, color: "text-purple-500", bg: "bg-purple-500/10" },
  { key: "logs", label: "تاریخچه فعالیت‌ها", description: "مشاهده تاریخچه تمام فعالیت‌های سیستم", href: "/dashboard/automation/logs", icon: History, color: "text-orange-500", bg: "bg-orange-500/10" },
];

export default function AutomationPage() {
  const { data: scheduledData, isLoading: schedLoading } = useQuery({
    queryKey: ["automation", "scheduled-list"],
    queryFn: () => scheduledMessagesApi.getAll({ page: 1, limit: 100 }),
  });

  const { data: repliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ["automation", "replies-list"],
    queryFn: () => autoRepliesApi.getAll({ page: 1, limit: 100 }),
  });

  const isLoading = schedLoading || repliesLoading;

  const messages = scheduledData?.items || [];
  const replies = repliesData?.items || [];
  const activeScheduled = messages.filter((m: any) => m.isPublished).length;
  const activeReplies = replies.filter((r: any) => r.isPublished).length;
  const totalKeywords = replies.reduce((sum: number, r: any) => sum + (r.keywords?.length || 0), 0);
  const totalSends = messages.reduce((sum: number, m: any) => sum + (m.sendCount || 0), 0);
  const lastSentMsg = messages.find((m: any) => m.lastSentAt);
  const lastActivity = lastSentMsg?.lastSentAt || null;

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
                    <p className="text-2xl font-bold">{replies.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <MessageSquareReply className="h-5 w-5 text-green-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{activeReplies} فعال</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کل ارسال‌ها</p>
                    <p className="text-2xl font-bold">{totalSends}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Zap className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">از {messages.length} پیام زمان‌بندی</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">پیام‌های خودکار</p>
                    <p className="text-2xl font-bold">{messages.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <BarChart2 className="h-5 w-5 text-purple-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{activeScheduled} فعال · {totalKeywords} کلمه کلیدی</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">آخرین ارسال</p>
                    <p className="text-lg font-bold truncate">
                      {lastActivity ? new Date(lastActivity).toLocaleDateString("fa-IR") : "—"}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                    <History className="h-5 w-5 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

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
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{section.label}</h3>
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
    </div>
  );
}
