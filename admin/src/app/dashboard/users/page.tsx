// src/app/dashboard/users/page.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/services/api";
import { User } from "@/types";
import { Card, CardHeader, CardContent, Badge, Button, Input, Modal, Pagination, TableRowSkeleton, EmptyState } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/utils";
import { Search, Shield, ShieldOff, Star, Eye } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";

const pointsSchema = z.object({
  amount: z.coerce.number().int().min(1, "حداقل ۱"),
  description: z.string().optional(),
});

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pointsModal, setPointsModal] = useState<User | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["users", page, search],
    queryFn: () => usersApi.getAll(page, search || undefined),
  });

  const users: User[] = data?.users || [];
  const pages = Math.ceil((data?.total || 0) / 20);

  const blockMutation = useMutation({
    mutationFn: ({ id, isBlocked }: { id: number; isBlocked: boolean }) =>
      usersApi.block(id, isBlocked),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(vars.isBlocked ? "کاربر بلاک شد" : "کاربر آنبلاک شد");
    },
    onError: () => toast.error("خطا در تغییر وضعیت"),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(pointsSchema) });
  const pointsMutation = useMutation({
    mutationFn: ({ id, amount, description }: { id: number; amount: number; description?: string }) =>
      usersApi.addPoints(id, amount, description),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("امتیاز اضافه شد");
      setPointsModal(null);
      reset();
    },
    onError: () => toast.error("خطا در افزودن امتیاز"),
  });

  const onAddPoints = (data: any) => {
    if (!pointsModal) return;
    pointsMutation.mutate({ id: pointsModal.id, ...data });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">لیست کاربران</h2>
              <p className="text-sm text-muted-foreground mt-0.5">مجموع {data?.total || 0} کاربر</p>
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="جستجوی نام یا یوزرنیم..."
                className="pr-9 pl-4 py-2 rounded-lg border border-input bg-background text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>آیدی تلگرام</th>
                  <th>امتیاز</th>
                  <th>دعوت‌ها</th>
                  <th>آخرین فعالیت</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)
                ) : users.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="کاربری یافت نشد" description="جستجوی دیگری امتحان کنید" /></td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {u.firstName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{u.firstName} {u.lastName}</p>
                            <p className="text-xs text-muted-foreground">{u.username ? `@${u.username}` : "بدون یوزرنیم"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs text-muted-foreground font-mono">{u.telegramId}</td>
                      <td><span className="font-semibold text-foreground">{formatNumber(u.points)}</span></td>
                      <td className="text-sm text-muted-foreground">{u.totalReferrals}</td>
                      <td className="text-xs text-muted-foreground">{formatDate(u.lastActiveAt)}</td>
                      <td>
                        <Badge variant={u.isBlocked ? "danger" : "success"}>
                          {u.isBlocked ? "بلاک" : "فعال"}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard/users/${u.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => setPointsModal(u)}>
                            <Star className="w-3.5 h-3.5 text-yellow-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            loading={blockMutation.isPending}
                            onClick={() => blockMutation.mutate({ id: u.id, isBlocked: !u.isBlocked })}>
                            {u.isBlocked
                              ? <ShieldOff className="w-3.5 h-3.5 text-green-500" />
                              : <Shield className="w-3.5 h-3.5 text-destructive" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </CardContent>
      </Card>

      {/* Points Modal */}
      <Modal open={!!pointsModal} onClose={() => { setPointsModal(null); reset(); }}
        title={`افزودن امتیاز — ${pointsModal?.firstName}`}>
        <form onSubmit={handleSubmit(onAddPoints)} className="space-y-4">
          <Input label="مقدار امتیاز" type="number" {...register("amount")} error={errors.amount?.message} placeholder="مثال: ۵۰" />
          <Input label="توضیحات (اختیاری)" {...register("description")} placeholder="دلیل اعطای امتیاز" />
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={pointsMutation.isPending} className="flex-1">ثبت امتیاز</Button>
            <Button type="button" variant="outline" onClick={() => setPointsModal(null)} className="flex-1">انصراف</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}