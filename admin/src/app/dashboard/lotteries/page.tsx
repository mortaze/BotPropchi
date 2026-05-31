"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Pagination, TableRowSkeleton } from "@/components/ui";
import { getApiError, lotteriesApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";


export default function LotteriesPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["lotteries", page], queryFn: () => lotteriesApi.getAll({ page, limit: 20 }) });
  const deleteMutation = useMutation({ mutationFn: lotteriesApi.delete, onSuccess: () => { toast.success("قرعه‌کشی حذف شد"); queryClient.invalidateQueries({ queryKey: ["lotteries"] }); }, onError: (error) => toast.error(getApiError(error)) });
  const drawMutation = useMutation({ mutationFn: lotteriesApi.draw, onSuccess: (data) => { toast.success(data.message); queryClient.invalidateQueries({ queryKey: ["lotteries"] }); }, onError: (error) => toast.error(getApiError(error)) });
  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">مدیریت قرعه‌کشی‌ها</h1><p className="text-sm text-muted-foreground">لیست، ایجاد، ویرایش، تاریخچه، شرکت‌کنندگان و برندگان</p></div><Link href="/dashboard/lotteries/create"><Button><Plus className="h-4 w-4" />ایجاد</Button></Link></div><Card><CardHeader><h2 className="font-semibold">قرعه‌کشی‌ها</h2></CardHeader><CardContent className="overflow-x-auto p-0"><table className="data-table"><thead><tr><th>عنوان</th><th>جایزه</th><th>شروع/پایان</th><th>شرکت‌کنندگان</th><th>برندگان</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{query.isLoading && Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}{(query.data?.items ?? []).map((lottery) => <tr key={lottery.id}><td><Link className="font-medium hover:text-primary" href={`/dashboard/lotteries/${lottery.id}`}>{lottery.title}</Link><p className="text-xs text-muted-foreground">#{lottery.id}</p></td><td>{lottery.prize}</td><td><p>{safeDateFormat(lottery.startAt, { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-xs text-muted-foreground">{safeDateFormat(lottery.endAt, { dateStyle: "medium", timeStyle: "short" })}</p></td><td>{lottery._count?.entries ?? 0}</td><td>{lottery._count?.winners ?? 0} / {lottery.winnersCount}</td><td><Badge variant={lottery.isCompleted ? "outline" : lottery.isActive ? "success" : "warning"}>{lottery.isCompleted ? "تکمیل" : lottery.isActive ? "فعال" : "غیرفعال"}</Badge></td><td className="flex flex-wrap gap-2"><Link href={`/dashboard/lotteries/${lottery.id}`}><Button size="sm" variant="outline">جزئیات</Button></Link><Link href={`/dashboard/lotteries/edit/${lottery.id}`}><Button size="sm" variant="secondary">ویرایش</Button></Link><Button size="sm" variant="primary" loading={drawMutation.isPending} disabled={lottery.isCompleted} onClick={() => drawMutation.mutate(lottery.id)}>Run Now</Button><Button size="sm" variant="danger" loading={deleteMutation.isPending} onClick={() => confirm("حذف شود؟") && deleteMutation.mutate(lottery.id)}>حذف</Button></td></tr>)}</tbody></table>{!query.isLoading && !query.data?.items.length && <EmptyState />}</CardContent><Pagination page={page} pages={query.data?.pages ?? 1} onChange={setPage} /></Card></div>;
}
