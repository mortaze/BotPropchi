"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BarChart2, TrendingUp, Users, MessageSquare, Hash, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton, EmptyState } from "@/components/ui";
import { scheduledMessagesApi, autoRepliesApi } from "@/services/api";

export default function AutomationAnalyticsPage() {
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

  const totalSends = messages.reduce((sum: number, m: any) => sum + (m.sendCount || 0), 0);
  const activeScheduled = messages.filter((m: any) => m.isPublished).length;
  const activeReplies = replies.filter((r: any) => r.isPublished).length;
  const totalKeywords = replies.reduce((sum: number, r: any) => sum + (r.keywords?.length || 0), 0);

  // Collect all unique keywords from auto replies
  const allKeywords: { keyword: string; autoReplyId: number; title: string }[] = [];
  for (const r of replies) {
    for (const kw of (r.keywords || [])) {
      allKeywords.push({ keyword: kw.keyword, autoReplyId: r.id, title: r.title });
    }
  }

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کل ارسال‌ها</p>
                    <p className="text-2xl font-bold">{totalSends}</p>
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
                    <p className="text-sm text-muted-foreground">کلمات کلیدی</p>
                    <p className="text-2xl font-bold">{totalKeywords}</p>
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
                    <p className="text-sm text-muted-foreground">پیام‌های خودکار</p>
                    <p className="text-2xl font-bold">{activeScheduled}<span className="text-sm text-muted-foreground"> / {messages.length}</span></p>
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
                    <p className="text-sm text-muted-foreground">پاسخ‌های خودکار</p>
                    <p className="text-2xl font-bold">{activeReplies}<span className="text-sm text-muted-foreground"> / {replies.length}</span></p>
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
        {/* Keywords List */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Hash className="h-5 w-5 text-green-500" />
              کلمات کلیدی ({totalKeywords})
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}</div>
            ) : allKeywords.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز کلمه کلیدی ثبت نشده است." />
            ) : (
              <div className="space-y-2">
                {allKeywords.map((kw, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <Badge variant="info">{kw.keyword}</Badge>
                    <span className="text-xs text-muted-foreground">{kw.title}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scheduled Messages Summary */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-500" />
              خلاصه پیام‌های زمان‌بندی
            </h3>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted" />)}</div>
            ) : messages.length === 0 ? (
              <EmptyState title="داده‌ای موجود نیست" description="هنوز پیام زمان‌بندی ثبت نشده است." />
            ) : (
              <div className="space-y-3">
                {messages.slice(0, 10).map((msg: any) => (
                  <div key={msg.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={msg.isPublished ? "success" : "outline"}>
                        {msg.isPublished ? "فعال" : "پیش‌نویس"}
                      </Badge>
                      <span className="text-sm font-medium text-foreground truncate">{msg.title}</span>
                    </div>
                    <Badge variant="outline">{msg.sendCount || 0} ارسال</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {!isLoading && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">پیام‌های زمان‌بندی</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold">{activeScheduled}</p>
                <span className="text-sm text-muted-foreground">فعال از {messages.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">پاسخ‌های خودکار</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold">{activeReplies}</p>
                <span className="text-sm text-muted-foreground">فعال از {replies.length}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">کلمات کلیدی</p>
              <p className="text-2xl font-bold">{totalKeywords}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
