"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Pagination, TableRowSkeleton } from "@/components/ui";
import { getApiError, lotteriesApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";

export default function LotteriesPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["lotteries", page], queryFn: () => lotteriesApi.getAll({ page, limit: 20 }) });
  const deleteMutation = useMutation({
    mutationFn: lotteriesApi.delete,
    onSuccess: () => { toast.success("قرعه‌کشی حذف شد"); queryClient.invalidateQueries({ queryKey: ["lotteries"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدیریت قرعه‌کشی‌ها</h1>
          <p className="text-sm text-muted-foreground">لیست، ایجاد، ویرایش و اجرای گردونه شانس</p>
        </div>
        <Link href="/dashboard/lotteries/create">
          <Button><Plus className="h-4 w-4" />ایجاد</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">قرعه‌کشی‌ها</h2>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>عنوان</th>
                <th>جایزه</th>
                <th>شرکت‌کنندگان</th>
                <th>کل بلیت‌ها</th>
                <th>برندگان</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}
              {(query.data?.items ?? []).map((lottery) => (
                <tr key={lottery.id}>
                  <td>
                    <Link className="font-medium hover:text-primary" href={`/dashboard/lotteries/${lottery.id}`}>
                      {lottery.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">#{lottery.id}</p>
                  </td>
                  <td>{lottery.prize}</td>
                  <td>{lottery.ticketStats?.participants ?? lottery._count?.entries ?? 0}</td>
                  <td>{lottery.ticketStats?.totalTickets ?? 0}</td>
                  <td>{lottery._count?.winners ?? 0} / {lottery.winnersCount}</td>
                  <td>
                    <Badge variant={lottery.isCompleted ? "outline" : lottery.isActive ? "success" : "warning"}>
                      {lottery.isCompleted ? "تکمیل" : lottery.isActive ? "فعال" : "غیرفعال"}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {!lottery.isCompleted && (
                        <Link href={`/dashboard/lotteries/${lottery.id}/execute`}>
                          <Button size="sm" variant="default">
                            <Play className="h-3 w-3 ml-1" />
                            اجرا
                          </Button>
                        </Link>
                      )}
                      <Link href={`/dashboard/lotteries/${lottery.id}`}>
                        <Button size="sm" variant="outline">جزئیات</Button>
                      </Link>
                      <Link href={`/dashboard/lotteries/edit/${lottery.id}`}>
                        <Button size="sm" variant="secondary">ویرایش</Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm("آیا از حذف این قرعه‌کشی مطمئن هستید؟")) {
                            deleteMutation.mutate(lottery.id);
                          }
                        }}
                      >
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Pagination page={page} pages={query.data?.pages ?? 1} onChange={setPage} />
    </div>
  );
}
