"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, MessageSquareReply, CheckCircle, XCircle, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton, EmptyState } from "@/components/ui";
import { automationApi } from "@/services/api";

export default function AutoRepliesPage() {
  const { data: dashboardData, isLoading: dashLoading } = useQuery({
    queryKey: ["automation", "dashboard"],
    queryFn: async () => {
      const res = await automationApi.getDashboard();
      return res.data;
    },
  });

  const { data: repliesData, isLoading: repliesLoading } = useQuery({
    queryKey: ["automation", "replies-list"],
    queryFn: async () => {
      const { data } = await import("@/services/api").then(m => m.default.get("/api/keyword-replies"));
      return data;
    },
  });

  const replies = repliesData?.items || [];
  const isLoading = dashLoading || repliesLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automation" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">پاسخ‌های خودکار</h1>
            <p className="text-sm text-muted-foreground">مدیریت کلمات کلیدی و پاسخ‌های خودکار</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کل پاسخ‌ها</p>
                    <p className="text-2xl font-bold">{dashboardData?.autoReplies?.total ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <MessageSquareReply className="h-5 w-5 text-green-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">فعال</p>
                    <p className="text-2xl font-bold text-green-500">{dashboardData?.autoReplies?.active ?? 0}</p>
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
                    <p className="text-sm text-muted-foreground">غیرفعال</p>
                    <p className="text-2xl font-bold text-orange-500">
                      {(dashboardData?.autoReplies?.total ?? 0) - (dashboardData?.autoReplies?.active ?? 0)}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                    <XCircle className="h-5 w-5 text-orange-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">کلمات کلیدی</p>
                    <p className="text-2xl font-bold">{dashboardData?.keywords?.total ?? 0}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <Hash className="h-5 w-5 text-purple-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Replies Table */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">لیست پاسخ‌های خودکار</h3>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : replies.length === 0 ? (
            <EmptyState title="پاسخی ثبت نشده" description="هنوز پاسخ خودکاری ایجاد نشده است." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>کلمه کلیدی</th>
                    <th>نوع</th>
                    <th>وضعیت</th>
                    <th>پاسخ</th>
                  </tr>
                </thead>
                <tbody>
                  {replies.map((reply: any) => (
                    <tr key={reply.id}>
                      <td className="font-medium text-foreground">
                        <Badge variant="info">{reply.keyword}</Badge>
                      </td>
                      <td className="text-sm">{reply.responseType || "TEXT"}</td>
                      <td>
                        <Badge variant={reply.isActive ? "success" : "warning"}>
                          {reply.isActive ? "فعال" : "غیرفعال"}
                        </Badge>
                      </td>
                      <td className="text-sm text-muted-foreground max-w-xs truncate">
                        {reply.response || "—"}
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
