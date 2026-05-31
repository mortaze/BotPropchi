"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState } from "@/components/ui";
import { getApiError, groupsApi, type TelegramGroupStatus } from "@/services/api";
import type { TelegramGroup } from "@/types";

const statusLabel: Record<TelegramGroupStatus, string> = { PENDING: "در انتظار", APPROVED: "تایید شده", REJECTED: "رد شده", DISABLED: "غیرفعال" };
const statusVariant: Record<TelegramGroupStatus, "warning" | "success" | "danger" | "outline"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", DISABLED: "outline" };

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["groups"], queryFn: () => groupsApi.getAll() });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TelegramGroupStatus }) => groupsApi.setStatus(id, status),
    onSuccess: () => { toast.success("وضعیت گروه به‌روزرسانی شد"); queryClient.invalidateQueries({ queryKey: ["groups"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });
  const refresh = useMutation({
    mutationFn: groupsApi.refreshAdmin,
    onSuccess: () => { toast.success("وضعیت مدیر بودن ربات بررسی شد"); queryClient.invalidateQueries({ queryKey: ["groups"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title">مدیریت گروه‌ها</h1><p className="text-sm text-muted-foreground">ربات فقط در گروه‌های ثبت‌شده، تاییدشده و دارای دسترسی ادمین فعال می‌شود.</p></div></div>
    <Card>
      <CardHeader><h2 className="font-semibold">گروه‌های ثبت‌شده</h2></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto"><table className="data-table"><thead><tr><th>نام گروه</th><th>آیدی گروه</th><th>تاریخ اضافه شدن</th><th>وضعیت تایید</th><th>وضعیت ادمین ربات</th><th>عملیات</th></tr></thead><tbody>
          {query.data?.items.map((group: TelegramGroup) => <tr key={group.id}>
            <td>{group.title}</td><td dir="ltr">{group.chatId}</td><td>{new Date(group.addedAt).toLocaleString("fa-IR")}</td>
            <td><Badge variant={statusVariant[group.status]}>{statusLabel[group.status]}</Badge></td>
            <td>{group.botIsAdmin ? <Badge variant="success">ربات مدیر است</Badge> : <Badge variant="danger">ربات مدیر نیست</Badge>} {!group.botIsAdmin && group.status === "APPROVED" && <p className="mt-1 text-xs text-red-400">برای فعال شدن قابلیت‌های گروهی، ربات را Admin کنید.</p>}</td>
            <td><div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: group.id, status: "APPROVED" })}>تایید</Button>
              <Button size="sm" variant="danger" onClick={() => setStatus.mutate({ id: group.id, status: "REJECTED" })}>رد</Button>
              <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: group.id, status: "DISABLED" })}>غیرفعال</Button>
              <Button size="sm" variant="ghost" loading={refresh.isPending} onClick={() => refresh.mutate(group.id)}><RefreshCw className="h-3.5 w-3.5" /> بررسی ادمین</Button>
            </div></td>
          </tr>)}
        </tbody></table></div>
        {!query.isLoading && !query.data?.items.length && <EmptyState icon={<ShieldCheck />} title="هنوز گروهی ثبت نشده" description="وقتی ربات به گروهی اضافه شود، اینجا با وضعیت در انتظار نمایش داده می‌شود." />}
      </CardContent>
    </Card>
  </div>;
}
