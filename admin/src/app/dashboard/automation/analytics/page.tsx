"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BarChart2, TrendingUp, Users, MessageSquare, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton, EmptyState } from "@/components/ui";
import { keywordRepliesApi } from "@/services/api";

export default function AutomationAnalyticsPage() {
  const { data: repliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ["automation", "analytics", "replies"],
    queryFn: () => keywordRepliesApi.getAll(),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["automation", "analytics", "logs"],
    queryFn: () => keywordRepliesApi.history(),
  });

  const replies = repliesData?.items || [];
  const logs = logsData?.items || [];
  const isLoading = repliesLoading || logsLoading;

  // Keyword usage analysis
  const keywordUsage: Record<string, number> = {};
  const groupUsage: Record<string, number> = {};
  const userUsage: Record<string, number> = {};
  const dailyUsage: Record<string, number> = {};

  for (const log of logs) {
    const kw = log.matchedText || log.keywordReply?.keyword || "نامشخص";
    keywordUsage[kw] = (keywordUsage[kw] || 0) + 1;

    const group = log.telegramGroup?.title || String(log.telegramGroupId || "نامشخص");
    groupUsage[group] = (groupUsage[group] || 0) + 1;

    const user = log.userTelegramId || "نامشخص";
    userUsage[user] = (userUsage[user] || 0) + 1;

    const date = log.createdAt ? new Date(log.createdAt).toLocaleDateString("fa-IR") : "نامشخص";
    dailyUsage[date] = (dailyUsage[date] || 0) + 1;
  }

  const sortedKeywords = Object.entries(keywordUsage).sort((a, b) => b[1] - a[1]);
  const sortedGroups = Object.entries(groupUsage).sort((a, b) => b[1] - a[1]);
  const sortedUsers = Object.entries(userUsage).sort((a, b) => b[1] - a[1]);
  const unusedKeywords = replies.filter((r: any) => !keywordUsage[r.keyword]);

  const maxKeywordCount = sortedKeywords.length > 0 ? sortedKeywords[0][1] : 1;

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
                    <p className="text-2xl font-bold">{logs.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <BarChart2 className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کلمات کلیدی فعال</p>
                    <p className="text-2xl font-bold">{sortedKeywords.length}</p>
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
                    <p className="text-2xl font-bold">{sortedGroups.length}</p>
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
                    <p className="text-2xl font-bold">{sortedUsers.length}</p>
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
            {sortedKeywords.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز تریگری ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {sortedKeywords.slice(0, 10).map(([keyword, count]) => (
                  <div key={keyword} className="flex items-center gap-3">
                    <Badge variant="info" className="shrink-0">{keyword}</Badge>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(count / maxKeywordCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground w-12 text-left">{count}</span>
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
            {sortedGroups.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز فعالیتی ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {sortedGroups.slice(0, 10).map(([group, count]) => (
                  <div key={group} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground truncate">{group}</span>
                    <Badge variant="outline">{count} بار</Badge>
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
            {sortedUsers.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز فعالیتی ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {sortedUsers.slice(0, 10).map(([user, count]) => (
                  <div key={user} className="flex items-center justify-between">
                    <span className="text-sm font-mono text-foreground">{user}</span>
                    <Badge variant="outline">{count} بار</Badge>
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
              <Hash className="h-5 w-5 text-red-500" />
              کلمات کلیدی بدون استفاده
            </h3>
          </CardHeader>
          <CardContent>
            {unusedKeywords.length === 0 ? (
              <EmptyState title="عالی!" description="تمام کلمات کلیدی حداقل یک بار استفاده شده‌اند." />
            ) : (
              <div className="space-y-2">
                {unusedKeywords.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <Badge variant="warning">{r.keyword}</Badge>
                    <span className="text-xs text-muted-foreground">بدون تریگر</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
