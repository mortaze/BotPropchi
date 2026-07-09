"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Clock, ArrowLeft, CheckCircle, XCircle, Pause } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton, EmptyState } from "@/components/ui";
import { automationApi, scheduledMessagesApi } from "@/services/api";

export default function ScheduledMessagesPage() {
  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ["automation", "dashboard"],
    queryFn: async () => {
      const res = await automationApi.getDashboard();
      return res.data;
    },
  });

  const { data, isLoading: listLoading } = useQuery({
    queryKey: ["automation", "scheduled-list"],
    queryFn: () => scheduledMessagesApi.getAll({ page: 1, limit: 100 }),
  });

  const messages = data?.items || [];
  const isLoading = dashLoading || listLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automation" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">پیام‌های خودکار</h1>
            <p className="text-sm text-muted-foreground">مدیریت و مشاهده پیام‌های زمان‌بندی‌شده</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کل پیام‌ها</p>
                    <p className="text-2xl font-bold">{dashboardData?.scheduledMessages?.total ?? messages.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Clock className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">فعال</p>
                    <p className="text-2xl font-bold text-green-500">{dashboardData?.scheduledMessages?.active ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">پیش‌نویس</p>
                    <p className="text-2xl font-bold text-orange-500">{dashboardData?.scheduledMessages?.draft ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                    <Pause className="h-5 w-5 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">آخرین ارسال</p>
                    <p className="text-lg font-bold truncate">
                      {messages.find((m: any) => m.lastSentAt)
                        ? new Date(messages.find((m: any) => m.lastSentAt).lastSentAt).toLocaleDateString("fa-IR")
                        : "—"}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <Clock className="h-5 w-5 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Messages Table */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">لیست پیام‌های خودکار</h3>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState title="پیامی ثبت نشده" description="هنوز پیام خودکاری ایجاد نشده است." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>عنوان</th>
                    <th>وضعیت</th>
                    <th>گروه</th>
                    <th>برنامه</th>
                    <th>تعداد ارسال</th>
                    <th>آخرین ارسال</th>
                    <th>زمان ایجاد</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg: any) => (
                    <tr key={msg.id}>
                      <td className="font-medium text-foreground">{msg.title}</td>
                      <td>
                        <Badge variant={msg.isPublished ? "success" : "warning"}>
                          {msg.isPublished ? "فعال" : "پیش‌نویس"}
                        </Badge>
                      </td>
                      <td className="text-sm text-muted-foreground">{msg.targetChatId ? String(msg.targetChatId) : "—"}</td>
                      <td className="text-sm text-muted-foreground">
                        {msg.intervalMinutes ? `هر ${msg.intervalMinutes} دقیقه` : "—"}
                      </td>
                      <td className="text-sm">{msg.sendCount || 0}</td>
                      <td className="text-sm text-muted-foreground">
                        {msg.lastSentAt ? new Date(msg.lastSentAt).toLocaleDateString("fa-IR") : "—"}
                      </td>
                      <td className="text-sm text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleDateString("fa-IR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
