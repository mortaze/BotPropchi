// src/app/dashboard/discounts/page.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { discountsApi } from "@/services/api";
import { DiscountCode, CATEGORY_LABELS } from "@/types";
import { Card, CardHeader, CardContent, Badge, Button, Pagination, TableRowSkeleton, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Plus, Edit2, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function DiscountsPage() {
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["discounts", page],
    queryFn: () => discountsApi.getAll(page),
  });

  const items: DiscountCode[] = data?.items || [];
  const pages = data?.pages || 1;

  const deleteMutation = useMutation({
    mutationFn: discountsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discounts"] }); toast.success("کد حذف شد"); },
    onError: () => toast.error("خطا در حذف"),
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">کدهای تخفیف</h2>
              <p className="text-sm text-muted-foreground mt-0.5">مجموع {data?.total || 0} کد</p>
            </div>
            <Link href="/dashboard/discounts/create">
              <Button size="sm"><Plus className="w-4 h-4 ml-1" />کد جدید</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>کد</th>
                  <th>پراپ فرم</th>
                  <th>تخفیف</th>
                  <th>دسته‌بندی</th>
                  <th>وضعیت</th>
                  <th>استفاده</th>
                  <th>انقضا</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={9} />)
                ) : items.length === 0 ? (
                  <tr><td colSpan={9}><EmptyState title="کدی یافت نشد" description="اولین کد تخفیف را اضافه کنید" /></td></tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {item.isFeatured && <Star className="w-3.5 h-3.5 text-yellow-500 shrink-0" fill="currentColor" />}
                          <span className="font-medium text-foreground text-sm">{item.title}</span>
                        </div>
                      </td>
                      <td>
                        <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{item.code}</code>
                      </td>
                      <td className="text-sm text-muted-foreground">{item.propFirm?.name}</td>
                      <td><span className="font-semibold text-green-500">{item.discountPercent}%</span></td>
                      <td><Badge variant="info">{CATEGORY_LABELS[item.category]}</Badge></td>
                      <td><Badge variant={item.isActive ? "success" : "warning"}>{item.isActive ? "فعال" : "غیرفعال"}</Badge></td>
                      <td className="text-sm text-muted-foreground">{item.usageCount}</td>
                      <td className="text-xs text-muted-foreground">
                        {item.expiresAt ? formatDate(item.expiresAt) : <span className="text-green-500">نامحدود</span>}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Link href={`/dashboard/discounts/edit/${item.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Edit2 className="w-3.5 h-3.5" /></Button>
                          </Link>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            loading={deleteMutation.isPending}
                            onClick={() => { if (confirm("حذف شود؟")) deleteMutation.mutate(item.id); }}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
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
    </div>
  );
}