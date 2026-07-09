"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BarChart2, TrendingUp, Users, MessageSquare, Hash, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton, EmptyState } from "@/components/ui";
import { automationApi } from "@/services/api";

export default function AutomationAnalyticsPage() {
  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ["automation", "dashboard"],
    queryFn: async () => {
      const res = await automationApi.getDashboard();
      return res.data;
    },
  });

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["automation", "analytics-extra"],
    queryFn: async () => {
      const res = await automationApi.getAnalytics();
      return res.data;
    },
  });

  const isLoading = dashLoading || analyticsLoading;

  const topKeywords = dashboardData?.topKeywords || [];
  const topGroups = dashboardData?.topGroups || [];
  const topUsers = dashboardData?.topUsers || [];
  const dailyStats = dashboardData?.dailyStats || [];
  const unusedKeywords = analyticsData?.unusedKeywords || [];
  const maxKeywordCount = topKeywords.length > 0 ? topKeywords[0].count : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automation" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تحلیل و آمار</h1>
            <p className="text-sm text-muted-foreground">تحلیل عملکرد سیستم اتوماسیون</p>
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کل تریگرها</p>
                    <p className="text-2xl font-bold">{dashboardData?.triggers?.total ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <BarChart2 className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">موفق: {dashboardData?.triggers?.success ?? 0} | ناموفق: {dashboardData?.triggers?.failed ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کلمات کلیدی فعال</p>
                    <p className="text-2xl font-bold">{topKeywords.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <Hash className="h-5 w-5 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">گروه‌های فعال</p>
                    <p className="text-2xl font-bold">{analyticsData?.activeGroupsCount ?? topGroups.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <MessageSquare className="h-5 w-5 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کاربران فعال</p>
                    <p className="text-2xl font-bold">{analyticsData?.activeUsersCount ?? topUsers.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                    <Users className="h-5 w-5 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Keyword Usage Chart */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              پرکاربردترین کلمات کلیدی
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
              </div>
            ) : topKeywords.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز تریگری ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {topKeywords.slice(0, 10).map((item: any) => (
                  <div key={item.keyword} className="flex items-center gap-3">
                    <Badge variant="info" className="shrink-0">{item.keyword}</Badge>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(item.count / maxKeywordCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-12 text-left">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Group Usage */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-500" />
              گروه‌های پرتعداد
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
              </div>
            ) : topGroups.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز فعالیتی ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {topGroups.slice(0, 10).map((item: any) => (
                  <div key={item.chatId} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{item.chatId}</span>
                    <Badge variant="outline">{item.count} بار</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-500" />
              کاربران پرتعداد
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
              </div>
            ) : topUsers.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز فعالیتی ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {topUsers.slice(0, 10).map((item: any) => (
                  <div key={item.telegramId} className="flex items-center justify-between">
                    <span className="text-sm font-mono text-foreground">{item.telegramId}</span>
                    <Badge variant="outline">{item.count} بار</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unused Keywords */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              کلمات کلیدی بدون استفاده
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}
              </div>
            ) : unusedKeywords.length === 0 ? (
              <EmptyState title="عالی!" description="تمام کلمات کلیدی حداقل یک بار استفاده شده‌اند." />
            ) : (
              <div className="space-y-2">
                {unusedKeywords.map((item: any) => (
                  <div key={item.autoReplyId} className="flex items-center justify-between">
                    <Badge variant="warning">{item.keyword}</Badge>
                    <span className="text-xs text-muted-foreground">بدون تریگر</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Stats */}
      {!isLoading && dailyStats.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">آمار روزانه (۳۰ روز اخیر)</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dailyStats.slice(0, 15).map((day: any) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-24">{day.date}</span>
                  <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/80 transition-all"
                      style={{ width: `${(day.count / (dailyStats[0]?.count || 1)) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground w-10 text-left">{day.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
