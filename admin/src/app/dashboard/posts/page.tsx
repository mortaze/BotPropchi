"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Search, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Pagination, TableRowSkeleton } from "@/components/ui";
import { getApiError, postsApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";
import type { PostStatus } from "@/types";

const statusConfig: Record<PostStatus, { variant: "success" | "warning" | "info" | "outline" | "danger"; label: string; icon: string }> = {
  PUBLISHED: { variant: "success", label: "منتشر شده", icon: "✅" },
  DRAFT: { variant: "warning", label: "پیش‌نویس", icon: "📝" },
  SCHEDULED: { variant: "info", label: "زمان‌بندی شده", icon: "⏰" },
  ARCHIVED: { variant: "outline", label: "آرشیو", icon: "📦" },
  HIDDEN: { variant: "danger", label: "مخفی", icon: "👻" },
};

export default function PostsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["posts", page, status, search],
    queryFn: () => postsApi.getAll({ page, limit: 20, status: status || undefined, search: search || undefined }),
  });
  const deleteMutation = useMutation({
    mutationFn: postsApi.delete,
    onSuccess: () => { toast.success("پست حذف شد"); qc.invalidateQueries({ queryKey: ["posts"] }); },
    onError: (e) => toast.error(getApiError(e)),
  });
  const publishMutation = useMutation({
    mutationFn: postsApi.publish,
    onSuccess: () => { toast.success("پست منتشر شد"); qc.invalidateQueries({ queryKey: ["posts"] }); },
    onError: (e) => toast.error(getApiError(e)),
  });
  const unpublishMutation = useMutation({
    mutationFn: postsApi.unpublish,
    onSuccess: () => { toast.success("پست از انتشار خارج شد"); qc.invalidateQueries({ queryKey: ["posts"] }); },
    onError: (e) => toast.error(getApiError(e)),
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدیریت پست‌ها</h1>
          <p className="text-sm text-muted-foreground">لیست، ایجاد و مدیریت پست‌های ربات</p>
        </div>
        <Link href="/dashboard/posts/create">
          <Button><Plus className="h-4 w-4" />ایجاد پست جدید</Button>
        </Link>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className="input w-full pr-10" placeholder="جستجو در پست‌ها..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="input w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">همه وضعیت‌ها</option>
              <option value="DRAFT">پیش‌نویس</option>
              <option value="PUBLISHED">منتشر شده</option>
              <option value="SCHEDULED">زمان‌بندی شده</option>
              <option value="ARCHIVED">آرشیو</option>
              <option value="HIDDEN">مخفی</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>وضعیت</th>
                <th>عنوان</th>
                <th>دستورات</th>
                <th>بازدید</th>
                <th>تاریخ انتشار</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)}
              {(query.data?.items ?? []).map((post) => (
                <tr key={post.id}>
                  <td>
                    <Badge variant={statusConfig[post.status].variant}>
                      {statusConfig[post.status].icon} {statusConfig[post.status].label}
                    </Badge>
                  </td>
                  <td>
                    <Link href={`/dashboard/posts/${post.id}`} className="font-medium hover:text-primary">
                      {post.title}
                    </Link>
                  </td>
                  <td>
                    {post.commands?.length
                      ? post.commands.map((c) => (
                          <code key={c.id} className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">{c.command}</code>
                        ))
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td>{formatNumber(post._count?.views ?? 0)}</td>
                  <td className="text-sm text-muted-foreground">{safeDateFormat(post.publishedAt, undefined, "هنوز منتشر نشده")}</td>
                  <td>
                    <div className="flex gap-1">
                      <Link href={`/dashboard/posts/${post.id}`}>
                        <Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button>
                      </Link>
                      {post.status === "PUBLISHED" ? (
                        <Button size="sm" variant="ghost" onClick={() => unpublishMutation.mutate(post.id)} loading={unpublishMutation.isPending}><XCircle className="h-4 w-4" /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => publishMutation.mutate(post.id)} loading={publishMutation.isPending}><CheckCircle className="h-4 w-4" /></Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("آیا از حذف این پست اطمینان دارید؟")) deleteMutation.mutate(post.id); }} loading={deleteMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query.isLoading && !query.data?.items.length && <EmptyState title="پستی یافت نشد" />}
        </CardContent>
        <Pagination page={page} pages={query.data?.pages ?? 1} onChange={setPage} />
      </Card>
    </div>
  );
}
