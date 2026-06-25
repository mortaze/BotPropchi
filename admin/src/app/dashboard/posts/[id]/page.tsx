"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, EyeOff, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input } from "@/components/ui";
import PostForm from "@/components/forms/PostForm";
import { getApiError, postsApi } from "@/services/api";
import { safeDateFormat, formatNumber } from "@/lib/utils";
import type { PostStatus } from "@/types";

const statusConfig: Record<PostStatus, { variant: "success" | "warning" | "info" | "outline" | "danger"; label: string; icon: string }> = {
  PUBLISHED: { variant: "success", label: "منتشر شده", icon: "✅" },
  DRAFT: { variant: "warning", label: "پیش‌نویس", icon: "📝" },
  SCHEDULED: { variant: "info", label: "زمان‌بندی شده", icon: "⏰" },
  ARCHIVED: { variant: "outline", label: "آرشیو", icon: "📦" },
  HIDDEN: { variant: "danger", label: "مخفی", icon: "👻" },
};

export default function PostDetailPage() {
  const id = Number(useParams<{ id: string }>().id);
  const router = useRouter();
  const qc = useQueryClient();
  const [newCommand, setNewCommand] = useState("");

  const query = useQuery({
    queryKey: ["post", id],
    queryFn: () => postsApi.getById(id),
    enabled: Number.isFinite(id),
    staleTime: 0,
    retry: 3,
  });

  const versionsQuery = useQuery({
    queryKey: ["post-versions", id],
    queryFn: () => postsApi.getVersions(id),
    enabled: Number.isFinite(id),
    staleTime: 0,
    retry: 3,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof postsApi.update>[1]) => postsApi.update(id, payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["post", id] });
      const previous = qc.getQueryData(["post", id]);
      qc.setQueryData(["post", id], (old: any) => old ? { ...old, ...payload } : old);
      return { previous };
    },
    onSuccess: (updated) => { toast.success("پست ذخیره شد"); qc.setQueryData(["post", id], updated); qc.invalidateQueries({ queryKey: ["posts"] }); qc.invalidateQueries({ queryKey: ["post", id] }); },
    onError: (e: unknown, _payload, context) => { if (context?.previous) qc.setQueryData(["post", id], context.previous); toast.error(getApiError(e)); },
  });

  const publishMutation = useMutation({
    mutationFn: () => postsApi.publish(id),
    onSuccess: () => { toast.success("پست منتشر شد"); qc.invalidateQueries({ queryKey: ["post", id] }); },
    onError: (e) => toast.error(getApiError(e)),
  });

  const unpublishMutation = useMutation({
    mutationFn: () => postsApi.unpublish(id),
    onSuccess: () => { toast.success("پست از انتشار خارج شد"); qc.invalidateQueries({ queryKey: ["post", id] }); },
    onError: (e) => toast.error(getApiError(e)),
  });

  const hideMutation = useMutation({
    mutationFn: () => postsApi.hide(id),
    onSuccess: () => { toast.success("پست مخفی شد"); qc.invalidateQueries({ queryKey: ["post", id] }); },
    onError: (e) => toast.error(getApiError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => postsApi.delete(id),
    onSuccess: () => { toast.success("پست حذف شد"); router.push("/dashboard/posts"); },
    onError: (e) => toast.error(getApiError(e)),
  });

  const syncMenuMutation = useMutation({
    mutationFn: () => postsApi.syncMenu(id),
    onSuccess: (data) => { toast.success(data.message || "پست به منو همگام‌سازی شد"); },
    onError: (e) => toast.error(getApiError(e)),
  });

  const addCommandMutation = useMutation({
    mutationFn: (command: string) => postsApi.addCommand(id, command),
    onSuccess: () => { toast.success("دستور اضافه شد"); setNewCommand(""); qc.invalidateQueries({ queryKey: ["post", id] }); },
    onError: (e) => toast.error(getApiError(e)),
  });

  const removeCommandMutation = useMutation({
    mutationFn: (commandId: number) => postsApi.removeCommand(id, commandId),
    onSuccess: () => { toast.success("دستور حذف شد"); qc.invalidateQueries({ queryKey: ["post", id] }); },
    onError: (e) => toast.error(getApiError(e)),
  });

  if (query.isLoading) return <div className="skeleton h-96" />;
  if (query.isError) {
    return (
      <div className="space-y-4">
        <EmptyState title="خطا در بارگذاری پست" description={getApiError(query.error)} />
        <div className="flex justify-center"><Button onClick={() => query.refetch()} loading={query.isFetching}>تلاش دوباره</Button></div>
      </div>
    );
  }
  if (!query.data) return (
    <div className="space-y-4">
      <EmptyState title="پست یافت نشد" />
      <div className="flex justify-center"><Button onClick={() => query.refetch()} loading={query.isFetching}>تلاش دوباره</Button></div>
    </div>
  );

  const post = query.data;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{post.title ?? 'بدون عنوان'}</h1>
          <p className="text-sm text-muted-foreground" dir="ltr">{post.slug ?? '-'}</p>
        </div>
        <Badge variant={statusConfig[post.status].variant}>
          {statusConfig[post.status].icon} {statusConfig[post.status].label}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="text-center"><p className="text-2xl font-bold">{formatNumber(post._count?.views ?? 0)}</p><p className="text-sm text-muted-foreground">بازدید</p></CardContent></Card>
        <Card><CardContent className="text-center"><p className="text-2xl font-bold">{formatNumber(post._count?.clickLogs ?? 0)}</p><p className="text-sm text-muted-foreground">کلیک</p></CardContent></Card>
        <Card><CardContent className="text-center"><p className="text-2xl font-bold">{post.commands?.length ?? 0}</p><p className="text-sm text-muted-foreground">دستورات</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {post.status === "PUBLISHED" ? (
          <Button variant="secondary" onClick={() => unpublishMutation.mutate()} loading={unpublishMutation.isPending}><XCircle className="h-4 w-4" />خروج از انتشار</Button>
        ) : (
          <Button onClick={() => publishMutation.mutate()} loading={publishMutation.isPending}><CheckCircle className="h-4 w-4" />انتشار</Button>
        )}
        <Button variant="outline" onClick={() => syncMenuMutation.mutate()} loading={syncMenuMutation.isPending}><RefreshCw className="h-4 w-4" />همگام‌سازی با منو</Button>
        <Button variant="outline" onClick={() => hideMutation.mutate()} loading={hideMutation.isPending}><EyeOff className="h-4 w-4" />مخفی کردن</Button>
        <Button variant="danger" onClick={() => { if (confirm("آیا از حذف این پست اطمینان دارید؟")) deleteMutation.mutate(); }} loading={deleteMutation.isPending}><Trash2 className="h-4 w-4" />حذف</Button>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">ویرایش پست</h2></CardHeader>
        <CardContent>
          <PostForm initial={post} loading={updateMutation.isPending} submitLabel="ذخیره تغییرات" onSubmit={(payload) => updateMutation.mutate(payload)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">دستورات</h2></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input placeholder="دستور جدید..." value={newCommand} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewCommand(e.target.value)} />
            </div>
            <Button onClick={() => { if (newCommand.trim()) addCommandMutation.mutate(newCommand.trim()); }} loading={addCommandMutation.isPending} disabled={!newCommand.trim()}><Plus className="h-4 w-4" />افزودن</Button>
          </div>
          {post.commands?.length ? (
            <div className="space-y-2">
              {post.commands.map((cmd) => (
                <div key={cmd.id} className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 text-sm">{cmd.command}</code>
                    {cmd.aliases?.length ? <span className="text-xs text-muted-foreground">{cmd.aliases.join(", ")}</span> : null}
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeCommandMutation.mutate(cmd.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">هیچ دستوری تعریف نشده است</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">اطلاعات زمانی</h2></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><p className="text-sm text-muted-foreground">ایجاد</p><p className="font-medium">{safeDateFormat(post.createdAt)}</p></div>
          <div><p className="text-sm text-muted-foreground">آخرین ویرایش</p><p className="font-medium">{safeDateFormat(post.updatedAt)}</p></div>
          <div><p className="text-sm text-muted-foreground">انتشار</p><p className="font-medium">{safeDateFormat(post.publishedAt, undefined, "هنوز منتشر نشده")}</p></div>
          <div><p className="text-sm text-muted-foreground">زمان‌بندی</p><p className="font-medium">{safeDateFormat(post.scheduledAt, undefined, "زمان‌بندی نشده")}</p></div>
        </CardContent>
      </Card>

      {versionsQuery.data?.length ? (
        <Card>
          <CardHeader><h2 className="font-semibold">تاریخچه نسخه‌ها</h2></CardHeader>
          <CardContent className="space-y-2">
            {versionsQuery.data.map((v: Record<string, unknown>, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
                <div>
                  <p className="text-sm font-medium">نسخه {(v.version as number) ?? i + 1}</p>
                  <p className="text-xs text-muted-foreground">{safeDateFormat((v.createdAt ?? v.updatedAt) as string | undefined)}</p>
                </div>
                {v.changes ? <p className="text-xs text-muted-foreground">{String(v.changes)}</p> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
