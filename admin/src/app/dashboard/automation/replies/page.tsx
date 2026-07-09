"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, MessageSquareReply, CheckCircle, XCircle, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, StatCardSkeleton, EmptyState } from "@/components/ui";
import { autoRepliesApi } from "@/services/api";

export default function AutoRepliesPage() {
  const { data: repliesData, isLoading } = useQuery({
    queryKey: ["automation", "replies-list"],
    queryFn: () => autoRepliesApi.getAll({ page: 1, limit: 100 }),
  });

  const replies = repliesData?.items || [];
  const active = replies.filter((r: any) => r.isPublished);
  const totalKeywords = replies.reduce((sum: number, r: any) => sum + (r.keywords?.length || 0), 0);

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

      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          <>
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
                    <p className="text-sm text-muted-foreground">کل پاسخ‌ها</p>
                    <p className="text-2xl font-bold">{replies.length}</p>
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
                    <p className="text-2xl font-bold text-green-500">{active.length}</p>
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
                    <p className="text-sm text-muted-foreground">کلمات کلیدی</p>
                    <p className="text-2xl font-bold">{totalKeywords}</p>
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
                    <th>عنوان</th>
                    <th>کلمات کلیدی</th>
                    <th>وضعیت</th>
                    <th>تعداد ارسال</th>
                    <th>زمان ایجاد</th>
                  </tr>
                </thead>
                <tbody>
                  {replies.map((reply: any) => (
                    <tr key={reply.id}>
                      <td className="font-medium text-foreground">{reply.title}</td>
                      <td className="text-sm">
                        {reply.keywords?.map((kw: any) => (
                          <Badge key={kw.id} variant="info" className="ml-1">{kw.keyword}</Badge>
                        ))}
                        {(!reply.keywords || reply.keywords.length === 0) && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td>
                        <Badge variant={reply.isPublished ? "success" : "warning"}>
                          {reply.isPublished ? "فعال" : "پیش‌نویس"}
                        </Badge>
                      </td>
                      <td className="text-sm">{reply.sendCount || 0}</td>
                      <td className="text-sm text-muted-foreground">
                        {new Date(reply.createdAt).toLocaleDateString("fa-IR")}
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
